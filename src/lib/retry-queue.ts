import { prisma } from "@/lib/prisma";
import { processCompletedTranscription } from "@/lib/transcription-processor";

const POLL_INTERVAL_MS = 15_000;
const MAX_CONCURRENT_JOBS = 3;

let isRunning = false;
let pollTimer: ReturnType<typeof setInterval> | null = null;

export function startRetryQueue() {
  if (isRunning || pollTimer) return;

  isRunning = true;
  console.log("[RETRY QUEUE] Started — polling every", POLL_INTERVAL_MS / 1000, "s");

  pollTimer = setInterval(async () => {
    await processRetryQueue();
  }, POLL_INTERVAL_MS);

  processRetryQueue();
}

export function stopRetryQueue() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  isRunning = false;
  console.log("[RETRY QUEUE] Stopped");
}

async function processRetryQueue() {
  try {
    const now = new Date();

    const meetingsDueForRetry = await prisma.meeting.findMany({
      where: {
        status: "TRANSCRIBING",
        nextRetryAt: { not: null, lte: now },
        sarvamJobId: { not: null },
      },
      orderBy: { nextRetryAt: "asc" },
      take: MAX_CONCURRENT_JOBS,
    });

    if (meetingsDueForRetry.length > 0) {
      console.log(
        `[RETRY QUEUE] Processing ${meetingsDueForRetry.length} meeting(s) due for retry`,
      );

      await Promise.allSettled(
        meetingsDueForRetry.map((meeting) =>
          processCompletedTranscription(meeting.id),
        ),
      );
    }

    const activeTranscribingMeetings = await prisma.meeting.findMany({
      where: {
        status: "TRANSCRIBING",
        nextRetryAt: null,
        sarvamJobId: { not: null },
      },
      orderBy: { createdAt: "asc" },
      take: MAX_CONCURRENT_JOBS,
    });

    if (activeTranscribingMeetings.length > 0) {
      console.log(
        `[RETRY QUEUE] Syncing status for ${activeTranscribingMeetings.length} active transcribing meeting(s)...`,
      );

      for (const meeting of activeTranscribingMeetings) {
        try {
          const { getSarvamJobStatus } = await import("@/lib/sarvam");
          const jobDetails = await getSarvamJobStatus(meeting.sarvamJobId!);
          const state = jobDetails.job_state;

          if (state === "Completed") {
            console.log(`[RETRY QUEUE] Active meeting ${meeting.id} completed. Processing...`);
            processCompletedTranscription(meeting.id).catch((err) => {
              console.error(`[RETRY QUEUE] Background processing error for ${meeting.id}:`, err.message);
            });
          } else if (state === "Failed") {
            console.log(`[RETRY QUEUE] Active meeting ${meeting.id} failed. Marking as FAILED...`);
            const { markAsFailed } = await import("@/lib/transcription-processor");
            await markAsFailed(meeting.id, jobDetails.error_message || "Sarvam job failed");
          } else {
            const displayState =
              state === "Running"
                ? "Sarvam AI is actively transcribing..."
                : "Job queued at Sarvam AI (Waiting for resource allocation)...";

            if (meeting.progressMessage !== displayState) {
              await prisma.meeting.update({
                where: { id: meeting.id },
                data: { progressMessage: displayState },
              });
            }
          }
        } catch (err: any) {
          console.error(`[RETRY QUEUE] Failed to sync status for ${meeting.id}:`, err.message);
        }
      }
    }
  } catch (error: any) {
    console.error(`[RETRY QUEUE] Error: ${error.message}`);
  }
}

export async function scheduleRetry(meetingId: string, delayMs = 0) {
  const nextRetryAt = new Date(Date.now() + delayMs);

  await prisma.meeting.update({
    where: { id: meetingId },
    data: {
      status: "TRANSCRIBING",
      nextRetryAt,
      retryCount: 0,
      lastError: null,
    },
  });

  console.log(`[RETRY QUEUE] Scheduled retry for ${meetingId} at ${nextRetryAt.toISOString()}`);
}
