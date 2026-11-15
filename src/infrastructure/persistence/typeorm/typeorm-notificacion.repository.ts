import type { EntityManager } from 'typeorm';
import type {
  FiltroNotificaciones,
  NotificacionRepository,
  PaginaNotificaciones,
} from '../../../application/ports/repositorios';
import type { Notificacion } from '../../../domain/notificacion';
import { notificacionDesdeSql, type NotificacionSqlRow } from './mappers';
import { NotificacionSchema, type NotificacionRow } from './schemas';

export class TypeOrmNotificacionRepository implements NotificacionRepository {
  constructor(private readonly manager: EntityManager) {}

  async insertar(notificacion: Notificacion): Promise<void> {
    const n = notificacion.snapshot();
    await this.manager.getRepository<NotificacionRow>(NotificacionSchema).insert({
      id: n.id,
      tenantId: n.tenantId,
      eventId: n.eventId,
      estado: n.estado,
      intentos: n.intentos,
      proximoIntentoEn: n.proximoIntentoEn,
      ultimoError: n.ultimoError,
      ultimoStatus: n.ultimoStatus,
      creadaEn: n.creadaEn,
      enviadaEn: n.enviadaEn,
    });
  }

  async reclamarLote(ahora: Date, limite: number, arrendadaHasta: Date): Promise<Notificacion[]> {
    // FOR UPDATE SKIP LOCKED: cada worker salta las filas que otro ya esta reclamando, asi
    // varias instancias pueden despachar a la vez sin repetir envios ni esperar bloqueos.
    const [filas]: [NotificacionSqlRow[], number] = await this.manager.query(
      `UPDATE notificaciones
          SET bloqueada_hasta = $3, actualizada_en = now()
        WHERE id IN (
          SELECT id FROM notificaciones
           WHERE estado = 'PENDIENTE'
             AND proximo_intento_en <= $1
             AND (bloqueada_hasta IS NULL OR bloqueada_hasta <= $1)
           ORDER BY proximo_intento_en
           LIMIT $2
           FOR UPDATE SKIP LOCKED
        )
        RETURNING id, tenant_id, event_id, estado, intentos, proximo_intento_en,
                  ultimo_error, ultimo_status, creada_en, enviada_en`,
      [ahora, limite, arrendadaHasta],
    );
    return filas.map(notificacionDesdeSql);
  }

  async guardar(notificacion: Notificacion): Promise<void> {
    const n = notificacion.snapshot();
    await this.manager.getRepository<NotificacionRow>(NotificacionSchema).update(
      { id: n.id },
      {
        estado: n.estado,
        intentos: n.intentos,
        proximoIntentoEn: n.proximoIntentoEn,
        ultimoError: n.ultimoError,
        ultimoStatus: n.ultimoStatus,
        enviadaEn: n.enviadaEn,
        bloqueadaHasta: null,
        actualizadaEn: () => 'now()',
      },
    );
  }

  async listar(tenantId: string, filtro: FiltroNotificaciones): Promise<PaginaNotificaciones> {
    const condiciones = ['n.tenant_id = $1'];
    const parametros: unknown[] = [tenantId];
    if (filtro.estado) {
      parametros.push(filtro.estado);
      condiciones.push(`n.estado = $${parametros.length}`);
    }
    if (filtro.numeroGuia) {
      parametros.push(filtro.numeroGuia);
      condiciones.push(`e.numero_guia = $${parametros.length}`);
    }
    const desde = `FROM notificaciones n
      JOIN eventos_guia e ON e.tenant_id = n.tenant_id AND e.event_id = n.event_id
      WHERE ${condiciones.join(' AND ')}`;

    const [conteo]: Array<{ total: number }> = await this.manager.query(
      `SELECT count(*)::int AS total ${desde}`,
      parametros,
    );
    const filas: Array<NotificacionSqlRow & { numero_guia: string }> = await this.manager.query(
      `SELECT n.id, n.tenant_id, n.event_id, n.estado, n.intentos, n.proximo_intento_en,
              n.ultimo_error, n.ultimo_status, n.creada_en, n.enviada_en, e.numero_guia
       ${desde}
       ORDER BY n.creada_en DESC, n.id
       LIMIT $${parametros.length + 1} OFFSET $${parametros.length + 2}`,
      [...parametros, filtro.limite, filtro.desplazamiento],
    );
    return {
      total: conteo?.total ?? 0,
      items: filas.map((fila) => ({
        notificacion: notificacionDesdeSql(fila),
        numeroGuia: fila.numero_guia,
      })),
    };
  }
}
