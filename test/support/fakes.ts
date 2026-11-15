import type { AppLogger } from '../../src/application/ports/app-logger';
import type { Clock } from '../../src/application/ports/clock';
import type {
  EventoRepository,
  FiltroNotificaciones,
  NotificacionRepository,
  PaginaNotificaciones,
  WebhookConfigRepository,
} from '../../src/application/ports/repositorios';
import type {
  ResultadoEnvio,
  SolicitudWebhook,
  WebhookSender,
} from '../../src/application/ports/webhook-sender';
import type { ConfigWebhook } from '../../src/domain/config-webhook';
import type { EventoGuia } from '../../src/domain/evento-guia';
import { Notificacion, type NotificacionProps } from '../../src/domain/notificacion';

export class MutableClock implements Clock {
  constructor(private actual: Date) {}
  ahora(): Date {
    return new Date(this.actual);
  }
  avanzar(ms: number): void {
    this.actual = new Date(this.actual.getTime() + ms);
  }
}

export class InMemoryEventos implements Pick<EventoRepository, 'buscarPorEventId'> {
  private readonly items = new Map<string, EventoGuia>();
  agregar(evento: EventoGuia): void {
    this.items.set(`${evento.tenantId}/${evento.eventId}`, evento);
  }
  async buscarPorEventId(tenantId: string, eventId: string): Promise<EventoGuia | null> {
    return this.items.get(`${tenantId}/${eventId}`) ?? null;
  }
}

export class InMemoryWebhooks implements WebhookConfigRepository {
  private readonly items = new Map<string, ConfigWebhook>();
  async guardar(candidato: ConfigWebhook): Promise<ConfigWebhook> {
    const final = {
      ...candidato,
      secreto: this.items.get(candidato.tenantId)?.secreto ?? candidato.secreto,
    };
    this.items.set(candidato.tenantId, final);
    return final;
  }
  async rotarSecreto(
    tenantId: string,
    secreto: string,
    ahora: Date,
  ): Promise<ConfigWebhook | null> {
    const actual = this.items.get(tenantId);
    if (!actual) return null;
    const nuevo = { ...actual, secreto, actualizadoEn: ahora };
    this.items.set(tenantId, nuevo);
    return nuevo;
  }
  async buscar(tenantId: string): Promise<ConfigWebhook | null> {
    return this.items.get(tenantId) ?? null;
  }
}

/**
 * Reproduce la semantica del repositorio real: entrega copias y solo conserva lo que se
 * guarda, igual que una base de datos.
 */
export class InMemoryNotificaciones implements NotificacionRepository {
  private readonly items = new Map<
    string,
    { props: NotificacionProps; bloqueadaHasta: Date | null }
  >();
  failOnGuardar = false;

  async insertar(notificacion: Notificacion): Promise<void> {
    this.items.set(notificacion.id, { props: notificacion.snapshot(), bloqueadaHasta: null });
  }

  obtener(id: string): Notificacion {
    const item = this.items.get(id);
    if (!item) throw new Error(`notificacion ${id} no existe`);
    return Notificacion.reconstruir(item.props);
  }

  async reclamarLote(ahora: Date, limite: number, arrendadaHasta: Date): Promise<Notificacion[]> {
    const elegidas = [...this.items.values()]
      .filter(
        ({ props, bloqueadaHasta }) =>
          props.estado === 'PENDIENTE' &&
          props.proximoIntentoEn <= ahora &&
          (bloqueadaHasta === null || bloqueadaHasta <= ahora),
      )
      .slice(0, limite);
    for (const item of elegidas) item.bloqueadaHasta = arrendadaHasta;
    return elegidas.map((i) => Notificacion.reconstruir(i.props));
  }

  async guardar(notificacion: Notificacion): Promise<void> {
    if (this.failOnGuardar) throw new Error('db caida');
    this.items.set(notificacion.id, { props: notificacion.snapshot(), bloqueadaHasta: null });
  }

  async listar(_tenantId: string, _filtro: FiltroNotificaciones): Promise<PaginaNotificaciones> {
    return { items: [], total: 0 };
  }
}

export class ScriptedSender implements WebhookSender {
  readonly solicitudes: SolicitudWebhook[] = [];
  constructor(private readonly respuestas: Array<ResultadoEnvio | 'throw'>) {}

  async enviar(solicitud: SolicitudWebhook): Promise<ResultadoEnvio> {
    this.solicitudes.push(solicitud);
    const respuesta =
      this.respuestas[Math.min(this.solicitudes.length - 1, this.respuestas.length - 1)];
    if (respuesta === 'throw' || respuesta === undefined) throw new Error('inesperado');
    return respuesta;
  }
}

export const OK: ResultadoEnvio = { exito: true, status: 200, duracionMs: 5 };
export const FALLO_500: ResultadoEnvio = {
  exito: false,
  error: 'HTTP_500',
  status: 500,
  duracionMs: 5,
};
export const TIMEOUT: ResultadoEnvio = {
  exito: false,
  error: 'TIMEOUT',
  status: null,
  duracionMs: 5000,
};

export class RecordingLogger implements AppLogger {
  readonly entradas: Array<{ nivel: string; mensaje: string; campos: Record<string, unknown> }> =
    [];
  info(mensaje: string, campos: Record<string, unknown> = {}): void {
    this.entradas.push({ nivel: 'info', mensaje, campos });
  }
  warn(mensaje: string, campos: Record<string, unknown> = {}): void {
    this.entradas.push({ nivel: 'warn', mensaje, campos });
  }
  error(mensaje: string, campos: Record<string, unknown> = {}): void {
    this.entradas.push({ nivel: 'error', mensaje, campos });
  }
}
