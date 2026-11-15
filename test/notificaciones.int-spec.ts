import { createHmac, randomUUID } from 'node:crypto';
import { startTestApp, TENANT_HEADER, type TestApp } from './support/test-app';
import { WebhookTarget, waitFor, type RecordedRequest } from './support/webhook-target';

const A = 'tenant-a';
const B = 'tenant-b';

interface NotificacionDto {
  id: string;
  eventId: string;
  numeroGuia: string;
  estado: string;
  intentos: number;
  ultimoError: string | null;
  ultimoStatus: number | null;
}

const evento = (estado: string, fechaEvento = '2026-01-01T10:00:00Z', extra = {}) => ({
  eventId: randomUUID(),
  estado,
  fechaEvento,
  ...extra,
});

describe('API: webhook, notificaciones y reintentos', () => {
  let t: TestApp;
  let target: WebhookTarget;
  let seq = 0;
  const guiaNueva = () => `W-${++seq}`;

  const configurarWebhook = (tenant: string, url: string) =>
    t.api.put('/webhook').set(TENANT_HEADER, tenant).send({ url });
  const registrar = (tenant: string, guia: string, payload: object) =>
    t.api.post(`/guias/${guia}/eventos`).set(TENANT_HEADER, tenant).send(payload);
  const notificaciones = async (tenant: string, query = ''): Promise<NotificacionDto[]> =>
    (await t.api.get(`/notificaciones${query}`).set(TENANT_HEADER, tenant)).body.items;
  const esperarEstado = (tenant: string, eventId: string, estado: string) =>
    waitFor(
      async () =>
        (await notificaciones(tenant)).find((n) => n.eventId === eventId && n.estado === estado),
      { description: `notificacion ${estado} de ${eventId}` },
    );

  beforeAll(async () => {
    t = await startTestApp({ worker: { enabled: true }, webhook: { timeoutMs: 300 } });
    target = new WebhookTarget();
    await target.start();
  });
  afterAll(async () => {
    await t.close();
    await target.stop();
  });
  beforeEach(() => {
    target.requests.length = 0;
    target.setBehavior(() => 200);
  });

  describe('configurar webhook', () => {
    it('guarda la URL por tenant y la devuelve', async () => {
      const sin = await t.api.get('/webhook').set(TENANT_HEADER, 'tenant-sin-webhook');
      const guardado = await configurarWebhook('tenant-cfg', target.url('/uno'));
      await configurarWebhook('tenant-cfg', target.url('/dos'));
      const leido = await t.api.get('/webhook').set(TENANT_HEADER, 'tenant-cfg');
      const otro = await t.api.get('/webhook').set(TENANT_HEADER, 'tenant-otro');

      expect(sin.status).toBe(404);
      expect(sin.body.code).toBe('WEBHOOK_NO_CONFIGURADO');
      expect(guardado.status).toBe(200);
      expect(leido.body.url).toBe(target.url('/dos'));
      expect(otro.status).toBe(404);
    });

    it.each([
      ['no es una URL', 'no-es-url'],
      ['usa un esquema no web', 'ftp://cliente.example.com/hook'],
      ['incluye credenciales', 'http://usuario:clave@127.0.0.1/hook'],
    ])('400 cuando la URL %s', async (_caso, url) => {
      const r = await configurarWebhook(A, url);

      expect(r.status).toBe(400);
      expect(r.body.code).toBe('URL_WEBHOOK_INVALIDA');
    });

    it('400 si falta la URL', async () => {
      const r = await t.api.put('/webhook').set(TENANT_HEADER, A).send({});

      expect(r.status).toBe(400);
      expect(r.body.code).toBe('VALIDACION_FALLIDA');
    });
  });

  describe('entrega', () => {
    it('notifica cada evento aceptado con el evento en el cuerpo', async () => {
      await configurarWebhook(A, target.url());
      const guia = guiaNueva();
      const e = evento('CREADA', '2026-01-01T10:00:00Z', { observacion: 'Tarjeta de prueba' });

      await registrar(A, guia, e);
      const entregada = await esperarEstado(A, e.eventId, 'ENVIADA');

      expect(entregada).toMatchObject({ intentos: 1, ultimoError: null, numeroGuia: guia });
      expect(target.requests).toHaveLength(1);
      expect(target.requests[0]).toMatchObject({
        method: 'POST',
        body: {
          eventId: e.eventId,
          tenantId: A,
          numeroGuia: guia,
          estado: 'CREADA',
          fechaEvento: '2026-01-01T10:00:00.000Z',
          observacion: 'Tarjeta de prueba',
        },
      });
      expect(target.requests[0]?.headers['x-event-id']).toBe(e.eventId);
      expect(target.requests[0]?.headers['x-delivery-attempt']).toBe('1');
    });

    it('no bloquea la respuesta del registro aunque el webhook no conteste', async () => {
      await configurarWebhook(A, target.url());
      target.setBehavior(() => 'hang');
      const e = evento('CREADA');

      const respuesta = await registrar(A, guiaNueva(), e);
      await waitFor(() => target.requests.length === 1, { description: 'llegada al webhook' });

      expect(respuesta.status).toBe(201);
      const [pendiente] = await notificaciones(A, '?estado=PENDIENTE');
      expect(pendiente).toBeDefined();

      target.setBehavior(() => 200);
      await esperarEstado(A, e.eventId, 'ENVIADA');
    });

    it('un evento repetido no genera una segunda notificacion', async () => {
      await configurarWebhook(A, target.url());
      const guia = guiaNueva();
      const e = evento('CREADA');

      await registrar(A, guia, e);
      await registrar(A, guia, e);
      await esperarEstado(A, e.eventId, 'ENVIADA');
      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(target.requests).toHaveLength(1);
    });

    it('cada tenant se notifica solo en su propio webhook', async () => {
      const otroTarget = new WebhookTarget();
      await otroTarget.start();
      try {
        await configurarWebhook(A, target.url());
        await configurarWebhook(B, otroTarget.url());
        const eA = evento('CREADA');
        const eB = evento('CREADA');

        await registrar(A, 'COMPARTIDA', eA);
        await registrar(B, 'COMPARTIDA', eB);
        await esperarEstado(A, eA.eventId, 'ENVIADA');
        await esperarEstado(B, eB.eventId, 'ENVIADA');

        expect(target.requests.map((r) => r.body.eventId)).toEqual([eA.eventId]);
        expect(otroTarget.requests.map((r) => r.body.eventId)).toEqual([eB.eventId]);
        expect((await notificaciones(A)).some((n) => n.eventId === eB.eventId)).toBe(false);
        expect((await notificaciones(B)).some((n) => n.eventId === eA.eventId)).toBe(false);
      } finally {
        await otroTarget.stop();
      }
    });
  });

  describe('firma HMAC', () => {
    const firmaValida = (peticion: RecordedRequest, secreto: string): boolean => {
      const timestamp = String(peticion.headers['x-signature-timestamp']);
      const esperado = `sha256=${createHmac('sha256', secreto)
        .update(`${timestamp}.${peticion.rawBody}`)
        .digest('hex')}`;
      return peticion.headers['x-signature'] === esperado;
    };

    it('muestra el secreto solo en la primera configuracion y nunca en la consulta', async () => {
      const primera = await configurarWebhook('tenant-firma-1', target.url());
      const segunda = await configurarWebhook('tenant-firma-1', target.url('/otra'));
      const consulta = await t.api.get('/webhook').set(TENANT_HEADER, 'tenant-firma-1');

      expect(primera.body.secreto).toMatch(/^whsec_[A-Za-z0-9_-]{43}$/);
      expect(segunda.status).toBe(200);
      expect(segunda.body).not.toHaveProperty('secreto');
      expect(consulta.body).not.toHaveProperty('secreto');
    });

    it('con configuraciones simultaneas solo una recibe el secreto y es el que queda guardado', async () => {
      const tenant = 'tenant-firma-carrera';

      const respuestas = await Promise.all(
        Array.from({ length: 10 }, () => configurarWebhook(tenant, target.url())),
      );

      const reveladas = respuestas.map((r) => r.body.secreto).filter(Boolean);
      expect(reveladas).toHaveLength(1);
      const { secreto } = await t.queryOne<{ secreto: string }>(
        'SELECT secreto FROM webhooks_tenant WHERE tenant_id = $1',
        [tenant],
      );
      expect(secreto).toBe(reveladas[0]);
    });

    it('cada notificacion llega firmada con el secreto del tenant', async () => {
      const tenant = 'tenant-firma-2';
      const { body } = await configurarWebhook(tenant, target.url());
      const e = evento('CREADA');

      await registrar(tenant, guiaNueva(), e);
      await esperarEstado(tenant, e.eventId, 'ENVIADA');

      const [recibida] = target.requests;
      expect(recibida?.headers['x-signature']).toMatch(/^sha256=[0-9a-f]{64}$/);
      expect(firmaValida(recibida!, body.secreto)).toBe(true);
      expect(firmaValida(recibida!, 'otro-secreto')).toBe(false);
      const edad = Date.now() / 1000 - Number(recibida?.headers['x-signature-timestamp']);
      expect(Math.abs(edad)).toBeLessThan(30);
    });

    it('al rotar el secreto, las entregas nuevas usan el nuevo y el anterior deja de validar', async () => {
      const tenant = 'tenant-firma-3';
      const { body: inicial } = await configurarWebhook(tenant, target.url());
      const rotado = await t.api.post('/webhook/secreto/rotar').set(TENANT_HEADER, tenant);
      const e = evento('CREADA');

      await registrar(tenant, guiaNueva(), e);
      await esperarEstado(tenant, e.eventId, 'ENVIADA');

      expect(rotado.status).toBe(200);
      expect(rotado.body.secreto).not.toBe(inicial.secreto);
      const [recibida] = target.requests;
      expect(firmaValida(recibida!, rotado.body.secreto)).toBe(true);
      expect(firmaValida(recibida!, inicial.secreto)).toBe(false);
    });

    it('rotar el secreto sin webhook configurado es 404', async () => {
      const r = await t.api.post('/webhook/secreto/rotar').set(TENANT_HEADER, 'tenant-sin-hook');

      expect(r.status).toBe(404);
      expect(r.body.code).toBe('WEBHOOK_NO_CONFIGURADO');
    });
  });

  describe('reintentos', () => {
    it('reintenta con el mismo evento hasta que el webhook responde 2xx', async () => {
      await configurarWebhook(A, target.url());
      target.setBehavior((i) => (i < 2 ? 500 : 200));
      const e = evento('CREADA');

      await registrar(A, guiaNueva(), e);
      const n = await esperarEstado(A, e.eventId, 'ENVIADA');

      expect(n.intentos).toBe(3);
      expect(target.requests.map((r) => r.headers['x-delivery-attempt'])).toEqual(['1', '2', '3']);
      expect(new Set(target.requests.map((r) => r.body.eventId))).toEqual(new Set([e.eventId]));
    });

    it('tras 5 intentos fallidos queda FALLIDA y consultable', async () => {
      await configurarWebhook(A, target.url());
      target.setBehavior(() => 500);
      const e = evento('CREADA');

      await registrar(A, guiaNueva(), e);
      const fallida = await esperarEstado(A, e.eventId, 'FALLIDA');
      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(fallida).toMatchObject({ intentos: 5, ultimoError: 'HTTP_500', ultimoStatus: 500 });
      expect(target.requests).toHaveLength(5);
      const consulta = await t.api.get('/notificaciones?estado=FALLIDA').set(TENANT_HEADER, A);
      expect(consulta.body.items.map((n: NotificacionDto) => n.eventId)).toContain(e.eventId);
      expect(consulta.body.total).toBeGreaterThanOrEqual(1);
    });

    it('un webhook que no responde dentro del timeout cuenta como fallo', async () => {
      await configurarWebhook(A, target.url());
      target.setBehavior((i) => (i === 0 ? 'hang' : 200));
      const e = evento('CREADA');

      await registrar(A, guiaNueva(), e);
      const n = await esperarEstado(A, e.eventId, 'ENVIADA');

      expect(n.intentos).toBe(2);
      expect(target.requests).toHaveLength(2);
    });

    it('los 5 intentos agotados por timeout dejan ultimoError TIMEOUT', async () => {
      await configurarWebhook(A, target.url());
      target.setBehavior(() => 'hang');
      const e = evento('CREADA');

      await registrar(A, guiaNueva(), e);
      const fallida = await esperarEstado(A, e.eventId, 'FALLIDA');

      expect(fallida).toMatchObject({ intentos: 5, ultimoError: 'TIMEOUT', ultimoStatus: null });
    });

    it('sin webhook configurado el evento se acepta y se entrega al configurarlo', async () => {
      const tenant = 'tenant-tardio';
      const e = evento('CREADA');

      const respuesta = await registrar(tenant, guiaNueva(), e);
      const pendiente = await waitFor(
        async () =>
          (await notificaciones(tenant)).find(
            (n) => n.eventId === e.eventId && n.ultimoError === 'WEBHOOK_NO_CONFIGURADO',
          ),
        { description: 'primer intento sin webhook' },
      );
      await configurarWebhook(tenant, target.url());
      const entregada = await esperarEstado(tenant, e.eventId, 'ENVIADA');

      expect(respuesta.status).toBe(201);
      expect(pendiente.estado).toBe('PENDIENTE');
      expect(entregada.intentos).toBeGreaterThan(1);
      expect(target.requests).toHaveLength(1);
    });
  });

  describe('consulta de notificaciones', () => {
    it('valida los parametros de filtro y paginacion', async () => {
      const estado = await t.api.get('/notificaciones?estado=ROTA').set(TENANT_HEADER, A);
      const limite = await t.api.get('/notificaciones?limite=1000').set(TENANT_HEADER, A);

      expect(estado.status).toBe(400);
      expect(limite.status).toBe(400);
    });

    it('pagina los resultados', async () => {
      await configurarWebhook('tenant-pag', target.url());
      for (let i = 0; i < 3; i++) await registrar('tenant-pag', guiaNueva(), evento('CREADA'));

      const pagina = await t.api.get('/notificaciones?limite=2').set(TENANT_HEADER, 'tenant-pag');
      const resto = await t.api
        .get('/notificaciones?limite=2&desplazamiento=2')
        .set(TENANT_HEADER, 'tenant-pag');

      expect(pagina.body).toMatchObject({ total: 3, limite: 2, desplazamiento: 0 });
      expect(pagina.body.items).toHaveLength(2);
      expect(resto.body.items).toHaveLength(1);
    });
  });
});

