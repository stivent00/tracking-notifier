import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ESTADOS_GUIA } from '../../domain/estado-guia';
import { ESTADOS_NOTIFICACION } from '../../domain/notificacion';
import type { FieldError } from './problem';

export class FieldErrorResponse implements FieldError {
  @ApiProperty() field!: string;
  @ApiProperty() message!: string;
}

export class ProblemResponse {
  @ApiProperty({ example: 'urn:tracking-notifier:error:TRANSICION_INVALIDA' }) type!: string;
  @ApiProperty({ example: 'Conflicto' }) title!: string;
  @ApiProperty({ example: 409 }) status!: number;
  @ApiProperty({ example: 'TRANSICION_INVALIDA' }) code!: string;
  @ApiProperty({ example: 'Transicion invalida de ENTREGADA a EN_RUTA' }) detail!: string;
  @ApiPropertyOptional({ type: [FieldErrorResponse] }) errors?: FieldErrorResponse[];
  @ApiProperty({ description: 'Coincide con la cabecera X-Request-Id y con los logs' })
  requestId!: string;
  @ApiProperty({ example: '/guias/GUIA-1001/eventos' }) instance!: string;
}

export class EventoResponse {
  @ApiProperty({ format: 'uuid' }) eventId!: string;
  @ApiProperty({ example: 'GUIA-1001' }) numeroGuia!: string;
  @ApiProperty({ enum: ESTADOS_GUIA }) estado!: string;
  @ApiProperty({ example: '2026-01-15T14:00:00.000Z' }) fechaEvento!: string;
  @ApiProperty({ nullable: true, type: String }) observacion!: string | null;
  @ApiProperty({ example: '2026-01-15T14:00:01.123Z' }) recibidoEn!: string;
}

export class HistorialResponse {
  @ApiProperty({ example: 'GUIA-1001' }) numeroGuia!: string;
  @ApiProperty({ enum: ESTADOS_GUIA }) estadoActual!: string;
  @ApiProperty({ type: [EventoResponse], description: 'En orden cronologico' })
  eventos!: EventoResponse[];
}

export class WebhookResponse {
  @ApiProperty({ example: 'https://cliente.example.com/hooks/tracking' }) url!: string;
  @ApiProperty() actualizadoEn!: string;
}

export class NotificacionResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) eventId!: string;
  @ApiProperty() numeroGuia!: string;
  @ApiProperty({ enum: ESTADOS_NOTIFICACION }) estado!: string;
  @ApiProperty({ description: 'Intentos de envio realizados' }) intentos!: number;
  @ApiProperty() proximoIntentoEn!: string;
  @ApiProperty({ nullable: true, type: String, example: 'HTTP_500' }) ultimoError!: string | null;
  @ApiProperty({ nullable: true, type: Number, example: 500 }) ultimoStatus!: number | null;
  @ApiProperty() creadaEn!: string;
  @ApiProperty({ nullable: true, type: String }) enviadaEn!: string | null;
}

export class PaginaNotificacionesResponse {
  @ApiProperty() total!: number;
  @ApiProperty() limite!: number;
  @ApiProperty() desplazamiento!: number;
  @ApiProperty({ type: [NotificacionResponse] }) items!: NotificacionResponse[];
}
