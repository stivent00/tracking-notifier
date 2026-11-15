import { Body, Controller, Get, Inject, Put } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type {
  ConfigurarWebhook,
  ObtenerWebhook,
} from '../../application/use-cases/configurar-webhook';
import type { ConfigWebhook } from '../../domain/config-webhook';
import { TOKENS } from '../tokens';
import { ConfigurarWebhookDto } from './dto';
import { ProblemResponse, WebhookResponse } from './responses';
import { Tenant } from './tenant.decorator';

const presentar = (c: ConfigWebhook) => ({
  url: c.url,
  actualizadoEn: c.actualizadoEn.toISOString(),
});

@ApiTags('webhook')
@Controller('webhook')
export class WebhookController {
  constructor(
    @Inject(TOKENS.ConfigurarWebhook) private readonly configurar: ConfigurarWebhook,
    @Inject(TOKENS.ObtenerWebhook) private readonly obtener: ObtenerWebhook,
  ) {}

  @ApiOperation({ summary: 'Configurar la URL de notificacion del tenant' })
  @ApiOkResponse({ type: WebhookResponse })
  @ApiBadRequestResponse({ type: ProblemResponse })
  @Put()
  async guardar(@Tenant() tenantId: string, @Body() dto: ConfigurarWebhookDto) {
    return presentar(await this.configurar.ejecutar(tenantId, dto.url));
  }

  @ApiOperation({ summary: 'Consultar la URL de notificacion del tenant' })
  @ApiOkResponse({ type: WebhookResponse })
  @ApiNotFoundResponse({ type: ProblemResponse })
  @Get()
  async consultar(@Tenant() tenantId: string) {
    return presentar(await this.obtener.ejecutar(tenantId));
  }
}
