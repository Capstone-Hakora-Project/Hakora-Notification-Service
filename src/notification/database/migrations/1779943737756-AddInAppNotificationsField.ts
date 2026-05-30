import { MigrationInterface, QueryRunner } from "typeorm";

export class AddInAppNotificationsField1779943737756 implements MigrationInterface {
    name = 'AddInAppNotificationsField1779943737756'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "in_app_notifications" ADD "order_id" character varying(120)`);
        await queryRunner.query(`ALTER TABLE "in_app_notifications" ADD "order_id_display" character varying(40) NOT NULL DEFAULT ''`);
        await queryRunner.query(`ALTER TABLE "in_app_notifications" ADD "status_label" character varying(80) NOT NULL DEFAULT ''`);
        await queryRunner.query(`ALTER TABLE "in_app_notifications" ADD "total_amount_display" character varying(40) NOT NULL DEFAULT ''`);
        await queryRunner.query(`ALTER TABLE "in_app_notifications" ADD "product_name" character varying(255) NOT NULL DEFAULT ''`);
        await queryRunner.query(`ALTER TABLE "in_app_notifications" ADD "product_thumbnail_url" character varying(500) NOT NULL DEFAULT ''`);
        await queryRunner.query(`ALTER TABLE "in_app_notifications" ADD "item_count" integer NOT NULL DEFAULT '0'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "in_app_notifications" DROP COLUMN "item_count"`);
        await queryRunner.query(`ALTER TABLE "in_app_notifications" DROP COLUMN "product_thumbnail_url"`);
        await queryRunner.query(`ALTER TABLE "in_app_notifications" DROP COLUMN "product_name"`);
        await queryRunner.query(`ALTER TABLE "in_app_notifications" DROP COLUMN "total_amount_display"`);
        await queryRunner.query(`ALTER TABLE "in_app_notifications" DROP COLUMN "status_label"`);
        await queryRunner.query(`ALTER TABLE "in_app_notifications" DROP COLUMN "order_id_display"`);
        await queryRunner.query(`ALTER TABLE "in_app_notifications" DROP COLUMN "order_id"`);
    }

}
