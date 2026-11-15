import type { EntityManager } from 'typeorm';
import type { GuiaRepository } from '../../../application/ports/repositorios';
import type { Guia } from '../../../domain/guia';
import { guiaDesdeRow } from './mappers';
import { GuiaSchema, type GuiaRow } from './schemas';

export class TypeOrmGuiaRepository implements GuiaRepository {
  constructor(private readonly manager: EntityManager) {}

  async obtenerParaActualizar(tenantId: string, numeroGuia: string): Promise<Guia> {
    await this.manager.query(
      `INSERT INTO guias (tenant_id, numero_guia) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [tenantId, numeroGuia],
    );
    const row = await this.manager
      .getRepository<GuiaRow>(GuiaSchema)
      .createQueryBuilder('g')
      .setLock('pessimistic_write')
      .where('g.tenantId = :tenantId AND g.numeroGuia = :numeroGuia', { tenantId, numeroGuia })
      .getOneOrFail();
    return guiaDesdeRow(row);
  }

  async guardar(guia: Guia): Promise<void> {
    await this.manager.getRepository<GuiaRow>(GuiaSchema).update(
      { tenantId: guia.tenantId, numeroGuia: guia.numeroGuia },
      {
        estadoActual: guia.estadoActual,
        ultimaFechaEvento: guia.ultimaFechaEvento,
        actualizadaEn: () => 'now()',
      },
    );
  }

  async buscar(tenantId: string, numeroGuia: string): Promise<Guia | null> {
    const row = await this.manager
      .getRepository<GuiaRow>(GuiaSchema)
      .findOne({ where: { tenantId, numeroGuia } });
    return row && row.estadoActual !== null ? guiaDesdeRow(row) : null;
  }
}
