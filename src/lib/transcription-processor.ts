import { prisma } from "@/lib/prisma";
import {
  getSarvamJobStatus,
  downloadSarvamJobTranscript,
  startSarvamTranscriptionJob,
  isMultiPartSarvamJob,
  parseMultiPartSarvamJob,
  SarvamTranscriptSegment,
} from "@/lib/sarvam";
import { generateMeetingInsights, generateMeetingChapters } from "@/lib/gemini";
import { collectUniqueSpeakerIds, normalizeSpeakerId } from "@/lib/speaker-id";
import { notifyMeetingFailed } from "@/lib/dead-letter";

const MAX_RETRIES = 8;

const BACKOFF_DELAYS = [
  5_000,
  10_000,
  15_000,
  20_000,
  30_000,
  45_000,
  60_000,
  90_000,
];

function log(msg: string) {
  console.log(`[TRANSCRIPTION] ${msg}`);
}

async function updateProgressMessage(meetingId: string, message: string) {
  log(`[Progress Update] ${message}`);
  try {
    await prisma.meeting.update({
      where: { id: meetingId },
      data: { progressMessage: message },
    });
  } catch (err: any) {
    console.error(`Failed to update progress message: ${err.message}`);
  }
}

export async function processCompletedTranscription(meetingId: string) {
  log(`Processing completed transcription for meeting: ${meetingId}`);

  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
  });

  if (!meeting) {
    log(`Meeting ${meetingId} not found. Aborting.`);
    return;
  }

  if (meeting.status !== "TRANSCRIBING") {
    log(`Meeting ${meetingId} is already "${meeting.status}". Skipping.`);
    return;
  }

  if (!meeting.sarvamJobId) {
    log(`Meeting ${meetingId} has no sarvamJobId. Marking as FAILED.`);
    await markAsFailed(meetingId, "No Sarvam job ID found for this meeting.");
    return;
  }

  try {
    await updateProgressMessage(meetingId, "Initializing transcription processing pipeline...");
    const combinedEntries: SarvamTranscriptSegment[] = [];

    // Handle Multi-Part (>2 Hours) Jobs
    if (isMultiPartSarvamJob(meeting.sarvamJobId)) {
      const multiPart = parseMultiPartSarvamJob(meeting.sarvamJobId)!;
      log(`Meeting has ${multiPart.parts.length} sliced sub-parts. Processing each in sequence...`);

      for (const part of multiPart.parts) {
        await updateProgressMessage(
          meetingId,
          `Retrieving Sarvam AI outputs for Part ${part.partIndex}/${part.totalParts}...`
        );

        const jsonOutput = await waitForOutputFiles(meetingId, part.jobId);

        await updateProgressMessage(
          meetingId,
          `Downloading transcript for Part ${part.partIndex}/${part.totalParts}...`
        );

        const rawResult = await downloadSarvamJobTranscript(
          part.jobId,
          jsonOutput.file_name
        );

        if (rawResult.diarized_transcript?.entries) {
          for (const entry of rawResult.diarized_transcript.entries) {
            const rawStart = parseFloat(entry.start_time_seconds?.toString() || "0");
            const rawEnd = parseFloat(entry.end_time_seconds?.toString() || "0");
            const shiftedStart = (isNaN(rawStart) ? 0 : rawStart) + part.startOffsetSeconds;
            const shiftedEnd = (isNaN(rawEnd) ? 0 : rawEnd) + part.startOffsetSeconds;

            const speakerTag = `P${part.partIndex}-${normalizeSpeakerId(entry.speaker_id)}`;

            combinedEntries.push({
              speaker_id: speakerTag,
              start_time_seconds: Math.round(shiftedStart * 100) / 100,
              end_time_seconds: Math.round(shiftedEnd * 100) / 100,
              transcript: entry.transcript,
            });
          }
        }
      }
    } else {
      // Single Part (<2 Hours) Job
      const jsonOutput = await waitForOutputFiles(meetingId, meeting.sarvamJobId);

      await updateProgressMessage(meetingId, "Downloading transcript outputs from Sarvam AI...");
      const rawResult = await downloadSarvamJobTranscript(
        meeting.sarvamJobId,
        jsonOutput.file_name
      );

      if (!rawResult.diarized_transcript?.entries) {
        throw new Error("Invalid transcript JSON format: missing entries.");
      }

      for (const entry of rawResult.diarized_transcript.entries) {
        combinedEntries.push({
          speaker_id: normalizeSpeakerId(entry.speaker_id),
          start_time_seconds: entry.start_time_seconds,
          end_time_seconds: entry.end_time_seconds,
          transcript: entry.transcript,
        });
      }
    }

    // Sort chronologically across all merged slices
    combinedEntries.sort((a, b) => {
      const aStart = parseFloat(a.start_time_seconds?.toString() || "0");
      const bStart = parseFloat(b.start_time_seconds?.toString() || "0");
      return aStart - bStart;
    });

    log(`Total combined transcript entries: ${combinedEntries.length}`);

    await updateProgressMessage(meetingId, "Formatting and saving transcript entries to database...");
    await writeTranscriptSegments(meetingId, combinedEntries);

    await generateAIInsights(meetingId, combinedEntries);

    const maxSegmentDuration = combinedEntries.reduce((max, entry) => {
      const end = parseFloat(entry.end_time_seconds?.toString() || "0");
      return Math.max(max, isNaN(end) ? 0 : end);
    }, 0);

    await prisma.meeting.update({
      where: { id: meetingId },
      data: {
        status: "COMPLETED",
        durationSeconds: maxSegmentDuration > 0 ? Math.round(maxSegmentDuration) : meeting.durationSeconds,
        retryCount: 0,
        lastError: null,
        nextRetryAt: null,
        progressMessage: "Successfully completed transcription processing!",
      },
    });

    log(`Meeting ${meetingId} processed successfully! (Duration: ${maxSegmentDuration}s)`);
  } catch (error: any) {
    log(`ERROR processing meeting ${meetingId}: ${error.message}`);

    // If audio is rejected for exceeding length or format validation, fail immediately without endless retrying
    if (error.message.includes("exceeds the maximum limit") || error.message.includes("duration exceeds") || error.message.includes("limit of 7200 seconds")) {
      await markAsFailed(meetingId, "Audio duration exceeds Sarvam's maximum limit of 2 hours (7200 seconds). Please upload audio under 2 hours.");
      return;
    }

    const isFatalJobError =
      error.message.includes("Job state is Failed") ||
      error.message.includes("credit") ||
      error.message.includes("quota") ||
      error.message.includes("exhausted");

    if (isFatalJobError && (meeting.retryCount ?? 0) < 3) {
      try {
        log(`[AUTO-FAILOVER] Key exhausted or job failed. Auto-restarting with next active key in pool...`);
        await updateProgressMessage(meetingId, "API key exhausted. Rotating to next key in pool and restarting transcription...");

        const newJobId = await startSarvamTranscriptionJob(
          meeting.audioUrl,
          meeting.languageCode,
          meeting.numSpeakers ?? undefined
        );

        await prisma.meeting.update({
          where: { id: meetingId },
          data: {
            sarvamJobId: newJobId,
            retryCount: 0,
            lastError: null,
            progressMessage: "Job restarted with fresh pool key. Actively transcribing...",
          },
        });

        log(`[AUTO-FAILOVER] Successfully restarted meeting ${meetingId} with new job ID: ${newJobId}`);
        return;
      } catch (restartErr: any) {
        log(`[AUTO-FAILOVER ERROR] Failed to restart job with next key: ${restartErr.message}`);
      }
    }

    const currentRetryCount = meeting.retryCount ?? 0;
    const nextRetry = currentRetryCount + 1;

    if (nextRetry < MAX_RETRIES) {
      const delayMs = BACKOFF_DELAYS[currentRetryCount] ?? BACKOFF_DELAYS[BACKOFF_DELAYS.length - 1];
      const nextRetryAt = new Date(Date.now() + delayMs);

      await prisma.meeting.update({
        where: { id: meetingId },
        data: {
          retryCount: nextRetry,
          lastError: error.message,
          nextRetryAt,
          progressMessage: `Waiting for files to materialize (retrying ${nextRetry}/${MAX_RETRIES}). Error: ${error.message}`,
        },
      });

      log(
        `Scheduled retry ${nextRetry}/${MAX_RETRIES} for meeting ${meetingId} at ${nextRetryAt.toISOString()} (delay: ${delayMs / 1000}s)`,
      );
    } else {
      await markAsFailed(meetingId, error.message);
    }
  }
}

