import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';

const POSTGRES_IMAGE = 'postgres:16-alpine';

declare global {
  var __POSTGRES_CONTAINER__: StartedPostgreSqlContainer | undefined;
}

/**
 * Integration tests run against a real PostgreSQL. By default a throwaway container is
 * started with Testcontainers (Docker required). Set TEST_DATABASE_URL to reuse an
 * existing server instead; each test file creates and drops its own database there.
 */
export default async function globalSetup(): Promise<void> {
  if (process.env.TEST_DATABASE_URL) {
    process.env.TEST_ADMIN_DATABASE_URL = process.env.TEST_DATABASE_URL;
    return;
  }
  try {
    const container = await new PostgreSqlContainer(POSTGRES_IMAGE).start();
    globalThis.__POSTGRES_CONTAINER__ = container;
    process.env.TEST_ADMIN_DATABASE_URL = container.getConnectionUri();
  } catch (error) {
    throw new Error(
      'Could not start PostgreSQL for the integration tests. Start Docker, or set ' +
        'TEST_DATABASE_URL to an existing server.',
      { cause: error },
    );
  }
}
