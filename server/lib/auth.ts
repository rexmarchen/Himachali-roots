import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { env } from '../env.js';
import { execute, queryAll, queryOne, type Db } from '../db.js';
import type { Role, SellerStatus, SessionUser } from '../../shared/types.js';
import { forbidden, unauthorized } from './http.js';
import { randomToken } from './ids.js';

export const SESSION_COOKIE = 'pr_session';

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `scrypt$16384$8$1$${salt}$${hash.toString('hex')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [scheme, n, r, p, salt, hash] = stored.split('$');
    if (scheme !== 'scrypt' || !salt || !hash) return false;
    const expected = Buffer.from(hash, 'hex');
    const actual = crypto.scryptSync(password, salt, expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
      maxmem: 64 * 1024 * 1024,
    });
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

interface UserRow {
  id: string;
  email: string;
  email_verified: number;
  is_disabled: number;
  full_name: string;
}

export function loadSessionUser(db: Db, token: string | undefined): SessionUser | null {
  if (!token) return null;
  const row = queryOne<UserRow>(
    db,
    `SELECT u.id, u.email, u.email_verified, u.is_disabled, p.full_name
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       LEFT JOIN profiles p ON p.id = u.id
      WHERE s.token_hash = ? AND s.expires_at > ? AND u.is_disabled = 0`,
    sha256(token),
    new Date().toISOString(),
  );
  if (!row) return null;
  const roles = queryAll<{ role: Role }>(db, 'SELECT role FROM user_roles WHERE user_id = ?', row.id).map((r) => r.role);
  const seller = queryOne<{ id: string; status: SellerStatus }>(
    db,
    'SELECT id, status FROM seller_profiles WHERE user_id = ?',
    row.id,
  );
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name ?? '',
    roles,
    sellerId: seller?.id ?? null,
    sellerStatus: seller?.status ?? null,
    emailVerified: row.email_verified === 1,
  };
}

export function createSession(db: Db, userId: string): string {
  const token = randomToken(32);
  const expires = new Date(Date.now() + env.sessionDays * 86400_000).toISOString();
  execute(db, 'INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)', sha256(token), userId, expires);
  return token;
}

export function destroySession(db: Db, token: string | undefined): void {
  if (!token) return;
  execute(db, 'DELETE FROM sessions WHERE token_hash = ?', sha256(token));
}

export function setSessionCookie(req: Request, res: Response, token: string): void {
  const secure = env.appUrl.startsWith('https://') || req.secure;
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: env.sessionDays * 86400_000,
  });
}

export function clearSessionCookie(req: Request, res: Response): void {
  const secure = env.appUrl.startsWith('https://') || req.secure;
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: 'lax', secure, path: '/' });
}

export function sessionToken(req: Request): string | undefined {
  return (req.cookies as Record<string, string> | undefined)?.[SESSION_COOKIE];
}

export function attachUser(db: Db) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    req.user = loadSessionUser(db, sessionToken(req)) ?? undefined;
    next();
  };
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) return next(unauthorized());
  next();
}

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) return next(unauthorized());
    if (!req.user.roles.some((role) => roles.includes(role))) return next(forbidden());
    next();
  };
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) return next(unauthorized());
  if (!req.user.roles.includes('admin')) return next(forbidden('Administrator access required.'));
  next();
}

/** Sellers may operate only after approval; admins may inspect any seller. */
export function requireApprovedSeller(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) return next(unauthorized());
  if (req.user.roles.includes('admin')) return next();
  if (!req.user.sellerId) return next(forbidden('Complete your seller application first.'));
  if (req.user.sellerStatus !== 'approved') {
    return next(forbidden('Your seller account is not approved yet.'));
  }
  next();
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: SessionUser;
    }
  }
}
