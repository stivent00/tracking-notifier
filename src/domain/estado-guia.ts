export const ESTADOS_GUIA = ['CREADA', 'EN_RUTA', 'ENTREGADA', 'DEVUELTA'] as const;

export type EstadoGuia = (typeof ESTADOS_GUIA)[number];

export function esEstadoGuia(valor: unknown): valor is EstadoGuia {
  return typeof valor === 'string' && (ESTADOS_GUIA as readonly string[]).includes(valor);
}

/**
 * Unica fuente de verdad de la maquina de estados. Un estado sin salidas es terminal.
 * Para soportar un estado nuevo basta con agregarlo a ESTADOS_GUIA y a esta tabla.
 */
export const TRANSICIONES: Readonly<Record<EstadoGuia, readonly EstadoGuia[]>> = {
  CREADA: ['EN_RUTA'],
  EN_RUTA: ['ENTREGADA', 'DEVUELTA'],
  ENTREGADA: [],
  DEVUELTA: [],
};

export const ESTADO_INICIAL: EstadoGuia = 'CREADA';

export function esTerminal(estado: EstadoGuia): boolean {
  return TRANSICIONES[estado].length === 0;
}

/** `desde === null` representa una guia que todavia no recibio ningun evento. */
export function puedeTransicionar(desde: EstadoGuia | null, hacia: EstadoGuia): boolean {
  if (desde === null) return hacia === ESTADO_INICIAL;
  return TRANSICIONES[desde].includes(hacia);
}
