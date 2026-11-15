import type { MigrationInterface, QueryRunner } from 'typeorm';

export class EsquemaInicial1731628800000 implements MigrationInterface {
  name = 'EsquemaInicial1731628800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE guias (
        tenant_id           varchar(64)  NOT NULL,
        numero_guia         varchar(64)  NOT NULL,
        estado_actual       varchar(20),
        ultima_fecha_evento timestamptz,
        creada_en           timestamptz  NOT NULL DEFAULT now(),
        actualizada_en      timestamptz  NOT NULL DEFAULT now(),
        PRIMARY KEY (tenant_id, numero_guia),
        CONSTRAINT guias_estado_valido
          CHECK (estado_actual IS NULL
                 OR estado_actual IN ('CREADA', 'EN_RUTA', 'ENTREGADA', 'DEVUELTA'))
      )
    `);

    // (tenant_id, event_id) es la clave de idempotencia: la base de datos garantiza que
    // un mismo evento no se registre dos veces, incluso con solicitudes concurrentes.
    await queryRunner.query(`
      CREATE TABLE eventos_guia (
        tenant_id    varchar(64)  NOT NULL,
        event_id     uuid         NOT NULL,
        secuencia    bigint       GENERATED ALWAYS AS IDENTITY,
        numero_guia  varchar(64)  NOT NULL,
        estado       varchar(20)  NOT NULL,
        fecha_evento timestamptz  NOT NULL,
        observacion  text,
        recibido_en  timestamptz  NOT NULL,
        PRIMARY KEY (tenant_id, event_id),
        FOREIGN KEY (tenant_id, numero_guia) REFERENCES guias (tenant_id, numero_guia),
        CONSTRAINT eventos_estado_valido
          CHECK (estado IN ('CREADA', 'EN_RUTA', 'ENTREGADA', 'DEVUELTA'))
      )
    `);
    await queryRunner.query(`
      CREATE INDEX eventos_guia_historial_idx
        ON eventos_guia (tenant_id, numero_guia, fecha_evento, secuencia)
    `);

    // Outbox transaccional: la fila se inserta en la misma transaccion que el evento.
    // UNIQUE (tenant_id, event_id) es la segunda barrera contra notificaciones duplicadas.
    await queryRunner.query(`
      CREATE TABLE notificaciones (
        id                 uuid         PRIMARY KEY,
        tenant_id          varchar(64)  NOT NULL,
        event_id           uuid         NOT NULL,
        estado             varchar(20)  NOT NULL,
        intentos           integer      NOT NULL DEFAULT 0,
        proximo_intento_en timestamptz  NOT NULL,
        bloqueada_hasta    timestamptz,
        ultimo_error       text,
        ultimo_status      integer,
        creada_en          timestamptz  NOT NULL,
        actualizada_en     timestamptz  NOT NULL DEFAULT now(),
        enviada_en         timestamptz,
        UNIQUE (tenant_id, event_id),
        FOREIGN KEY (tenant_id, event_id) REFERENCES eventos_guia (tenant_id, event_id),
        CONSTRAINT notificaciones_estado_valido
          CHECK (estado IN ('PENDIENTE', 'ENVIADA', 'FALLIDA'))
      )
    `);
    await queryRunner.query(`
      CREATE INDEX notificaciones_pendientes_idx
        ON notificaciones (proximo_intento_en)
        WHERE estado = 'PENDIENTE'
    `);
    await queryRunner.query(`
      CREATE INDEX notificaciones_tenant_idx
        ON notificaciones (tenant_id, estado, creada_en DESC)
    `);

    await queryRunner.query(`
      CREATE TABLE webhooks_tenant (
        tenant_id      varchar(64)  PRIMARY KEY,
        url            text         NOT NULL,
        actualizado_en timestamptz  NOT NULL
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE webhooks_tenant');
    await queryRunner.query('DROP TABLE notificaciones');
    await queryRunner.query('DROP TABLE eventos_guia');
    await queryRunner.query('DROP TABLE guias');
  }
}
