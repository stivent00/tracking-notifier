import 'reflect-metadata';
import { createApp } from './app';
import { ConfigError, loadConfig } from './infrastructure/config/config';

async function bootstrap(): Promise<void> {
  const config = loadConfig();
  const app = await createApp(config);
  await app.listen(config.port, '0.0.0.0');
}

bootstrap().catch((error: unknown) => {
  const message = error instanceof ConfigError ? error.message : 'Fatal error during startup';
  process.stderr.write(
    `${JSON.stringify({ level: 'fatal', time: new Date().toISOString(), msg: message })}\n`,
  );
  process.exit(1);
});
