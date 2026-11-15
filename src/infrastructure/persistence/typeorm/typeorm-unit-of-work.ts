import type { DataSource } from 'typeorm';
import type {
  RepositoriosTransaccionales,
  UnitOfWork,
} from '../../../application/ports/unit-of-work';
import { TypeOrmEventoRepository } from './typeorm-evento.repository';
import { TypeOrmGuiaRepository } from './typeorm-guia.repository';
import { TypeOrmNotificacionRepository } from './typeorm-notificacion.repository';

export class TypeOrmUnitOfWork implements UnitOfWork {
  constructor(private readonly dataSource: DataSource) {}

  ejecutar<T>(trabajo: (repos: RepositoriosTransaccionales) => Promise<T>): Promise<T> {
    return this.dataSource.transaction('READ COMMITTED', (manager) =>
      trabajo({
        guias: new TypeOrmGuiaRepository(manager),
        eventos: new TypeOrmEventoRepository(manager),
        notificaciones: new TypeOrmNotificacionRepository(manager),
      }),
    );
  }
}
