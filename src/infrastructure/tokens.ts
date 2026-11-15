export const TOKENS = {
  Config: Symbol('Config'),
  UnitOfWork: Symbol('UnitOfWork'),
  EventoRepository: Symbol('EventoRepository'),
  NotificacionRepository: Symbol('NotificacionRepository'),
  WebhookConfigRepository: Symbol('WebhookConfigRepository'),
  Clock: Symbol('Clock'),
  IdGenerator: Symbol('IdGenerator'),
  RegistrarEvento: Symbol('RegistrarEvento'),
  ConsultarHistorial: Symbol('ConsultarHistorial'),
  ConfigurarWebhook: Symbol('ConfigurarWebhook'),
  ObtenerWebhook: Symbol('ObtenerWebhook'),
  ConsultarNotificaciones: Symbol('ConsultarNotificaciones'),
} as const;
