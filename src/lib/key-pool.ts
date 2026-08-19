import { prisma } from "@/lib/prisma";

export type ApiProvider = "SARVAM" | "GROQ" | "OPENAI" | "GEMINI";

export interface KeyPoolSelection {
  id: string;
  key: string;
  provider: ApiProvider;
  isFallbackEnv?: boolean;
}

export async function getAvailableKey(
  provider: ApiProvider,
  excludedKeyIds: string[] = []
): Promise<KeyPoolSelection | null> {
  const now = new Date();

  try {
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
      take: 5,
    });

    if (candidates.length > 0) {
      const selected = candidates[0];
      return {
        id: selected.id,
        key: selected.key,
        provider,
        isFallbackEnv: false,
      };
    }
  } catch (error) {
    console.error(`[KEY POOL ERROR] Failed to fetch database key for provider ${provider}:`, error);
  }

  const envKeyName = getEnvVarNameForProvider(provider);
  const envKeyVal = process.env[envKeyName];

  if (envKeyVal && !excludedKeyIds.includes(`env-${provider}`)) {
    return {
      id: `env-${provider}`,
      key: envKeyVal,
      provider,
      isFallbackEnv: true,
    };
  }

  return null;
}

export async function reportKeySuccess(keyId: string): Promise<void> {
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
  if (!keyId || keyId.startsWith("env-")) return;

  const resetAt = new Date(Date.now() + Math.max(10, resetInSeconds) * 1000);

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
  return await prisma.apiKeyPool.delete({
    where: { id },
  });
}

export async function togglePoolKeyStatus(id: string, status: "ACTIVE" | "DISABLED") {
  return await prisma.apiKeyPool.update({
    where: { id },
    data: { status },
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
