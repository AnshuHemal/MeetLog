"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { startSarvamTranscriptionJob } from "@/lib/sarvam";

export async function createMeetingAction(payload: {
  workspaceSlug: string;
  title: string;
  description?: string;
  audioUrl: string;
  durationSeconds: number;
  languageCode: string;
  numSpeakers?: number;
}) {
  const workspace = await prisma.workspace.findUnique({
    where: { slug: payload.workspaceSlug },
  });

  if (!workspace) {
    throw new Error("Workspace not found");
  }

  const audioUrl = payload.audioUrl?.trim();
  if (!audioUrl) {
    throw new Error("Audio URL is missing. The file upload may have failed — please try again.");
  }

  const meeting = await prisma.meeting.create({
    data: {
      workspaceId: workspace.id,
      title: payload.title,
      description: payload.description,
      audioUrl,
      durationSeconds: payload.durationSeconds,
      status: "UPLOADED",
      languageCode: payload.languageCode,
      numSpeakers: payload.numSpeakers,
    },
  });

  try {
    const sarvamJobId = await startSarvamTranscriptionJob(
      audioUrl,
      payload.languageCode,
      payload.numSpeakers
    );

    await prisma.meeting.update({
      where: { id: meeting.id },
      data: {
        status: "TRANSCRIBING",
        sarvamJobId,
      },
    });
  } catch (error: any) {
    console.error("Failed to start Sarvam job for meeting:", meeting.id, error);

    const friendlyError = error.message.includes("No active Sarvam API keys") || error.message.includes("No credits available") || error.message.includes("402")
      ? "All Sarvam API keys are currently out of credits. Please add fresh keys in Settings > API Key Pool."
      : error.message;

    await prisma.meeting.update({
      where: { id: meeting.id },
      data: {
        status: "FAILED",
        lastError: friendlyError,
        progressMessage: `Failed: ${friendlyError}`,
      },
    });

    throw new Error(friendlyError);
  }

  revalidatePath(`/workspace/${payload.workspaceSlug}`);
  return { success: true, meetingId: meeting.id };
}
