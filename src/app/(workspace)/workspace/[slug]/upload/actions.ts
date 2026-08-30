"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { startSarvamTranscriptionJob } from "@/lib/sarvam";

export type CreateMeetingResult =
  | { success: true; meetingId: string; error?: never }
  | { success: false; error: string; meetingId?: never };

export async function createMeetingAction(payload: {
  workspaceSlug: string;
  title: string;
  description?: string;
  audioUrl: string;
  durationSeconds: number;
  languageCode: string;
  numSpeakers?: number;
  provider?: "GEMINI" | "SARVAM";
}): Promise<CreateMeetingResult> {
  try {
    const workspace = await prisma.workspace.findUnique({
      where: { slug: payload.workspaceSlug },
    });

    if (!workspace) {
      return { success: false, error: "Workspace not found" };
    }

    const audioUrl = payload.audioUrl?.trim();
    if (!audioUrl) {
      return {
        success: false,
        error: "Audio URL is missing. The file upload may have failed — please try again.",
      };
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
        // Fast async job initializer: return immediately to prevent Vercel Server Action timeouts
        transcriptionJobId = `gemini_${meeting.id}_${Date.now()}`;
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
          progressMessage:
            selectedProvider === "GEMINI"
              ? "Queued for Google Gemini 3.5 audio intelligence pipeline..."
              : "Job submitted to Sarvam AI cluster...",
        },
      });

      revalidatePath(`/workspace/${payload.workspaceSlug}`);
      return { success: true, meetingId: meeting.id };

    } catch (error: any) {
      console.error(`Failed to initialize ${selectedProvider} job for meeting:`, meeting.id, error);

      let friendlyError = error.message || "Failed to initialize transcription job.";
      if (selectedProvider === "SARVAM") {
        if (
          friendlyError.includes("No active Sarvam API keys") ||
          friendlyError.includes("No credits available") ||
          friendlyError.includes("402")
        ) {
          friendlyError =
            "All Sarvam API keys are currently out of credits. Please add fresh keys in Settings > API Key Pool.";
        }
      } else if (selectedProvider === "GEMINI") {
        if (
          friendlyError.includes("No active Gemini API keys") ||
          friendlyError.includes("429") ||
          friendlyError.includes("quota")
        ) {
          friendlyError =
            "Gemini API rate limit or quota exceeded. Please check your Gemini API key in Settings > API Key Pool.";
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

      return { success: false, error: friendlyError };
    }
  } catch (outerError: any) {
    console.error("[CREATE MEETING ACTION CRITICAL ERROR]", outerError);
    return {
      success: false,
      error: outerError.message || "An unexpected server error occurred.",
    };
  }
}