"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { sendWorkspaceInvite } from "@/lib/invite-actions";

export interface ActionResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
  fieldErrors?: Record<string, string>;
}

export async function checkSlugAvailable(
  slug: string,
): Promise<{ available: boolean }> {
  if (!slug || slug.length < 2) return { available: false };

  const existing = await prisma.workspace.findUnique({
    where: { slug },
    select: { id: true },
  });

  return { available: !existing };
}

export interface CreateWorkspaceInput {
  name: string;
  slug: string;
}

export interface CreateWorkspaceResult {
  workspaceId: string;
  slug: string;
}

export async function createWorkspace(
  input: CreateWorkspaceInput,
): Promise<ActionResult<CreateWorkspaceResult>> {
  const user = await requireUser();

  const fieldErrors: Record<string, string> = {};

  const name = input.name.trim();
  if (!name) fieldErrors.name = "Workspace name is required.";
  else if (name.length < 2) fieldErrors.name = "Name must be at least 2 characters.";
  else if (name.length > 64) fieldErrors.name = "Name must be 64 characters or fewer.";

  const slug = input.slug.trim().toLowerCase();
  if (!slug) fieldErrors.slug = "URL slug is required.";
  else if (!/^[a-z0-9-]+$/.test(slug)) fieldErrors.slug = "Only lowercase letters, numbers, and hyphens.";
  else if (slug.length < 2) fieldErrors.slug = "Slug must be at least 2 characters.";
  else if (slug.length > 48) fieldErrors.slug = "Slug must be 48 characters or fewer.";
  else if (slug.startsWith("-") || slug.endsWith("-")) fieldErrors.slug = "Slug cannot start or end with a hyphen.";

  if (Object.keys(fieldErrors).length > 0) {
    return { success: false, fieldErrors };
  }

  const existing = await prisma.workspace.findUnique({
    where: { slug },
    select: { id: true },
  });

  if (existing) {
    return {
      success: false,
      fieldErrors: { slug: "This URL is already taken. Try another." },
    };
  }

  try {
    const workspace = await prisma.$transaction(async (tx) => {
      const ws = await tx.workspace.create({
        data: { name, slug },
      });

      await tx.workspaceMember.create({
        data: {
          workspaceId: ws.id,
          userId: user.id,
          role: "OWNER",
        },
      });

      return ws;
    });

    return {
      success: true,
      data: { workspaceId: workspace.id, slug: workspace.slug },
    };
  } catch {
    return {
      success: false,
      error: "Failed to create workspace. Please try again.",
    };
  }
}

export interface SendInvitesInput {
  workspaceId: string;
  emails: string[];
}

export async function sendInvites(
  input: SendInvitesInput,
): Promise<ActionResult> {
  const validEmails = input.emails
    .map((e) => e.trim().toLowerCase())
    .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));

  if (validEmails.length === 0) {
    return { success: false, error: "No valid email addresses provided." };
  }

  const results = await Promise.allSettled(
    validEmails.map((email) => sendWorkspaceInvite(input.workspaceId, email)),
  );

  const failed = results.filter(
    (r) => r.status === "rejected" || (r.status === "fulfilled" && !r.value.success),
  );

  if (failed.length === validEmails.length) {
    return { success: false, error: "Failed to send invitations. Please try again." };
  }

  return { success: true };
}

export async function completeOnboarding(slug: string): Promise<never> {
  redirect(`/workspace/${slug}`);
}
