import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { WorkspaceTopbar } from "../_components/workspace-topbar";
import { MeetingsListClient } from "./_components/meetings-list-client";

interface MeetingsPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: MeetingsPageProps): Promise<Metadata> {
  const { slug } = await params;
  const workspace = await prisma.workspace.findUnique({
    where: { slug },
    select: { name: true },
  });
  return { title: workspace ? `${workspace.name} — Meetings` : "Meetings Library" };
}

export default async function MeetingsPage({ params }: MeetingsPageProps) {
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

  return (
    <div className="flex flex-1 flex-col overflow-y-auto bg-background">
      <WorkspaceTopbar
        workspaceName={workspace.name}
        workspaceSlug={workspace.slug}
        pageTitle="Meetings"
      />

      <main className="flex-1 p-6 w-full">
        <MeetingsListClient meetings={meetings} slug={slug} />
      </main>
    </div>
  );
}
