import { MigrationInterface, QueryRunner } from "typeorm";

export class AddInAppNotificationPriority1780058597518 implements MigrationInterface {
    name = 'AddInAppNotificationPriority1780058597518'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "in_app_notifications" ADD "priority" character varying(20) NOT NULL DEFAULT 'normal'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "in_app_notifications" DROP COLUMN "priority"`);
    }

}
