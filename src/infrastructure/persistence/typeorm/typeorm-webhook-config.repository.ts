import type { EntityManager } from 'typeorm';
import type { WebhookConfigRepository } from '../../../application/ports/repositorios';
import type { ConfigWebhook } from '../../../domain/config-webhook';
import { WebhookSchema, type WebhookRow } from './schemas';

interface WebhookSqlRow {
  tenant_id: string;
  url: string;
  secreto: string;
  actualizado_en: Date;
}

const desdeSql = (row: WebhookSqlRow): ConfigWebhook => ({
  tenantId: row.tenant_id,
  url: row.url,
  secreto: row.secreto,
  actualizadoEn: row.actualizado_en,
});

export class TypeOrmWebhookConfigRepository implements WebhookConfigRepository {
  constructor(private readonly manager: EntityManager) {}

  async guardar(candidato: ConfigWebhook): Promise<ConfigWebhook> {
    // En el conflicto no se toca `secreto`: una reconfiguracion nunca invalida la firma.
    const filas: WebhookSqlRow[] = await this.manager.query(
      `INSERT INTO webhooks_tenant (tenant_id, url, secreto, actualizado_en)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (tenant_id)
         DO UPDATE SET url = EXCLUDED.url, actualizado_en = EXCLUDED.actualizado_en
       RETURNING tenant_id, url, secreto, actualizado_en`,
      [candidato.tenantId, candidato.url, candidato.secreto, candidato.actualizadoEn],
    );
    return desdeSql(filas[0] as WebhookSqlRow);
  }

  async rotarSecreto(
    tenantId: string,
    secreto: string,
    ahora: Date,
  ): Promise<ConfigWebhook | null> {
    // TypeORM devuelve [filas, cantidad] para UPDATE ... RETURNING.
    const [filas]: [WebhookSqlRow[], number] = await this.manager.query(
      `UPDATE webhooks_tenant SET secreto = $2, actualizado_en = $3
        WHERE tenant_id = $1
        RETURNING tenant_id, url, secreto, actualizado_en`,
      [tenantId, secreto, ahora],
    );
    return filas[0] ? desdeSql(filas[0]) : null;
  }

  async buscar(tenantId: string): Promise<ConfigWebhook | null> {
    const row = await this.manager
      .getRepository<WebhookRow>(WebhookSchema)
      .findOne({ where: { tenantId } });
    return row
      ? {
          tenantId: row.tenantId,
          url: row.url,
          secreto: row.secreto,
          actualizadoEn: row.actualizadoEn,
        }
      : null;
  }
}