async function waitForOutputFiles(meetingId: string, jobId: string) {
  const maxAttempts = 10;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await updateProgressMessage(
      meetingId,
      `Checking for Sarvam AI outputs (attempt ${attempt}/${maxAttempts})...`
    );

    const jobDetails = await getSarvamJobStatus(jobId);
    const detail = jobDetails.job_details?.[0];
    const outputs = detail?.outputs ?? [];
    const state = jobDetails.job_state;
    const itemState = detail?.state;
    const itemError = detail?.error_message;

    log(`Job state: ${state}, item state: ${itemState || "N/A"}, failed files: ${jobDetails.failed_files_count ?? 0}`);

    if (state === "Failed") {
      throw new Error(`Job state is Failed on Sarvam AI: ${jobDetails.error_message || "Unknown error"}`);
    }

    if (itemState === "API Error" || itemState === "Failed" || (jobDetails.failed_files_count && jobDetails.failed_files_count > 0 && outputs.length === 0)) {
      const msg = itemError || jobDetails.error_message || "Sarvam AI rejected audio processing.";
      throw new Error(`Sarvam AI audio processing error: ${msg}`);
    }

    // Check if output files actually succeeded
    if (outputs.length > 0 && itemState !== "API Error") {
      const jsonOutput = outputs.find((o: any) => o.file_name?.endsWith(".json"));
      if (jsonOutput) {
        log(`Found output file: ${jsonOutput.file_name} (file_id: ${jsonOutput.file_id})`);

        const stabilizeMs = attempt <= 2 ? 6_000 : 3_000;
        await updateProgressMessage(
          meetingId,
          `Sarvam AI transcript found! Stabilizing storage files (${stabilizeMs / 1000}s)...`
        );
        await new Promise((r) => setTimeout(r, stabilizeMs));

        return jsonOutput;
      }
    }

    if (attempt < maxAttempts) {
      const waitMs = 3000;
      log(`No outputs yet (state: ${state}). Waiting ${waitMs / 1000}s...`);
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }

  throw new Error(
    `No JSON output file found after ${maxAttempts} attempts for job ${jobId}.`,
  );
}

