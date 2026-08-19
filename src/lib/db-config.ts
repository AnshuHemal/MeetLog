import type { PoolConfig } from "pg";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

export function normalizeDatabaseUrl(url: string): string {
  return url.replace(
    /([?&])sslmode=(require|prefer|verify-ca)(?=(&|$))/i,
    "$1sslmode=verify-full",
  );
}

function getDatabaseHostname(url: string): string | null {
  const match = url.match(/@([^/?]+)/);
  if (!match) return null;

  const hostPart = match[1];
  const host = hostPart.startsWith("[")
    ? hostPart.slice(1, hostPart.indexOf("]"))
    : hostPart.split(":")[0];

  return host || null;
}

export function isLocalDatabase(url: string): boolean {
  const hostname = getDatabaseHostname(url);
  return hostname ? LOCAL_HOSTS.has(hostname) : false;
}

export function resolvePgPoolConfig(): PoolConfig {
  const raw = process.env.DATABASE_URL;
  if (!raw) {
    throw new Error("DATABASE_URL is not set");
  }

  const connectionString = normalizeDatabaseUrl(raw);
  const isLocal = isLocalDatabase(connectionString);

  return {
    connectionString,
    ...(isLocal ? { ssl: false } : {}),
  };
}
