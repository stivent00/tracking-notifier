import { EntitySchema } from 'typeorm';

export interface GuiaRow {
  tenantId: string;
  numeroGuia: string;
  estadoActual: string | null;
  ultimaFechaEvento: Date | null;
  creadaEn: Date;
  actualizadaEn: Date;
}

export interface EventoRow {
  tenantId: string;
  eventId: string;
  numeroGuia: string;
  estado: string;
  fechaEvento: Date;
  observacion: string | null;
  recibidoEn: Date;
  secuencia?: string;
}

export interface NotificacionRow {
  id: string;
  tenantId: string;
  eventId: string;
  estado: string;
  intentos: number;
  proximoIntentoEn: Date;
  bloqueadaHasta: Date | null;
  ultimoError: string | null;
  ultimoStatus: number | null;
  creadaEn: Date;
  actualizadaEn: Date;
  enviadaEn: Date | null;
}

export interface WebhookRow {
  tenantId: string;
  url: string;
  secreto: string;
  actualizadoEn: Date;
}

const timestamptz = (name: string, nullable = false) => ({
  name,
  type: 'timestamptz' as const,
  nullable,
});

export const GuiaSchema = new EntitySchema<GuiaRow>({
  name: 'Guia',
  tableName: 'guias',
  columns: {
    tenantId: { name: 'tenant_id', type: 'varchar', length: 64, primary: true },
    numeroGuia: { name: 'numero_guia', type: 'varchar', length: 64, primary: true },
    estadoActual: { name: 'estado_actual', type: 'varchar', length: 20, nullable: true },
    ultimaFechaEvento: timestamptz('ultima_fecha_evento', true),
    creadaEn: { ...timestamptz('creada_en'), default: () => 'now()' },
    actualizadaEn: { ...timestamptz('actualizada_en'), default: () => 'now()' },
  },
});

export const EventoSchema = new EntitySchema<EventoRow>({
  name: 'EventoGuia',
  tableName: 'eventos_guia',
  columns: {
    tenantId: { name: 'tenant_id', type: 'varchar', length: 64, primary: true },
    eventId: { name: 'event_id', type: 'uuid', primary: true },
    numeroGuia: { name: 'numero_guia', type: 'varchar', length: 64 },
    estado: { name: 'estado', type: 'varchar', length: 20 },
    fechaEvento: timestamptz('fecha_evento'),
    observacion: { name: 'observacion', type: 'text', nullable: true },
    recibidoEn: timestamptz('recibido_en'),
    secuencia: { name: 'secuencia', type: 'bigint', insert: false, update: false },
  },
});

export const NotificacionSchema = new EntitySchema<NotificacionRow>({
  name: 'Notificacion',
  tableName: 'notificaciones',
  columns: {
    id: { name: 'id', type: 'uuid', primary: true },
    tenantId: { name: 'tenant_id', type: 'varchar', length: 64 },
    eventId: { name: 'event_id', type: 'uuid' },
    estado: { name: 'estado', type: 'varchar', length: 20 },
    intentos: { name: 'intentos', type: 'int' },
    proximoIntentoEn: timestamptz('proximo_intento_en'),
    bloqueadaHasta: timestamptz('bloqueada_hasta', true),
    ultimoError: { name: 'ultimo_error', type: 'text', nullable: true },
    ultimoStatus: { name: 'ultimo_status', type: 'int', nullable: true },
    creadaEn: timestamptz('creada_en'),
    actualizadaEn: { ...timestamptz('actualizada_en'), default: () => 'now()' },
    enviadaEn: timestamptz('enviada_en', true),
  },
});

export const WebhookSchema = new EntitySchema<WebhookRow>({
  name: 'WebhookTenant',
  tableName: 'webhooks_tenant',
  columns: {
    tenantId: { name: 'tenant_id', type: 'varchar', length: 64, primary: true },
    url: { name: 'url', type: 'text' },
    secreto: { name: 'secreto', type: 'text' },
    actualizadoEn: timestamptz('actualizado_en'),
  },
});

export const SCHEMAS = [GuiaSchema, EventoSchema, NotificacionSchema, WebhookSchema];
