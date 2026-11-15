import type { ConfigWebhook } from '../../domain/config-webhook';
import type { EventoGuia } from '../../domain/evento-guia';
import type { Guia } from '../../domain/guia';
import type { EstadoNotificacion, Notificacion } from '../../domain/notificacion';

/**
 * Todos los metodos reciben el tenant de forma explicita: no existe ninguna consulta
 * que pueda leer datos de un tenant sin indicarlo.
 */
export interface GuiaRepository {
  /**
   * Devuelve la guia bloqueada para escritura hasta el final de la transaccion; si no
   * existia la crea vacia. Serializa los eventos concurrentes de una misma guia.
   */
  obtenerParaActualizar(tenantId: string, numeroGuia: string): Promise<Guia>;
  guardar(guia: Guia): Promise<void>;
  buscar(tenantId: string, numeroGuia: string): Promise<Guia | null>;
}

export interface EventoRepository {
  buscarPorEventId(tenantId: string, eventId: string): Promise<EventoGuia | null>;
  /** Devuelve false si (tenantId, eventId) ya existia; la base de datos es el arbitro final. */
  insertar(evento: EventoGuia): Promise<boolean>;
  /** Orden cronologico: por fechaEvento y, en empate, por orden de llegada. */
  listarPorGuia(tenantId: string, numeroGuia: string): Promise<EventoGuia[]>;
}

export interface FiltroNotificaciones {
  estado?: EstadoNotificacion;
  numeroGuia?: string;
  limite: number;
  desplazamiento: number;
}

export interface NotificacionConGuia {
  notificacion: Notificacion;
  numeroGuia: string;
}

export interface PaginaNotificaciones {
  items: NotificacionConGuia[];
  total: number;
}

export interface NotificacionRepository {
  insertar(notificacion: Notificacion): Promise<void>;
  /**
   * Reclama de forma atomica hasta `limite` notificaciones vencidas, arrendandolas hasta
   * `arrendadaHasta`. Dos reclamos concurrentes nunca devuelven la misma notificacion.
   */
  reclamarLote(ahora: Date, limite: number, arrendadaHasta: Date): Promise<Notificacion[]>;
  guardar(notificacion: Notificacion): Promise<void>;
  listar(tenantId: string, filtro: FiltroNotificaciones): Promise<PaginaNotificaciones>;
}

export interface WebhookConfigRepository {
  guardar(config: ConfigWebhook): Promise<void>;
  buscar(tenantId: string): Promise<ConfigWebhook | null>;
}