async function writeTranscriptSegments(
  meetingId: string,
  entries: Array<{
    speaker_id: string;
    start_time_seconds: string | number;
    end_time_seconds: string | number;
    transcript: string;
  }>,
) {
  const uniqueSpeakers = collectUniqueSpeakerIds(entries);

  await prisma.$transaction(
    async (tx) => {
      try {
        await tx.meeting.update({
          where: { id: meetingId },
          data: {
            numSpeakers: uniqueSpeakers.length,
          },
        });
      } catch {
        // ignore
      }

      await tx.transcriptSegment.deleteMany({
        where: { meetingId },
      });

      const segmentsData = entries.map((entry, index) => {
        const start = parseFloat(entry.start_time_seconds?.toString() || "0");
        const end = parseFloat(entry.end_time_seconds?.toString() || "0");

        return {
          meetingId,
          speakerId: normalizeSpeakerId(entry.speaker_id),
          startTime: isNaN(start) ? 0 : start,
          endTime: isNaN(end) ? 0 : end,
          text: entry.transcript || "",
          index,
        };
      });

      // Insert segments in 500-item chunks for optimal database throughput
      const CHUNK_SIZE = 500;
      for (let i = 0; i < segmentsData.length; i += CHUNK_SIZE) {
        const chunk = segmentsData.slice(i, i + CHUNK_SIZE);
        await tx.transcriptSegment.createMany({
          data: chunk,
        });
      }

      // Fetch all existing labels in 1 query
      const existingLabels = await tx.speakerLabel.findMany({
        where: { meetingId },
        select: { speakerId: true },
      });
      const existingSet = new Set(existingLabels.map((l) => l.speakerId));

      const newSpeakerLabels = uniqueSpeakers
        .filter((speakerId) => !existingSet.has(speakerId))
        .map((speakerId) => {
          const speakerNum = parseInt(speakerId.replace(/\D/g, ""), 10);
          const displayName = isNaN(speakerNum) ? speakerId : `Speaker ${speakerNum + 1}`;
          return {
            meetingId,
            speakerId,
            displayName,
          };
        });

      if (newSpeakerLabels.length > 0) {
        await tx.speakerLabel.createMany({
          data: newSpeakerLabels,
        });
      }
    },
    {
      timeout: 30000,
      maxWait: 10000,
    }
  );

  log(`Successfully wrote ${entries.length} segments and speaker labels to database.`);
}

