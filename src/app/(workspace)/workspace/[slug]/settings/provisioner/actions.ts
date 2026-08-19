"use server";

import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";

async function verifyWorkspaceAccess(workspaceSlug: string, userId: string) {
  const membership = await prisma.workspaceMember.findFirst({
    where: { userId, workspace: { slug: workspaceSlug } },
  });
  if (!membership) {
    throw new Error("Unauthorized: You do not have access to this workspace.");
  }
  return membership;
}

export async function getProvisionedAccountsAction(workspaceSlug: string) {
  try {
    const user = await requireUser();
    await verifyWorkspaceAccess(workspaceSlug, user.id);

    const accounts = await prisma.sarvamProvisionedAccount.findMany({
      orderBy: { createdAt: "desc" },
      include: { apiKeyPool: { select: { id: true, status: true, usageCount: true, lastUsedAt: true } } },
      take: 200,
    });

    return {
      success: true,
      accounts: accounts.map((a) => ({
        id: a.id,
        email: a.email,
        status: a.status,
        lastError: a.lastError,
        keyId: a.apiKeyPool?.id || null,
        keyStatus: a.apiKeyPool?.status || null,
        usageCount: a.apiKeyPool?.usageCount || 0,
        lastUsedAt: a.apiKeyPool?.lastUsedAt?.toISOString() || null,
        createdAt: a.createdAt.toISOString(),
      })),
    };
  } catch (error: any) {
    console.error("[GET PROVISIONED ACCOUNTS ERROR]", error);
    return { success: false, error: error.message || "Failed to load accounts." };
  }
}

export async function getProvisionerStatsAction(workspaceSlug: string) {
  try {
    const user = await requireUser();
    await verifyWorkspaceAccess(workspaceSlug, user.id);

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

    return {
      success: true,
      stats: {
        totalAccounts,
        activeAccounts,
        failedAccounts,
        totalKeys: poolStats._count,
        activeKeys,
        exhaustedKeys,
        totalUsage: poolStats._sum.usageCount || 0,
        totalErrors: poolStats._sum.errorCount || 0,
      },
    };
  } catch (error: any) {
    console.error("[GET PROVISIONER STATS ERROR]", error);
    return { success: false, error: error.message || "Failed to load stats." };
  }
}

export async function deleteProvisionedAccountAction(workspaceSlug: string, accountId: string) {
  try {
    const user = await requireUser();
    await verifyWorkspaceAccess(workspaceSlug, user.id);

    const account = await prisma.sarvamProvisionedAccount.findUnique({
      where: { id: accountId },
      select: { apiKeyPoolId: true },
    });

    if (!account) return { success: false, error: "Account not found." };

    if (account.apiKeyPoolId) {
      await prisma.apiKeyPool.delete({ where: { id: account.apiKeyPoolId } });
    }

    await prisma.sarvamProvisionedAccount.delete({ where: { id: accountId } });
    return { success: true };
  } catch (error: any) {
    console.error("[DELETE PROVISIONED ACCOUNT ERROR]", error);
    return { success: false, error: error.message || "Failed to delete account." };
  }
}

export async function deleteAllFailedAccountsAction(workspaceSlug: string) {
  try {
    const user = await requireUser();
    await verifyWorkspaceAccess(workspaceSlug, user.id);

    const failedAccounts = await prisma.sarvamProvisionedAccount.findMany({
      where: { status: "FAILED" },
      select: { apiKeyPoolId: true },
    });

    const keyIds = failedAccounts.map((a) => a.apiKeyPoolId).filter(Boolean) as string[];
    if (keyIds.length > 0) {
      await prisma.apiKeyPool.deleteMany({ where: { id: { in: keyIds } } });
    }

    const deleted = await prisma.sarvamProvisionedAccount.deleteMany({
      where: { status: "FAILED" },
    });

    return { success: true, count: deleted.count };
  } catch (error: any) {
    console.error("[DELETE ALL FAILED ACCOUNTS ERROR]", error);
    return { success: false, error: error.message || "Failed to delete failed accounts." };
  }
}

export async function testProvisionedKeyAction(workspaceSlug: string, keyId: string) {
  try {
    const user = await requireUser();
    await verifyWorkspaceAccess(workspaceSlug, user.id);

    const record = await prisma.apiKeyPool.findUnique({ where: { id: keyId } });
    if (!record) return { success: false, error: "Key not found." };

    const axios = (await import("axios")).default;

    try {
      const res = await axios.get("https://api.sarvam.ai/speech-to-text/job/v1/ping-test-status", {
        headers: { "api-subscription-key": record.key },
        validateStatus: () => true,
      });

      if (res.status === 401 || res.status === 403) {
        await prisma.apiKeyPool.update({
          where: { id: keyId },
          data: { status: "EXHAUSTED", lastError: "Expired or Invalid (HTTP 401/403)", errorCount: { increment: 1 } },
        });
        return { success: false, status: "EXHAUSTED", error: "Key is expired or invalid." };
      }

      if (res.status === 402) {
        await prisma.apiKeyPool.update({
          where: { id: keyId },
          data: { status: "EXHAUSTED", lastError: "Quota Exhausted (HTTP 402)", errorCount: { increment: 1 } },
        });
        return { success: false, status: "EXHAUSTED", error: "Credits exhausted." };
      }

      if (res.status === 429) {
        await prisma.apiKeyPool.update({
          where: { id: keyId },
          data: { status: "RATE_LIMITED", rateLimitResetAt: new Date(Date.now() + 60000), lastError: "Rate Limited (HTTP 429)" },
        });
        return { success: false, status: "RATE_LIMITED", error: "Rate limited." };
      }

      await prisma.apiKeyPool.update({
        where: { id: keyId },
        data: { status: "ACTIVE", lastError: null, rateLimitResetAt: null },
      });
      return { success: true, status: "ACTIVE", message: "Key validated successfully." };
    } catch (err: any) {
      return { success: false, error: err.message || "Connection failed." };
    }
  } catch (error: any) {
    return { success: false, error: error.message || "Validation failed." };
  }
}
