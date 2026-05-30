import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { existsSync } from 'fs';
import { join } from 'path';

function resolveProtoPath(): string {
  const candidates = [
    join(__dirname, 'proto', 'notification.proto'),
    join(__dirname, '..', 'src', 'proto', 'notification.proto'),
  ];
  const found = candidates.find((p) => existsSync(p));
  if (!found) {
    throw new Error(
      `notification.proto not found. Tried: ${candidates.join(', ')}. Run: npm run build`,
    );
  }
  return found;
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  const grpcPort = process.env.NOTIFICATION_SERVICE_GRPC_PORT || '50058';
  const kafkaBroker = process.env.KAFKA_BROKER || 'localhost:9093';
  const protoPath = resolveProtoPath();

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      package: 'notification',
      protoPath,
      url: `0.0.0.0:${grpcPort}`,
      loader: {
        keepCase: true,
        longs: String,
        enums: String,
        defaults: true,
        arrays: true,
      },
    },
  });

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.KAFKA,
    options: {
      client: {
        clientId: 'notification-service',
        brokers: [kafkaBroker],
      },
      consumer: {
        groupId: 'notification-service-group',
      },
    },
  });

  await app.startAllMicroservices();
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
