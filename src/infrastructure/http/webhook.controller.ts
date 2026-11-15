import { Body, Controller, Get, Inject, Put } from '@nestjs/common';
import type {
  ConfigurarWebhook,
  ObtenerWebhook,
} from '../../application/use-cases/configurar-webhook';
import type { ConfigWebhook } from '../../domain/config-webhook';
import { TOKENS } from '../tokens';
import { ConfigurarWebhookDto } from './dto';
import { Tenant } from './tenant.decorator';

const presentar = (c: ConfigWebhook) => ({
  url: c.url,
  actualizadoEn: c.actualizadoEn.toISOString(),
});

@Controller('webhook')
export class WebhookController {
  constructor(
    @Inject(TOKENS.ConfigurarWebhook) private readonly configurar: ConfigurarWebhook,
    @Inject(TOKENS.ObtenerWebhook) private readonly obtener: ObtenerWebhook,
  ) {}

  @Put()
  async guardar(@Tenant() tenantId: string, @Body() dto: ConfigurarWebhookDto) {
    return presentar(await this.configurar.ejecutar(tenantId, dto.url));
  }

  @Get()
  async consultar(@Tenant() tenantId: string) {
    return presentar(await this.obtener.ejecutar(tenantId));
  }
}
