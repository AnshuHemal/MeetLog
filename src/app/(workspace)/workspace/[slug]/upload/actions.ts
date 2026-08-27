"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { startSarvamTranscriptionJob } from "@/lib/sarvam";
import { startGeminiTranscriptionJob } from "@/lib/gemini-transcribe";

export async function createMeetingAction(payload: {
  workspaceSlug: string;
  title: string;
  description?: string;
  audioUrl: string;
  durationSeconds: number;
  languageCode: string;
  numSpeakers?: number;
  provider?: "GEMINI" | "SARVAM";
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

  const selectedProvider = payload.provider || "GEMINI";

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
    let transcriptionJobId: string;

    if (selectedProvider === "GEMINI") {
      const { jobId } = await startGeminiTranscriptionJob(
        meeting.id,
        audioUrl,
        payload.languageCode,
        payload.numSpeakers
      );
      transcriptionJobId = jobId;
    } else {
      transcriptionJobId = await startSarvamTranscriptionJob(
        audioUrl,
        payload.languageCode,
        payload.numSpeakers
      );
    }

    await prisma.meeting.update({
      where: { id: meeting.id },
      data: {
        status: "TRANSCRIBING",
        sarvamJobId: transcriptionJobId,
      },
    });
  } catch (error: any) {
    console.error(`Failed to start ${selectedProvider} job for meeting:`, meeting.id, error);

    let friendlyError = error.message;
    if (selectedProvider === "SARVAM") {
      if (error.message.includes("No active Sarvam API keys") || error.message.includes("No credits available") || error.message.includes("402")) {
        friendlyError = "All Sarvam API keys are currently out of credits. Please add fresh keys in Settings > API Key Pool.";
      }
    } else if (selectedProvider === "GEMINI") {
      if (error.message.includes("No active Gemini API keys") || error.message.includes("429") || error.message.includes("quota")) {
        friendlyError = "Gemini API rate limit or quota exceeded. Please check your Gemini API key in Settings > API Key Pool.";
      }
    }

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
