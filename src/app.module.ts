import { DynamicModule, Module, type Provider } from '@nestjs/common';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { ConfigurarWebhook, ObtenerWebhook } from './application/use-cases/configurar-webhook';
import { ConsultarHistorial } from './application/use-cases/consultar-historial';
import { ConsultarNotificaciones } from './application/use-cases/consultar-notificaciones';
import { RegistrarEvento } from './application/use-cases/registrar-evento';
import type { AppConfig } from './infrastructure/config/config';
import { AllExceptionsFilter } from './infrastructure/http/all-exceptions.filter';
import { GuiasController } from './infrastructure/http/guias.controller';
import { HealthController } from './infrastructure/http/health.controller';
import { NotificacionesController } from './infrastructure/http/notificaciones.controller';
import { crearValidationPipe } from './infrastructure/http/validation';
import { WebhookController } from './infrastructure/http/webhook.controller';
import { buildLoggerParams } from './infrastructure/logging/logger.config';
import { DatabaseService } from './infrastructure/persistence/database.service';
import { TypeOrmEventoRepository } from './infrastructure/persistence/typeorm/typeorm-evento.repository';
import { TypeOrmNotificacionRepository } from './infrastructure/persistence/typeorm/typeorm-notificacion.repository';
import { TypeOrmUnitOfWork } from './infrastructure/persistence/typeorm/typeorm-unit-of-work';
import { TypeOrmWebhookConfigRepository } from './infrastructure/persistence/typeorm/typeorm-webhook-config.repository';
import { systemClock, uuidGenerator } from './infrastructure/system';
import { TOKENS } from './infrastructure/tokens';
import type { Clock } from './application/ports/clock';
import type { IdGenerator } from './application/ports/id-generator';
import type {
  EventoRepository,
  NotificacionRepository,
  WebhookConfigRepository,
} from './application/ports/repositorios';
import type { UnitOfWork } from './application/ports/unit-of-work';

/**
 * Composition root: es el unico lugar donde los puertos se enlazan con sus adaptadores y
 * donde se construyen los casos de uso (clases puras, sin decoradores de Nest).
 */
function buildProviders(config: AppConfig): Provider[] {
  return [
    { provide: TOKENS.Config, useValue: config },
    DatabaseService,
    { provide: TOKENS.Clock, useValue: systemClock },
    { provide: TOKENS.IdGenerator, useValue: uuidGenerator },
    {
      provide: TOKENS.UnitOfWork,
      inject: [DatabaseService],
      useFactory: (db: DatabaseService) => new TypeOrmUnitOfWork(db.dataSource),
    },
    {
      provide: TOKENS.EventoRepository,
      inject: [DatabaseService],
      useFactory: (db: DatabaseService) => new TypeOrmEventoRepository(db.dataSource.manager),
    },
    {
      provide: TOKENS.NotificacionRepository,
      inject: [DatabaseService],
      useFactory: (db: DatabaseService) => new TypeOrmNotificacionRepository(db.dataSource.manager),
    },
    {
      provide: TOKENS.WebhookConfigRepository,
      inject: [DatabaseService],
      useFactory: (db: DatabaseService) =>
        new TypeOrmWebhookConfigRepository(db.dataSource.manager),
    },
    {
      provide: TOKENS.RegistrarEvento,
      inject: [TOKENS.UnitOfWork, TOKENS.EventoRepository, TOKENS.Clock, TOKENS.IdGenerator],
      useFactory: (uow: UnitOfWork, eventos: EventoRepository, clock: Clock, ids: IdGenerator) =>
        new RegistrarEvento(uow, eventos, clock, ids),
    },
    {
      provide: TOKENS.ConsultarHistorial,
      inject: [TOKENS.EventoRepository],
      useFactory: (eventos: EventoRepository) => new ConsultarHistorial(eventos),
    },
    {
      provide: TOKENS.ConfigurarWebhook,
      inject: [TOKENS.WebhookConfigRepository, TOKENS.Clock],
      useFactory: (webhooks: WebhookConfigRepository, clock: Clock) =>
        new ConfigurarWebhook(webhooks, clock, { permitirHttp: config.webhook.allowHttp }),
    },
    {
      provide: TOKENS.ObtenerWebhook,
      inject: [TOKENS.WebhookConfigRepository],
      useFactory: (webhooks: WebhookConfigRepository) => new ObtenerWebhook(webhooks),
    },
    {
      provide: TOKENS.ConsultarNotificaciones,
      inject: [TOKENS.NotificacionRepository],
      useFactory: (notificaciones: NotificacionRepository) =>
        new ConsultarNotificaciones(notificaciones),
    },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_PIPE, useFactory: crearValidationPipe },
  ];
}

@Module({})
export class AppModule {
  static register(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [LoggerModule.forRoot(buildLoggerParams(config))],
      controllers: [HealthController, GuiasController, WebhookController, NotificacionesController],
      providers: buildProviders(config),
    };
  }
}