describe('outbox: sobrevive a un reinicio', () => {
  it('una notificacion pendiente se entrega cuando arranca otra instancia', async () => {
    const target = new WebhookTarget();
    await target.start();
    const sinWorker = await startTestApp({ worker: { enabled: false } });
    try {
      const e = evento('CREADA');
      await sinWorker.api.put('/webhook').set(TENANT_HEADER, A).send({ url: target.url() });
      await sinWorker.api.post('/guias/R-1/eventos').set(TENANT_HEADER, A).send(e);
      await sinWorker.stop();
      expect(target.requests).toHaveLength(0);

      const reiniciada = await startTestApp({ worker: { enabled: true } }, sinWorker.db);
      try {
        await waitFor(() => target.requests.length === 1, { description: 'entrega tras reinicio' });
        expect(target.requests[0]?.body.eventId).toBe(e.eventId);
      } finally {
        await reiniciada.close();
      }
    } finally {
      await target.stop();
    }
  });
});

describe('configuracion estricta de webhooks', () => {
  it('rechaza http cuando WEBHOOK_ALLOW_HTTP es false', async () => {
    const t = await startTestApp({ webhook: { allowHttp: false } });
    try {
      const http = await t.api
        .put('/webhook')
        .set(TENANT_HEADER, A)
        .send({ url: 'http://cliente.example.com/hook' });
      const https = await t.api
        .put('/webhook')
        .set(TENANT_HEADER, A)
        .send({ url: 'https://cliente.example.com/hook' });

      expect(http.status).toBe(400);
      expect(http.body.code).toBe('URL_WEBHOOK_INVALIDA');
      expect(https.status).toBe(200);
    } finally {
      await t.close();
    }
  });
});
