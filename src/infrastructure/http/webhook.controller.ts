import { Body, Controller, Get, HttpCode, Inject, Post, Put } from '@nestjs/common';
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
  RotarSecretoWebhook,
} from '../../application/use-cases/configurar-webhook';
import type { ConfigWebhook } from '../../domain/config-webhook';
import { TOKENS } from '../tokens';
import { ConfigurarWebhookDto } from './dto';
import {
  ConfiguracionWebhookResponse,
  ProblemResponse,
  SecretoResponse,
  WebhookResponse,
} from './responses';
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
    @Inject(TOKENS.RotarSecretoWebhook) private readonly rotar: RotarSecretoWebhook,
  ) {}

  @ApiOperation({
    summary: 'Configurar la URL de notificacion del tenant',
    description:
      'En la primera configuracion devuelve `secreto`, la clave con la que se firma cada ' +
      'notificacion (X-Signature). Es la unica vez que se muestra; reconfigurar la URL la conserva.',
  })
  @ApiOkResponse({ type: ConfiguracionWebhookResponse })
  @ApiBadRequestResponse({ type: ProblemResponse })
  @Put()
  async guardar(@Tenant() tenantId: string, @Body() dto: ConfigurarWebhookDto) {
    const { config, secretoRevelado } = await this.configurar.ejecutar(tenantId, dto.url);
    return { ...presentar(config), ...(secretoRevelado ? { secreto: secretoRevelado } : {}) };
  }

  @ApiOperation({ summary: 'Consultar la URL de notificacion del tenant (sin el secreto)' })
  @ApiOkResponse({ type: WebhookResponse })
  @ApiNotFoundResponse({ type: ProblemResponse })
  @Get()
  async consultar(@Tenant() tenantId: string) {
    return presentar(await this.obtener.ejecutar(tenantId));
  }

  @ApiOperation({
    summary: 'Rotar el secreto de firma',
    description: 'Invalida el secreto anterior y devuelve el nuevo, que solo se muestra ahora.',
  })
  @ApiOkResponse({ type: SecretoResponse })
  @ApiNotFoundResponse({ type: ProblemResponse })
  @HttpCode(200)
  @Post('secreto/rotar')
  async rotarSecreto(@Tenant() tenantId: string) {
    return { secreto: await this.rotar.ejecutar(tenantId) };
  }
}
