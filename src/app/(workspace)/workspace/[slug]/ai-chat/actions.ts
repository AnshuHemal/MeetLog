"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { generateGeminiContent } from "@/lib/gemini";
import { revalidatePath } from "next/cache";

export interface Citation {
  meetingId: string;
  meetingTitle: string;
  timestampSeconds: number;
  timestampFormatted: string;
  speakerName: string;
  snippet: string;
}

export interface DBMessageItem {
  id: string;
  sender: "user" | "ai";
  text: string;
  citations?: Citation[];
  createdAt: string;
}

export interface AskAIResult {
  success: boolean;
  answer?: string;
  citations?: Citation[];
  error?: string;
}

import { formatSecondsToTime } from "@/lib/time-utils";

function formatSeconds(seconds: number): string {
  return formatSecondsToTime(seconds);
}

export async function getWorkspaceAIChatMessagesAction(workspaceSlug: string) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) return { success: false, error: "Unauthorized" };

    const workspace = await prisma.workspace.findUnique({
      where: { slug: workspaceSlug },
      include: {
        members: { where: { userId: session.user.id } },
      },
    });

    if (!workspace || workspace.members.length === 0) {
      return { success: false, error: "Workspace not found or access denied." };
    }

    const messages = await prisma.aIChatMessage.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { createdAt: "asc" },
    });

    const formatted: DBMessageItem[] = messages.map((m) => {
      let citations: Citation[] | undefined;
      if (m.citations) {
        try {
          citations = JSON.parse(m.citations);
        } catch (e) {}
      }
      return {
        id: m.id,
        sender: m.sender as "user" | "ai",
        text: m.text,
        citations,
        createdAt: m.createdAt.toISOString(),
      };
    });

    return { success: true, messages: formatted };
  } catch (error: any) {
    console.error("getWorkspaceAIChatMessagesAction Error:", error);
    return { success: false, error: error?.message || "Failed to fetch chat history." };
  }
}

export async function clearWorkspaceAIChatHistoryAction(workspaceSlug: string) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) return { success: false, error: "Unauthorized" };

    const workspace = await prisma.workspace.findUnique({
      where: { slug: workspaceSlug },
    });

    if (workspace) {
      await prisma.aIChatMessage.deleteMany({
        where: { workspaceId: workspace.id },
      });
    }

    revalidatePath(`/workspace/${workspaceSlug}/ai-chat`);
    return { success: true };
  } catch (error: any) {
    console.error("clearWorkspaceAIChatHistoryAction Error:", error);
    return { success: false, error: error?.message || "Failed to clear chat history." };
  }
}

