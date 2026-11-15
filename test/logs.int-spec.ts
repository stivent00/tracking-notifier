import { Writable } from 'node:stream';
import { startTestApp, TENANT_HEADER } from './support/test-app';
import { WebhookTarget, waitFor } from './support/webhook-target';

describe('logs estructurados sin datos personales', () => {
  it('emite JSON valido y nunca registra observacion, cuerpos, cabeceras ni la URL del webhook', async () => {
    const lineas: string[] = [];
    const stream = new Writable({
      write(chunk: Buffer, _encoding, callback) {
        lineas.push(...chunk.toString('utf8').split('\n').filter(Boolean));
        callback();
      },
    });
    const target = new WebhookTarget((i) => (i === 0 ? 500 : 200));
    await target.start();
    const t = await startTestApp(
      { logLevel: 'info', worker: { enabled: true } },
      undefined,
      stream,
    );
    try {
      const secreto = 'NOMBRE-PERSONAL-FICTICIO-123';
      await t.api
        .put('/webhook')
        .set(TENANT_HEADER, 'tenant-logs')
        .set('Authorization', 'Bearer token-que-no-debe-aparecer')
        .send({ url: target.url('/ruta-privada-del-cliente') });
      await t.api
        .post('/guias/L-1/eventos?token=en-query-string')
        .set(TENANT_HEADER, 'tenant-logs')
        .send({
          eventId: '6f9619ff-8b86-4d11-b42d-00c04fc964ff',
          estado: 'CREADA',
          fechaEvento: '2026-01-01T10:00:00Z',
          observacion: secreto,
        });
      await t.api
        .post('/guias/L-1/eventos')
        .set(TENANT_HEADER, 'tenant-logs')
        .send({ estado: 'X' });
      await waitFor(async () => target.requests.length >= 2, {
        description: 'entrega con reintento',
      });
      await waitFor(() => lineas.some((l) => l.includes('Webhook entregado')), {
        description: 'log de entrega',
      });

      const registros = lineas.map((l) => JSON.parse(l) as Record<string, unknown>);
      const texto = lineas.join('\n');

      expect(registros.length).toBeGreaterThan(3);
      expect(
        registros.every((r) => typeof r.level === 'string' && typeof r.time === 'string'),
      ).toBe(true);
      expect(texto).not.toContain(secreto);
      expect(texto).not.toContain('token-que-no-debe-aparecer');
      expect(texto).not.toContain('en-query-string');
      expect(texto).not.toContain('ruta-privada-del-cliente');
      expect(texto).not.toContain('127.0.0.1');
      expect(registros.some((r) => r.msg === 'Webhook fallido, se reintentara')).toBe(true);
      expect(registros.some((r) => r.tenantId === 'tenant-logs')).toBe(true);
    } finally {
      await t.close();
      await target.stop();
    }
  });
});
