import type { NextFunction, Request, Response } from 'express';
import type { ZodType } from 'zod';
import { ZodError } from 'zod';
import { env } from '../env.js';

export class AppError extends Error {
  status: number;
  code: string;
  fields?: Record<string, string>;

  constructor(status: number, code: string, message: string, fields?: Record<string, string>) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

export const badRequest = (message: string, fields?: Record<string, string>) =>
  new AppError(400, 'invalid_request', message, fields);
export const unauthorized = (message = 'Please sign in to continue.') =>
  new AppError(401, 'unauthorized', message);
export const forbidden = (message = 'You do not have permission to do that.') =>
  new AppError(403, 'forbidden', message);
export const notFound = (message = 'Not found.') => new AppError(404, 'not_found', message);
export const conflict = (message: string, code = 'conflict') => new AppError(409, code, message);

export function parse<T>(schema: ZodType<T>, value: unknown): T {
  try {
    return schema.parse(value);
  } catch (error) {
    if (error instanceof ZodError) {
      const fields: Record<string, string> = {};
      for (const issue of error.issues) {
        const key = issue.path.join('.') || 'form';
        if (!fields[key]) fields[key] = issue.message;
      }
      throw badRequest('Please check the highlighted fields.', fields);
    }
    throw error;
  }
}

export function errorMiddleware(error: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (error instanceof AppError) {
    res.status(error.status).json({
      error: { code: error.code, message: error.message, ...(error.fields ? { fields: error.fields } : {}) },
    });
    return;
  }
  // Multer size/type errors
  if (typeof error === 'object' && error && 'code' in error) {
    const code = String((error as { code: unknown }).code);
    if (code === 'LIMIT_FILE_SIZE') {
      res.status(400).json({ error: { code: 'file_too_large', message: 'Images must be 5 MB or smaller.' } });
      return;
    }
    if (code.startsWith('LIMIT_')) {
      res.status(400).json({ error: { code: 'invalid_upload', message: 'That upload could not be accepted.' } });
      return;
    }
  }
  console.error(
    JSON.stringify({
      level: 'error',
      msg: 'unhandled_request_error',
      method: req.method,
      path: req.path,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error && !process.env.NODE_ENV?.startsWith('prod') ? error.stack : undefined,
    }),
  );
  res.status(500).json({ error: { code: 'internal_error', message: 'Something went wrong on our side. Please try again.' } });
}

function isSameOrigin(req: Request): boolean {
  const origin = req.get('origin');
  if (!origin) return true; // same-origin fetch may omit Origin; cookies are SameSite=Lax.
  try {
    const originUrl = new URL(origin);
    const host = req.get('host');
    if (Boolean(host) && originUrl.host === host) return true;

    // Allow requests originating from the configured application URL (e.g. Vite frontend)
    const appUrl = new URL(env.appUrl);
    if (originUrl.host === appUrl.host) return true;

    // In local development/testing, permit localhost/127.0.0.1 loopback variations
    if (!env.isProduction) {
      const isLoopback = (hostname: string) => hostname === 'localhost' || hostname === '127.0.0.1';
      const hostNameOnly = host ? host.split(':')[0] : '';
      if (
        isLoopback(originUrl.hostname) &&
        (isLoopback(appUrl.hostname) || isLoopback(hostNameOnly))
      ) {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Lightweight CSRF defence for the cookie-session API:
 *  - SameSite=Lax session cookie
 *  - Origin must match Host for browser mutations
 *  - Mutations must send the custom header required by the API client
 * Webhooks are exempt because they are authenticated by provider signatures.
 */
export function csrfGuard(req: Request, res: Response, next: NextFunction): void {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || req.path.startsWith('/webhooks/')) {
    next();
    return;
  }
  if (!isSameOrigin(req)) {
    res.status(403).json({ error: { code: 'csrf', message: 'Cross-origin request rejected.' } });
    return;
  }
  if (req.get('x-requested-with') !== 'pahadi-roots') {
    res.status(403).json({ error: { code: 'csrf', message: 'Missing request header. Refresh the page and try again.' } });
    return;
  }
  next();
}

export function clientIp(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}
