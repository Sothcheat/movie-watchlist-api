import { MigrationInterface, QueryRunner } from 'typeorm';

export class IndexRefreshTokensExpiresAt1793884778792 implements MigrationInterface {
  name = 'IndexRefreshTokensExpiresAt1793884778792';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX "IDX_ba3bd69c8ad1e799c0256e9e50" ON "refresh_tokens"  ("expires_at") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_ba3bd69c8ad1e799c0256e9e50"`,
    );
  }
}
