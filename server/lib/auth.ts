import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { env } from '../env.js';
import { execute, queryAll, queryOne, type Db } from '../db.js';
import type { Role, SellerStatus, SessionUser } from '../../shared/types.js';
import { AppError, clientIp, forbidden, unauthorized } from './http.js';
import { randomToken } from './ids.js';

import { PasswordService } from '../core/security/PasswordService.js';
import { MfaService } from '../core/security/MfaService.js';

export const SESSION_COOKIE = 'pr_session';
export const ADMIN_SESSION_COOKIE = 'pr_admin_session';
export const NO_PASSWORD_MARKER = '!google-only!';
const SESSION_TOUCH_MS = 5 * 60_000;
const ADMIN_SESSION_TOUCH_MS = 60_000;
const ADMIN_SESSION_ABSOLUTE_HOURS = 12;
export type SessionScope = 'standard' | 'admin';

export function hasUsablePassword(hash: string | null | undefined): boolean {
  return typeof hash === 'string' && hash.length > 0 && !hash.startsWith(NO_PASSWORD_MARKER);
}

export function hashPassword(password: string): string {
  return PasswordService.hash(password);
}

export function verifyPassword(password: string, stored: string): boolean {
  return PasswordService.verify(password, stored);
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
  mfa_secret?: string | null;
  mfa_enabled_at?: string | null;
  mfa_verified_at?: string | null;
  last_seen_at: string;
  created_at: string;
}

function isStepUpFresh(mfaVerifiedAt: string | null | undefined): boolean {
  if (!mfaVerifiedAt) return false;
  const parsed = Date.parse(mfaVerifiedAt);
  return Number.isFinite(parsed) && Date.now() - parsed <= env.adminStepUpMinutes * 60_000;
}

function sessionCutoffs(scope: SessionScope = 'standard'): { now: string; idleCutoff: string } {
  const now = new Date();
  if (scope === 'admin') {
    return {
      now: now.toISOString(),
      idleCutoff: new Date(now.getTime() - env.adminSessionIdleMinutes * 60_000).toISOString(),
    };
  }
  const idleDays = Math.max(1, Math.min(env.sessionIdleDays, env.sessionDays));
  return {
    now: now.toISOString(),
    idleCutoff: new Date(now.getTime() - idleDays * 86400_000).toISOString(),
  };
}

export function buildSessionUser(
  db: Db,
  user: Pick<UserRow, 'id' | 'email' | 'email_verified' | 'full_name' | 'password_hash' | 'mfa_secret' | 'mfa_enabled_at' | 'mfa_verified_at'>,
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
  const mfaEnabled = Boolean(user.mfa_secret && user.mfa_enabled_at);
  return {
    id: user.id,
    email: user.email,
    fullName: user.full_name ?? '',
    roles,
    sellerId: seller?.id ?? null,
    sellerStatus: seller?.status ?? null,
    emailVerified: user.email_verified === 1,
    mfaEnabled,
    adminStepUpActive: mfaEnabled && isStepUpFresh(user.mfa_verified_at),
    hasPassword: hasUsablePassword(user.password_hash),
    authProviders: providers,
  };
}

export function getSessionUser(db: Db, userId: string): SessionUser | null {
  const row = queryOne<UserRow>(
    db,
    `SELECT u.id, u.email, u.email_verified, u.is_disabled, u.password_hash,
            u.mfa_secret, u.mfa_enabled_at, NULL AS mfa_verified_at,
            COALESCE(p.full_name, '') AS full_name, '' AS last_seen_at, '' AS created_at
       FROM users u
       LEFT JOIN profiles p ON p.id = u.id
      WHERE u.id = ?`,
    userId,
  );
  if (!row || row.is_disabled) return null;
  return buildSessionUser(db, row);
}

