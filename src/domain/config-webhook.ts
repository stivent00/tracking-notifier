export interface ConfigWebhook {
  readonly tenantId: string;
  readonly url: string;
  /** Clave con la que se firma (HMAC-SHA256) cada notificacion enviada a este tenant. */
  readonly secreto: string;
  readonly actualizadoEn: Date;
}
