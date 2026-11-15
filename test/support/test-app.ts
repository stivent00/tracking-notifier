import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { createApp } from '../../src/app';
import type { AppConfig } from '../../src/infrastructure/config/config';
import { DatabaseService } from '../../src/infrastructure/persistence/database.service';
import { createTestDatabase, type TestDatabase } from './test-database';

export interface TestApp {
  app: NestExpressApplication;
  api: ReturnType<typeof request>;
  config: AppConfig;
  db: TestDatabase;
  /** Stops the app but keeps the database, to simulate a process restart. */
  stop(): Promise<void>;
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  queryOne<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T>;
  close(): Promise<void>;
}

type ConfigOverrides = {
  [K in keyof AppConfig]?: AppConfig[K] extends object ? Partial<AppConfig[K]> : AppConfig[K];
};

export function testConfig(databaseUrl: string, overrides: ConfigOverrides = {}): AppConfig {
  return {
    nodeEnv: 'test',
    port: 0,
    logLevel: 'silent',
    databaseUrl,
    databasePoolSize: 20,
    runMigrationsOnStart: true,
    ...overrides,
    worker: {
      enabled: false,
      pollIntervalMs: 20,
      batchSize: 10,
      leaseMs: 30_000,
      ...overrides.worker,
    },
    webhook: {
      timeoutMs: 5000,
      maxAttempts: 5,
      backoffBaseMs: 10,
      backoffMaxMs: 50,
      allowHttp: true,
      ...overrides.webhook,
    },
  };
}

export async function startTestApp(
  overrides: ConfigOverrides = {},
  existingDb?: TestDatabase,
): Promise<TestApp> {
  const db: TestDatabase = existingDb ?? (await createTestDatabase());
  const config = testConfig(db.url, overrides);
  const app = await createApp(config);
  await app.init();
  const database = app.get(DatabaseService);

  return {
    app,
    api: request(app.getHttpServer()),
    config,
    db,
    stop: () => app.close(),
    query: (sql, params) => database.dataSource.query(sql, params),
    async queryOne(sql, params) {
      const rows = await database.dataSource.query(sql, params);
      if (rows.length !== 1) throw new Error(`Expected one row, got ${rows.length}`);
      return rows[0];
    },
    async close() {
      await app.close();
      await db.drop();
    },
  };
}

export const TENANT_HEADER = 'X-Tenant-Id';
