"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import type { ActionItemStatus, ActionItemPriority } from "@/generated/prisma/enums";

export interface WorkspaceTaskItem {
  id: string;
  meetingId: string;
  meetingTitle: string;
  taskDescription: string;
  assigneeName: string | null;
  status: ActionItemStatus;
  priority: ActionItemPriority;
  dueDate: Date | null;
  createdAt: Date;
}

export async function getWorkspaceTasksAction(workspaceSlug: string) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) return { success: false, error: "Unauthorized" };

    const workspace = await prisma.workspace.findUnique({
      where: { slug: workspaceSlug },
      include: {
        members: { where: { userId: session.user.id } },
      },
    });

    if (!workspace || workspace.members.length === 0) {
      return { success: false, error: "Access denied" };
    }

    const tasks = await prisma.actionItem.findMany({
      where: {
        meeting: {
          workspaceId: workspace.id,
        },
      },
      include: {
        meeting: {
          select: {
            id: true,
            title: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const formatted: WorkspaceTaskItem[] = tasks.map((t) => ({
      id: t.id,
      meetingId: t.meetingId,
      meetingTitle: t.meeting.title,
      taskDescription: t.taskDescription,
      assigneeName: t.assigneeName,
      status: t.status,
      priority: t.priority,
      dueDate: t.dueDate,
      createdAt: t.createdAt,
    }));

    return { success: true, tasks: formatted };
  } catch (error: any) {
    console.error("getWorkspaceTasksAction error:", error);
    return { success: false, error: error?.message || "Failed to fetch tasks" };
  }
}

export async function updateTaskStatusAction(
  taskId: string,
  newStatus: ActionItemStatus,
  workspaceSlug: string
) {
  try {
    await prisma.actionItem.update({
      where: { id: taskId },
      data: { status: newStatus },
    });

    revalidatePath(`/workspace/${workspaceSlug}/tasks`);
    return { success: true };
  } catch (error: any) {
    console.error("updateTaskStatusAction error:", error);
    return { success: false, error: error?.message || "Failed to update task status" };
  }
}

export async function updateTaskPriorityAction(
  taskId: string,
  newPriority: ActionItemPriority,
  workspaceSlug: string
) {
  try {
    await prisma.actionItem.update({
      where: { id: taskId },
      data: { priority: newPriority },
    });

    revalidatePath(`/workspace/${workspaceSlug}/tasks`);
    return { success: true };
  } catch (error: any) {
    console.error("updateTaskPriorityAction error:", error);
    return { success: false, error: error?.message || "Failed to update task priority" };
  }
}

export async function createTaskAction(
  workspaceSlug: string,
  meetingId: string,
  taskDescription: string,
  assigneeName?: string,
  priority: ActionItemPriority = "MEDIUM"
) {
  try {
    const task = await prisma.actionItem.create({
      data: {
        meetingId,
        taskDescription,
        assigneeName: assigneeName || null,
        priority,
        status: "PENDING",
      },
    });

    revalidatePath(`/workspace/${workspaceSlug}/tasks`);
    return { success: true, task };
  } catch (error: any) {
    console.error("createTaskAction error:", error);
    return { success: false, error: error?.message || "Failed to create task" };
  }
}
