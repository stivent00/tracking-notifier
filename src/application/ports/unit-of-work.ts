import type { EventoRepository, GuiaRepository, NotificacionRepository } from './repositorios';

export interface RepositoriosTransaccionales {
  guias: GuiaRepository;
  eventos: EventoRepository;
  notificaciones: NotificacionRepository;
}

export interface UnitOfWork {
  /** Ejecuta `trabajo` en una unica transaccion: confirma si termina y revierte si lanza. */
  ejecutar<T>(trabajo: (repos: RepositoriosTransaccionales) => Promise<T>): Promise<T>;
}
