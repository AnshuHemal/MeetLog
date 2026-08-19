import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { MeetingViewerClient } from "@/app/(workspace)/workspace/[slug]/meetings/[meetingId]/_components/meeting-viewer-client";
import { Logo } from "@/components/shared/logo";
import { ThemeToggle } from "@/components/shared/theme-toggle";

interface SharePageProps {
  params: Promise<{ token: string }>;
}

export async function generateMetadata({ params }: SharePageProps): Promise<Metadata> {
  const { token } = await params;
  const meeting = await prisma.meeting.findUnique({
    where: { shareToken: token },
    select: { title: true, isPublic: true },
  });
  
  if (!meeting || !meeting.isPublic) {
    return { title: "Access Denied" };
  }
  
  return { title: `${meeting.title} — Shared Transcript` };
}

export default async function SharePage({ params }: SharePageProps) {
  const { token } = await params;

  const meeting = await prisma.meeting.findUnique({
    where: { shareToken: token, isPublic: true },
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

  if (!meeting) {
    notFound();
  }

  const speakerMap: Record<string, string> = {};
  meeting.speakerLabels.forEach((label) => {
    speakerMap[label.speakerId] = label.displayName;
  });

  const maxSegmentEnd = meeting.segments.reduce((max, s) => Math.max(max, s.endTime || 0), 0);
  const effectiveDuration = maxSegmentEnd > 0 ? Math.round(maxSegmentEnd) : (meeting.durationSeconds || 0);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background">
      {}
      <header className="flex h-14 items-center justify-between border-b border-border bg-card px-6 shrink-0">
        <div className="flex items-center gap-2">
          <Logo asLink={false} size={24} />
          <span className="text-[10px] font-bold bg-primary/10 text-primary px-2.5 py-0.5 rounded-full border border-primary/20">SHARED VIEW</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-2xs text-muted-foreground font-mono hidden sm:block">
            Public access view-only transcript
          </div>
          <ThemeToggle />
        </div>
      </header>

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
        }}
        segments={meeting.segments.map((seg) => ({
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
        }))}
        speakerMap={speakerMap}
        actionItems={meeting.actionItems.map((item) => ({
          id: item.id,
          taskDescription: item.taskDescription,
          assigneeName: item.assigneeName,
          status: item.status,
        }))}
        workspaceSlug="shared"
        isReadOnly={true}
      />
    </div>
  );
}
