"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

export interface VocabularyItem {
  id: string;
  term: string;
  category: string | null;
  createdAt: string;
}

export interface SpeakerProfileItem {
  speakerId: string;
  displayName: string;
  totalMeetingsCount: number;
}

export async function getWorkspaceVocabularyAction(workspaceSlug: string) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) return { success: false, error: "Unauthorized" };

    const workspace = await prisma.workspace.findUnique({
      where: { slug: workspaceSlug },
    });

    if (!workspace) return { success: false, error: "Workspace not found." };

    const terms = await prisma.workspaceVocabulary.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { createdAt: "desc" },
    });

    const items: VocabularyItem[] = terms.map((t) => ({
      id: t.id,
      term: t.term,
      category: t.category,
      createdAt: t.createdAt.toISOString(),
    }));

    return { success: true, terms: items };
  } catch (error: any) {
    console.error("getWorkspaceVocabularyAction Error:", error);
    return { success: false, error: error?.message || "Failed to fetch vocabulary." };
  }
}

export async function addWorkspaceVocabularyTermAction(
  workspaceSlug: string,
  term: string,
  category?: string
) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) return { success: false, error: "Unauthorized" };

    const workspace = await prisma.workspace.findUnique({
      where: { slug: workspaceSlug },
    });

    if (!workspace) return { success: false, error: "Workspace not found." };

    const cleanTerm = term.trim();
    if (!cleanTerm) return { success: false, error: "Term cannot be empty." };

    await prisma.workspaceVocabulary.upsert({
      where: {
        workspaceId_term: {
          workspaceId: workspace.id,
          term: cleanTerm,
        },
      },
      update: {
        category: category || "TECH",
      },
      create: {
        workspaceId: workspace.id,
        term: cleanTerm,
        category: category || "TECH",
      },
    });

    revalidatePath(`/workspace/${workspaceSlug}/settings/vocabulary`);
    return { success: true };
  } catch (error: any) {
    console.error("addWorkspaceVocabularyTermAction Error:", error);
    return { success: false, error: error?.message || "Failed to add term." };
  }
}

export async function deleteWorkspaceVocabularyTermAction(
  workspaceSlug: string,
  vocabularyId: string
) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) return { success: false, error: "Unauthorized" };

    await prisma.workspaceVocabulary.delete({
      where: { id: vocabularyId },
    });

    revalidatePath(`/workspace/${workspaceSlug}/settings/vocabulary`);
    return { success: true };
  } catch (error: any) {
    console.error("deleteWorkspaceVocabularyTermAction Error:", error);
    return { success: false, error: error?.message || "Failed to delete term." };
  }
}

export async function getWorkspaceSpeakerProfilesAction(workspaceSlug: string) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) return { success: false, error: "Unauthorized" };

    const workspace = await prisma.workspace.findUnique({
      where: { slug: workspaceSlug },
    });

    if (!workspace) return { success: false, error: "Workspace not found." };

    const labels = await prisma.speakerLabel.findMany({
      where: { meeting: { workspaceId: workspace.id } },
    });

    const profilesMap: Record<string, { displayName: string; meetingsSet: Set<string> }> = {};

    labels.forEach((lbl) => {
      if (!profilesMap[lbl.speakerId]) {
        profilesMap[lbl.speakerId] = { displayName: lbl.displayName, meetingsSet: new Set() };
      }
      profilesMap[lbl.speakerId].displayName = lbl.displayName;
      profilesMap[lbl.speakerId].meetingsSet.add(lbl.meetingId);
    });

    const profiles: SpeakerProfileItem[] = Object.keys(profilesMap).map((speakerId) => ({
      speakerId,
      displayName: profilesMap[speakerId].displayName,
      totalMeetingsCount: profilesMap[speakerId].meetingsSet.size,
    }));

    return { success: true, profiles };
  } catch (error: any) {
    console.error("getWorkspaceSpeakerProfilesAction Error:", error);
    return { success: false, error: error?.message || "Failed to fetch speaker profiles." };
  }
}

export async function globalRenameSpeakerAction(
  workspaceSlug: string,
  speakerId: string,
  newDisplayName: string
) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) return { success: false, error: "Unauthorized" };

    const workspace = await prisma.workspace.findUnique({
      where: { slug: workspaceSlug },
    });

    if (!workspace) return { success: false, error: "Workspace not found." };

    const cleanName = newDisplayName.trim();
    if (!cleanName) return { success: false, error: "Display name cannot be empty." };

    await prisma.speakerLabel.updateMany({
      where: {
        meeting: { workspaceId: workspace.id },
        speakerId: speakerId,
      },
      data: {
        displayName: cleanName,
      },
    });

    revalidatePath(`/workspace/${workspaceSlug}`);
    return { success: true };
  } catch (error: any) {
    console.error("globalRenameSpeakerAction Error:", error);
    return { success: false, error: error?.message || "Failed to rename speaker globally." };
  }
}
