import { Inject, Injectable, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import type { AppConfig } from '../config/config';
import { TOKENS } from '../tokens';
import { createDataSource } from './typeorm/data-source';

@Injectable()
export class DatabaseService implements OnModuleInit, OnApplicationShutdown {
  readonly dataSource: DataSource;

  constructor(@Inject(TOKENS.Config) private readonly config: AppConfig) {
    this.dataSource = createDataSource({
      url: config.databaseUrl,
      poolSize: config.databasePoolSize,
    });
  }

  async onModuleInit(): Promise<void> {
    await this.dataSource.initialize();
    if (this.config.runMigrationsOnStart) {
      await this.dataSource.runMigrations();
    }
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.dataSource.isInitialized) {
      await this.dataSource.destroy();
    }
  }

  async ping(): Promise<void> {
    await this.dataSource.query('SELECT 1');
  }
}
