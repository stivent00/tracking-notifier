import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { setupOpenApi } from './infrastructure/http/openapi';
import type { AppConfig } from './infrastructure/config/config';

export async function createApp(
  config: AppConfig,
  logStream?: NodeJS.WritableStream,
): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule.register(config, logStream),
    {
      bufferLogs: true,
    },
  );
  app.useLogger(app.get(Logger));
  app.disable('x-powered-by');
  app.useBodyParser('json', { limit: '100kb' });
  setupOpenApi(app);
  app.enableShutdownHooks();
  return app;
}
