import { z } from 'zod';

const booleanFromString = z.enum(['true', 'false']).transform((value) => value === 'true');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DATABASE_POOL_SIZE: z.coerce.number().int().min(1).max(100).default(10),
  RUN_MIGRATIONS_ON_START: booleanFromString.default(true),

  WORKER_ENABLED: booleanFromString.default(true),
  WORKER_POLL_INTERVAL_MS: z.coerce.number().int().min(10).default(1000),
  WORKER_BATCH_SIZE: z.coerce.number().int().min(1).max(500).default(20),
  WORKER_LEASE_MS: z.coerce.number().int().min(1000).default(30_000),

  WEBHOOK_TIMEOUT_MS: z.coerce.number().int().min(50).default(5000),
  WEBHOOK_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(5),
  WEBHOOK_BACKOFF_BASE_MS: z.coerce.number().int().min(1).default(1000),
  WEBHOOK_BACKOFF_MAX_MS: z.coerce.number().int().min(1).default(300_000),
  WEBHOOK_ALLOW_HTTP: booleanFromString.default(false),
});

export type AppConfig = {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  logLevel: string;
  databaseUrl: string;
  databasePoolSize: number;
  runMigrationsOnStart: boolean;
  worker: {
    enabled: boolean;
    pollIntervalMs: number;
    batchSize: number;
    leaseMs: number;
  };
  webhook: {
    timeoutMs: number;
    maxAttempts: number;
    backoffBaseMs: number;
    backoffMaxMs: number;
    allowHttp: boolean;
  };
};

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'env'}: ${issue.message}`)
      .join('; ');
    throw new ConfigError(`Invalid environment configuration: ${problems}`);
  }
  const e = parsed.data;
  return {
    nodeEnv: e.NODE_ENV,
    port: e.PORT,
    logLevel: e.LOG_LEVEL,
    databaseUrl: e.DATABASE_URL,
    databasePoolSize: e.DATABASE_POOL_SIZE,
    runMigrationsOnStart: e.RUN_MIGRATIONS_ON_START,
    worker: {
      enabled: e.WORKER_ENABLED,
      pollIntervalMs: e.WORKER_POLL_INTERVAL_MS,
      batchSize: e.WORKER_BATCH_SIZE,
      leaseMs: e.WORKER_LEASE_MS,
    },
    webhook: {
      timeoutMs: e.WEBHOOK_TIMEOUT_MS,
      maxAttempts: e.WEBHOOK_MAX_ATTEMPTS,
      backoffBaseMs: e.WEBHOOK_BACKOFF_BASE_MS,
      backoffMaxMs: e.WEBHOOK_BACKOFF_MAX_MS,
      allowHttp: e.WEBHOOK_ALLOW_HTTP,
    },
  };
}
