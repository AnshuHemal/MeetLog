import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { WorkspaceTopbar } from "../../_components/workspace-topbar";
import { MeetingViewerClient } from "./_components/meeting-viewer-client";
import { ProcessingPlaceholder } from "./_components/processing-placeholder";
import { FailedMeetingView } from "./_components/failed-meeting-view";

interface MeetingPageProps {
  params: Promise<{ slug: string; meetingId: string }>;
}

export async function generateMetadata({ params }: MeetingPageProps): Promise<Metadata> {
  const { meetingId } = await params;
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: { title: true },
  });
  return { title: meeting ? `${meeting.title} — Transcript` : "Meeting Transcription" };
}

export default async function MeetingPage({ params }: MeetingPageProps) {
  const { slug, meetingId } = await params;
  const user = await requireUser();

  const membership = await prisma.workspaceMember.findFirst({
    where: { userId: user.id, workspace: { slug } },
    include: { workspace: true },
  });

  if (!membership) notFound();

  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    include: {
      segments: {
        orderBy: { index: "asc" },
      },
      speakerLabels: true,
      actionItems: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!meeting) notFound();

  if (meeting.status === "TRANSCRIBING" || meeting.status === "UPLOADED") {
    return (
      <div className="flex flex-1 flex-col overflow-y-auto">
        <WorkspaceTopbar
          workspaceName={membership.workspace.name}
          workspaceSlug={slug}
          pageTitle={meeting.title}
        />
        <main className="flex-1 flex items-center justify-center p-6">
          <ProcessingPlaceholder 
            meetingId={meetingId} 
            workspaceSlug={slug} 
            title={meeting.title} 
          />
        </main>
      </div>
    );
  }

  if (meeting.status === "FAILED") {
    return (
      <div className="flex flex-1 flex-col overflow-y-auto">
        <WorkspaceTopbar
          workspaceName={membership.workspace.name}
          workspaceSlug={slug}
          pageTitle={meeting.title}
        />
        <main className="flex-1 flex items-center justify-center p-6">
          <FailedMeetingView
            meetingId={meetingId}
            workspaceSlug={slug}
            lastError={meeting.lastError}
            retryCount={meeting.retryCount}
          />
        </main>
      </div>
    );
  }

  const speakerMap: Record<string, string> = {};
  meeting.speakerLabels.forEach((label) => {
    speakerMap[label.speakerId] = label.displayName;
  });

  const maxSegmentEnd = meeting.segments.reduce((max, s) => Math.max(max, s.endTime || 0), 0);
  const effectiveDuration = maxSegmentEnd > 0 ? Math.round(maxSegmentEnd) : (meeting.durationSeconds || 0);

  if (maxSegmentEnd > 0 && Math.abs((meeting.durationSeconds || 0) - maxSegmentEnd) > 15) {
    prisma.meeting.update({
      where: { id: meeting.id },
      data: { durationSeconds: Math.round(maxSegmentEnd) },
    }).catch(console.error);
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <WorkspaceTopbar
        workspaceName={membership.workspace.name}
        workspaceSlug={slug}
        pageTitle={meeting.title}
      />
      <MeetingViewerClient
        meeting={{
          id: meeting.id,
          title: meeting.title,
          description: meeting.description,
          audioUrl: meeting.audioUrl,
          durationSeconds: effectiveDuration,
          status: meeting.status,
          summaryMarkdown: meeting.summaryMarkdown,
          chaptersJson: meeting.chaptersJson,
          isPublic: meeting.isPublic,
          shareToken: meeting.shareToken,
        }}
        segments={(() => {
          const uniqueMap = new Map<string, (typeof meeting.segments)[0]>();
          meeting.segments.forEach((seg) => {
            const key = `${seg.speakerId}_${Math.floor(seg.startTime)}_${seg.text.trim().toLowerCase()}`;
            if (!uniqueMap.has(key)) {
              uniqueMap.set(key, seg);
            }
          });
          return Array.from(uniqueMap.values()).map((seg) => ({
            id: seg.id,
            speakerId: seg.speakerId,
            startTime: seg.startTime,
            endTime: seg.endTime,
            text: seg.text,
            index: seg.index,
            highlightColor: seg.highlightColor,
            noteText: seg.noteText,
            sentiment: seg.sentiment,
            isEdited: seg.isEdited,
          }));
        })()}
        speakerMap={speakerMap}
        actionItems={meeting.actionItems.map((item) => ({
          id: item.id,
          taskDescription: item.taskDescription,
          assigneeName: item.assigneeName,
          status: item.status,
        }))}
        workspaceSlug={slug}
      />
    </div>
  );
}
