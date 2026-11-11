import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  app.setGlobalPrefix('api');
  app.enableCors({ origin: config.getOrThrow<string>('FRONTEND_ORIGIN') });

  // Applies the DTO rules to every request body and query string:
  // - whitelist: drop properties that are not declared in the DTO
  // - forbidNonWhitelisted: reject the request instead of silently dropping
  // - transform: turn plain JSON into DTO class instances (needed for nested validation)
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));

  const port = config.getOrThrow<number>('PORT');
  await app.listen(port);
  Logger.log(`SmartInventory API listening on http://localhost:${port}/api`, 'Bootstrap');
}

void bootstrap();
