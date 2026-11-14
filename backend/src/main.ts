import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { AppLogger } from './common/logger/app-logger.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    abortOnError: false, // permite registrar el fallo de arranque en formato estructurado
  });
  const logger = app.get(AppLogger);
  app.useLogger(logger);

  app.enableCors({
    origin: process.env.FRONTEND_URL ?? 'http://localhost:3000',
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter(logger));

  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port);
  logger.info('Bootstrap', 'APP_STARTED', 'Aplicación iniciada', {
    port,
    env: process.env.NODE_ENV ?? 'development',
  });
}
bootstrap().catch((error: unknown) => {
  // Shift Right: un fallo de arranque (p. ej. BD inalcanzable) queda como ERROR con contexto,
  // sin volcar la cadena de conexión ni el stack completo.
  new AppLogger().error(
    'Bootstrap',
    'APP_START_FAILED',
    'La aplicación no pudo iniciar',
    {
      error: error instanceof Error ? error.name : 'UnknownError',
      reason:
        error instanceof Error
          ? (error.message.split('\n').find((l) => l.trim()) ?? '')
          : String(error),
    },
  );
  process.exit(1);
});
