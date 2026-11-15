import { createHmac } from 'node:crypto';
import { firmar } from './fetch-webhook-sender';

describe('firmar', () => {
  it('es HMAC-SHA256 hexadecimal de "timestamp.cuerpo"', () => {
    const esperado = createHmac('sha256', 'secreto').update('1700000000.{"a":1}').digest('hex');

    expect(firmar('secreto', '1700000000', '{"a":1}')).toBe(`sha256=${esperado}`);
  });

  it('cambia si cambia el cuerpo, el timestamp o el secreto', () => {
    const base = firmar('secreto', '1700000000', '{"a":1}');

    expect(firmar('secreto', '1700000000', '{"a":2}')).not.toBe(base);
    expect(firmar('secreto', '1700000001', '{"a":1}')).not.toBe(base);
    expect(firmar('otro', '1700000000', '{"a":1}')).not.toBe(base);
  });
});
