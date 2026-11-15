export interface PayloadWebhook {
  eventId: string;
  tenantId: string;
  numeroGuia: string;
  estado: string;
  fechaEvento: string;
  observacion: string | null;
}

export interface SolicitudWebhook {
  url: string;
  payload: PayloadWebhook;
  notificacionId: string;
  /** Numero del intento que se esta realizando (1 para el primero). */
  intento: number;
}

export type ResultadoEnvio =
  | { exito: true; status: number; duracionMs: number }
  | { exito: false; error: string; status: number | null; duracionMs: number };

export interface WebhookSender {
  /** Nunca lanza: cualquier fallo (red, timeout, status no 2xx) se devuelve como resultado. */
  enviar(solicitud: SolicitudWebhook): Promise<ResultadoEnvio>;
}
