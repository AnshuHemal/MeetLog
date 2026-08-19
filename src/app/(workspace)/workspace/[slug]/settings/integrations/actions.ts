"use server";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { revalidatePath } from "next/cache";

export async function getWorkspaceIntegrationsAction(workspaceSlug: string) {
  const user = await requireUser();

  const membership = await prisma.workspaceMember.findFirst({
    where: { userId: user.id, workspace: { slug: workspaceSlug } },
    include: { workspace: { include: { integrations: true } } },
  });

  if (!membership) return null;
  return membership.workspace.integrations;
}

export async function saveIntegrationAction(
  workspaceSlug: string,
  type: "SLACK" | "JIRA" | "LINEAR" | "NOTION",
  data: {
    webhookUrl?: string;
    apiKey?: string;
    projectKey?: string;
    teamId?: string;
  }
) {
  const user = await requireUser();

  const membership = await prisma.workspaceMember.findFirst({
    where: { userId: user.id, workspace: { slug: workspaceSlug } },
    include: { workspace: true },
  });

  if (!membership) throw new Error("Unauthorized");

  await prisma.workspaceIntegration.upsert({
    where: { workspaceId_type: { workspaceId: membership.workspaceId, type } },
    create: { workspaceId: membership.workspaceId, type, isActive: true, ...data },
    update: { isActive: true, ...data },
  });

  revalidatePath(`/workspace/${workspaceSlug}/settings/integrations`);
  return { success: true };
}

export async function deleteIntegrationAction(
  workspaceSlug: string,
  type: "SLACK" | "JIRA" | "LINEAR" | "NOTION"
) {
  const user = await requireUser();

  const membership = await prisma.workspaceMember.findFirst({
    where: { userId: user.id, workspace: { slug: workspaceSlug } },
    include: { workspace: true },
  });

  if (!membership) throw new Error("Unauthorized");

  await prisma.workspaceIntegration.deleteMany({
    where: { workspaceId: membership.workspaceId, type },
  });

  revalidatePath(`/workspace/${workspaceSlug}/settings/integrations`);
  return { success: true };
}