export function loadSessionUser(db: Db, token: string | undefined, requiredScope: SessionScope = 'standard'): SessionUser | null {
  if (!token) return null;
  const { now, idleCutoff } = sessionCutoffs(requiredScope);
  const row = queryOne<UserRow>(
    db,
    `SELECT u.id, u.email, u.email_verified, u.is_disabled, u.password_hash,
            u.mfa_secret, u.mfa_enabled_at, s.mfa_verified_at,
            COALESCE(p.full_name, '') AS full_name,
            COALESCE(s.last_seen_at, s.created_at) AS last_seen_at,
            s.created_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       LEFT JOIN profiles p ON p.id = u.id
      WHERE s.token_hash = ? AND s.scope = ? AND s.expires_at > ? AND u.is_disabled = 0
        AND COALESCE(s.last_seen_at, s.created_at) > ?`,
    sha256(token),
    requiredScope,
    now,
    idleCutoff,
  );
  if (!row) return null;

  const built = buildSessionUser(db, row);
  // Enforce fresh DB role check on every admin request: revoked admins lose access immediately.
  if (requiredScope === 'admin' && !built.roles.includes('admin')) {
    return null;
  }

  // Touch at most every five minutes for customer sessions, or every minute for 30-min admin sessions.
  const touchIntervalMs = requiredScope === 'admin' ? ADMIN_SESSION_TOUCH_MS : SESSION_TOUCH_MS;
  const lastSeen = Date.parse(row.last_seen_at);
  if (!Number.isFinite(lastSeen) || Date.now() - lastSeen > touchIntervalMs) {
    execute(
      db,
      'UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?',
      now,
      sha256(token),
    );
  }
  return built;
}

export function createSession(
  db: Db,
  userId: string,
  options: { scope?: SessionScope; mfaVerifiedAt?: string | null } = {},
): string {
  const scope = options.scope ?? 'standard';
  const token = randomToken(32);
  const now = new Date();
  const createdAt = now.toISOString();
  const expires =
    scope === 'admin'
      ? new Date(now.getTime() + ADMIN_SESSION_ABSOLUTE_HOURS * 3600_000).toISOString()
      : new Date(now.getTime() + env.sessionDays * 86400_000).toISOString();
  const { idleCutoff } = sessionCutoffs(scope);
  execute(
    db,
    'DELETE FROM sessions WHERE scope = ? AND (expires_at <= ? OR COALESCE(last_seen_at, created_at) <= ?)',
    scope,
    createdAt,
    idleCutoff,
  );
  execute(
    db,
    'INSERT INTO sessions (token_hash, user_id, scope, mfa_verified_at, expires_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)',
    sha256(token),
    userId,
    scope,
    options.mfaVerifiedAt ?? null,
    expires,
    createdAt,
  );
  return token;
}

export function destroyAllUserSessions(db: Db, userId: string): void {
  execute(db, 'DELETE FROM sessions WHERE user_id = ?', userId);
}

/** Issue fresh isolated sessions and revoke the caller's previous tokens (fixation defence). */
export function rotateSession(
  db: Db,
  req: Request,
  res: Response,
  userId: string,
  options: { mfaVerifiedAt?: string | null } = {},
): string {
  destroySession(db, sessionToken(req));
  destroySession(db, adminSessionToken(req));
  const token = createSession(db, userId, { scope: 'standard', mfaVerifiedAt: options.mfaVerifiedAt ?? null });
  setSessionCookie(req, res, token);

  const isAdmin = Boolean(queryOne(db, "SELECT 1 FROM user_roles WHERE user_id = ? AND role = 'admin'", userId));
  if (isAdmin) {
    const adminToken = createSession(db, userId, { scope: 'admin', mfaVerifiedAt: options.mfaVerifiedAt ?? null });
    setAdminSessionCookie(req, res, adminToken);
  } else {
    clearAdminSessionCookie(req, res);
  }
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

export function setAdminSessionCookie(req: Request, res: Response, token: string): void {
  const sameSite = env.sessionSameSite === 'none' ? 'none' : 'strict';
  const secure = sameSite === 'none' || env.appUrl.startsWith('https://') || req.secure;
  res.cookie(ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite,
    secure,
    path: '/',
    maxAge: ADMIN_SESSION_ABSOLUTE_HOURS * 3600_000,
  });
}

