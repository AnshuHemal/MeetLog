import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { processCompletedTranscription } from "@/lib/transcription-processor";

export async function POST(req: NextRequest) {
  let body: any;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { job_id, job_state, error_message } = body;

  if (!job_id) {
    return NextResponse.json({ error: "Missing job_id" }, { status: 400 });
  }

  console.log(`[WEBHOOK] Received Sarvam webhook: job_id=${job_id}, state=${job_state}`);

  const meeting = await prisma.meeting.findUnique({
    where: { sarvamJobId: job_id },
  });

  if (!meeting) {
    console.log(`[WEBHOOK] No meeting found for job_id ${job_id}. Ignoring.`);
    return NextResponse.json({ received: true });
  }

  if (meeting.status !== "TRANSCRIBING") {
    console.log(`[WEBHOOK] Meeting ${meeting.id} is already "${meeting.status}". Ignoring.`);
    return NextResponse.json({ received: true });
  }

  if (job_state === "Completed") {
    console.log(`[WEBHOOK] Job completed for meeting ${meeting.id}. Triggering processing...`);

    processCompletedTranscription(meeting.id).catch((err) => {
      console.error(`[WEBHOOK] Background processing error for ${meeting.id}:`, err.message);
    });

    return NextResponse.json({ received: true, processing: true });
  }

  if (job_state === "Failed") {
    console.log(`[WEBHOOK] Job failed for meeting ${meeting.id}: ${error_message}`);

    await prisma.meeting.update({
      where: { id: meeting.id },
      data: {
        status: "FAILED",
        lastError: error_message || "Sarvam job failed",
      },
    });

    return NextResponse.json({ received: true, status: "FAILED" });
  }

  return NextResponse.json({ received: true });
}
