export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const SENSITIVE_KEYS = new Set([
  'password',
  'password_hash',
  'token',
  'otp',
  'secret',
  'key',
  'authorization',
  'cookie',
  'card',
  'cvv',
  'rawBody',
]);

function sanitize(data: unknown): unknown {
  if (data === null || data === undefined) return data;
  if (typeof data !== 'object') return data;
  if (Array.isArray(data)) return data.map(sanitize);

  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.has(k.toLowerCase()) || k.toLowerCase().includes('password') || k.toLowerCase().includes('secret')) {
      clean[k] = '[REDACTED]';
    } else {
      clean[k] = sanitize(v);
    }
  }
  return clean;
}

export class Logger {
  private readonly context: string;

  constructor(context: string) {
    this.context = context;
  }

  debug(msg: string, meta?: Record<string, unknown>): void {
    this.log('debug', msg, meta);
  }

  info(msg: string, meta?: Record<string, unknown>): void {
    this.log('info', msg, meta);
  }

  warn(msg: string, meta?: Record<string, unknown>): void {
    this.log('warn', msg, meta);
  }

  error(msg: string, error?: Error | unknown, meta?: Record<string, unknown>): void {
    const errorDetails = error instanceof Error
      ? { message: error.message, stack: error.stack, name: error.name }
      : { raw: String(error) };
    this.log('error', msg, { ...meta, error: errorDetails });
  }

  private log(level: LogLevel, msg: string, meta?: Record<string, unknown>): void {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      context: this.context,
      message: msg,
      ...(meta ? (sanitize(meta) as Record<string, unknown>) : {}),
    };

    const formatted = JSON.stringify(entry);
    if (level === 'error') {
      console.error(formatted);
    } else if (level === 'warn') {
      console.warn(formatted);
    } else {
      console.log(formatted);
    }
  }
}

export const appLogger = new Logger('App');

