import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { NotificationModule } from './notification/notification.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('DATABASE_HOST') ?? 'localhost',
        port: Number(config.get<string>('DATABASE_PORT') ?? 5432),
        username: config.get<string>('DATABASE_USERNAME') ?? 'postgres',
        password: config.get<string>('DATABASE_PASSWORD') ?? 'postgres',
        database: config.get<string>('DATABASE_NAME') ?? 'notification_service',
        autoLoadEntities: true,
        synchronize: false,
        migrationsRun: false,
        logging: process.env.NODE_ENV !== 'production',
      }),
    }),
    NotificationModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
