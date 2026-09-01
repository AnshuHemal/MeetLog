"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import crypto from "crypto";

export async function renameSpeakerAction(
  meetingId: string,
  speakerId: string,
  displayName: string,
  workspaceSlug: string
) {
  await prisma.speakerLabel.upsert({
    where: {
      meetingId_speakerId: {
        meetingId,
        speakerId,
      },
    },
    create: {
      meetingId,
      speakerId,
      displayName,
    },
    update: {
      displayName,
    },
  });

  revalidatePath(`/workspace/${workspaceSlug}/meetings/${meetingId}`);
  return { success: true };
}

export async function editSegmentAction(
  segmentId: string,
  text: string,
  meetingId: string,
  workspaceSlug: string,
  isEdited?: boolean
) {
  await prisma.transcriptSegment.update({
    where: { id: segmentId },
    data: { text, isEdited: isEdited ?? true },
  });

  revalidatePath(`/workspace/${workspaceSlug}/meetings/${meetingId}`);
  return { success: true };
}

export async function toggleActionItemAction(
  actionItemId: string,
  isCompleted: boolean,
  meetingId: string,
  workspaceSlug: string
) {
  await prisma.actionItem.update({
    where: { id: actionItemId },
    data: {
      status: isCompleted ? "COMPLETED" : "PENDING",
    },
  });

  revalidatePath(`/workspace/${workspaceSlug}/meetings/${meetingId}`);
  return { success: true };
}

export async function draftMeetingEmailAction(
  meetingId: string,
  meetingTitle: string,
  summaryMarkdown: string,
  workspaceSlug: string
) {
  const actionItems = await prisma.actionItem.findMany({
    where: { meetingId },
  });

  const actionList = actionItems.map(
    (item) => `${item.taskDescription}${item.assigneeName ? ` (Assigned to: ${item.assigneeName})` : ""}`
  );

  const { generateFollowUpEmail } = await import("@/lib/gemini");
  const emailDraft = await generateFollowUpEmail(meetingTitle, summaryMarkdown, actionList);

  return { success: true, emailDraft };
}

export async function toggleMeetingPublicAction(
  meetingId: string,
  isPublic: boolean,
  workspaceSlug: string
) {
  if (isPublic) {
    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      select: { shareToken: true },
    });

    const token = meeting?.shareToken || crypto.randomUUID();

    await prisma.meeting.update({
      where: { id: meetingId },
      data: {
        isPublic: true,
        shareToken: token,
      },
    });

    revalidatePath(`/workspace/${workspaceSlug}/meetings/${meetingId}`);
    return { success: true, shareToken: token };
  } else {
    await prisma.meeting.update({
      where: { id: meetingId },
      data: {
        isPublic: false,
      },
    });

    revalidatePath(`/workspace/${workspaceSlug}/meetings/${meetingId}`);
    return { success: true, shareToken: null };
  }
}

export async function askMeetingAIAction(
  meetingId: string,
  userQuery: string,
  workspaceSlug: string
) {
  const segments = await prisma.transcriptSegment.findMany({
    where: { meetingId },
    orderBy: { index: "asc" },
  });

  const speakerLabels = await prisma.speakerLabel.findMany({
    where: { meetingId },
  });

  const speakerMap: Record<string, string> = {};
  speakerLabels.forEach((label) => {
    speakerMap[label.speakerId] = label.displayName;
  });

  const transcriptText = segments
    .map((seg) => {
      const name = speakerMap[seg.speakerId] || seg.speakerId;
      return `${name}: ${seg.text}`;
    })
    .join("\n");

  const { answerTranscriptQuestion } = await import("@/lib/gemini");
  const aiAnswer = await answerTranscriptQuestion(transcriptText, userQuery);

  return { success: true, answer: aiAnswer };
}

export async function updateSegmentAnnotationAction(
  segmentId: string,
  meetingId: string,
  highlightColor: string | null,
  noteText: string | null,
  workspaceSlug: string
) {
  await prisma.transcriptSegment.update({
    where: { id: segmentId },
    data: { highlightColor, noteText }
  });
  revalidatePath(`/workspace/${workspaceSlug}/meetings/${meetingId}`);
  return { success: true };
}

