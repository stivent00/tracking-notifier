import { GuiaNoEncontradaError } from '../../domain/errores';
import type { EstadoGuia } from '../../domain/estado-guia';
import type { EventoGuia } from '../../domain/evento-guia';
import type { EventoRepository } from '../ports/repositorios';

export interface Historial {
  numeroGuia: string;
  estadoActual: EstadoGuia;
  eventos: EventoGuia[];
}

export class ConsultarHistorial {
  constructor(private readonly eventos: EventoRepository) {}

  /**
   * Una unica consulta alimenta estado y eventos, de modo que nunca se contradicen. El
   * estado actual es el del ultimo evento: Guia.aplicar solo acepta eventos en orden.
   */
  async ejecutar(tenantId: string, numeroGuia: string): Promise<Historial> {
    const eventos = await this.eventos.listarPorGuia(tenantId, numeroGuia);
    const ultimo = eventos.at(-1);
    if (!ultimo) throw new GuiaNoEncontradaError(numeroGuia);
    return { numeroGuia, estadoActual: ultimo.estado, eventos };
  }
}
