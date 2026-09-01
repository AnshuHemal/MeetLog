import { prisma } from "@/lib/prisma";

export type ApiProvider = "SARVAM" | "GROQ" | "OPENAI" | "GEMINI";

export interface KeyPoolSelection {
  id: string;
  key: string;
  provider: ApiProvider;
  isFallbackEnv?: boolean;
}

const inMemoryKeyCooldowns = new Map<string, number>();

export function isKeyInCooldown(keyId: string): boolean {
  const resetTimestamp = inMemoryKeyCooldowns.get(keyId);
  if (!resetTimestamp) return false;
  if (Date.now() >= resetTimestamp) {
    inMemoryKeyCooldowns.delete(keyId);
    return false;
  }
  return true;
}

export function markKeyCooldown(keyId: string, seconds: number) {
  inMemoryKeyCooldowns.set(keyId, Date.now() + Math.max(10, seconds) * 1000);
}

export function parseGoogleRetryDelay(errorMsg: string): number {
  const match =
    String(errorMsg).match(/retry in\s*([\d\.]+)\s*s/i) ||
    String(errorMsg).match(/retryDelay"?:\s*"(\d+)s"/i);
  if (match) {
    const sec = parseFloat(match[1]);
    if (!isNaN(sec) && sec > 0) {
      return Math.ceil(sec) + 1;
    }
  }
  return 25; // Default 25s for Gemini free tier RPM
}

export async function getAvailableKey(
  provider: ApiProvider,
  excludedKeyIds: string[] = []
): Promise<KeyPoolSelection | null> {
  const now = new Date();

  try {
    // 1. Auto-reactivate any rate-limited keys whose cooldown period has passed
    await prisma.apiKeyPool.updateMany({
      where: {
        provider,
        status: "RATE_LIMITED",
        rateLimitResetAt: {
          lte: now,
        },
      },
      data: {
        status: "ACTIVE",
        rateLimitResetAt: null,
      },
    });

    // 2. Fetch candidates from database pool
    const candidates = await prisma.apiKeyPool.findMany({
      where: {
        provider,
        status: "ACTIVE",
        id: {
          notIn: excludedKeyIds,
        },
      },
      orderBy: [
        { lastUsedAt: "asc" },
        { usageCount: "asc" },
      ],
      take: 10,
    });

    // Filter out any key currently in local memory cooldown
    const validCandidate = candidates.find((c) => !isKeyInCooldown(c.id));
    if (validCandidate) {
      return {
        id: validCandidate.id,
        key: validCandidate.key,
        provider,
        isFallbackEnv: false,
      };
    }
  } catch (error) {
    console.error(`[KEY POOL ERROR] Failed to fetch database key for provider ${provider}:`, error);
  }

  // 3. Fallback to process.env key if available, not excluded, and not in cooldown
  const envKeyName = getEnvVarNameForProvider(provider);
  const envKeyVal = process.env[envKeyName];
  const envId = `env-${provider}`;

  if (envKeyVal && !excludedKeyIds.includes(envId) && !isKeyInCooldown(envId)) {
    return {
      id: envId,
      key: envKeyVal,
      provider,
      isFallbackEnv: true,
    };
  }

  return null;
}

/**
 * Robust key selection that automatically waits for cooling-down keys if all keys are temporarily rate-limited.
 */
export async function waitForAvailableKey(
  provider: ApiProvider,
  excludedKeyIds: string[] = [],
  maxWaitMs: number = 60000,
  onWaiting?: (secondsRemaining: number) => void
): Promise<KeyPoolSelection | null> {
  const immediate = await getAvailableKey(provider, excludedKeyIds);
  if (immediate) return immediate;

  // If no immediate key, find the earliest resetting database key
  try {
    const earliest = await prisma.apiKeyPool.findFirst({
      where: {
        provider,
        status: "RATE_LIMITED",
      },
      orderBy: {
        rateLimitResetAt: "asc",
      },
    });

    if (earliest?.rateLimitResetAt) {
      const now = Date.now();
      const resetTime = earliest.rateLimitResetAt.getTime();
      const waitTime = Math.max(1000, Math.min(maxWaitMs, resetTime - now + 500));
      const waitSeconds = Math.ceil(waitTime / 1000);

      if (waitTime > 0 && waitTime <= maxWaitMs) {
        if (onWaiting) {
          onWaiting(waitSeconds);
        }
        console.log(`[KEY POOL] All ${provider} keys rate-limited. Waiting ${waitSeconds}s for key ${earliest.id.slice(0, 8)} to reset...`);
        await new Promise((r) => setTimeout(r, waitTime));

        // Reactivate and retry
        await prisma.apiKeyPool.update({
          where: { id: earliest.id },
          data: { status: "ACTIVE", rateLimitResetAt: null },
        });

        return {
          id: earliest.id,
          key: earliest.key,
          provider,
          isFallbackEnv: false,
        };
      }
    }
  } catch (err: any) {
    console.warn(`[KEY POOL] Error in waitForAvailableKey:`, err.message);
  }

  // Clear in-memory cooldowns if all options exhausted
  inMemoryKeyCooldowns.clear();
  return getAvailableKey(provider, []);
}

export async function reportKeySuccess(keyId: string): Promise<void> {
  inMemoryKeyCooldowns.delete(keyId);
  if (!keyId || keyId.startsWith("env-")) return;

  try {
    await prisma.apiKeyPool.update({
      where: { id: keyId },
      data: {
        usageCount: { increment: 1 },
        lastUsedAt: new Date(),
        status: "ACTIVE",
        rateLimitResetAt: null,
      },
    });
  } catch (error) {
    console.error(`[KEY POOL ERROR] Failed to record success for key ${keyId}:`, error);
  }
}

export async function reportKeyRateLimit(
  keyId: string,
  resetInSeconds: number = 60,
  errorMessage?: string
): Promise<void> {
  const actualSeconds = Math.max(10, resetInSeconds);
  markKeyCooldown(keyId, actualSeconds);

  if (!keyId || keyId.startsWith("env-")) {
    console.warn(`[KEY POOL] Fallback key ${keyId} placed in cooldown for ${actualSeconds}s`);
    return;
  }

  const resetAt = new Date(Date.now() + actualSeconds * 1000);

  try {
    await prisma.apiKeyPool.update({
      where: { id: keyId },
      data: {
        status: "RATE_LIMITED",
        rateLimitResetAt: resetAt,
        errorCount: { increment: 1 },
        lastError: errorMessage || "HTTP 429 - Rate limit reached",
      },
    });
    console.warn(`[KEY POOL] Key ${keyId} marked as RATE_LIMITED until ${resetAt.toISOString()}`);
  } catch (error) {
    console.error(`[KEY POOL ERROR] Failed to mark rate limit for key ${keyId}:`, error);
  }
}

export async function reportKeyExhausted(
  keyId: string,
  errorMessage?: string
): Promise<void> {
  markKeyCooldown(keyId, 86400);

  if (!keyId || keyId.startsWith("env-")) return;

  try {
    await prisma.apiKeyPool.update({
      where: { id: keyId },
      data: {
        status: "EXHAUSTED",
        errorCount: { increment: 1 },
        lastError: errorMessage || "Quota exhausted / Invalid key (HTTP 402/403)",
      },
    });
    console.error(`[KEY POOL] Key ${keyId} marked as EXHAUSTED: ${errorMessage}`);
  } catch (error) {
    console.error(`[KEY POOL ERROR] Failed to mark key exhausted for ${keyId}:`, error);
  }
}

export async function resetAllRateLimitedKeys(provider?: ApiProvider): Promise<number> {
  inMemoryKeyCooldowns.clear();
  try {
    const res = await prisma.apiKeyPool.updateMany({
      where: {
        ...(provider ? { provider } : {}),
        status: "RATE_LIMITED",
      },
      data: {
        status: "ACTIVE",
        rateLimitResetAt: null,
      },
    });
    return res.count;
  } catch (err: any) {
    console.error("[KEY POOL] Failed to reset rate-limited keys:", err);
    return 0;
  }
}

export async function getAllPoolKeys(provider?: ApiProvider): Promise<Array<{
  id: string;
  provider: string;
  key: string;
  label: string | null;
  status: string;
  rateLimitResetAt: Date | null;
  usageCount: number;
  errorCount: number;
  lastUsedAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}>> {
  try {
    return await prisma.apiKeyPool.findMany({
      where: provider ? { provider } : undefined,
      orderBy: [{ provider: "asc" }, { createdAt: "desc" }],
    });
  } catch (error) {
    console.error("[KEY POOL ERROR] Failed to fetch all pool keys:", error);
    return [];
  }
}

export async function addPoolKey(data: {
  provider: ApiProvider;
  key: string;
  label?: string;
}) {
  inMemoryKeyCooldowns.clear();
  return await prisma.apiKeyPool.create({
    data: {
      provider: data.provider,
      key: data.key.trim(),
      label: data.label?.trim() || null,
      status: "ACTIVE",
    },
  });
}

export async function deletePoolKey(id: string) {
  inMemoryKeyCooldowns.delete(id);
  return await prisma.apiKeyPool.delete({
    where: { id },
  });
}

export async function togglePoolKeyStatus(id: string, status: "ACTIVE" | "DISABLED") {
  if (status === "ACTIVE") {
    inMemoryKeyCooldowns.delete(id);
  }
  return await prisma.apiKeyPool.update({
    where: { id },
    data: {
      status,
      ...(status === "ACTIVE" ? { lastError: null, rateLimitResetAt: null } : {}),
    },
  });
}

function getEnvVarNameForProvider(provider: ApiProvider): string {
  switch (provider) {
    case "SARVAM":
      return "SARVAM_API_KEY";
    case "GROQ":
      return "GROQ_API_KEY";
    case "OPENAI":
      return "OPENAI_API_KEY";
    case "GEMINI":
      return "GEMINI_API_KEY";
    default:
      return `${provider}_API_KEY`;
  }
}
