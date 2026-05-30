import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateInAppNotifications1779942924556 implements MigrationInterface {
    name = 'CreateInAppNotifications1779942924556'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "in_app_notifications" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" character varying(80) NOT NULL, "event_id" character varying(120) NOT NULL, "event_type" character varying(120) NOT NULL, "category" character varying(50) NOT NULL DEFAULT 'order-updates', "title" character varying(255) NOT NULL, "body" text NOT NULL, "link_url" character varying(500) NOT NULL DEFAULT '', "is_read" boolean NOT NULL DEFAULT false, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_f871e2a23724692bbb5b3b75c98" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_d0b7a07fe479e9518ab8601835" ON "in_app_notifications" ("event_id", "user_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_332e1868773a1f0b7361527659" ON "in_app_notifications" ("user_id", "created_at") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_332e1868773a1f0b7361527659"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_d0b7a07fe479e9518ab8601835"`);
        await queryRunner.query(`DROP TABLE "in_app_notifications"`);
    }

}
