import { Notificacion } from '../../domain/notificacion';
import { PoliticaReintentos } from '../../domain/politica-reintentos';
import {
  FALLO_500,
  InMemoryEventos,
  InMemoryNotificaciones,
  InMemoryWebhooks,
  MutableClock,
  OK,
  RecordingLogger,
  ScriptedSender,
  TIMEOUT,
} from '../../../test/support/fakes';
import { DespacharNotificaciones } from './despachar-notificaciones';

const INICIO = new Date('2026-01-01T10:00:00Z');
const TENANT = 'tenant-a';
const EVENT_ID = '11111111-1111-4111-8111-111111111111';

function escenario(
  respuestas: ConstructorParameters<typeof ScriptedSender>[0],
  opciones: { conWebhook?: boolean } = {},
) {
  const clock = new MutableClock(INICIO);
  const eventos = new InMemoryEventos();
  const webhooks = new InMemoryWebhooks();
  const notificaciones = new InMemoryNotificaciones();
  const sender = new ScriptedSender(respuestas);
  const logger = new RecordingLogger();
  // aleatorio = 1 -> espera = techo exponencial: 1 s, 2 s, 4 s, 8 s
  const politica = new PoliticaReintentos({ maxIntentos: 5, baseMs: 1000, maxMs: 60_000 }, () => 1);

  eventos.agregar({
    tenantId: TENANT,
    eventId: EVENT_ID,
    numeroGuia: 'G-1',
    estado: 'EN_RUTA',
    fechaEvento: INICIO,
    observacion: 'Sale de bodega',
    recibidoEn: INICIO,
  });
  if (opciones.conWebhook !== false) {
    void webhooks.guardar({
      tenantId: TENANT,
      url: 'https://cliente.example.com/hook',
      secreto: 'whsec_de_prueba',
      actualizadoEn: INICIO,
    });
  }
  const notificacion = Notificacion.crear(
    { id: 'n-1', tenantId: TENANT, eventId: EVENT_ID },
    INICIO,
  );
  void notificaciones.insertar(notificacion);

  const despachar = new DespacharNotificaciones(
    notificaciones,
    eventos as never,
    webhooks,
    sender,
    clock,
    politica,
    logger,
    { tamanoLote: 10, arrendamientoMs: 30_000 },
  );
  const actual = () => notificaciones.obtener(notificacion.id);
  return { clock, actual, notificaciones, sender, logger, despachar };
}

describe('DespacharNotificaciones', () => {
  it('envia el evento al webhook del tenant y marca la notificacion ENVIADA', async () => {
    const { despachar, actual, sender } = escenario([OK]);

    const procesadas = await despachar.ejecutar();

    expect(procesadas).toBe(1);
    expect(actual().estado).toBe('ENVIADA');
    expect(sender.solicitudes).toHaveLength(1);
    expect(sender.solicitudes[0]).toMatchObject({
      url: 'https://cliente.example.com/hook',
      secreto: 'whsec_de_prueba',
      intento: 1,
      payload: {
        eventId: EVENT_ID,
        tenantId: TENANT,
        numeroGuia: 'G-1',
        estado: 'EN_RUTA',
        fechaEvento: '2026-01-01T10:00:00.000Z',
        observacion: 'Sale de bodega',
      },
    });
  });

  it('un fallo la reprograma con espera creciente y no se reintenta antes de tiempo', async () => {
    const { despachar, actual, sender, clock } = escenario([FALLO_500, FALLO_500, OK]);

    await despachar.ejecutar();
    expect(actual().estado).toBe('PENDIENTE');
    expect(actual().proximoIntentoEn.getTime() - INICIO.getTime()).toBe(1000);

    clock.avanzar(999);
    expect(await despachar.ejecutar()).toBe(0);
    expect(sender.solicitudes).toHaveLength(1);

    clock.avanzar(1);
    await despachar.ejecutar();
    expect(actual().proximoIntentoEn.getTime() - clock.ahora().getTime()).toBe(2000);

    clock.avanzar(2000);
    await despachar.ejecutar();
    expect(actual().estado).toBe('ENVIADA');
    expect(actual().intentos).toBe(3);
    expect(sender.solicitudes.map((s) => s.intento)).toEqual([1, 2, 3]);
  });

  it('tras 5 intentos fallidos queda FALLIDA y deja de enviarse', async () => {
    const { despachar, actual, sender, clock, logger } = escenario([TIMEOUT]);

    for (let i = 0; i < 8; i++) {
      await despachar.ejecutar();
      clock.avanzar(60_000);
    }

    expect(sender.solicitudes).toHaveLength(5);
    expect(actual().estado).toBe('FALLIDA');
    expect(actual().intentos).toBe(5);
    expect(actual().ultimoError).toBe('TIMEOUT');
    expect(logger.entradas.filter((e) => e.nivel === 'error')).toHaveLength(1);
  });

  it('sin webhook configurado cuenta el intento y reintenta', async () => {
    const { despachar, actual, sender } = escenario([OK], { conWebhook: false });

    await despachar.ejecutar();

    expect(sender.solicitudes).toHaveLength(0);
    expect(actual().estado).toBe('PENDIENTE');
    expect(actual().intentos).toBe(1);
    expect(actual().ultimoError).toBe('WEBHOOK_NO_CONFIGURADO');
  });

  it('si no puede guardar el resultado, no lanza y deja el arrendamiento para reintentar', async () => {
    const { despachar, notificaciones, clock, sender, logger } = escenario([OK]);
    notificaciones.failOnGuardar = true;

    await expect(despachar.ejecutar()).resolves.toBe(1);
    expect(logger.entradas.some((e) => e.mensaje === 'No se pudo procesar la notificacion')).toBe(
      true,
    );

    clock.avanzar(1000);
    expect(await despachar.ejecutar()).toBe(0);
    clock.avanzar(30_000);
    expect(await despachar.ejecutar()).toBe(1);
    expect(sender.solicitudes).toHaveLength(2);
  });

  it('un error inesperado del sender no detiene al resto del lote', async () => {
    const { despachar, actual, logger } = escenario(['throw']);

    await expect(despachar.ejecutar()).resolves.toBe(1);

    expect(actual().estado).toBe('PENDIENTE');
    expect(logger.entradas.some((e) => e.nivel === 'error')).toBe(true);
  });

  it('los logs no incluyen la observacion ni la URL completa del webhook', async () => {
    const { despachar, logger } = escenario([FALLO_500]);

    await despachar.ejecutar();

    const serializado = JSON.stringify(logger.entradas);
    expect(serializado).not.toContain('Sale de bodega');
    expect(serializado).not.toContain('cliente.example.com/hook');
  });
});