export async function analyzeMeetingSentimentAction(
  meetingId: string,
  workspaceSlug: string
) {
  const segments = await prisma.transcriptSegment.findMany({
    where: { meetingId },
    select: { id: true, text: true, speakerId: true },
    orderBy: { index: "asc" },
  });

  if (segments.length === 0) return { success: false, error: "No segments found." };

  const { analyzeSentimentBatch } = await import("@/lib/gemini");

  const BATCH_SIZE = 150;
  const allResults = [];
  for (let i = 0; i < segments.length; i += BATCH_SIZE) {
    const batch = segments.slice(i, i + BATCH_SIZE);
    const batchResults = await analyzeSentimentBatch(batch);
    allResults.push(...batchResults);
  }

  await Promise.all(
    allResults.map((result) =>
      prisma.transcriptSegment.update({
        where: { id: result.id },
        data: { sentiment: result.sentiment },
      })
    )
  );

  revalidatePath(`/workspace/${workspaceSlug}/meetings/${meetingId}`);
  return { success: true, analyzed: allResults.length };
}

export async function pingUserPresenceAction(
  meetingId: string,
  workspaceSlug: string
) {
  try {
    const user = await requireUser();

    const membership = await prisma.workspaceMember.findFirst({
      where: { userId: user.id, workspace: { slug: workspaceSlug } },
      select: { id: true },
    });

    if (!membership) return { success: false, activeUsers: [] };

    // Verify meeting exists to prevent foreign key constraint violation
    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      select: { id: true },
    });

    if (!meeting) {
      return { success: false, activeUsers: [] };
    }

    const now = new Date();

    await prisma.userPresence.upsert({
      where: { userId_meetingId: { userId: user.id, meetingId } },
      create: { userId: user.id, meetingId, updatedAt: now },
      update: { updatedAt: now },
    });

    const activeThreshold = new Date(Date.now() - 60000);
    const activePresences = await prisma.userPresence.findMany({
      where: {
        meetingId,
        updatedAt: { gte: activeThreshold },
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            image: true,
            email: true,
          },
        },
      },
    });

    return {
      success: true,
      activeUsers: activePresences.map((p) => ({
        id: p.user.id,
        name: p.user.name,
        image: p.user.image,
        email: p.user.email,
      })),
    };
  } catch (err: any) {
    console.warn(`[PRESENCE] Heartbeat warning for meeting ${meetingId}:`, err.message);
    return { success: false, activeUsers: [] };
  }
}

export async function retryMeetingAction(meetingId: string, workspaceSlug: string) {
  const user = await requireUser();

  const membership = await prisma.workspaceMember.findFirst({
    where: { userId: user.id, workspace: { slug: workspaceSlug } },
  });
  if (!membership) {
    return { success: false, error: "Not a member of this workspace." };
  }

  const meeting = await prisma.meeting.findUnique({ where: { id: meetingId } });
  if (!meeting) {
    return { success: false, error: "Meeting not found." };
  }
  if (meeting.workspaceId !== membership.workspaceId) {
    return { success: false, error: "Meeting does not belong to this workspace." };
  }
  if (meeting.status !== "FAILED") {
    return { success: false, error: "Only failed meetings can be retried." };
  }

  const { startSarvamTranscriptionJob } = await import("@/lib/sarvam");

  try {
    const jobId = await startSarvamTranscriptionJob(
      meeting.audioUrl,
      meeting.languageCode,
      meeting.numSpeakers ?? undefined,
    );

    await prisma.meeting.update({
      where: { id: meetingId },
      data: {
        status: "TRANSCRIBING",
        sarvamJobId: jobId,
        retryCount: 0,
        lastError: null,
        nextRetryAt: null,
      },
    });

    revalidatePath(`/workspace/${workspaceSlug}/meetings/${meetingId}`);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to start transcription." };
  }
}

export async function retranscribeMeetingAction(
  meetingId: string,
  workspaceSlug: string,
  provider: "GEMINI" | "SARVAM" = "GEMINI"
) {
  const user = await requireUser();

  const membership = await prisma.workspaceMember.findFirst({
    where: { userId: user.id, workspace: { slug: workspaceSlug } },
  });
  if (!membership) {
    return { success: false, error: "Not a member of this workspace." };
  }

  const meeting = await prisma.meeting.findUnique({ where: { id: meetingId } });
  if (!meeting) {
    return { success: false, error: "Meeting not found." };
  }

  let jobId: string;
  if (provider === "GEMINI") {
    jobId = `gemini_${meeting.id}_${Date.now()}`;
  } else {
    const { startSarvamTranscriptionJob } = await import("@/lib/sarvam");
    jobId = await startSarvamTranscriptionJob(
      meeting.audioUrl,
      meeting.languageCode,
      meeting.numSpeakers ?? undefined
    );
  }

  await prisma.$transaction([
    prisma.transcriptSegment.deleteMany({ where: { meetingId } }),
    prisma.meeting.update({
      where: { id: meetingId },
      data: {
        status: "TRANSCRIBING",
        sarvamJobId: jobId,
        retryCount: 0,
        lastError: null,
        nextRetryAt: null,
        progressMessage:
          provider === "GEMINI"
            ? "Queued for Google Gemini audio intelligence pipeline..."
            : "Submitted to Sarvam AI cluster...",
      },
    }),
  ]);

  revalidatePath(`/workspace/${workspaceSlug}/meetings/${meetingId}`);
  return { success: true };
}

