"use server";

import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import {
  getAllPoolKeys,
  addPoolKey,
  deletePoolKey,
  togglePoolKeyStatus,
  ApiProvider,
} from "@/lib/key-pool";
import axios from "axios";

async function verifyWorkspaceAccess(workspaceSlug: string, userId: string) {
  const membership = await prisma.workspaceMember.findFirst({
    where: {
      userId,
      workspace: { slug: workspaceSlug },
    },
  });

  if (!membership) {
    throw new Error("Unauthorized: You do not have access to this workspace.");
  }

  return membership;
}

export async function getPoolKeysAction(workspaceSlug: string) {
  try {
    const user = await requireUser();
    await verifyWorkspaceAccess(workspaceSlug, user.id);

    const keys = await getAllPoolKeys();

    return {
      success: true,
      keys: keys.map((k) => ({
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
      })),
    };
  } catch (error: any) {
    console.error("[GET POOL KEYS ERROR]", error);
    return { success: false, error: error.message || "Failed to load pool keys." };
  }
}

export async function addPoolKeyAction(
  workspaceSlug: string,
  data: { provider: ApiProvider; key: string; label?: string }
) {
  try {
    const user = await requireUser();
    await verifyWorkspaceAccess(workspaceSlug, user.id);

    if (!data.key || !data.key.trim()) {
      return { success: false, error: "API Key cannot be empty." };
    }

    const created = await addPoolKey({
      provider: data.provider,
      key: data.key,
      label: data.label,
    });

    return {
      success: true,
      key: {
        id: created.id,
        provider: created.provider,
        maskedKey: maskApiKey(created.key),
        label: created.label,
        status: created.status,
        usageCount: created.usageCount,
        errorCount: created.errorCount,
        createdAt: created.createdAt.toISOString(),
      },
    };
  } catch (error: any) {
    console.error("[ADD POOL KEY ERROR]", error);
    return { success: false, error: error.message || "Failed to add API key." };
  }
}

export async function deletePoolKeyAction(workspaceSlug: string, keyId: string) {
  try {
    const user = await requireUser();
    await verifyWorkspaceAccess(workspaceSlug, user.id);

    await deletePoolKey(keyId);
    return { success: true };
  } catch (error: any) {
    console.error("[DELETE POOL KEY ERROR]", error);
    return { success: false, error: error.message || "Failed to delete API key." };
  }
}

export async function togglePoolKeyStatusAction(
  workspaceSlug: string,
  keyId: string,
  status: "ACTIVE" | "DISABLED"
) {
  try {
    const user = await requireUser();
    await verifyWorkspaceAccess(workspaceSlug, user.id);

    await togglePoolKeyStatus(keyId, status);
    return { success: true };
  } catch (error: any) {
    console.error("[TOGGLE POOL KEY ERROR]", error);
    return { success: false, error: error.message || "Failed to toggle key status." };
  }
}

export async function testPoolKeyAction(workspaceSlug: string, keyId: string) {
  try {
    const user = await requireUser();
    await verifyWorkspaceAccess(workspaceSlug, user.id);

    const record = await prisma.apiKeyPool.findUnique({
      where: { id: keyId },
    });

    if (!record) {
      return { success: false, error: "Key not found." };
    }

    if (record.provider === "SARVAM") {
      try {
        const res = await axios.get("https://api.sarvam.ai/speech-to-text/job/v1/ping-test-status", {
          headers: { "api-subscription-key": record.key },
          validateStatus: () => true,
        });

        if (res.status === 401 || res.status === 403) {
          await prisma.apiKeyPool.update({
            where: { id: keyId },
            data: {
              status: "EXHAUSTED",
              lastError: "Expired or Invalid API Key (HTTP 401/403)",
              errorCount: { increment: 1 },
            },
          });
          return { success: false, status: "EXHAUSTED", error: "Authentication failed. Key is expired or invalid." };
        }

        if (res.status === 402) {
          await prisma.apiKeyPool.update({
            where: { id: keyId },
            data: {
              status: "EXHAUSTED",
              lastError: "Quota / Credits Exhausted (HTTP 402)",
              errorCount: { increment: 1 },
            },
          });
          return { success: false, status: "EXHAUSTED", error: "Payment required: Credits exhausted on this key." };
        }

        if (res.status === 429) {
          const resetAt = new Date(Date.now() + 60000);
          await prisma.apiKeyPool.update({
            where: { id: keyId },
            data: {
              status: "RATE_LIMITED",
              rateLimitResetAt: resetAt,
              lastError: "Rate limit reached (HTTP 429)",
              errorCount: { increment: 1 },
            },
          });
          return { success: false, status: "RATE_LIMITED", error: "Rate limit reached on this key." };
        }

        await prisma.apiKeyPool.update({
          where: { id: keyId },
          data: {
            status: "ACTIVE",
            lastError: null,
            rateLimitResetAt: null,
          },
        });

        return { success: true, status: "ACTIVE", message: "Key validated successfully with Sarvam AI!" };
      } catch (err: any) {
        return { success: false, error: err.message || "Failed to connect to Sarvam AI." };
      }
    }

    return { success: true, status: "ACTIVE", message: `Key is configured for ${record.provider}.` };
  } catch (error: any) {
    return { success: false, error: error.message || "Key validation failed." };
  }
}

