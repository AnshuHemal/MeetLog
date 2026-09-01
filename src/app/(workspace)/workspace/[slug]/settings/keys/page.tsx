import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getAllPoolKeys } from "@/lib/key-pool";
import { KeysPageClient } from "./_components/keys-page-client";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "API Key Pool & Rotation | MeetLog",
  description: "Manage multi-provider API keys with automatic failover and load balancing.",
};

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function KeysSettingsPage({ params }: PageProps) {
  const { slug } = await params;
  const user = await requireUser();

  const workspace = await prisma.workspace.findFirst({
    where: {
      slug: { equals: slug, mode: "insensitive" },
      members: { some: { userId: user.id } },
    },
  });

  if (!workspace) {
    const fallbackMembership = await prisma.workspaceMember.findFirst({
      where: { userId: user.id },
      include: { workspace: true },
    });
    if (fallbackMembership) {
      redirect(`/workspace/${fallbackMembership.workspace.slug}/settings/keys`);
    }
    notFound();
  }

  const keys = await getAllPoolKeys();

  function maskApiKey(key: string): string {
    if (!key || key.length <= 8) return "••••••••";
    const start = key.slice(0, 4);
    const end = key.slice(-4);
    return `${start}••••••••${end}`;
  }

  const initialKeys = keys.map((k) => ({
    id: k.id,
    provider: k.provider,
    maskedKey: maskApiKey(k.key),
    label: k.label,
    status: k.status,
    rateLimitResetAt: k.rateLimitResetAt?.toISOString() || null,
    usageCount: k.usageCount,
    errorCount: k.errorCount,
    lastUsedAt: k.lastUsedAt?.toISOString() || null,
    lastError: k.lastError,
    createdAt: k.createdAt.toISOString(),
  }));

  return <KeysPageClient workspaceSlug={workspace.slug} initialKeys={initialKeys} />;
}
