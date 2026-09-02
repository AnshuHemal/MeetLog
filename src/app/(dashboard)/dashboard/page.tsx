import type { Metadata } from "next";
import Link from "next/link";
import { siteConfig } from "@/config/site";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { FadeIn, StaggerChildren } from "@/components/motion/fade-in";
import { WorkspaceCard } from "./_components/workspace-card";
import { Plus, LayoutGrid } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: `Choose a workspace — ${siteConfig.name}` };

export default async function DashboardPage() {
  const user = await requireUser();

  const memberships = await prisma.workspaceMember.findMany({
    where: { userId: user.id },
    include: {
      workspace: {
        include: {
          _count: { select: { members: true, meetings: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const workspaces = memberships.map((m) => ({
    id: m.workspace.id,
    name: m.workspace.name,
    slug: m.workspace.slug,
    logo: m.workspace.logo,
    role: m.role,
    memberCount: m.workspace._count.members,
    meetingCount: m.workspace._count.meetings,
  }));

  return (
    <div className="w-full max-w-2xl">
      {}
      <FadeIn direction="down" className="mb-10 text-center">
        <div className="mb-4 flex justify-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/20">
            <LayoutGrid className="size-7 text-primary" />
          </div>
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Welcome back{user.name ? `, ${user.name.split(" ")[0]}` : ""}
        </h1>
        <p className="mt-2 text-muted-foreground">
          Choose a workspace to continue, or create a new one.
        </p>
      </FadeIn>

      {/* Workspace Grid */}
      <StaggerChildren className="grid grid-cols-1 gap-4 sm:grid-cols-2 items-stretch">
        {workspaces.map((ws) => (
          <WorkspaceCard key={ws.id} workspace={ws} />
        ))}
      </StaggerChildren>

      {}
      <FadeIn delay={0.35} className="mt-6 flex justify-center">
        <Button variant="outline" asChild className="gap-2">
          <Link href="/onboarding">
            <Plus className="size-4" />
            Create new workspace
          </Link>
        </Button>
      </FadeIn>
    </div>
  );
}
