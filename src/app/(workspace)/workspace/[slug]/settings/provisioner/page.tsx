import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { ProvisionerPageClient } from "./_components/provisioner-client";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sarvam Key Provisioner | MeetLog",
  description: "Auto-provision Sarvam AI API keys using temporary emails and automated signup.",
};

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function ProvisionerSettingsPage({ params }: PageProps) {
  const { slug } = await params;
  const user = await requireUser();

  const membership = await prisma.workspaceMember.findFirst({
    where: { userId: user.id, workspace: { slug } },
  });

  if (!membership) notFound();

  const accounts = await prisma.sarvamProvisionedAccount.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      apiKeyPool: {
        select: { id: true, status: true, usageCount: true, lastUsedAt: true, errorCount: true },
      },
    },
    take: 200,
  });

  const [totalAccounts, activeAccounts, failedAccounts, poolStats] = await Promise.all([
    prisma.sarvamProvisionedAccount.count(),
    prisma.sarvamProvisionedAccount.count({ where: { status: "ACTIVE" } }),
    prisma.sarvamProvisionedAccount.count({ where: { status: "FAILED" } }),
    prisma.apiKeyPool.aggregate({
      where: { provider: "SARVAM" },
      _count: true,
      _sum: { usageCount: true, errorCount: true },
    }),
  ]);

  const activeKeys = await prisma.apiKeyPool.count({
    where: { provider: "SARVAM", status: "ACTIVE" },
  });

  const exhaustedKeys = await prisma.apiKeyPool.count({
    where: { provider: "SARVAM", status: "EXHAUSTED" },
  });

  const initialAccounts = accounts.map((a) => ({
    id: a.id,
    email: a.email,
    status: a.status,
    lastError: a.lastError,
    keyId: a.apiKeyPool?.id || null,
    keyStatus: a.apiKeyPool?.status || null,
    usageCount: a.apiKeyPool?.usageCount || 0,
    lastUsedAt: a.apiKeyPool?.lastUsedAt?.toISOString() || null,
    createdAt: a.createdAt.toISOString(),
  }));

  const initialStats = {
    totalAccounts,
    activeAccounts,
    failedAccounts,
    totalKeys: poolStats._count,
    activeKeys,
    exhaustedKeys,
    totalUsage: poolStats._sum.usageCount || 0,
    totalErrors: poolStats._sum.errorCount || 0,
  };

  return (
    <ProvisionerPageClient
      workspaceSlug={slug}
      initialAccounts={initialAccounts}
      initialStats={initialStats}
    />
  );
}
