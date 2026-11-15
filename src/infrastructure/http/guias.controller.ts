import { Body, Controller, Get, Inject, Param, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { ConsultarHistorial } from '../../application/use-cases/consultar-historial';
import type { RegistrarEvento } from '../../application/use-cases/registrar-evento';
import type { EstadoGuia } from '../../domain/estado-guia';
import type { EventoGuia } from '../../domain/evento-guia';
import { TOKENS } from '../tokens';
import { RegistrarEventoDto } from './dto';
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

@Controller('guias')
export class GuiasController {
  constructor(
    @Inject(TOKENS.RegistrarEvento) private readonly registrarEvento: RegistrarEvento,
    @Inject(TOKENS.ConsultarHistorial) private readonly consultarHistorial: ConsultarHistorial,
  ) {}

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
