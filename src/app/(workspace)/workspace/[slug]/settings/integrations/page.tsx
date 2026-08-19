import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { IntegrationsPageClient } from "./_components/integrations-page-client";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Integrations | MeetLog",
  description: "Connect MeetLog to Slack, Jira, Linear, and Notion.",
};

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function IntegrationsPage({ params }: PageProps) {
  const { slug } = await params;
  const user = await requireUser();

  const membership = await prisma.workspaceMember.findFirst({
    where: { userId: user.id, workspace: { slug } },
    include: {
      workspace: {
        include: { integrations: true },
      },
    },
  });

  if (!membership) notFound();

  return (
    <IntegrationsPageClient
      workspaceSlug={slug}
      integrations={membership.workspace.integrations.map((i) => ({
        id: i.id,
        type: i.type,
        webhookUrl: i.webhookUrl,
        apiKey: i.apiKey,
        projectKey: i.projectKey,
        teamId: i.teamId,
        isActive: i.isActive,
      }))}
    />
  );
}
