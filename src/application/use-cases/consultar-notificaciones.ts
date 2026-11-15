import type {
  FiltroNotificaciones,
  NotificacionRepository,
  PaginaNotificaciones,
} from '../ports/repositorios';

export class ConsultarNotificaciones {
  constructor(private readonly notificaciones: NotificacionRepository) {}

  ejecutar(tenantId: string, filtro: FiltroNotificaciones): Promise<PaginaNotificaciones> {
    return this.notificaciones.listar(tenantId, filtro);
  }
}
