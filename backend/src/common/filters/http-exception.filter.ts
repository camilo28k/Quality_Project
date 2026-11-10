import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AppLogger } from '../logger/app-logger.service';

/**
 * Respuesta de error uniforme y registro de validaciones rechazadas (WARN)
 * y excepciones no controladas (ERROR) para Shift Right.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: AppLogger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();

    const isHttp = exception instanceof HttpException;
    const status: number = isHttp
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;
    const body = isHttp ? exception.getResponse() : null;
    const message =
      typeof body === 'object' && body !== null && 'message' in body
        ? (body as { message: string | string[] }).message
        : isHttp
          ? exception.message
          : 'Error interno del servidor';

    const meta = { method: req.method, path: req.path, status };
    if (status === (HttpStatus.BAD_REQUEST as number)) {
      this.logger.warn(
        'HttpExceptionFilter',
        'VALIDATION_REJECTED',
        'Solicitud rechazada por validación',
        {
          ...meta,
          errors: message,
        },
      );
    } else if (status >= 500) {
      this.logger.error(
        'HttpExceptionFilter',
        'UNHANDLED_EXCEPTION',
        'Excepción no controlada',
        {
          ...meta,
          error:
            exception instanceof Error ? exception.message : String(exception),
        },
      );
    }

    res.status(status).json({ statusCode: status, message });
  }
}
