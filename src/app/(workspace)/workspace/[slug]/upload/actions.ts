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

export async function importMeetingFromLinkAction(payload: {
  workspaceSlug: string;
  url: string;
  title: string;
  description?: string;
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

    const rawUrl = payload.url?.trim();
    if (!rawUrl) {
      return { success: false, error: "Please enter a valid media or YouTube URL." };
    }

    const { ingestMediaLink } = await import("@/lib/link-fetcher");
    const ingested = await ingestMediaLink(rawUrl, payload.title);

    // ─── Direct YouTube Transcript Path (Instant & 100% Cloud-Safe) ─────────────
    if (ingested.isYouTubeDirect && ingested.transcriptSegments && ingested.transcriptSegments.length > 0) {
      console.log(`[IMPORT LINK] Creating completed meeting for YouTube direct transcript (${ingested.transcriptSegments.length} segments)...`);

      const meetingTitle = payload.title?.trim() || ingested.title || "YouTube Recording";

      const meeting = await prisma.meeting.create({
        data: {
          workspaceId: workspace.id,
          title: meetingTitle,
          description: payload.description || "Imported from YouTube",
          audioUrl: ingested.audioUrl,
          durationSeconds: ingested.durationSeconds,
          status: "COMPLETED",
          languageCode: "auto",
          numSpeakers: payload.numSpeakers || 1,
          progressMessage: "Import complete. Dialogue transcript synchronized from YouTube.",
        },
      });

      // Save all transcript segments
      await prisma.transcriptSegment.createMany({
        data: ingested.transcriptSegments.map((s) => ({
          meetingId: meeting.id,
          index: s.index,
          speakerId: s.speakerId,
          startTime: s.startTime,
          endTime: s.endTime,
          text: s.text,
        })),
      });

      // Launch background AI summary & action items generation
      const fullTranscript = ingested.transcriptSegments.map((s) => s.text).join(" ");
      if (fullTranscript.trim().length > 0) {
        (async () => {
          try {
            console.log(`[IMPORT LINK] Synthesizing executive AI summary for meeting ${meeting.id}...`);
            const { generateMeetingInsights, generateMeetingChapters } = await import("@/lib/gemini");
            const [insights, chapters] = await Promise.allSettled([
              generateMeetingInsights(fullTranscript),
              generateMeetingChapters(fullTranscript),
            ]);

            const summaryMarkdown = insights.status === "fulfilled" ? insights.value.summary : null;
            const chaptersJson = chapters.status === "fulfilled" ? JSON.stringify(chapters.value) : null;

            await prisma.meeting.update({
              where: { id: meeting.id },
              data: {
                ...(summaryMarkdown ? { summaryMarkdown } : {}),
                ...(chaptersJson ? { chaptersJson } : {}),
              },
            });

            if (insights.status === "fulfilled" && insights.value.actionItems?.length) {
              await prisma.actionItem.createMany({
                data: insights.value.actionItems.map((item) => ({
                  meetingId: meeting.id,
                  taskDescription: item.task,
                  assigneeName: item.assignee || null,
                  priority: "MEDIUM",
                  status: "PENDING",
                })),
              });
            }

            console.log(`[IMPORT LINK] AI insights successfully attached to meeting ${meeting.id}.`);
          } catch (err: any) {
            console.warn("[IMPORT LINK] AI summary generation background non-fatal:", err.message);
          }
        })();
      }

      revalidatePath(`/workspace/${payload.workspaceSlug}/meetings`);
      return { success: true, meetingId: meeting.id };
    }

    // Standard media extraction path (Google Drive, direct URLs)
    return createMeetingAction({
      workspaceSlug: payload.workspaceSlug,
      title: payload.title || ingested.title,
      description: payload.description,
      audioUrl: ingested.audioUrl,
      durationSeconds: ingested.durationSeconds,
      languageCode: "unknown",
      numSpeakers: payload.numSpeakers,
      provider: payload.provider || "GEMINI",
    });
  } catch (error: any) {
    console.error("[IMPORT MEETING FROM LINK ACTION ERROR]", error);
    return {
      success: false,
      error: error.message || "Failed to ingest media from the provided link.",
    };
  }
}