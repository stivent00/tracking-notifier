import type { Notificacion } from '../../domain/notificacion';
import type { PoliticaReintentos } from '../../domain/politica-reintentos';
import type { AppLogger } from '../ports/app-logger';
import type { Clock } from '../ports/clock';
import type {
  EventoRepository,
  NotificacionRepository,
  WebhookConfigRepository,
} from '../ports/repositorios';
import type { ResultadoEnvio, WebhookSender } from '../ports/webhook-sender';

export interface OpcionesDespacho {
  tamanoLote: number;
  arrendamientoMs: number;
}

export class DespacharNotificaciones {
  constructor(
    private readonly notificaciones: NotificacionRepository,
    private readonly eventos: EventoRepository,
    private readonly webhooks: WebhookConfigRepository,
    private readonly sender: WebhookSender,
    private readonly clock: Clock,
    private readonly politica: PoliticaReintentos,
    private readonly logger: AppLogger,
    private readonly opciones: OpcionesDespacho,
  ) {}

  /** Procesa un lote de notificaciones vencidas y devuelve cuantas reclamo. */
  async ejecutar(): Promise<number> {
    const ahora = this.clock.ahora();
    const lote = await this.notificaciones.reclamarLote(
      ahora,
      this.opciones.tamanoLote,
      new Date(ahora.getTime() + this.opciones.arrendamientoMs),
    );
    await Promise.all(lote.map((notificacion) => this.procesar(notificacion)));
    return lote.length;
  }

  private async procesar(notificacion: Notificacion): Promise<void> {
    const intento = notificacion.intentos + 1;
    const contexto = {
      tenantId: notificacion.tenantId,
      notificacionId: notificacion.id,
      eventId: notificacion.eventId,
      intento,
    };
    try {
      const resultado = await this.enviar(notificacion, intento);
      const fin = this.clock.ahora();
      if (resultado.exito) {
        notificacion.registrarExito(fin, resultado.status);
      } else {
        notificacion.registrarFallo(
          fin,
          { error: resultado.error, status: resultado.status },
          this.politica,
        );
      }
      await this.notificaciones.guardar(notificacion);

      const campos = {
        ...contexto,
        estado: notificacion.estado,
        status: resultado.status,
        duracionMs: resultado.duracionMs,
      };
      if (resultado.exito) {
        this.logger.info('Webhook entregado', campos);
      } else if (notificacion.estado === 'FALLIDA') {
        this.logger.error('Webhook fallido definitivamente', { ...campos, error: resultado.error });
      } else {
        this.logger.warn('Webhook fallido, se reintentara', {
          ...campos,
          error: resultado.error,
          proximoIntentoEn: notificacion.proximoIntentoEn.toISOString(),
        });
      }
    } catch (error) {
      // El arrendamiento sigue vigente: al vencer, la notificacion se reclama de nuevo.
      this.logger.error('No se pudo procesar la notificacion', {
        ...contexto,
        errorName: error instanceof Error ? error.name : 'desconocido',
      });
    }
  }

  private async enviar(notificacion: Notificacion, intento: number): Promise<ResultadoEnvio> {
    const config = await this.webhooks.buscar(notificacion.tenantId);
    if (!config) {
      return { exito: false, error: 'WEBHOOK_NO_CONFIGURADO', status: null, duracionMs: 0 };
    }
    const evento = await this.eventos.buscarPorEventId(notificacion.tenantId, notificacion.eventId);
    if (!evento) {
      return { exito: false, error: 'EVENTO_NO_ENCONTRADO', status: null, duracionMs: 0 };
    }
    return this.sender.enviar({
      url: config.url,
      secreto: config.secreto,
      notificacionId: notificacion.id,
      intento,
      payload: {
        eventId: evento.eventId,
        tenantId: evento.tenantId,
        numeroGuia: evento.numeroGuia,
        estado: evento.estado,
        fechaEvento: evento.fechaEvento.toISOString(),
        observacion: evento.observacion,
      },
    });
  }
}