export async function generateSummaryAction(meetingId: string, workspaceSlug: string) {
  const user = await requireUser();

  const membership = await prisma.workspaceMember.findFirst({
    where: { userId: user.id, workspace: { slug: workspaceSlug } },
  });
  if (!membership) {
    return { success: false, error: "Not a member of this workspace." };
  }

  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    include: {
      segments: {
        orderBy: { index: "asc" },
      },
    },
  });

  if (!meeting || meeting.segments.length === 0) {
    return { success: false, error: "No transcript segments found to summarize." };
  }

  const fullTranscript = meeting.segments
    .map((s) => `[${s.speakerId}] ${s.text}`)
    .join("\n");

  try {
    const { generateMeetingInsights, generateMeetingChapters } = await import("@/lib/gemini");
    const insights = await generateMeetingInsights(fullTranscript);

    await prisma.$transaction(async (tx) => {
      await tx.meeting.update({
        where: { id: meetingId },
        data: {
          summaryMarkdown: insights.summary,
        },
      });

      if (insights.actionItems && insights.actionItems.length > 0) {
        await tx.actionItem.deleteMany({ where: { meetingId } });
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
    });

    try {
      const chapters = await generateMeetingChapters(fullTranscript);
      if (chapters && chapters.length > 0) {
        await prisma.meeting.update({
          where: { id: meetingId },
          data: { chaptersJson: JSON.stringify(chapters) },
        });
      }
    } catch {}

    revalidatePath(`/workspace/${workspaceSlug}/meetings/${meetingId}`);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to generate summary." };
  }
}

export async function replaceMeetingAudioAction(
  meetingId: string,
  workspaceSlug: string,
  audioUrl: string,
  durationSeconds: number,
) {
  const user = await requireUser();

  const membership = await prisma.workspaceMember.findFirst({
    where: { userId: user.id, workspace: { slug: workspaceSlug } },
  });
  if (!membership) {
    return { success: false, error: "Not a member of this workspace." };
  }

  const meeting = await prisma.meeting.findUnique({ where: { id: meetingId } });
  if (!meeting) {
    return { success: false, error: "Meeting not found." };
  }
  if (meeting.workspaceId !== membership.workspaceId) {
    return { success: false, error: "Meeting does not belong to this workspace." };
  }

  const { startSarvamTranscriptionJob } = await import("@/lib/sarvam");

  try {
    const jobId = await startSarvamTranscriptionJob(
      audioUrl,
      meeting.languageCode,
      meeting.numSpeakers ?? undefined,
    );

    await prisma.transcriptSegment.deleteMany({ where: { meetingId } });
    await prisma.speakerLabel.deleteMany({ where: { meetingId } });
    await prisma.actionItem.deleteMany({ where: { meetingId } });

    await prisma.meeting.update({
      where: { id: meetingId },
      data: {
        status: "TRANSCRIBING",
        sarvamJobId: jobId,
        audioUrl,
        durationSeconds,
        retryCount: 0,
        lastError: null,
        nextRetryAt: null,
        summaryMarkdown: null,
        chaptersJson: null,
      },
    });

    revalidatePath(`/workspace/${workspaceSlug}/meetings/${meetingId}`);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to start transcription." };
  }
}

export async function syncMeetingDurationAction(
  meetingId: string,
  durationSeconds: number,
  workspaceSlug: string
) {
  if (!durationSeconds || isNaN(durationSeconds) || durationSeconds <= 0) {
    return { success: false };
  }

  try {
    await prisma.meeting.update({
      where: { id: meetingId },
      data: { durationSeconds: Math.round(durationSeconds) },
    });

    revalidatePath(`/workspace/${workspaceSlug}/meetings/${meetingId}`);
    revalidatePath(`/workspace/${workspaceSlug}`);
    revalidatePath(`/workspace/${workspaceSlug}/meetings`);
    return { success: true };
  } catch {
    return { success: false };
  }
}
