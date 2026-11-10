import { Injectable, LoggerService } from '@nestjs/common';

export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  context: string;
  event: string;
  message: string;
  metadata?: Record<string, unknown>;
}

/** Claves que nunca deben llegar a los logs (guía §18, privacidad). */
const SENSITIVE_KEYS = [
  'password',
  'passwordhash',
  'token',
  'accesstoken',
  'authorization',
  'secret',
];

const BOGOTA_OFFSET_MS = -5 * 60 * 60 * 1000;

/** Fecha ISO con desfase fijo de Colombia (UTC-5, sin horario de verano). */
export function bogotaTimestamp(date: Date = new Date()): string {
  return new Date(date.getTime() + BOGOTA_OFFSET_MS)
    .toISOString()
    .replace('Z', '-05:00');
}

export function redact(
  metadata?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (!metadata) return undefined;
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    clean[key] = SENSITIVE_KEYS.includes(key.toLowerCase())
      ? '[REDACTED]'
      : value;
  }
  return clean;
}

export function buildEntry(
  level: LogLevel,
  context: string,
  event: string,
  message: string,
  metadata?: Record<string, unknown>,
  now: Date = new Date(),
): LogEntry {
  const entry: LogEntry = {
    timestamp: bogotaTimestamp(now),
    level,
    context,
    event,
    message,
  };
  const clean = redact(metadata);
  if (clean && Object.keys(clean).length > 0) entry.metadata = clean;
  return entry;
}

/**
 * Logger estructurado en JSON (una línea por evento) para Shift Right.
 * También implementa LoggerService para recibir los mensajes internos de Nest.
 */
@Injectable()
export class AppLogger implements LoggerService {
  event(
    level: LogLevel,
    context: string,
    event: string,
    message: string,
    metadata?: Record<string, unknown>,
  ): void {
    const line = JSON.stringify(
      buildEntry(level, context, event, message, metadata),
    );
    if (level === 'ERROR') console.error(line);
    else if (level === 'WARN') console.warn(line);
    else console.log(line);
  }

  info(
    context: string,
    event: string,
    message: string,
    metadata?: Record<string, unknown>,
  ): void {
    this.event('INFO', context, event, message, metadata);
  }

  warn(message: unknown, context?: string): void;
  warn(
    context: string,
    event: string,
    message: string,
    metadata?: Record<string, unknown>,
  ): void;
  warn(a: unknown, b?: string, c?: string, d?: Record<string, unknown>): void {
    if (c !== undefined) this.event('WARN', String(a), b ?? 'WARN', c, d);
    else this.event('WARN', b ?? 'Nest', 'FRAMEWORK', String(a));
  }

  error(message: unknown, trace?: string, context?: string): void;
  error(
    context: string,
    event: string,
    message: string,
    metadata?: Record<string, unknown>,
  ): void;
  error(
    a: unknown,
    b?: unknown,
    c?: unknown,
    d?: Record<string, unknown>,
  ): void {
    if (typeof c === 'string' && d !== undefined)
      this.event('ERROR', String(a), String(b), c, d);
    else
      this.event(
        'ERROR',
        typeof c === 'string' ? c : 'Nest',
        'FRAMEWORK',
        String(a),
        b ? { trace: b } : undefined,
      );
  }

  log(message: unknown, context?: string): void {
    this.event('INFO', context ?? 'Nest', 'FRAMEWORK', String(message));
  }

  debug(message: unknown, context?: string): void {
    if (process.env.LOG_DEBUG === 'true')
      this.event('DEBUG', context ?? 'Nest', 'FRAMEWORK', String(message));
  }

  verbose(message: unknown, context?: string): void {
    this.debug(message, context);
  }
}
