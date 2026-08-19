import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { PlayCircle, Clock, Video, FileAudio, Plus, AlertCircle, RefreshCw, Loader2 } from "lucide-react";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { FadeIn } from "@/components/motion/fade-in";
import { WorkspaceTopbar } from "./_components/workspace-topbar";
import { Button } from "@/components/ui/button";
import { MeetingsList } from "./_components/meetings-list";

interface WorkspacePageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: WorkspacePageProps): Promise<Metadata> {
  const { slug } = await params;
  const workspace = await prisma.workspace.findUnique({
    where: { slug },
    select: { name: true },
  });
  return { title: workspace ? `${workspace.name} — Dashboard` : "Workspace Dashboard" };
}

import { formatDurationHuman } from "@/lib/time-utils";

function formatDuration(seconds: number): string {
  return formatDurationHuman(seconds);
}

export default async function WorkspacePage({ params }: WorkspacePageProps) {
  const { slug } = await params;
  const user = await requireUser();

  const membership = await prisma.workspaceMember.findFirst({
    where: { userId: user.id, workspace: { slug } },
    include: {
      workspace: true,
    },
  });

  if (!membership) notFound();

  const { workspace } = membership;

  const meetings = await prisma.meeting.findMany({
    where: { workspaceId: workspace.id },
    orderBy: { createdAt: "desc" },
  });

  const totalMeetings = meetings.length;
  const completedMeetings = meetings.filter((m) => m.status === "COMPLETED");
  const transcribingMeetings = meetings.filter((m) => m.status === "TRANSCRIBING");
  const totalDurationSeconds = completedMeetings.reduce((acc, m) => acc + m.durationSeconds, 0);

  const stats = [
    {
      label: "Total Recordings",
      value: totalMeetings,
      icon: Video,
      description: "Meetings uploaded to this workspace",
    },
    {
      label: "Transcribed Time",
      value: formatDuration(totalDurationSeconds),
      icon: Clock,
      description: "Total audio processed by AI",
    },
    {
      label: "Active Jobs",
      value: transcribingMeetings.length,
      icon: RefreshCw,
      description: "Transcriptions currently processing",
    },
  ];

  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      <WorkspaceTopbar
        workspaceName={workspace.name}
        workspaceSlug={workspace.slug}
        pageTitle="Dashboard"
      />

      <main className="flex-1 p-6 w-full">
        {}
        <FadeIn direction="down" className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Welcome back{user.name ? `, ${user.name.split(" ")[0]}` : ""}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Analyze and transcribe meeting audio from your workspace:{" "}
              <span className="font-medium text-foreground">{workspace.name}</span>.
            </p>
          </div>
          <Button asChild className="hidden sm:flex">
            <Link href={`/workspace/${slug}/upload`}>
              <Plus className="mr-2 size-4" /> Upload Recording
            </Link>
          </Button>
        </FadeIn>

        {}
        <FadeIn delay={0.05} className="mb-8">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {stats.map(({ label, value, icon: Icon, description }) => (
              <div key={label} className="rounded-xl border border-border bg-card p-5">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-muted-foreground">{label}</p>
                  <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10">
                    <Icon className={cn("size-4 text-primary", label === "Active Jobs" && transcribingMeetings.length > 0 && "animate-spin")} />
                  </div>
                </div>
                <p className="mt-3 text-3xl font-bold tracking-tight text-foreground">{value}</p>
                <p className="mt-1 text-xs text-muted-foreground">{description}</p>
              </div>
            ))}
          </div>
        </FadeIn>

        {}
        <FadeIn delay={0.1} className="mt-2">
          <MeetingsList
            initialMeetings={meetings.map((m) => ({
              id: m.id,
              title: m.title,
              description: m.description,
              audioUrl: m.audioUrl,
              durationSeconds: m.durationSeconds,
              status: m.status,
              numSpeakers: m.numSpeakers,
              createdAt: m.createdAt.toISOString(),
            }))}
            workspaceSlug={slug}
          />
        </FadeIn>
      </main>
    </div>
  );
}

function cn(...classes: any[]) {
  return classes.filter(Boolean).join(" ");
}