export function clearSessionCookie(req: Request, res: Response): void {
  const sameSite = env.sessionSameSite;
  const secure = sameSite === 'none' || env.appUrl.startsWith('https://') || req.secure;
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite, secure, path: '/' });
}

export function clearAdminSessionCookie(req: Request, res: Response): void {
  const sameSite = env.sessionSameSite === 'none' ? 'none' : 'strict';
  const secure = sameSite === 'none' || env.appUrl.startsWith('https://') || req.secure;
  res.clearCookie(ADMIN_SESSION_COOKIE, { httpOnly: true, sameSite, secure, path: '/' });
}

export function sessionToken(req: Request): string | undefined {
  return (req.cookies as Record<string, string> | undefined)?.[SESSION_COOKIE];
}

export function adminSessionToken(req: Request): string | undefined {
  return (req.cookies as Record<string, string> | undefined)?.[ADMIN_SESSION_COOKIE];
}

export function isAdminNetworkAllowed(req: Request): boolean {
  if (env.adminSubdomain) {
    const rawHost = (req.get('x-forwarded-host') || req.get('host') || '').split(',')[0].trim();
    const hostname = rawHost.split(':')[0].toLowerCase();
    if (hostname !== env.adminSubdomain) return false;
  }
  if (env.adminAllowedIps.length > 0) {
    const ip = clientIp(req).replace(/^::ffff:/, '');
    if (!env.adminAllowedIps.includes(ip)) return false;
  }
  return true;
}

export function attachUser(db: Db) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const standardUser = loadSessionUser(db, sessionToken(req), 'standard');
    const adminUser = req.path.startsWith('/admin')
      ? loadSessionUser(db, adminSessionToken(req), 'admin')
      : null;
    req.adminUser = adminUser ?? undefined;
    req.user = (req.path.startsWith('/admin') ? (adminUser ?? standardUser) : standardUser) ?? undefined;
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

export function requireAdminMiddleware(requireAdminMfa = env.requireAdminMfa) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!isAdminNetworkAllowed(req)) {
      return next(forbidden('Administrator access is restricted on this network or host.'));
    }
    if (!req.user) return next(unauthorized());
    if (!req.user.roles.includes('admin')) return next(forbidden('Administrator access required.'));
    if (!req.adminUser) {
      return next(unauthorized('An active administrator session is required. Please sign in again.'));
    }
    if (requireAdminMfa && !req.adminUser.mfaEnabled) {
      return next(
        new AppError(
          403,
          'mfa_enrollment_required',
          'Two-factor authentication is mandatory for administrators. Enable it in your account settings first.',
        ),
      );
    }
    next();
  };
}

export const requireAdmin = requireAdminMiddleware();

export function requireAdminStepUp(db: Db, requireAdminMfa = env.requireAdminMfa) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!requireAdminMfa) return next();
    if (!req.adminUser) return next(unauthorized('An active administrator session is required.'));
    if (req.adminUser.adminStepUpActive) return next();

    const code = req.get('x-mfa-code')?.trim();
    if (code && /^\d{6}$/.test(code)) {
      const row = queryOne<{ mfa_secret: string | null; mfa_enabled_at: string | null }>(
        db,
        'SELECT mfa_secret, mfa_enabled_at FROM users WHERE id = ?',
        req.adminUser.id,
      );
      if (row?.mfa_secret && row.mfa_enabled_at && MfaService.verifyToken(row.mfa_secret, code)) {
        const token = adminSessionToken(req);
        if (token) {
          execute(db, 'UPDATE sessions SET mfa_verified_at = ? WHERE token_hash = ?', new Date().toISOString(), sha256(token));
        }
        return next();
      }
      return next(unauthorized('Invalid 6-digit verification code.'));
    }

    return next(
      new AppError(
        403,
        'mfa_step_up_required',
        'Two-step verification confirmation is required for this sensitive action.',
      ),
    );
  };
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
      adminUser?: SessionUser;
    }
  }
}
