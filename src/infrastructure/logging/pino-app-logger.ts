import type { PinoLogger } from 'nestjs-pino';
import type { AppLogger } from '../../application/ports/app-logger';

export class PinoAppLogger implements AppLogger {
  constructor(private readonly logger: PinoLogger) {}

  info(mensaje: string, campos: Record<string, unknown> = {}): void {
    this.logger.info(campos, mensaje);
  }
  warn(mensaje: string, campos: Record<string, unknown> = {}): void {
    this.logger.warn(campos, mensaje);
  }
  error(mensaje: string, campos: Record<string, unknown> = {}): void {
    this.logger.error(campos, mensaje);
  }
}
