import { Body, Controller, Get, Inject, Param, Post, Res } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import type { ConsultarHistorial } from '../../application/use-cases/consultar-historial';
import type { RegistrarEvento } from '../../application/use-cases/registrar-evento';
import type { EstadoGuia } from '../../domain/estado-guia';
import type { EventoGuia } from '../../domain/evento-guia';
import { TOKENS } from '../tokens';
import { RegistrarEventoDto } from './dto';
import { EventoResponse, HistorialResponse, ProblemResponse } from './responses';
import { NumeroGuiaPipe } from './numero-guia.pipe';
import { Tenant } from './tenant.decorator';

const presentarEvento = (e: EventoGuia) => ({
  eventId: e.eventId,
  numeroGuia: e.numeroGuia,
  estado: e.estado,
  fechaEvento: e.fechaEvento.toISOString(),
  observacion: e.observacion,
  recibidoEn: e.recibidoEn.toISOString(),
});

@ApiTags('guias')
@Controller('guias')
export class GuiasController {
  constructor(
    @Inject(TOKENS.RegistrarEvento) private readonly registrarEvento: RegistrarEvento,
    @Inject(TOKENS.ConsultarHistorial) private readonly consultarHistorial: ConsultarHistorial,
  ) {}

  @ApiOperation({
    summary: 'Registrar un evento de estado',
    description:
      'Idempotente por (tenant, eventId): repetir el mismo evento responde 200 con la cabecera ' +
      'Idempotent-Replayed. Una guia ENTREGADA o DEVUELTA ya no cambia de estado.',
  })
  @ApiCreatedResponse({ type: EventoResponse, description: 'Evento aceptado' })
  @ApiOkResponse({ type: EventoResponse, description: 'Repeticion idempotente del mismo evento' })
  @ApiBadRequestResponse({ type: ProblemResponse })
  @ApiConflictResponse({
    type: ProblemResponse,
    description: 'TRANSICION_INVALIDA, EVENTO_FUERA_DE_ORDEN o EVENT_ID_EN_CONFLICTO',
  })
  @Post(':numeroGuia/eventos')
  async registrar(
    @Tenant() tenantId: string,
    @Param('numeroGuia', NumeroGuiaPipe) numeroGuia: string,
    @Body() dto: RegistrarEventoDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { evento, creado } = await this.registrarEvento.ejecutar({
      tenantId,
      numeroGuia,
      eventId: dto.eventId,
      estado: dto.estado as EstadoGuia,
      fechaEvento: new Date(dto.fechaEvento),
      observacion: dto.observacion ?? null,
    });
    res.status(creado ? 201 : 200);
    if (!creado) res.setHeader('Idempotent-Replayed', 'true');
    return presentarEvento(evento);
  }

  @ApiOperation({ summary: 'Estado actual y eventos en orden cronologico' })
  @ApiOkResponse({ type: HistorialResponse })
  @ApiNotFoundResponse({ type: ProblemResponse, description: 'La guia no existe para este tenant' })
  @Get(':numeroGuia')
  async historial(
    @Tenant() tenantId: string,
    @Param('numeroGuia', NumeroGuiaPipe) numeroGuia: string,
  ) {
    const historial = await this.consultarHistorial.ejecutar(tenantId, numeroGuia);
    return {
      numeroGuia: historial.numeroGuia,
      estadoActual: historial.estadoActual,
      eventos: historial.eventos.map(presentarEvento),
    };
  }
}
