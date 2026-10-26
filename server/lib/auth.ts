import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { env } from '../env.js';
import { execute, queryAll, queryOne, type Db } from '../db.js';
import type { Role, SellerStatus, SessionUser } from '../../shared/types.js';
import { forbidden, unauthorized } from './http.js';
import { randomToken } from './ids.js';

export const SESSION_COOKIE = 'pr_session';
export const NO_PASSWORD_MARKER = '!google-only!';
const SESSION_TOUCH_MS = 5 * 60_000;

export function hasUsablePassword(hash: string | null | undefined): boolean {
  return typeof hash === 'string' && hash.length > 0 && !hash.startsWith(NO_PASSWORD_MARKER);
}

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
  password_hash: string;
  last_seen_at: string;
  created_at: string;
}

function sessionCutoffs(): { now: string; idleCutoff: string } {
  const now = new Date();
  const idleDays = Math.max(1, Math.min(env.sessionIdleDays, env.sessionDays));
  return {
    now: now.toISOString(),
    idleCutoff: new Date(now.getTime() - idleDays * 86400_000).toISOString(),
  };
}

export function buildSessionUser(
  db: Db,
  user: Pick<UserRow, 'id' | 'email' | 'email_verified' | 'full_name' | 'password_hash'>,
): SessionUser {
  const roles = queryAll<{ role: Role }>(db, 'SELECT role FROM user_roles WHERE user_id = ?', user.id).map((r) => r.role);
  const seller = queryOne<{ id: string; status: SellerStatus }>(
    db,
    'SELECT id, status FROM seller_profiles WHERE user_id = ?',
    user.id,
  );
  const providers = queryAll<{ provider: string }>(
    db,
    'SELECT provider FROM auth_identities WHERE user_id = ? ORDER BY provider',
    user.id,
  ).map((row) => row.provider);
  return {
    id: user.id,
    email: user.email,
    fullName: user.full_name ?? '',
    roles,
    sellerId: seller?.id ?? null,
    sellerStatus: seller?.status ?? null,
    emailVerified: user.email_verified === 1,
    hasPassword: hasUsablePassword(user.password_hash),
    authProviders: providers,
  };
}

export function getSessionUser(db: Db, userId: string): SessionUser | null {
  const row = queryOne<UserRow>(
    db,
    `SELECT u.id, u.email, u.email_verified, u.is_disabled, u.password_hash,
            COALESCE(p.full_name, '') AS full_name, '' AS last_seen_at, '' AS created_at
       FROM users u
       LEFT JOIN profiles p ON p.id = u.id
      WHERE u.id = ?`,
    userId,
  );
  if (!row || row.is_disabled) return null;
  return buildSessionUser(db, row);
}

export function loadSessionUser(db: Db, token: string | undefined): SessionUser | null {
  if (!token) return null;
  const { now, idleCutoff } = sessionCutoffs();
  const row = queryOne<UserRow>(
    db,
    `SELECT u.id, u.email, u.email_verified, u.is_disabled, u.password_hash,
            COALESCE(p.full_name, '') AS full_name,
            COALESCE(s.last_seen_at, s.created_at) AS last_seen_at,
            s.created_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       LEFT JOIN profiles p ON p.id = u.id
      WHERE s.token_hash = ? AND s.expires_at > ? AND u.is_disabled = 0
        AND COALESCE(s.last_seen_at, s.created_at) > ?`,
    sha256(token),
    now,
    idleCutoff,
  );
  if (!row) return null;

  // Touch at most every five minutes so a busy customer does not turn every
  // request into a write. The idle window is measured from this timestamp.
  const lastSeen = Date.parse(row.last_seen_at);
  if (!Number.isFinite(lastSeen) || Date.now() - lastSeen > SESSION_TOUCH_MS) {
    execute(
      db,
      'UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?',
      now,
      sha256(token),
    );
  }
  return buildSessionUser(db, row);
}

export function createSession(db: Db, userId: string): string {
  const token = randomToken(32);
  const now = new Date();
  const createdAt = now.toISOString();
  const expires = new Date(now.getTime() + env.sessionDays * 86400_000).toISOString();
  const { idleCutoff } = sessionCutoffs();
  execute(
    db,
    'DELETE FROM sessions WHERE expires_at <= ? OR COALESCE(last_seen_at, created_at) <= ?',
    createdAt,
    idleCutoff,
  );
  execute(
    db,
    'INSERT INTO sessions (token_hash, user_id, expires_at, last_seen_at) VALUES (?, ?, ?, ?)',
    sha256(token),
    userId,
    expires,
    createdAt,
  );
  return token;
}

/** Issue a fresh session and revoke the caller's previous token (fixation defence). */
export function rotateSession(db: Db, req: Request, res: Response, userId: string): string {
  destroySession(db, sessionToken(req));
  const token = createSession(db, userId);
  setSessionCookie(req, res, token);
  return token;
}

export function destroySession(db: Db, token: string | undefined): void {
  if (!token) return;
  execute(db, 'DELETE FROM sessions WHERE token_hash = ?', sha256(token));
}

export function setSessionCookie(req: Request, res: Response, token: string): void {
  const sameSite = env.sessionSameSite;
  const secure = sameSite === 'none' || env.appUrl.startsWith('https://') || req.secure;
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite,
    secure,
    path: '/',
    maxAge: env.sessionDays * 86400_000,
  });
}

export function clearSessionCookie(req: Request, res: Response): void {
  const sameSite = env.sessionSameSite;
  const secure = sameSite === 'none' || env.appUrl.startsWith('https://') || req.secure;
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite, secure, path: '/' });
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
