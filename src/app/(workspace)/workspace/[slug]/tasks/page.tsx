import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { TasksKanbanClient } from "./_components/tasks-kanban-client";
import { WorkspaceTopbar } from "../_components/workspace-topbar";
import { getWorkspaceTasksAction } from "./actions";

interface TasksPageProps {
  params: Promise<{
    slug: string;
  }>;
}

export default async function TasksPage({ params }: TasksPageProps) {
  const { slug } = await params;

  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect("/login");
  }

  const workspace = await prisma.workspace.findUnique({
    where: { slug },
    include: {
      members: {
        where: { userId: session.user.id },
      },
    },
  });

  if (!workspace || workspace.members.length === 0) {
    notFound();
  }

  const taskRes = await getWorkspaceTasksAction(slug);
  const meetings = await prisma.meeting.findMany({
    where: { workspaceId: workspace.id },
    select: { id: true, title: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="flex flex-1 flex-col h-full overflow-hidden bg-background">
      <WorkspaceTopbar
        workspaceName={workspace.name}
        workspaceSlug={workspace.slug}
        pageTitle="Tasks Board"
      />
      <TasksKanbanClient
        workspaceSlug={workspace.slug}
        workspaceName={workspace.name}
        initialTasks={taskRes.tasks || []}
        meetings={meetings}
      />
    </div>
  );
}
