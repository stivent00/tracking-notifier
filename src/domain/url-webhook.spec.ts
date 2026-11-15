import { UrlWebhookInvalidaError } from './errores';
import { validarUrlWebhook } from './url-webhook';

const estricta = { permitirHttp: false };

describe('validarUrlWebhook', () => {
  it('acepta https y devuelve la URL normalizada', () => {
    expect(validarUrlWebhook('https://cliente.example.com/hooks/tracking', estricta)).toBe(
      'https://cliente.example.com/hooks/tracking',
    );
  });

  it('acepta http solo cuando el entorno lo permite', () => {
    expect(() => validarUrlWebhook('http://localhost:9000/hook', estricta)).toThrow(
      UrlWebhookInvalidaError,
    );
    expect(validarUrlWebhook('http://localhost:9000/hook', { permitirHttp: true })).toBe(
      'http://localhost:9000/hook',
    );
  });

  it.each([
    ['vacia', ''],
    ['sin esquema', 'cliente.example.com/hook'],
    ['esquema no web', 'ftp://cliente.example.com/hook'],
    ['javascript', 'javascript:alert(1)'],
    ['con credenciales', 'https://usuario:clave@cliente.example.com/hook'],
    ['con fragmento', 'https://cliente.example.com/hook#x'],
    ['demasiado larga', `https://cliente.example.com/${'a'.repeat(2100)}`],
  ])('rechaza una URL %s', (_nombre, url) => {
    expect(() => validarUrlWebhook(url, { permitirHttp: true })).toThrow(UrlWebhookInvalidaError);
  });
});
