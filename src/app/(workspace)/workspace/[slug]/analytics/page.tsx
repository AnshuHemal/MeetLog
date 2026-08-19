import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { AnalyticsClient } from "./_components/analytics-client";
import { WorkspaceTopbar } from "../_components/workspace-topbar";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Workspace Intelligence & Analytics | MeetLog",
  description: "Gain deeper insights into speaking times, action completion rates, and meeting patterns.",
};

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function AnalyticsPage({ params }: PageProps) {
  const { slug } = await params;
  const user = await requireUser();

  const workspace = await prisma.workspace.findUnique({
    where: { slug },
    include: {
      members: {
        where: { userId: user.id }
      }
    }
  });

  if (!workspace || workspace.members.length === 0) {
    notFound();
  }

  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      <WorkspaceTopbar
        workspaceName={workspace.name}
        workspaceSlug={workspace.slug}
        pageTitle="Analytics"
      />
      <AnalyticsClient
        workspaceSlug={slug}
        workspaceName={workspace.name}
      />
    </div>
  );
}