async function generateAIInsights(
  meetingId: string,
  entries: Array<{
    speaker_id: string;
    start_time_seconds: string | number;
    end_time_seconds: string | number;
    transcript: string;
  }>,
) {
  const fullTranscript = entries
    .map((e) => `[${normalizeSpeakerId(e.speaker_id)}] ${e.transcript}`)
    .join("\n");

  if (!fullTranscript.trim()) {
    log("Transcript is empty, skipping AI insight generation.");
    return;
  }

  log("Generating executive summary and action items with Gemini AI...");
  await updateProgressMessage(meetingId, "Analyzing meeting content with AI intelligence...");

  try {
    const insights = await generateMeetingInsights(fullTranscript);

    await prisma.$transaction(
      async (tx) => {
        await tx.meeting.update({
          where: { id: meetingId },
          data: {
            summaryMarkdown: insights.summary,
          },
        });

        if (insights.actionItems && insights.actionItems.length > 0) {
          await tx.actionItem.deleteMany({
            where: { meetingId },
          });

          await tx.actionItem.createMany({
            data: insights.actionItems.map((item) => ({
              meetingId,
              taskDescription: item.task,
              assigneeName: item.assignee || null,
              priority: "MEDIUM",
              status: "PENDING",
            })),
          });
        }
      },
      {
        timeout: 30000,
        maxWait: 10000,
      }
    );

    log(`AI Insights saved. Summary length: ${insights.summary.length}, Action items: ${insights.actionItems.length}`);
  } catch (err: any) {
    log(`Gemini insights generation failed: ${err.message}. Continuing with transcription.`);
  }

  log("Generating chapters with Gemini AI...");
  try {
    const chapters = await generateMeetingChapters(fullTranscript);
    if (chapters && chapters.length > 0) {
      await prisma.meeting.update({
        where: { id: meetingId },
        data: {
          chaptersJson: JSON.stringify(chapters),
        },
      });
      log(`Saved ${chapters.length} chapters.`);
    }
  } catch (err: any) {
    log(`Chapter generation failed: ${err.message}. Continuing.`);
  }
}

export async function markAsFailed(meetingId: string, errorMessage: string) {
  log(`Marking meeting ${meetingId} as FAILED: ${errorMessage}`);
  try {
    await prisma.meeting.update({
      where: { id: meetingId },
      data: {
        status: "FAILED",
        lastError: errorMessage,
        nextRetryAt: null,
        progressMessage: `Failed: ${errorMessage}`,
      },
    });

    await notifyMeetingFailed(meetingId, errorMessage);
  } catch (err: any) {
    console.error(`Failed to mark meeting ${meetingId} as failed:`, err);
  }
}
