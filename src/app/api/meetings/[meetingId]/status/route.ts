import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSarvamJobStatus } from "@/lib/sarvam";
import { processCompletedTranscription, markAsFailed } from "@/lib/transcription-processor";

const processingJobs = new Set<string>();

interface RouteParams {
  params: Promise<{ meetingId: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const { meetingId } = await params;

  if (processingJobs.has(meetingId)) {
    return NextResponse.json({ status: "TRANSCRIBING" });
  }

  try {
    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
    });

    if (!meeting) {
      return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
    }

    if (meeting.status !== "TRANSCRIBING") {
      return NextResponse.json({ status: meeting.status, progressMessage: meeting.progressMessage });
    }

    if (!meeting.sarvamJobId) {
      await markAsFailed(meetingId, "No SARvam job ID found.");
      return NextResponse.json({ status: "FAILED", progressMessage: "No SARvam job ID found." });
    }

    if (processingJobs.has(meetingId)) {
      return NextResponse.json({
        status: "TRANSCRIBING",
        progressMessage: meeting.progressMessage || "Processing transcription pipeline..."
      });
    }

    let jobDetails;
    try {
      jobDetails = await getSarvamJobStatus(meeting.sarvamJobId);
    } catch (err: any) {
      console.error(`[STATUS] Error fetching SARvam status for ${meetingId}: ${err.message}`);
      return NextResponse.json({
        status: "TRANSCRIBING",
        progressMessage: meeting.progressMessage || "Re-attempting status sync with Sarvam AI..."
      });
    }

    if (jobDetails.job_state === "Completed") {
      processingJobs.add(meetingId);

      processCompletedTranscription(meetingId)
        .catch((err) => {
          console.error(`[STATUS] Background processing error for ${meetingId}:`, err.message);
        })
        .finally(() => {
          processingJobs.delete(meetingId);
        });

      return NextResponse.json({
        status: "TRANSCRIBING",
        progressMessage: "Sarvam AI job completed. Triggering local processing pipeline..."
      });
    }

    if (jobDetails.job_state === "Failed") {
      const errMsg = jobDetails.error_message || "Sarvam job failed";
      console.warn(`[STATUS] Job ${meeting.sarvamJobId} failed on Sarvam: ${errMsg}. Attempting failover to next key...`);

      try {
        const { startSarvamTranscriptionJob } = await import("@/lib/sarvam");
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
            progressMessage: "API key exhausted. Rotated to next key in pool and resumed transcription...",
          },
        });

        return NextResponse.json({
          status: "TRANSCRIBING",
          progressMessage: "API key exhausted. Rotated to next key in pool and resumed transcription...",
        });
      } catch (failoverErr: any) {
        console.error(`[STATUS] Auto-failover failed:`, failoverErr.message);
        await markAsFailed(meetingId, errMsg);
        return NextResponse.json({ status: "FAILED", error: errMsg, progressMessage: `Failed: ${errMsg}` });
      }
    }

    const displayState =
      jobDetails.job_state === "Running"
        ? "Sarvam AI is actively transcribing..."
        : "Job queued at Sarvam AI (Waiting for resource allocation)...";

    if (meeting.progressMessage !== displayState) {
      await prisma.meeting.update({
        where: { id: meetingId },
        data: { progressMessage: displayState }
      });
      meeting.progressMessage = displayState;
    }

    return NextResponse.json({
      status: "TRANSCRIBING",
      progressMessage: meeting.progressMessage
    });
  } catch (error: any) {
    console.error(`[STATUS] CRITICAL ERROR for ${meetingId}: ${error.message}`);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}
