import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { WorkspaceTopbar } from "../../_components/workspace-topbar";
import { VocabularyManagerClient } from "./_components/vocabulary-manager-client";
import {
  getWorkspaceVocabularyAction,
  getWorkspaceSpeakerProfilesAction,
} from "./actions";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function SettingsVocabularyPage({ params }: PageProps) {
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

  const [vocabRes, speakerRes] = await Promise.all([
    getWorkspaceVocabularyAction(slug),
    getWorkspaceSpeakerProfilesAction(slug),
  ]);

  return (
    <div className="flex flex-1 flex-col h-full overflow-hidden bg-background">
      <WorkspaceTopbar
        workspaceName={workspace.name}
        workspaceSlug={workspace.slug}
        pageTitle="Speaker & Vocabulary Calibration"
      />
      <VocabularyManagerClient
        workspaceSlug={workspace.slug}
        workspaceName={workspace.name}
        initialTerms={vocabRes.terms || []}
        initialProfiles={speakerRes.profiles || []}
      />
    </div>
  );
}
