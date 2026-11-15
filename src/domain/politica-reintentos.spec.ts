import { PoliticaReintentos } from './politica-reintentos';

describe('PoliticaReintentos', () => {
  const props = { maxIntentos: 5, baseMs: 1000, maxMs: 30_000 };

  it('el techo de espera crece de forma exponencial hasta el maximo', () => {
    const politica = new PoliticaReintentos(props);

    expect([1, 2, 3, 4, 5, 6].map((n) => politica.techoMs(n))).toEqual([
      1000, 2000, 4000, 8000, 16_000, 30_000,
    ]);
  });

  it('aplica jitter entre 0 y el techo', () => {
    expect(new PoliticaReintentos(props, () => 0).esperaMs(3)).toBe(0);
    expect(new PoliticaReintentos(props, () => 0.5).esperaMs(3)).toBe(2000);
    expect(new PoliticaReintentos(props, () => 0.999999).esperaMs(3)).toBeLessThanOrEqual(4000);
  });

  it('se agota exactamente al llegar al maximo de intentos', () => {
    const politica = new PoliticaReintentos(props);

    expect(politica.agotada(4)).toBe(false);
    expect(politica.agotada(5)).toBe(true);
  });
});
