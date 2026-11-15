import type { ConfigWebhook } from '../../domain/config-webhook';
import { WebhookNoConfiguradoError } from '../../domain/errores';
import { validarUrlWebhook } from '../../domain/url-webhook';
import type { Clock } from '../ports/clock';
import type { WebhookConfigRepository } from '../ports/repositorios';

export class ConfigurarWebhook {
  constructor(
    private readonly webhooks: WebhookConfigRepository,
    private readonly clock: Clock,
    private readonly opciones: { permitirHttp: boolean },
  ) {}

  async ejecutar(tenantId: string, url: string): Promise<ConfigWebhook> {
    const config: ConfigWebhook = {
      tenantId,
      url: validarUrlWebhook(url, this.opciones),
      actualizadoEn: this.clock.ahora(),
    };
    await this.webhooks.guardar(config);
    return config;
  }
}

export class ObtenerWebhook {
  constructor(private readonly webhooks: WebhookConfigRepository) {}

  async ejecutar(tenantId: string): Promise<ConfigWebhook> {
    const config = await this.webhooks.buscar(tenantId);
    if (!config) throw new WebhookNoConfiguradoError();
    return config;
  }
}
