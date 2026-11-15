import { ESTADOS_GUIA, esTerminal, puedeTransicionar, type EstadoGuia } from './estado-guia';

describe('maquina de estados de la guia', () => {
  const permitidas: Array<[EstadoGuia | null, EstadoGuia]> = [
    [null, 'CREADA'],
    ['CREADA', 'EN_RUTA'],
    ['EN_RUTA', 'ENTREGADA'],
    ['EN_RUTA', 'DEVUELTA'],
  ];

  it.each(permitidas)('permite %s -> %s', (desde, hacia) => {
    expect(puedeTransicionar(desde, hacia)).toBe(true);
  });

  it('rechaza todas las demas combinaciones', () => {
    const origenes: Array<EstadoGuia | null> = [null, ...ESTADOS_GUIA];
    const rechazadas = origenes.flatMap((desde) =>
      ESTADOS_GUIA.filter((hacia) => !permitidas.some(([d, h]) => d === desde && h === hacia)).map(
        (hacia) => [desde, hacia] as const,
      ),
    );

    expect(rechazadas.length).toBe(origenes.length * ESTADOS_GUIA.length - permitidas.length);
    for (const [desde, hacia] of rechazadas) {
      expect({ desde, hacia, permitida: puedeTransicionar(desde, hacia) }).toEqual({
        desde,
        hacia,
        permitida: false,
      });
    }
  });

  it.each(['ENTREGADA', 'DEVUELTA'] as const)('%s es terminal y no cambia de estado', (estado) => {
    expect(esTerminal(estado)).toBe(true);
    for (const hacia of ESTADOS_GUIA) {
      expect(puedeTransicionar(estado, hacia)).toBe(false);
    }
  });

  it('los estados no terminales tienen salida', () => {
    expect(esTerminal('CREADA')).toBe(false);
    expect(esTerminal('EN_RUTA')).toBe(false);
  });
});
