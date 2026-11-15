import type { EntityManager } from 'typeorm';
import type { EventoRepository } from '../../../application/ports/repositorios';
import type { EventoGuia } from '../../../domain/evento-guia';
import { eventoDesdeRow } from './mappers';
import { EventoSchema, type EventoRow } from './schemas';

export class TypeOrmEventoRepository implements EventoRepository {
  constructor(private readonly manager: EntityManager) {}

  async buscarPorEventId(tenantId: string, eventId: string): Promise<EventoGuia | null> {
    const row = await this.manager
      .getRepository<EventoRow>(EventoSchema)
      .findOne({ where: { tenantId, eventId } });
    return row ? eventoDesdeRow(row) : null;
  }

  async insertar(evento: EventoGuia): Promise<boolean> {
    const filas: unknown[] = await this.manager.query(
      `INSERT INTO eventos_guia
         (tenant_id, event_id, numero_guia, estado, fecha_evento, observacion, recibido_en)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (tenant_id, event_id) DO NOTHING
       RETURNING event_id`,
      [
        evento.tenantId,
        evento.eventId,
        evento.numeroGuia,
        evento.estado,
        evento.fechaEvento,
        evento.observacion,
        evento.recibidoEn,
      ],
    );
    return filas.length === 1;
  }

  async listarPorGuia(tenantId: string, numeroGuia: string): Promise<EventoGuia[]> {
    const rows = await this.manager
      .getRepository<EventoRow>(EventoSchema)
      .createQueryBuilder('e')
      .where('e.tenantId = :tenantId AND e.numeroGuia = :numeroGuia', { tenantId, numeroGuia })
      .orderBy('e.fechaEvento', 'ASC')
      .addOrderBy('e.secuencia', 'ASC')
      .getMany();
    return rows.map(eventoDesdeRow);
  }
}