export async function askWorkspaceAIAction(
  workspaceSlug: string,
  question: string
): Promise<AskAIResult> {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return { success: false, error: "Unauthorized" };
    }

    const workspace = await prisma.workspace.findUnique({
      where: { slug: workspaceSlug },
      include: {
        members: {
          where: { userId: session.user.id },
        },
      },
    });

    if (!workspace || workspace.members.length === 0) {
      return { success: false, error: "Workspace not found or access denied." };
    }

    await prisma.aIChatMessage.create({
      data: {
        workspaceId: workspace.id,
        userId: session.user.id,
        sender: "user",
        text: question,
      },
    });

    const meetings = await prisma.meeting.findMany({
      where: {
        workspaceId: workspace.id,
        status: "COMPLETED",
      },
      include: {
        segments: {
          orderBy: { index: "asc" },
          take: 100,
        },
        speakerLabels: true,
        actionItems: true,
      },
      orderBy: { createdAt: "desc" },
      take: 15,
    });

    if (meetings.length === 0) {
      const noDataAnswer = "There are no completed meeting recordings in this workspace yet. Upload or record a meeting to start asking questions!";
      await prisma.aIChatMessage.create({
        data: {
          workspaceId: workspace.id,
          userId: session.user.id,
          sender: "ai",
          text: noDataAnswer,
        },
      });

      return {
        success: true,
        answer: noDataAnswer,
        citations: [],
      };
    }

    let contextText = `Workspace Name: ${workspace.name}\nTotal Completed Meetings: ${meetings.length}\n\n`;

    meetings.forEach((m, idx) => {
      const speakerMap = new Map<string, string>();
      m.speakerLabels.forEach((lbl) => speakerMap.set(lbl.speakerId, lbl.displayName));

      contextText += `=== MEETING #${idx + 1} ===\n`;
      contextText += `ID: ${m.id}\nTitle: ${m.title}\nDate: ${m.createdAt.toLocaleDateString()}\n`;
      if (m.summaryMarkdown) {
        contextText += `Summary: ${m.summaryMarkdown.slice(0, 300)}...\n`;
      }
      if (m.actionItems.length > 0) {
        contextText += `Action Items:\n` + m.actionItems.map((a) => `- [${a.status}] ${a.taskDescription}`).join("\n") + "\n";
      }

      contextText += `Transcript Excerpts:\n`;
      m.segments.forEach((seg) => {
        const speaker = speakerMap.get(seg.speakerId) || seg.speakerId;
        const timeStr = formatSeconds(seg.startTime);
        contextText += `[SegID:${seg.id}|Time:${timeStr}|Sec:${Math.floor(seg.startTime)}|Speaker:${speaker}] ${seg.text}\n`;
      });
      contextText += `\n`;
    });

    const systemPrompt = `You are MeetLog Workspace AI, an intelligent executive assistant for the "${workspace.name}" workspace.
Answer the user's question accurately using ONLY the meeting transcripts, summaries, and action items provided in the context below.

CRITICAL CITATION RULES:
1. Whenever you reference a specific discussion, decision, or action item, cite the meeting source.
2. Format inline citations in your text like this: [CITATION: {Meeting Title} | {Timestamp MM:SS} | {Meeting ID} | {Seconds}]
   Example: As discussed in the sprint planning [CITATION: Q3 Product Roadmap | 04:15 | cmrek4v32003q00w832leqd7j | 255], the team agreed to focus on UI.
3. If the answer cannot be found in the context, politely inform the user that it wasn't discussed in any recorded meetings.
4. Use rich Markdown formatting (bullet points, bold text, headers) for clean readability.`;

    const fullPrompt = `${systemPrompt}\n\n=== CONTEXT DATA ===\n${contextText}\n\n=== USER QUESTION ===\n${question}`;

    const rawAnswer = await generateGeminiContent(fullPrompt);

    const citationRegex = /\[CITATION:\s*([^|]+)\s*\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|\s*(\d+)\]/g;
    const citationsMap = new Map<string, Citation>();

    let match;
    while ((match = citationRegex.exec(rawAnswer)) !== null) {
      const [fullMatch, meetingTitle, timestampFormatted, meetingId, secondsStr] = match;
      const key = `${meetingId}-${secondsStr}`;
      if (!citationsMap.has(key)) {
        citationsMap.set(key, {
          meetingId: meetingId.trim(),
          meetingTitle: meetingTitle.trim(),
          timestampSeconds: parseInt(secondsStr.trim(), 10),
          timestampFormatted: timestampFormatted.trim(),
          speakerName: "Speaker",
          snippet: `Jump to ${timestampFormatted.trim()}`,
        });
      }
    }

    const cleanAnswer = rawAnswer.replace(citationRegex, (_: string, title: string, time: string) => `[${title.trim()} • ${time.trim()}]`);
    const citationsArray = Array.from(citationsMap.values());

    await prisma.aIChatMessage.create({
      data: {
        workspaceId: workspace.id,
        userId: session.user.id,
        sender: "ai",
        text: cleanAnswer,
        citations: citationsArray.length > 0 ? JSON.stringify(citationsArray) : null,
      },
    });

    revalidatePath(`/workspace/${workspaceSlug}/ai-chat`);

    return {
      success: true,
      answer: cleanAnswer,
      citations: citationsArray,
    };
  } catch (error: any) {
    console.error("askWorkspaceAIAction Error:", error);
    return {
      success: false,
      error: error?.message || "Failed to query workspace AI intelligence.",
    };
  }
}
