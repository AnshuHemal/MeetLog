"use server";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { sendInviteEmail } from "@/lib/email";
import { siteConfig } from "@/config/site";
import { randomBytes } from "crypto";

export interface ActionResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
  fieldErrors?: Record<string, string>;
}

export async function sendWorkspaceInvite(
  workspaceId: string,
  email: string,
): Promise<ActionResult> {
  const actor = await requireUser();

  const membership = await prisma.workspaceMember.findFirst({
    where: { workspaceId, userId: actor.id, role: { in: ["OWNER", "ADMIN"] } },
    include: { workspace: { select: { name: true, slug: true } } },
  });

  if (!membership) {
    return { success: false, error: "You don't have permission to invite members." };
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return { success: false, fieldErrors: { email: "Please enter a valid email address." } };
  }

  const existingUser = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true },
  });

  if (existingUser) {
    const alreadyMember = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: existingUser.id } },
      select: { id: true },
    });
    if (alreadyMember) {
      return { success: false, fieldErrors: { email: "This user is already a member." } };
    }
  }

  const existingInvite = await prisma.invitation.findFirst({
    where: {
      workspaceId,
      email: normalizedEmail,
      acceptedAt: null,
      expiresAt: { gt: new Date() },
    },
    select: { id: true },
  });

  if (existingInvite) {
    return {
      success: false,
      fieldErrors: { email: "An invitation has already been sent to this email." },
    };
  }

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  try {
    await prisma.invitation.create({
      data: {
        workspaceId,
        email: normalizedEmail,
        role: "MEMBER",
        token,
        invitedById: actor.id,
        expiresAt,
      },
    });

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? siteConfig.url;
    const inviteUrl = `${baseUrl}/invite/${token}`;

    try {
      await sendInviteEmail({
        to: normalizedEmail,
        inviterName: actor.name,
        workspaceName: membership.workspace.name,
        inviteUrl,
      });
    } catch (err) {
      console.error("[Invite] Email send failed:", err);

    }

    return { success: true };
  } catch {
    return { success: false, error: "Failed to send invitation. Please try again." };
  }
}

export async function resendWorkspaceInvite(
  invitationId: string,
): Promise<ActionResult> {
  const actor = await requireUser();

  const invitation = await prisma.invitation.findUnique({
    where: { id: invitationId },
    include: {
      workspace: { select: { name: true, slug: true, id: true } },
    },
  });

  if (!invitation) return { success: false, error: "Invitation not found." };

  const membership = await prisma.workspaceMember.findFirst({
    where: {
      workspaceId: invitation.workspaceId,
      userId: actor.id,
      role: { in: ["OWNER", "ADMIN"] },
    },
    select: { id: true },
  });

  if (!membership) return { success: false, error: "Permission denied." };

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await prisma.invitation.update({
    where: { id: invitationId },
    data: { token, expiresAt },
  });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? siteConfig.url;
  const inviteUrl = `${baseUrl}/invite/${token}`;

  sendInviteEmail({
    to: invitation.email,
    inviterName: actor.name,
    workspaceName: invitation.workspace.name,
    inviteUrl,
  }).catch((err) => console.error("[Invite] Resend failed:", err));

  return { success: true };
}

export async function revokeWorkspaceInvite(
  invitationId: string,
): Promise<ActionResult> {
  const actor = await requireUser();

  const invitation = await prisma.invitation.findUnique({
    where: { id: invitationId },
    select: { workspaceId: true },
  });

  if (!invitation) return { success: false, error: "Invitation not found." };

  const membership = await prisma.workspaceMember.findFirst({
    where: {
      workspaceId: invitation.workspaceId,
      userId: actor.id,
      role: { in: ["OWNER", "ADMIN"] },
    },
    select: { id: true },
  });

  if (!membership) return { success: false, error: "Permission denied." };

  await prisma.invitation.delete({ where: { id: invitationId } });
  return { success: true };
}

export async function getPendingInvitations(workspaceId: string) {
  await requireUser();

  return prisma.invitation.findMany({
    where: {
      workspaceId,
      acceptedAt: null,
      expiresAt: { gt: new Date() },
    },
    include: {
      invitedBy: { select: { name: true, image: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}
