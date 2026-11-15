import type { MigrationInterface, QueryRunner } from 'typeorm';

export class SecretoWebhook1731715200000 implements MigrationInterface {
  name = 'SecretoWebhook1731715200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE webhooks_tenant ADD COLUMN secreto text');
    await queryRunner.query(`
      UPDATE webhooks_tenant
         SET secreto = replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
    `);
    await queryRunner.query('ALTER TABLE webhooks_tenant ALTER COLUMN secreto SET NOT NULL');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE webhooks_tenant DROP COLUMN secreto');
  }
}
