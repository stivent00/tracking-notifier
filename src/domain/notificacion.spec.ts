import { Notificacion } from './notificacion';
import { PoliticaReintentos } from './politica-reintentos';

const ahora = new Date('2026-01-01T10:00:00Z');
const politica = new PoliticaReintentos({ maxIntentos: 5, baseMs: 1000, maxMs: 60_000 }, () => 1);
const fallo = { error: 'HTTP_500', status: 500 };

const nueva = () => Notificacion.crear({ id: 'n-1', tenantId: 'tenant-a', eventId: 'e-1' }, ahora);

describe('Notificacion', () => {
  it('nace PENDIENTE, sin intentos y lista para enviarse', () => {
    const n = nueva();

    expect(n.estado).toBe('PENDIENTE');
    expect(n.intentos).toBe(0);
    expect(n.proximoIntentoEn).toEqual(ahora);
  });

  it('un exito la marca ENVIADA y cuenta el intento', () => {
    const n = nueva();

    n.registrarExito(ahora, 204);

    expect(n.estado).toBe('ENVIADA');
    expect(n.intentos).toBe(1);
    expect(n.enviadaEn).toEqual(ahora);
    expect(n.ultimoError).toBeNull();
  });

  it('un fallo reprograma con espera creciente y sigue PENDIENTE', () => {
    const n = nueva();

    n.registrarFallo(ahora, fallo, politica);
    expect(n.proximoIntentoEn.getTime() - ahora.getTime()).toBe(1000);

    n.registrarFallo(ahora, fallo, politica);
    expect(n.proximoIntentoEn.getTime() - ahora.getTime()).toBe(2000);

    expect(n.estado).toBe('PENDIENTE');
    expect(n.intentos).toBe(2);
    expect(n.ultimoError).toBe('HTTP_500');
    expect(n.ultimoStatus).toBe(500);
  });

  it('tras 5 intentos fallidos queda FALLIDA y consultable con su ultimo error', () => {
    const n = nueva();

    for (let i = 0; i < 5; i++) n.registrarFallo(ahora, fallo, politica);

    expect(n.estado).toBe('FALLIDA');
    expect(n.intentos).toBe(5);
    expect(n.ultimoError).toBe('HTTP_500');
  });

  it('un exito tras fallos previos limpia el error', () => {
    const n = nueva();
    n.registrarFallo(ahora, fallo, politica);

    n.registrarExito(ahora, 200);

    expect(n.estado).toBe('ENVIADA');
    expect(n.intentos).toBe(2);
    expect(n.ultimoError).toBeNull();
  });

  it('no permite registrar resultados sobre una notificacion final', () => {
    const n = nueva();
    n.registrarExito(ahora, 200);

    expect(() => n.registrarFallo(ahora, fallo, politica)).toThrow();
    expect(() => n.registrarExito(ahora, 200)).toThrow();
  });
});
