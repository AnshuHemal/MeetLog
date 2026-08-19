"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { deleteCloudinaryAssetByUrl } from "@/lib/cloudinary-server";
import type { WorkspaceRole } from "@/generated/prisma/enums";

const DELETE_ALLOWED_ROLES: WorkspaceRole[] = ["OWNER", "ADMIN", "MEMBER"];

export interface DeleteMeetingResult {
  success: boolean;
  error?: string;
  title?: string;
}

export async function deleteMeetingAction(
  meetingId: string,
  workspaceSlug: string,
): Promise<DeleteMeetingResult> {
  try {
    const user = await requireUser();

    const membership = await prisma.workspaceMember.findFirst({
      where: { userId: user.id, workspace: { slug: workspaceSlug } },
      select: { workspaceId: true, role: true },
    });

    if (!membership) {
      return { success: false, error: "You do not have access to this workspace." };
    }

    if (!DELETE_ALLOWED_ROLES.includes(membership.role)) {
      return { success: false, error: "You do not have permission to delete meetings." };
    }

    const meeting = await prisma.meeting.findFirst({
      where: { id: meetingId, workspaceId: membership.workspaceId },
      select: { id: true, title: true, audioUrl: true },
    });

    if (!meeting) {
      return { success: false, error: "Meeting not found." };
    }

    try {
      if (meeting.audioUrl.includes("drive.google.com")) {
        const { deleteGoogleDriveFile } = await import("@/lib/gdrive");
        await deleteGoogleDriveFile(meeting.audioUrl);
      } else {
        await deleteCloudinaryAssetByUrl(meeting.audioUrl);
      }
    } catch (storageError) {
      console.error(
        `[deleteMeeting] Storage delete failed for meeting ${meetingId}:`,
        storageError,
      );
      return {
        success: false,
        error: "Could not remove the recording from cloud storage. Please try again.",
      };
    }

    await prisma.meeting.delete({ where: { id: meeting.id } });

    revalidatePath(`/workspace/${workspaceSlug}`);
    revalidatePath(`/workspace/${workspaceSlug}/meetings`);

    return { success: true, title: meeting.title };
  } catch (error: unknown) {
    console.error("[deleteMeeting] Unexpected error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to delete meeting.",
    };
  }
}
