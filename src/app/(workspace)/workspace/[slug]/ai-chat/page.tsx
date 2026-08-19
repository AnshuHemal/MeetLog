import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { AIChatClient } from "./_components/ai-chat-client";
import { WorkspaceTopbar } from "../_components/workspace-topbar";

interface AIChatPageProps {
  params: Promise<{
    slug: string;
  }>;
}

export default async function AIChatPage({ params }: AIChatPageProps) {
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

  const { getWorkspaceAIChatMessagesAction } = await import("./actions");
  const chatRes = await getWorkspaceAIChatMessagesAction(slug);

  return (
    <div className="flex flex-1 flex-col h-full overflow-hidden bg-background">
      <WorkspaceTopbar
        workspaceName={workspace.name}
        workspaceSlug={workspace.slug}
        pageTitle="Ask Workspace AI"
      />
      <AIChatClient
        workspaceSlug={workspace.slug}
        workspaceName={workspace.name}
        initialMessages={chatRes.messages || []}
      />
    </div>
  );
}
