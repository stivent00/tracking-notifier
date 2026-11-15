import {
  Inject,
  Injectable,
  type BeforeApplicationShutdown,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import type { AppLogger } from '../../application/ports/app-logger';
import type { DespacharNotificaciones } from '../../application/use-cases/despachar-notificaciones';
import type { AppConfig } from '../config/config';
import { TOKENS } from '../tokens';

/**
 * Sondea la tabla de notificaciones pendientes. Si el lote vino lleno vuelve a sondear de
 * inmediato; si no, espera `pollIntervalMs`. Al apagarse deja terminar el lote en curso.
 */
@Injectable()
export class NotificacionWorker implements OnApplicationBootstrap, BeforeApplicationShutdown {
  private timer: NodeJS.Timeout | undefined;
  private enCurso: Promise<void> | undefined;
  private detenido = false;

  constructor(
    @Inject(TOKENS.DespacharNotificaciones) private readonly despachar: DespacharNotificaciones,
    @Inject(TOKENS.Config) private readonly config: AppConfig,
    @Inject(TOKENS.AppLogger) private readonly logger: AppLogger,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.config.worker.enabled) return;
    this.programar(0);
  }

  async beforeApplicationShutdown(): Promise<void> {
    this.detenido = true;
    if (this.timer) clearTimeout(this.timer);
    await this.enCurso;
  }

  private programar(retardoMs: number): void {
    if (this.detenido) return;
    this.timer = setTimeout(() => {
      this.enCurso = this.iterar();
    }, retardoMs);
  }

  private async iterar(): Promise<void> {
    let procesadas = 0;
    try {
      procesadas = await this.despachar.ejecutar();
    } catch (error) {
      this.logger.error('Fallo el ciclo del worker de notificaciones', {
        errorName: error instanceof Error ? error.name : 'desconocido',
      });
    }
    const lleno = procesadas >= this.config.worker.batchSize;
    this.programar(lleno ? 0 : this.config.worker.pollIntervalMs);
  }
}
