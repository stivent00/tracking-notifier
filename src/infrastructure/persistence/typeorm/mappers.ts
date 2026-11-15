import type { EventoGuia } from '../../../domain/evento-guia';
import type { EstadoGuia } from '../../../domain/estado-guia';
import { Guia } from '../../../domain/guia';
import { Notificacion, type EstadoNotificacion } from '../../../domain/notificacion';
import type { EventoRow, GuiaRow } from './schemas';

export function guiaDesdeRow(row: GuiaRow): Guia {
  return Guia.reconstruir({
    tenantId: row.tenantId,
    numeroGuia: row.numeroGuia,
    estadoActual: row.estadoActual as EstadoGuia | null,
    ultimaFechaEvento: row.ultimaFechaEvento,
  });
}

export function eventoDesdeRow(row: EventoRow): EventoGuia {
  return {
    tenantId: row.tenantId,
    eventId: row.eventId,
    numeroGuia: row.numeroGuia,
    estado: row.estado as EstadoGuia,
    fechaEvento: row.fechaEvento,
    observacion: row.observacion,
    recibidoEn: row.recibidoEn,
  };
}

/** Fila cruda (snake_case) devuelta por consultas SQL explicitas. */
export interface NotificacionSqlRow {
  id: string;
  tenant_id: string;
  event_id: string;
  estado: string;
  intentos: number;
  proximo_intento_en: Date;
  ultimo_error: string | null;
  ultimo_status: number | null;
  creada_en: Date;
  enviada_en: Date | null;
}

export function notificacionDesdeSql(row: NotificacionSqlRow): Notificacion {
  return Notificacion.reconstruir({
    id: row.id,
    tenantId: row.tenant_id,
    eventId: row.event_id,
    estado: row.estado as EstadoNotificacion,
    intentos: row.intentos,
    proximoIntentoEn: row.proximo_intento_en,
    ultimoError: row.ultimo_error,
    ultimoStatus: row.ultimo_status,
    creadaEn: row.creada_en,
    enviadaEn: row.enviada_en,
  });
}
