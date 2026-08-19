import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { SearchPageClient } from "./_components/search-page-client";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Search Transcripts & Meetings | MeetLog",
  description: "Search keywords across all meetings and spoken transcripts.",
};

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function SearchPage({ params }: PageProps) {
  const { slug } = await params;
  const user = await requireUser();

  const membership = await prisma.workspaceMember.findFirst({
    where: { userId: user.id, workspace: { slug } },
    include: {
      workspace: true,
    },
  });

  if (!membership) notFound();

  return (
    <SearchPageClient
      workspaceSlug={slug}
      workspaceName={membership.workspace.name}
    />
  );
}
