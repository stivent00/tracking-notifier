import { Controller, Get, Inject, Query } from '@nestjs/common';
import type { ConsultarNotificaciones } from '../../application/use-cases/consultar-notificaciones';
import type { EstadoNotificacion } from '../../domain/notificacion';
import { TOKENS } from '../tokens';
import { ListarNotificacionesQuery } from './dto';
import { Tenant } from './tenant.decorator';

@Controller('notificaciones')
export class NotificacionesController {
  constructor(
    @Inject(TOKENS.ConsultarNotificaciones) private readonly consultar: ConsultarNotificaciones,
  ) {}

  @Get()
  async listar(@Tenant() tenantId: string, @Query() query: ListarNotificacionesQuery) {
    const pagina = await this.consultar.ejecutar(tenantId, {
      estado: query.estado as EstadoNotificacion | undefined,
      numeroGuia: query.numeroGuia,
      limite: query.limite,
      desplazamiento: query.desplazamiento,
    });
    return {
      total: pagina.total,
      limite: query.limite,
      desplazamiento: query.desplazamiento,
      items: pagina.items.map(({ notificacion: n, numeroGuia }) => ({
        id: n.id,
        eventId: n.eventId,
        numeroGuia,
        estado: n.estado,
        intentos: n.intentos,
        proximoIntentoEn: n.proximoIntentoEn.toISOString(),
        ultimoError: n.ultimoError,
        ultimoStatus: n.ultimoStatus,
        creadaEn: n.creadaEn.toISOString(),
        enviadaEn: n.enviadaEn?.toISOString() ?? null,
      })),
    };
  }
}
