import { UrlWebhookInvalidaError } from './errores';

const MAX_LARGO = 2048;

export interface OpcionesUrlWebhook {
  permitirHttp: boolean;
}

/** Valida y normaliza la URL a la que se notifica a un tenant. */
export function validarUrlWebhook(crudo: string, opciones: OpcionesUrlWebhook): string {
  if (crudo.length === 0 || crudo.length > MAX_LARGO) {
    throw new UrlWebhookInvalidaError(`La URL debe tener entre 1 y ${MAX_LARGO} caracteres`);
  }
  let url: URL;
  try {
    url = new URL(crudo);
  } catch {
    throw new UrlWebhookInvalidaError('La URL no es valida');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new UrlWebhookInvalidaError('Solo se permiten URLs http o https');
  }
  if (url.protocol === 'http:' && !opciones.permitirHttp) {
    throw new UrlWebhookInvalidaError('La URL debe usar https');
  }
  if (url.username !== '' || url.password !== '') {
    throw new UrlWebhookInvalidaError('La URL no puede incluir credenciales');
  }
  if (url.hash !== '') {
    throw new UrlWebhookInvalidaError('La URL no puede incluir fragmento');
  }
  return url.toString();
}
