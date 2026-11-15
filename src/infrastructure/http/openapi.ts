import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export function setupOpenApi(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('tracking-notifier')
    .setDescription(
      'Recibe cambios de estado de guias de envio, los guarda por tenant y notifica por webhook. ' +
        'Todas las rutas (salvo /health) exigen la cabecera X-Tenant-Id.',
    )
    .setVersion('1.0.0')
    .addGlobalParameters({
      name: 'X-Tenant-Id',
      in: 'header',
      required: true,
      description: 'Tenant ya validado por el API Gateway: 1 a 64 caracteres [A-Za-z0-9_-]',
      schema: { type: 'string', example: 'acme' },
    })
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document, { jsonDocumentUrl: 'openapi.json' });
}
