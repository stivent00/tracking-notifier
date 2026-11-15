import type {
  ResultadoEnvio,
  SolicitudWebhook,
  WebhookSender,
} from '../../application/ports/webhook-sender';

export class FetchWebhookSender implements WebhookSender {
  constructor(private readonly timeoutMs: number) {}

  async enviar(solicitud: SolicitudWebhook): Promise<ResultadoEnvio> {
    const inicio = performance.now();
    const duracion = () => Math.round(performance.now() - inicio);
    try {
      const respuesta = await fetch(solicitud.url, {
        method: 'POST',
        // Una redireccion podria llevar el POST a un destino no validado: se trata como fallo.
        redirect: 'manual',
        signal: AbortSignal.timeout(this.timeoutMs),
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'tracking-notifier/1.0',
          'X-Event-Id': solicitud.payload.eventId,
          'X-Notification-Id': solicitud.notificacionId,
          'X-Delivery-Attempt': String(solicitud.intento),
        },
        body: JSON.stringify(solicitud.payload),
      });
      // El cuerpo de la respuesta no se lee ni se registra: puede contener datos del cliente.
      await respuesta.body?.cancel().catch(() => undefined);

      if (respuesta.status >= 200 && respuesta.status < 300) {
        return { exito: true, status: respuesta.status, duracionMs: duracion() };
      }
      return {
        exito: false,
        error: `HTTP_${respuesta.status}`,
        status: respuesta.status,
        duracionMs: duracion(),
      };
    } catch (error) {
      return { exito: false, error: clasificar(error), status: null, duracionMs: duracion() };
    }
  }
}

function clasificar(error: unknown): string {
  // Duck typing: DOMException (timeout/abort) no siempre es `instanceof Error` entre contextos.
  const { name, cause } = (error ?? {}) as { name?: unknown; cause?: { code?: unknown } };
  if (name === 'TimeoutError' || name === 'AbortError') return 'TIMEOUT';
  if (typeof cause?.code === 'string') return `RED_${cause.code}`;
  return 'ERROR_DE_RED';
}
