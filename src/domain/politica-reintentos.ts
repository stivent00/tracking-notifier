export interface PoliticaReintentosProps {
  maxIntentos: number;
  baseMs: number;
  maxMs: number;
}

/**
 * Espera creciente (exponencial) con "full jitter": el retardo real es un valor
 * aleatorio entre 0 y el techo exponencial, lo que evita que muchos reintentos
 * fallidos vuelvan a golpear el webhook del cliente al mismo tiempo.
 */
export class PoliticaReintentos {
  constructor(
    private readonly props: PoliticaReintentosProps,
    private readonly aleatorio: () => number = Math.random,
  ) {}

  get maxIntentos(): number {
    return this.props.maxIntentos;
  }

  /** `intentosRealizados` es el numero de intentos ya fallidos (>= 1). */
  techoMs(intentosRealizados: number): number {
    const exponente = Math.max(0, intentosRealizados - 1);
    return Math.min(this.props.maxMs, this.props.baseMs * 2 ** exponente);
  }

  esperaMs(intentosRealizados: number): number {
    return Math.round(this.techoMs(intentosRealizados) * this.aleatorio());
  }

  agotada(intentosRealizados: number): boolean {
    return intentosRealizados >= this.props.maxIntentos;
  }
}
