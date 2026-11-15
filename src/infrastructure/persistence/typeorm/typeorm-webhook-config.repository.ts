import type { EntityManager } from 'typeorm';
import type { WebhookConfigRepository } from '../../../application/ports/repositorios';
import type { ConfigWebhook } from '../../../domain/config-webhook';
import { WebhookSchema, type WebhookRow } from './schemas';

export class TypeOrmWebhookConfigRepository implements WebhookConfigRepository {
  constructor(private readonly manager: EntityManager) {}

  async guardar(config: ConfigWebhook): Promise<void> {
    await this.manager
      .getRepository<WebhookRow>(WebhookSchema)
      .upsert({ tenantId: config.tenantId, url: config.url, actualizadoEn: config.actualizadoEn }, [
        'tenantId',
      ]);
  }

  async buscar(tenantId: string): Promise<ConfigWebhook | null> {
    const row = await this.manager
      .getRepository<WebhookRow>(WebhookSchema)
      .findOne({ where: { tenantId } });
    return row ? { tenantId: row.tenantId, url: row.url, actualizadoEn: row.actualizadoEn } : null;
  }
}
