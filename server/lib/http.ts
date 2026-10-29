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
  // Last line of defence: a route that forgets to use parse()/safeParse() must
  // not turn a field-level validation failure into an opaque 500. Report the
  // offending fields so the client can highlight them.
  if (error instanceof ZodError) {
    const fields: Record<string, string> = {};
    for (const issue of error.issues) {
      const key = issue.path.join('.') || 'form';
      if (!fields[key]) fields[key] = issue.message;
    }
    res.status(400).json({
      error: { code: 'invalid_request', message: 'Please check the highlighted fields.', fields },
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
      requestId: res.locals.requestId,
      method: req.method,
      path: req.path,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error && !process.env.NODE_ENV?.startsWith('prod') ? error.stack : undefined,
    }),
  );
  res.status(500).json({ error: { code: 'internal_error', message: 'Something went wrong on our side. Please try again.' } });
}

function normalizeOrigin(value: string): string {
  try {
    return new URL(value).origin;
  } catch {
    return '';
  }
}

const configuredOrigins = new Set(
  [env.appUrl, ...env.allowedOrigins].map(normalizeOrigin).filter(Boolean),
);

function isLoopback(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

/**
 * Browser requests carrying an Origin are trusted only when they match the
 * request host, the configured APP_URL or an explicit ALLOWED_ORIGINS entry.
 * Requests without Origin are non-browser clients or same-origin GETs.
 */
export function isTrustedOrigin(req: Request, origin?: string | null): boolean {
  if (!origin) return true;
  let originUrl: URL;
  try {
    originUrl = new URL(origin);
  } catch {
    return false;
  }
  const host = req.get('host');
  if (host && originUrl.host === host) {
    // In production a TLS origin must not be downgraded to http on the same host.
    if (!env.isProduction || originUrl.protocol === 'https:' || req.protocol === 'https') return true;
  }
  if (configuredOrigins.has(originUrl.origin)) return true;
  if (!env.isProduction && isLoopback(originUrl.hostname)) {
    const hostName = (host ?? '').split(':')[0];
    if (isLoopback(hostName)) return true;
    try {
      if (isLoopback(new URL(env.appUrl).hostname)) return true;
    } catch {
      // Ignore an unparseable APP_URL; production validation reports it.
    }
  }
  return false;
}

/** Explicit allowlist CORS for a split frontend/API deployment. Same-origin needs no header. */
export function corsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const origin = req.get('origin');
  if (!origin) {
    next();
    return;
  }
  if (!isTrustedOrigin(req, origin)) {
    if (req.method === 'OPTIONS') {
      res.status(403).json({ error: { code: 'cors', message: 'Origin not allowed.' } });
      return;
    }
    // No CORS headers: the browser blocks the response, and csrfGuard blocks mutations.
    next();
    return;
  }
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With, X-Request-Id');
    res.setHeader('Access-Control-Max-Age', '600');
    res.status(204).end();
    return;
  }
  next();
}

/**
 * Lightweight CSRF defence for the cookie-session API:
 *  - SameSite session cookie
 *  - Origin must match Host, APP_URL or ALLOWED_ORIGINS for browser mutations
 *  - Mutations must send the custom header required by the API client
 * Webhooks are exempt because they are authenticated by provider signatures.
 */
export function csrfGuard(req: Request, res: Response, next: NextFunction): void {
  if (
    ['GET', 'HEAD', 'OPTIONS'].includes(req.method) ||
    req.path.startsWith('/webhooks/') ||
    req.path === '/create-order' ||
    req.path === '/verify-payment'
  ) {
    next();
    return;
  }
  if (!isTrustedOrigin(req, req.get('origin'))) {
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
