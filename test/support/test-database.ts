import { randomBytes } from 'node:crypto';
import { Client } from 'pg';

export interface TestDatabase {
  url: string;
  drop(): Promise<void>;
}

/** Creates an isolated, empty database on the shared PostgreSQL used by the suite. */
export async function createTestDatabase(): Promise<TestDatabase> {
  const adminUrl = process.env.TEST_ADMIN_DATABASE_URL;
  if (!adminUrl) {
    throw new Error('TEST_ADMIN_DATABASE_URL is not set; the integration global setup did not run');
  }
  const name = `tn_test_${randomBytes(6).toString('hex')}`;
  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE ${name}`);
  } finally {
    await admin.end();
  }

  const url = new URL(adminUrl);
  url.pathname = `/${name}`;

  return {
    url: url.toString(),
    async drop() {
      const client = new Client({ connectionString: adminUrl });
      await client.connect();
      try {
        await client.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      } finally {
        await client.end();
      }
    },
  };
}
