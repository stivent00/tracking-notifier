import type { EstadoGuia } from './estado-guia';

export interface EventoGuia {
  readonly tenantId: string;
  readonly eventId: string;
  readonly numeroGuia: string;
  readonly estado: EstadoGuia;
  readonly fechaEvento: Date;
  readonly observacion: string | null;
  readonly recibidoEn: Date;
}

/** Dos solicitudes con el mismo eventId son un reintento legitimo solo si dicen lo mismo. */
export function mismoContenido(a: EventoGuia, b: EventoGuia): boolean {
  return (
    a.numeroGuia === b.numeroGuia &&
    a.estado === b.estado &&
    a.fechaEvento.getTime() === b.fechaEvento.getTime() &&
    a.observacion === b.observacion
  );
}
