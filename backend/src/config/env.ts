import "dotenv/config";

function requireEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Environment variable ${name} must be an integer, got: ${raw}`);
  }
  return parsed;
}

export const env = {
  nodeEnv: requireEnv("NODE_ENV", "development"),
  port: intEnv("PORT", 3000),
  host: requireEnv("HOST", "0.0.0.0"),
  databaseUrl: requireEnv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/pulz?schema=public"),
  corsOrigin: requireEnv("CORS_ORIGIN", "http://localhost:5173"),
  authSecret: requireEnv("AUTH_SECRET", "change-me-in-real-env"),
  resultsTtlHours: intEnv("RESULTS_TTL_HOURS", 24),
  resultsCleanupIntervalMinutes: intEnv("RESULTS_CLEANUP_INTERVAL_MINUTES", 5),
} as const;

export const isProduction = env.nodeEnv === "production";
