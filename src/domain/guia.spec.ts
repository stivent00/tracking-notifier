import { EventoFueraDeOrdenError, TransicionInvalidaError } from './errores';
import { Guia } from './guia';

const t = (iso: string) => new Date(iso);

describe('Guia', () => {
  it('una guia nueva no tiene estado y acepta CREADA', () => {
    const guia = Guia.nueva('tenant-a', 'G-1');

    guia.aplicar({ estado: 'CREADA', fechaEvento: t('2026-01-01T10:00:00Z') });

    expect(guia.estadoActual).toBe('CREADA');
    expect(guia.ultimaFechaEvento).toEqual(t('2026-01-01T10:00:00Z'));
  });

  it('recorre el camino feliz hasta ENTREGADA', () => {
    const guia = Guia.nueva('tenant-a', 'G-1');

    guia.aplicar({ estado: 'CREADA', fechaEvento: t('2026-01-01T10:00:00Z') });
    guia.aplicar({ estado: 'EN_RUTA', fechaEvento: t('2026-01-01T11:00:00Z') });
    guia.aplicar({ estado: 'ENTREGADA', fechaEvento: t('2026-01-01T12:00:00Z') });

    expect(guia.estadoActual).toBe('ENTREGADA');
  });

  it('rechaza un primer evento distinto de CREADA sin modificar la guia', () => {
    const guia = Guia.nueva('tenant-a', 'G-1');

    expect(() =>
      guia.aplicar({ estado: 'EN_RUTA', fechaEvento: t('2026-01-01T10:00:00Z') }),
    ).toThrow(TransicionInvalidaError);
    expect(guia.estadoActual).toBeNull();
    expect(guia.ultimaFechaEvento).toBeNull();
  });

  it.each(['ENTREGADA', 'DEVUELTA'] as const)('una guia %s ya no cambia de estado', (terminal) => {
    const guia = Guia.reconstruir({
      tenantId: 'tenant-a',
      numeroGuia: 'G-1',
      estadoActual: terminal,
      ultimaFechaEvento: t('2026-01-01T12:00:00Z'),
    });

    for (const estado of ['CREADA', 'EN_RUTA', 'ENTREGADA', 'DEVUELTA'] as const) {
      expect(() => guia.aplicar({ estado, fechaEvento: t('2026-01-02T00:00:00Z') })).toThrow(
        TransicionInvalidaError,
      );
    }
    expect(guia.estadoActual).toBe(terminal);
  });

  it('rechaza un evento con fecha anterior al ultimo aceptado', () => {
    const guia = Guia.nueva('tenant-a', 'G-1');
    guia.aplicar({ estado: 'CREADA', fechaEvento: t('2026-01-01T10:00:00Z') });

    expect(() =>
      guia.aplicar({ estado: 'EN_RUTA', fechaEvento: t('2026-01-01T09:59:59Z') }),
    ).toThrow(EventoFueraDeOrdenError);
    expect(guia.estadoActual).toBe('CREADA');
  });

  it('acepta un evento con la misma fecha que el ultimo', () => {
    const guia = Guia.nueva('tenant-a', 'G-1');
    guia.aplicar({ estado: 'CREADA', fechaEvento: t('2026-01-01T10:00:00Z') });

    guia.aplicar({ estado: 'EN_RUTA', fechaEvento: t('2026-01-01T10:00:00Z') });

    expect(guia.estadoActual).toBe('EN_RUTA');
  });
});
