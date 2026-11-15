import { EventoFueraDeOrdenError, TransicionInvalidaError } from './errores';
import { puedeTransicionar, type EstadoGuia } from './estado-guia';
import type { EventoGuia } from './evento-guia';

export interface GuiaProps {
  tenantId: string;
  numeroGuia: string;
  estadoActual: EstadoGuia | null;
  ultimaFechaEvento: Date | null;
}

export class Guia {
  private constructor(
    readonly tenantId: string,
    readonly numeroGuia: string,
    private _estadoActual: EstadoGuia | null,
    private _ultimaFechaEvento: Date | null,
  ) {}

  static nueva(tenantId: string, numeroGuia: string): Guia {
    return new Guia(tenantId, numeroGuia, null, null);
  }

  static reconstruir(props: GuiaProps): Guia {
    return new Guia(props.tenantId, props.numeroGuia, props.estadoActual, props.ultimaFechaEvento);
  }

  get estadoActual(): EstadoGuia | null {
    return this._estadoActual;
  }

  get ultimaFechaEvento(): Date | null {
    return this._ultimaFechaEvento;
  }

  /**
   * Aplica un evento a la guia o lanza un error de dominio sin modificar nada.
   * Un evento con fechaEvento anterior al ultimo aceptado se rechaza para que el
   * estado actual y el historial cronologico nunca se contradigan.
   */
  aplicar(evento: Pick<EventoGuia, 'estado' | 'fechaEvento'>): void {
    if (!puedeTransicionar(this._estadoActual, evento.estado)) {
      throw new TransicionInvalidaError(this._estadoActual, evento.estado);
    }
    if (this._ultimaFechaEvento && evento.fechaEvento < this._ultimaFechaEvento) {
      throw new EventoFueraDeOrdenError(evento.fechaEvento, this._ultimaFechaEvento);
    }
    this._estadoActual = evento.estado;
    this._ultimaFechaEvento = evento.fechaEvento;
  }
}
