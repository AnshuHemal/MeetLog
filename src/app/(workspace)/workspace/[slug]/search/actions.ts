"use server";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

export interface SearchMatchSegment {
  id: string;
  meetingId: string;
  meetingTitle: string;
  startTime: number;
  text: string;
  speakerId: string;
  speakerName: string;
}

export interface SearchMatchMeeting {
  id: string;
  title: string;
  description: string | null;
  createdAt: Date;
  durationSeconds: number;
}

export interface SearchResults {
  meetings: SearchMatchMeeting[];
  segments: SearchMatchSegment[];
}

export async function searchWorkspaceMeetingsAction(
  workspaceSlug: string,
  query: string
): Promise<SearchResults> {
  const user = await requireUser();

  const membership = await prisma.workspaceMember.findFirst({
    where: { userId: user.id, workspace: { slug: workspaceSlug } },
    include: { workspace: true },
  });

  if (!membership) {
    throw new Error("Unauthorized access to workspace search.");
  }

  const workspaceId = membership.workspaceId;
  const cleanQuery = query.trim();

  if (!cleanQuery) {
    return { meetings: [], segments: [] };
  }

  const meetings = await prisma.meeting.findMany({
    where: {
      workspaceId,
      OR: [
        { title: { contains: cleanQuery, mode: "insensitive" } },
        { description: { contains: cleanQuery, mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      title: true,
      description: true,
      createdAt: true,
      durationSeconds: true,
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  const segments = await prisma.transcriptSegment.findMany({
    where: {
      meeting: { workspaceId },
      text: { contains: cleanQuery, mode: "insensitive" },
    },
    select: {
      id: true,
      meetingId: true,
      startTime: true,
      text: true,
      speakerId: true,
      meeting: {
        select: {
          title: true,
          speakerLabels: {
            select: {
              speakerId: true,
              displayName: true,
            },
          },
        },
      },
    },
    orderBy: { meeting: { createdAt: "desc" } },
    take: 30,
  });

  const formattedSegments: SearchMatchSegment[] = segments.map((seg) => {
    const labels = seg.meeting.speakerLabels;
    const labelMatch = labels.find((l) => l.speakerId === seg.speakerId);
    const speakerName = labelMatch?.displayName || `Speaker ${seg.speakerId.replace("SPEAKER_", "")}`;

    return {
      id: seg.id,
      meetingId: seg.meetingId,
      meetingTitle: seg.meeting.title,
      startTime: seg.startTime,
      text: seg.text,
      speakerId: seg.speakerId,
      speakerName,
    };
  });

  return {
    meetings,
    segments: formattedSegments,
  };
}
