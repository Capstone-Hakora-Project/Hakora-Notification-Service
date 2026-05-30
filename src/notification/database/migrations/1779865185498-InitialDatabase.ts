import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialDatabase1779865185498 implements MigrationInterface {
    name = 'InitialDatabase1779865185498'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "user_notification_preferences" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" character varying(80) NOT NULL, "event_type" character varying(120) NOT NULL, "email_enabled" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_2b30dfc697b16f75a55be54d464" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_33bb0c336d35f8b706fdd126b8" ON "user_notification_preferences" ("user_id", "event_type") `);
        await queryRunner.query(`CREATE TABLE "notification_logs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "event_id" character varying(120) NOT NULL DEFAULT '', "event_type" character varying(120) NOT NULL, "channel" character varying(30) NOT NULL, "recipient" character varying(255) NOT NULL, "subject" character varying(255) NOT NULL DEFAULT '', "body_preview" text NOT NULL DEFAULT '', "status" character varying(20) NOT NULL DEFAULT 'PENDING', "error_message" text, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_19c524e644cdeaebfcffc284871" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_0eaf8f4f0c0ef20c32fa6792d8" ON "notification_logs" ("event_id", "channel") `);
        await queryRunner.query(`CREATE TABLE "notification_templates" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "event_type" character varying(100) NOT NULL, "channel" character varying(30) NOT NULL, "language" character varying(10) NOT NULL DEFAULT 'vi', "subject_template" character varying(255) NOT NULL DEFAULT '', "body_template" text NOT NULL, "is_active" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_76f0fc48b8d057d2ae7f3a2848a" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_1f854364d4db5a15f358d70f56" ON "notification_templates" ("event_type", "channel", "language") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_1f854364d4db5a15f358d70f56"`);
        await queryRunner.query(`DROP TABLE "notification_templates"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_0eaf8f4f0c0ef20c32fa6792d8"`);
        await queryRunner.query(`DROP TABLE "notification_logs"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_33bb0c336d35f8b706fdd126b8"`);
        await queryRunner.query(`DROP TABLE "user_notification_preferences"`);
    }

}
