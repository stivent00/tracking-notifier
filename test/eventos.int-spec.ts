import { randomUUID } from 'node:crypto';
import { startTestApp, TENANT_HEADER, type TestApp } from './support/test-app';

const A = 'tenant-a';
const B = 'tenant-b';

function body(estado: string, fechaEvento: string, extra: Record<string, unknown> = {}) {
  return { eventId: randomUUID(), estado, fechaEvento, ...extra };
}

describe('API: registrar evento e historial', () => {
  let t: TestApp;
  let guiaSeq = 0;
  const nuevaGuia = () => `G-${++guiaSeq}`;

  beforeAll(async () => {
    t = await startTestApp();
  });
  afterAll(async () => {
    await t.close();
  });

  const post = (tenant: string, guia: string, payload: unknown) =>
    t.api
      .post(`/guias/${guia}/eventos`)
      .set(TENANT_HEADER, tenant)
      .send(payload as object);
  const get = (tenant: string, guia: string) =>
    t.api.get(`/guias/${guia}`).set(TENANT_HEADER, tenant);

  describe('flujo normal', () => {
    it('registra eventos y devuelve estado actual y eventos en orden cronologico', async () => {
      const guia = nuevaGuia();

      const r1 = await post(
        A,
        guia,
        body('CREADA', '2026-01-01T10:00:00Z', { observacion: 'Alta' }),
      );
      const r2 = await post(A, guia, body('EN_RUTA', '2026-01-01T11:00:00-05:00'));
      const r3 = await post(A, guia, body('ENTREGADA', '2026-01-01T17:30:00Z'));
      const historial = await get(A, guia);

      expect([r1.status, r2.status, r3.status]).toEqual([201, 201, 201]);
      expect(r1.body).toMatchObject({ numeroGuia: guia, estado: 'CREADA', observacion: 'Alta' });
      expect(historial.status).toBe(200);
      expect(historial.body.estadoActual).toBe('ENTREGADA');
      expect(historial.body.eventos.map((e: { estado: string }) => e.estado)).toEqual([
        'CREADA',
        'EN_RUTA',
        'ENTREGADA',
      ]);
      expect(historial.body.eventos[1].fechaEvento).toBe('2026-01-01T16:00:00.000Z');
    });

    it('cada evento aceptado genera exactamente una notificacion pendiente', async () => {
      const guia = nuevaGuia();
      await post(A, guia, body('CREADA', '2026-01-01T10:00:00Z'));
      await post(A, guia, body('EN_RUTA', '2026-01-01T11:00:00Z'));

      const filas = await t.query(
        `SELECT n.estado FROM notificaciones n
           JOIN eventos_guia e USING (tenant_id, event_id)
          WHERE e.numero_guia = $1`,
        [guia],
      );

      expect(filas).toEqual([{ estado: 'PENDIENTE' }, { estado: 'PENDIENTE' }]);
    });
  });

  describe('idempotencia', () => {
    it('repetir el mismo evento responde 200 sin duplicar evento ni notificacion', async () => {
      const guia = nuevaGuia();
      const evento = body('CREADA', '2026-01-01T10:00:00Z');

      const primera = await post(A, guia, evento);
      const segunda = await post(A, guia, evento);

      expect(primera.status).toBe(201);
      expect(segunda.status).toBe(200);
      expect(segunda.headers['idempotent-replayed']).toBe('true');
      expect(segunda.body).toEqual(primera.body);
      const { eventos } = await t.queryOne<{ eventos: number }>(
        `SELECT count(*)::int AS eventos FROM eventos_guia WHERE event_id = $1`,
        [evento.eventId],
      );
      const { notificaciones } = await t.queryOne<{ notificaciones: number }>(
        `SELECT count(*)::int AS notificaciones FROM notificaciones WHERE event_id = $1`,
        [evento.eventId],
      );
      expect({ eventos, notificaciones }).toEqual({ eventos: 1, notificaciones: 1 });
    });

    it('20 solicitudes simultaneas con el mismo eventId producen un solo evento', async () => {
      const guia = nuevaGuia();
      const evento = body('CREADA', '2026-01-01T10:00:00Z');

      const respuestas = await Promise.all(Array.from({ length: 20 }, () => post(A, guia, evento)));

      const estados = respuestas.map((r) => r.status).sort();
      expect(estados.filter((s) => s === 201)).toHaveLength(1);
      expect(estados.filter((s) => s === 200)).toHaveLength(19);
      const { total } = await t.queryOne<{ total: number }>(
        `SELECT (SELECT count(*) FROM eventos_guia WHERE event_id = $1)::int +
                (SELECT count(*) FROM notificaciones WHERE event_id = $1)::int AS total`,
        [evento.eventId],
      );
      expect(total).toBe(2);
    });

    it('el mismo eventId con contenido distinto es un conflicto 409', async () => {
      const guia = nuevaGuia();
      const evento = body('CREADA', '2026-01-01T10:00:00Z');
      await post(A, guia, evento);

      const conflicto = await post(A, guia, { ...evento, estado: 'EN_RUTA' });
      const otraGuia = await post(A, nuevaGuia(), evento);

      expect(conflicto.status).toBe(409);
      expect(conflicto.body.code).toBe('EVENT_ID_EN_CONFLICTO');
      expect(otraGuia.status).toBe(409);
      expect(otraGuia.body.code).toBe('EVENT_ID_EN_CONFLICTO');
    });

    it('un eventId duplicado en otra guia no deja guias vacias', async () => {
      const guia = nuevaGuia();
      const otra = nuevaGuia();
      const evento = body('CREADA', '2026-01-01T10:00:00Z');
      await post(A, guia, evento);

      await post(A, otra, evento);

      const filas = await t.query(`SELECT 1 FROM guias WHERE numero_guia = $1`, [otra]);
      expect(filas).toHaveLength(0);
    });
  });

  describe('reglas de estado', () => {
    it('la primera transicion debe ser CREADA y no deja rastro si falla', async () => {
      const guia = nuevaGuia();

      const respuesta = await post(A, guia, body('EN_RUTA', '2026-01-01T10:00:00Z'));

      expect(respuesta.status).toBe(409);
      expect(respuesta.body.code).toBe('TRANSICION_INVALIDA');
      expect((await get(A, guia)).status).toBe(404);
      expect(await t.query(`SELECT 1 FROM guias WHERE numero_guia = $1`, [guia])).toHaveLength(0);
    });

    it.each(['ENTREGADA', 'DEVUELTA'])('una guia %s ya no cambia de estado', async (terminal) => {
      const guia = nuevaGuia();
      await post(A, guia, body('CREADA', '2026-01-01T10:00:00Z'));
      await post(A, guia, body('EN_RUTA', '2026-01-01T11:00:00Z'));
      await post(A, guia, body(terminal, '2026-01-01T12:00:00Z'));

      for (const estado of ['CREADA', 'EN_RUTA', 'ENTREGADA', 'DEVUELTA']) {
        const r = await post(A, guia, body(estado, '2026-01-02T00:00:00Z'));
        expect(r.status).toBe(409);
        expect(r.body.code).toBe('TRANSICION_INVALIDA');
      }
      expect((await get(A, guia)).body.estadoActual).toBe(terminal);
      const { total } = await t.queryOne<{ total: number }>(
        `SELECT count(*)::int AS total FROM eventos_guia WHERE numero_guia = $1`,
        [guia],
      );
      expect(total).toBe(3);
    });

    it('rechaza un evento con fecha anterior al ultimo aceptado', async () => {
      const guia = nuevaGuia();
      await post(A, guia, body('CREADA', '2026-01-01T10:00:00Z'));

      const r = await post(A, guia, body('EN_RUTA', '2026-01-01T09:00:00Z'));

      expect(r.status).toBe(409);
      expect(r.body.code).toBe('EVENTO_FUERA_DE_ORDEN');
    });

    it('con ENTREGADA y DEVUELTA simultaneas solo gana una', async () => {
      const guia = nuevaGuia();
      await post(A, guia, body('CREADA', '2026-01-01T10:00:00Z'));
      await post(A, guia, body('EN_RUTA', '2026-01-01T11:00:00Z'));

      const [entregada, devuelta] = await Promise.all([
        post(A, guia, body('ENTREGADA', '2026-01-01T12:00:00Z')),
        post(A, guia, body('DEVUELTA', '2026-01-01T12:00:00Z')),
      ]);

      expect([entregada.status, devuelta.status].sort()).toEqual([201, 409]);
      const historial = await get(A, guia);
      expect(historial.body.eventos).toHaveLength(3);
      const ganadora = entregada.status === 201 ? 'ENTREGADA' : 'DEVUELTA';
      expect(historial.body.estadoActual).toBe(ganadora);
    });
  });

  describe('aislamiento por tenant', () => {
    it('un tenant no ve guias de otro: responde 404 como si no existieran', async () => {
      const guia = nuevaGuia();
      await post(A, guia, body('CREADA', '2026-01-01T10:00:00Z'));

      const propia = await get(A, guia);
      const ajena = await get(B, guia);

      expect(propia.status).toBe(200);
      expect(ajena.status).toBe(404);
      expect(ajena.body.code).toBe('GUIA_NO_ENCONTRADA');
    });

    it('el mismo numero de guia y el mismo eventId son independientes entre tenants', async () => {
      const guia = nuevaGuia();
      const evento = body('CREADA', '2026-01-01T10:00:00Z');

      const deA = await post(A, guia, evento);
      const deB = await post(B, guia, evento);
      await post(B, guia, body('EN_RUTA', '2026-01-01T11:00:00Z'));

      expect([deA.status, deB.status]).toEqual([201, 201]);
      expect((await get(A, guia)).body.estadoActual).toBe('CREADA');
      expect((await get(B, guia)).body.estadoActual).toBe('EN_RUTA');
    });
  });

  describe('validacion y formato de error unico', () => {
    const esProblem = (r: { status: number; headers: Record<string, string>; body: unknown }) => {
      expect(r.headers['content-type']).toMatch(/application\/problem\+json/);
      expect(r.body).toMatchObject({
        status: r.status,
        code: expect.any(String),
        title: expect.any(String),
        detail: expect.any(String),
        requestId: expect.any(String),
        instance: expect.any(String),
      });
    };

    it.each([
      [
        'eventId no es UUID',
        { ...body('CREADA', '2026-01-01T10:00:00Z'), eventId: 'abc' },
        'eventId',
      ],
      ['estado desconocido', body('PERDIDA', '2026-01-01T10:00:00Z'), 'estado'],
      ['fecha sin zona horaria', body('CREADA', '2026-01-01T10:00:00'), 'fechaEvento'],
      ['fecha de calendario imposible', body('CREADA', '2026-02-30T10:00:00Z'), 'fechaEvento'],
      [
        'observacion demasiado larga',
        body('CREADA', '2026-01-01T10:00:00Z', { observacion: 'x'.repeat(501) }),
        'observacion',
      ],
      ['propiedad desconocida', body('CREADA', '2026-01-01T10:00:00Z', { extra: 1 }), 'extra'],
    ])('400 cuando %s', async (_caso, payload, campo) => {
      const r = await post(A, nuevaGuia(), payload);

      expect(r.status).toBe(400);
      expect(r.body.code).toBe('VALIDACION_FALLIDA');
      expect(r.body.errors.map((e: { field: string }) => e.field)).toContain(campo);
      esProblem(r);
    });

    it('400 sin cabecera X-Tenant-Id o con una invalida', async () => {
      const sin = await t.api
        .post('/guias/G-X/eventos')
        .send(body('CREADA', '2026-01-01T10:00:00Z'));
      const mala = await post(
        "a'; DROP TABLE guias;--",
        'G-X',
        body('CREADA', '2026-01-01T10:00:00Z'),
      );

      for (const r of [sin, mala]) {
        expect(r.status).toBe(400);
        expect(r.body.code).toBe('TENANT_ID_INVALIDO');
        esProblem(r);
      }
    });

    it('400 con un numero de guia invalido y con JSON malformado', async () => {
      const guia = await post(A, 'guia%20mala!', body('CREADA', '2026-01-01T10:00:00Z'));
      const json = await t.api
        .post('/guias/G-1/eventos')
        .set(TENANT_HEADER, A)
        .set('Content-Type', 'application/json')
        .send('{"eventId":');

      expect(guia.status).toBe(400);
      expect(json.status).toBe(400);
      expect(json.body.code).toBe('JSON_INVALIDO');
      esProblem(json);
    });

    it('rutas inexistentes y guias desconocidas usan el mismo formato', async () => {
      const ruta = await t.api.get('/no-existe').set(TENANT_HEADER, A);
      const guia = await get(A, 'G-NO-EXISTE');

      expect(ruta.status).toBe(404);
      expect(guia.status).toBe(404);
      esProblem(ruta);
      esProblem(guia);
    });
  });
});

describe('API: especificacion OpenAPI', () => {
  it('publica /openapi.json con las rutas del servicio', async () => {
    const t = await startTestApp();
    try {
      const res = await t.api.get('/openapi.json');

      expect(res.status).toBe(200);
      expect(Object.keys(res.body.paths)).toEqual(
        expect.arrayContaining([
          '/guias/{numeroGuia}/eventos',
          '/guias/{numeroGuia}',
          '/webhook',
          '/notificaciones',
        ]),
      );
      expect(res.body.paths['/guias/{numeroGuia}/eventos'].post.responses).toHaveProperty('409');
      expect((await t.api.get('/docs')).status).toBe(200);
    } finally {
      await t.close();
    }
  });
});
