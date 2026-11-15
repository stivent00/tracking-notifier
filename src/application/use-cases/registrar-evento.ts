import { EventIdConflictoError } from '../../domain/errores';
import type { EstadoGuia } from '../../domain/estado-guia';
import { mismoContenido, type EventoGuia } from '../../domain/evento-guia';
import { Notificacion } from '../../domain/notificacion';
import type { Clock } from '../ports/clock';
import type { IdGenerator } from '../ports/id-generator';
import type { EventoRepository } from '../ports/repositorios';
import type { UnitOfWork } from '../ports/unit-of-work';

export interface RegistrarEventoComando {
  tenantId: string;
  numeroGuia: string;
  eventId: string;
  estado: EstadoGuia;
  fechaEvento: Date;
  observacion: string | null;
}

export interface ResultadoRegistro {
  evento: EventoGuia;
  /** false cuando el eventId ya habia sido aceptado: es una repeticion idempotente. */
  creado: boolean;
}

/** Senal interna para abortar (y revertir) la transaccion cuando el evento ya existia. */
class EventoYaRegistrado extends Error {
  constructor(readonly existente: EventoGuia | null) {
    super('evento ya registrado');
  }
}

export class RegistrarEvento {
  constructor(
    private readonly unitOfWork: UnitOfWork,
    private readonly eventos: EventoRepository,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async ejecutar(comando: RegistrarEventoComando): Promise<ResultadoRegistro> {
    const candidato: EventoGuia = {
      tenantId: comando.tenantId,
      eventId: comando.eventId,
      numeroGuia: comando.numeroGuia,
      estado: comando.estado,
      fechaEvento: comando.fechaEvento,
      observacion: comando.observacion,
      recibidoEn: this.clock.ahora(),
    };

    // Camino rapido para reintentos del emisor: no toma bloqueos ni abre transaccion.
    const previo = await this.eventos.buscarPorEventId(comando.tenantId, comando.eventId);
    if (previo) return this.resolverDuplicado(previo, candidato);

    try {
      return await this.registrar(candidato);
    } catch (error) {
      if (!(error instanceof EventoYaRegistrado)) throw error;
      const existente =
        error.existente ?? (await this.eventos.buscarPorEventId(comando.tenantId, comando.eventId));
      if (!existente) throw error;
      return this.resolverDuplicado(existente, candidato);
    }
  }

  private registrar(candidato: EventoGuia): Promise<ResultadoRegistro> {
    return this.unitOfWork.ejecutar(async (repos) => {
      // El bloqueo de la guia serializa los eventos concurrentes de la misma guia; por eso
      // la comprobacion de duplicado debe hacerse despues de tomarlo.
      const guia = await repos.guias.obtenerParaActualizar(
        candidato.tenantId,
        candidato.numeroGuia,
      );
      const existente = await repos.eventos.buscarPorEventId(candidato.tenantId, candidato.eventId);
      if (existente) throw new EventoYaRegistrado(existente);

      guia.aplicar(candidato);

      // Si otra transaccion inserto el mismo eventId en otra guia, la restriccion unica es
      // quien decide y se re-lee el evento ganador despues de revertir.
      const insertado = await repos.eventos.insertar(candidato);
      if (!insertado) throw new EventoYaRegistrado(null);

      await repos.guias.guardar(guia);
      await repos.notificaciones.insertar(
        Notificacion.crear(
          { id: this.ids.nuevoId(), tenantId: candidato.tenantId, eventId: candidato.eventId },
          candidato.recibidoEn,
        ),
      );
      return { evento: candidato, creado: true };
    });
  }

  private resolverDuplicado(existente: EventoGuia, candidato: EventoGuia): ResultadoRegistro {
    if (!mismoContenido(existente, candidato)) {
      throw new EventIdConflictoError(candidato.eventId);
    }
    return { evento: existente, creado: false };
  }
}
