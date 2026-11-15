import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';
import type { EventoGuia } from '../src/domain/evento-guia';
import { Notificacion } from '../src/domain/notificacion';
import { createDataSource } from '../src/infrastructure/persistence/typeorm/data-source';
import { TypeOrmEventoRepository } from '../src/infrastructure/persistence/typeorm/typeorm-evento.repository';
import { TypeOrmNotificacionRepository } from '../src/infrastructure/persistence/typeorm/typeorm-notificacion.repository';
import { TypeOrmUnitOfWork } from '../src/infrastructure/persistence/typeorm/typeorm-unit-of-work';
import { createTestDatabase, type TestDatabase } from './support/test-database';

const ahora = new Date('2026-01-01T10:00:00Z');

function evento(overrides: Partial<EventoGuia> = {}): EventoGuia {
  return {
    tenantId: 'tenant-a',
    eventId: randomUUID(),
    numeroGuia: 'G-1',
    estado: 'CREADA',
    fechaEvento: ahora,
    observacion: null,
    recibidoEn: ahora,
    ...overrides,
  };
}

describe('persistencia contra PostgreSQL real', () => {
  let db: TestDatabase;
  let dataSource: DataSource;
  let uow: TypeOrmUnitOfWork;

  beforeAll(async () => {
    db = await createTestDatabase();
    dataSource = createDataSource({ url: db.url, poolSize: 10 });
    await dataSource.initialize();
    await dataSource.runMigrations();
    uow = new TypeOrmUnitOfWork(dataSource);
  });

  afterAll(async () => {
    await dataSource.destroy();
    await db.drop();
  });

  it('las migraciones son idempotentes', async () => {
    await expect(dataSource.runMigrations()).resolves.toEqual([]);
  });

  it('la migracion del secreto rellena las filas existentes y se puede revertir', async () => {
    const otra = await createTestDatabase();
    const ds = createDataSource({ url: otra.url, poolSize: 2 });
    try {
      await ds.initialize();
      await ds.runMigrations();
      await ds.undoLastMigration();
      await ds.query(
        `INSERT INTO webhooks_tenant (tenant_id, url, actualizado_en)
         VALUES ('antiguo', 'https://cliente.example.com/hook', now())`,
      );

      await ds.runMigrations();

      const [fila] = await ds.query(
        `SELECT secreto FROM webhooks_tenant WHERE tenant_id = 'antiguo'`,
      );
      expect(fila.secreto).toMatch(/^[0-9a-f]{64}$/);
    } finally {
      await ds.destroy();
      await otra.drop();
    }
  });

  it('revierte toda la transaccion si el trabajo lanza', async () => {
    const e = evento({ numeroGuia: 'G-ROLLBACK' });

    await expect(
      uow.ejecutar(async (repos) => {
        await repos.guias.obtenerParaActualizar(e.tenantId, e.numeroGuia);
        await repos.eventos.insertar(e);
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    const eventos = new TypeOrmEventoRepository(dataSource.manager);
    expect(await eventos.buscarPorEventId(e.tenantId, e.eventId)).toBeNull();
    const [{ total }] = await dataSource.query(
      `SELECT count(*)::int AS total FROM guias WHERE numero_guia = 'G-ROLLBACK'`,
    );
    expect(total).toBe(0);
  });

  it('insertar un evento duplicado devuelve false en lugar de lanzar', async () => {
    const e = evento({ numeroGuia: 'G-DUP' });
    const resultados = await uow.ejecutar(async (repos) => {
      await repos.guias.obtenerParaActualizar(e.tenantId, e.numeroGuia);
      return [await repos.eventos.insertar(e), await repos.eventos.insertar(e)];
    });

    expect(resultados).toEqual([true, false]);
  });

  it('la misma clave de evento puede existir en tenants distintos', async () => {
    const eventId = randomUUID();
    for (const tenantId of ['tenant-a', 'tenant-b']) {
      const resultado = await uow.ejecutar(async (repos) => {
        await repos.guias.obtenerParaActualizar(tenantId, 'G-SHARED');
        return repos.eventos.insertar(evento({ tenantId, eventId, numeroGuia: 'G-SHARED' }));
      });
      expect(resultado).toBe(true);
    }
  });

  it('serializa transacciones concurrentes sobre la misma guia', async () => {
    const orden: string[] = [];
    let liberarPrimera!: () => void;
    const primeraTieneElBloqueo = new Promise<void>((resolve) => {
      liberarPrimera = resolve;
    });
    let primeraPuedeTerminar!: () => void;
    const esperaPrimera = new Promise<void>((resolve) => {
      primeraPuedeTerminar = resolve;
    });

    const primera = uow.ejecutar(async (repos) => {
      await repos.guias.obtenerParaActualizar('tenant-a', 'G-LOCK');
      orden.push('primera-bloquea');
      liberarPrimera();
      await esperaPrimera;
      orden.push('primera-termina');
    });
    await primeraTieneElBloqueo;
    const segunda = uow.ejecutar(async (repos) => {
      await repos.guias.obtenerParaActualizar('tenant-a', 'G-LOCK');
      orden.push('segunda-bloquea');
    });

    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(orden).toEqual(['primera-bloquea']);
    primeraPuedeTerminar();
    await Promise.all([primera, segunda]);
    expect(orden).toEqual(['primera-bloquea', 'primera-termina', 'segunda-bloquea']);
  });

  it('dos reclamos concurrentes de notificaciones nunca devuelven la misma fila', async () => {
    const notificaciones = new TypeOrmNotificacionRepository(dataSource.manager);
    const ids: string[] = [];
    for (let i = 0; i < 30; i++) {
      const e = evento({ numeroGuia: `G-CLAIM-${i}` });
      const id = randomUUID();
      ids.push(id);
      await uow.ejecutar(async (repos) => {
        await repos.guias.obtenerParaActualizar(e.tenantId, e.numeroGuia);
        await repos.eventos.insertar(e);
        await repos.notificaciones.insertar(
          Notificacion.crear({ id, tenantId: e.tenantId, eventId: e.eventId }, ahora),
        );
      });
    }
    const hasta = new Date(ahora.getTime() + 60_000);

    const lotes = await Promise.all(
      Array.from({ length: 4 }, () => notificaciones.reclamarLote(ahora, 10, hasta)),
    );

    const reclamadas = lotes.flat().map((n) => n.id);
    expect(new Set(reclamadas).size).toBe(reclamadas.length);
    expect(reclamadas.every((id) => ids.includes(id))).toBe(true);
    expect(reclamadas.length).toBe(30);
    expect(await notificaciones.reclamarLote(ahora, 10, hasta)).toEqual([]);
  });

  it('una notificacion con arrendamiento vencido vuelve a estar disponible', async () => {
    const notificaciones = new TypeOrmNotificacionRepository(dataSource.manager);
    const e = evento({ numeroGuia: 'G-LEASE' });
    const id = randomUUID();
    await uow.ejecutar(async (repos) => {
      await repos.guias.obtenerParaActualizar(e.tenantId, e.numeroGuia);
      await repos.eventos.insertar(e);
      await repos.notificaciones.insertar(
        Notificacion.crear({ id, tenantId: e.tenantId, eventId: e.eventId }, ahora),
      );
    });
    const arrendadaHasta = new Date(ahora.getTime() + 30_000);

    const primero = await notificaciones.reclamarLote(ahora, 100, arrendadaHasta);
    const durante = await notificaciones.reclamarLote(
      new Date(ahora.getTime() + 1000),
      100,
      arrendadaHasta,
    );
    const despues = await notificaciones.reclamarLote(
      new Date(ahora.getTime() + 31_000),
      100,
      arrendadaHasta,
    );

    expect(primero.map((n) => n.id)).toContain(id);
    expect(durante.map((n) => n.id)).not.toContain(id);
    expect(despues.map((n) => n.id)).toContain(id);
  });
});
