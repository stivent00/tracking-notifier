import { DynamicModule, Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import type { AppConfig } from './infrastructure/config/config';
import { HealthController } from './infrastructure/http/health.controller';
import { buildLoggerParams } from './infrastructure/logging/logger.config';

@Module({})
export class AppModule {
  static register(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [LoggerModule.forRoot(buildLoggerParams(config))],
      controllers: [HealthController],
    };
  }
}