export async function deleteExpiredPoolKeysAction(workspaceSlug: string) {
  try {
    const user = await requireUser();
    await verifyWorkspaceAccess(workspaceSlug, user.id);

    const deleted = await prisma.apiKeyPool.deleteMany({
      where: {
        status: "EXHAUSTED",
      },
    });

    return { success: true, count: deleted.count };
  } catch (error: any) {
    console.error("[DELETE EXPIRED KEYS ERROR]", error);
    return { success: false, error: error.message || "Failed to remove expired keys." };
  }
}

export async function testAllPoolKeysAction(workspaceSlug: string) {
  try {
    const user = await requireUser();
    await verifyWorkspaceAccess(workspaceSlug, user.id);

    const keys = await prisma.apiKeyPool.findMany();
    const results: Record<string, { success: boolean; status: string; msg: string }> = {};

    for (const keyRecord of keys) {
      if (keyRecord.provider === "SARVAM") {
        try {
          const res = await axios.get("https://api.sarvam.ai/speech-to-text/job/v1/ping-test-status", {
            headers: { "api-subscription-key": keyRecord.key },
            validateStatus: () => true,
          });

          if (res.status === 401 || res.status === 403) {
            await prisma.apiKeyPool.update({
              where: { id: keyRecord.id },
              data: {
                status: "EXHAUSTED",
                lastError: "Expired or Invalid API Key",
                errorCount: { increment: 1 },
              },
            });
            results[keyRecord.id] = { success: false, status: "EXHAUSTED", msg: "Expired / Invalid" };
          } else if (res.status === 402) {
            await prisma.apiKeyPool.update({
              where: { id: keyRecord.id },
              data: {
                status: "EXHAUSTED",
                lastError: "Quota Exhausted",
                errorCount: { increment: 1 },
              },
            });
            results[keyRecord.id] = { success: false, status: "EXHAUSTED", msg: "Quota Exhausted" };
          } else if (res.status === 429) {
            results[keyRecord.id] = { success: false, status: "RATE_LIMITED", msg: "Rate Limited" };
          } else {
            await prisma.apiKeyPool.update({
              where: { id: keyRecord.id },
              data: { status: "ACTIVE", lastError: null },
            });
            results[keyRecord.id] = { success: true, status: "ACTIVE", msg: "Active" };
          }
        } catch {
          results[keyRecord.id] = { success: false, status: keyRecord.status, msg: "Network Error" };
        }
      } else {
        results[keyRecord.id] = { success: true, status: "ACTIVE", msg: "Configured" };
      }
    }

    return { success: true, results };
  } catch (error: any) {
    console.error("[TEST ALL KEYS ERROR]", error);
    return { success: false, error: error.message || "Failed to scan keys." };
  }
}

export async function getBoomlifyCreditStatsAction(workspaceSlug: string) {
  try {
    const user = await requireUser();
    await verifyWorkspaceAccess(workspaceSlug, user.id);

    const apiKey = process.env.BOOMLIFY_API_KEY || "api_f3b8c315c649d7a8ece99a8460dddbfe1585a0f70ec5efad1424a20f2bcec445";
    const res = await axios.get("https://v1.boomlify.com/api/v1/account/usage", {
      headers: { "X-API-Key": apiKey },
      timeout: 10000,
    });

    const data = res.data;
    const credits = data?.credit_info?.available_credits ?? 50;
    const freeCredits = data?.credit_info?.free_credits_today?.available ?? 50;
    const tier = data?.credit_info?.tier ?? "free";

    return {
      success: true,
      credits,
      freeCredits,
      tier,
    };
  } catch (error: any) {
    return {
      success: false,
      credits: 40,
      freeCredits: 40,
      tier: "free",
      error: error.message || "Could not fetch credits",
    };
  }
}

function maskApiKey(key: string): string {
  if (!key || key.length <= 8) return "••••••••";
  const start = key.slice(0, 4);
  const end = key.slice(-4);
  return `${start}••••••••${end}`;
}
