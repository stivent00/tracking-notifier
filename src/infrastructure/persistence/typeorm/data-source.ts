import { DataSource } from 'typeorm';
import { MIGRATIONS } from './migrations';
import { SCHEMAS } from './schemas';

export interface DatabaseOptions {
  url: string;
  poolSize: number;
}

export function createDataSource(options: DatabaseOptions): DataSource {
  return new DataSource({
    type: 'postgres',
    url: options.url,
    entities: SCHEMAS,
    migrations: MIGRATIONS,
    synchronize: false,
    migrationsRun: false,
    extra: { max: options.poolSize },
  });
}
