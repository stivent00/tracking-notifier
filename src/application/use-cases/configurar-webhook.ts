import type { ConfigWebhook } from '../../domain/config-webhook';
import { WebhookNoConfiguradoError } from '../../domain/errores';
import { validarUrlWebhook } from '../../domain/url-webhook';
import type { Clock } from '../ports/clock';
import type { WebhookConfigRepository } from '../ports/repositorios';
import type { SecretGenerator } from '../ports/secret-generator';

export interface ResultadoConfiguracion {
  config: ConfigWebhook;
  /** Solo presente cuando el secreto se genero en esta llamada: es la unica vez que se muestra. */
  secretoRevelado: string | null;
}

export class ConfigurarWebhook {
  constructor(
    private readonly webhooks: WebhookConfigRepository,
    private readonly clock: Clock,
    private readonly secretos: SecretGenerator,
    private readonly opciones: { permitirHttp: boolean },
  ) {}

  async ejecutar(tenantId: string, url: string): Promise<ResultadoConfiguracion> {
    const candidato: ConfigWebhook = {
      tenantId,
      url: validarUrlWebhook(url, this.opciones),
      secreto: this.secretos.nuevoSecreto(),
      actualizadoEn: this.clock.ahora(),
    };
    // Si el tenant ya tenia webhook se conserva su secreto: el candidato solo "gana" en la
    // primera configuracion, incluso con dos PUT simultaneos.
    const config = await this.webhooks.guardar(candidato);
    return {
      config,
      secretoRevelado: config.secreto === candidato.secreto ? config.secreto : null,
    };
  }
}

export class RotarSecretoWebhook {
  constructor(
    private readonly webhooks: WebhookConfigRepository,
    private readonly clock: Clock,
    private readonly secretos: SecretGenerator,
  ) {}

  async ejecutar(tenantId: string): Promise<string> {
    const secreto = this.secretos.nuevoSecreto();
    const config = await this.webhooks.rotarSecreto(tenantId, secreto, this.clock.ahora());
    if (!config) throw new WebhookNoConfiguradoError();
    return secreto;
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
