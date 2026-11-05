import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateWatchlistItems1793886391367 implements MigrationInterface {
  name = 'CreateWatchlistItems1793886391367';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."watchlist_priority" AS ENUM('low', 'medium', 'high')`,
    );
    await queryRunner.query(
      `CREATE TABLE "watchlist_items" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "user_id" uuid NOT NULL, "tmdb_id" integer NOT NULL, "title" text NOT NULL, "overview" text, "poster_path" text, "release_date" date, "synced_at" TIMESTAMP WITH TIME ZONE NOT NULL, "watched" boolean NOT NULL DEFAULT false, "watched_at" TIMESTAMP WITH TIME ZONE, "rating" smallint, "priority" "public"."watchlist_priority" NOT NULL DEFAULT 'medium', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_watchlist_items_user_movie" UNIQUE ("user_id", "tmdb_id"), CONSTRAINT "CHK_watchlist_items_rating" CHECK ("rating" BETWEEN 1 AND 10), CONSTRAINT "PK_0a02323c5cc02e094871f24062b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_a37f6e927b4c09907cf0e87b0d" ON "watchlist_items"  ("synced_at") `,
    );
    await queryRunner.query(
      `ALTER TABLE "watchlist_items" ADD CONSTRAINT "FK_0072d2b5c5969c239be193df141" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "watchlist_items" DROP CONSTRAINT "FK_0072d2b5c5969c239be193df141"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_a37f6e927b4c09907cf0e87b0d"`,
    );
    await queryRunner.query(`DROP TABLE "watchlist_items"`);
    await queryRunner.query(`DROP TYPE "public"."watchlist_priority"`);
  }
}
