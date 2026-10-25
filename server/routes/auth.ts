import crypto from 'node:crypto';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { env } from '../env.js';
import { execute, queryOne, tx, type Db } from '../db.js';
import {
  clearSessionCookie,
  createSession,
  destroySession,
  hashPassword,
  normalizeEmail,
  requireAuth,
  sessionToken,
  setSessionCookie,
  sha256,
  verifyPassword,
} from '../lib/auth.js';
import { parse, unauthorized, badRequest, conflict } from '../lib/http.js';
import { newId, randomToken } from '../lib/ids.js';
import { ensureCart, CART_COOKIE, setCartCookie } from '../lib/cart.js';
import { notify } from '../lib/email.js';

const emailSchema = z.string().trim().toLowerCase().email('Enter a valid email address.').max(254);
const passwordSchema = z
  .string()
  .min(10, 'Use at least 10 characters.')
  .max(200, 'That password is too long.')
  .refine((value) => /[a-zA-Z]/.test(value) && /[0-9]/.test(value), 'Include at least one letter and one number.');

const registerSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter your name.').max(120),
  email: emailSchema,
  password: passwordSchema,
  marketingConsent: z.boolean().optional().default(false),
  acceptedTerms: z.literal(true, { message: 'Please accept the terms to create an account.' }),
});

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password.').max(200),
});

function authLimiter(max: number) {
  return rateLimit({
    windowMs: 15 * 60_000,
    limit: env.isTest ? 1000 : max,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: { code: 'rate_limited', message: 'Too many attempts. Please wait and try again.' } },
  });
}

async function issueVerification(db: Db, user: { id: string; email: string; fullName: string }): Promise<string | null> {
  const token = randomToken(32);
  execute(
    db,
    `INSERT INTO email_verification_tokens (token_hash, user_id, expires_at) VALUES (?, ?, ?)`,
    sha256(token),
    user.id,
    new Date(Date.now() + 24 * 3600_000).toISOString(),
  );
  const link = `${env.appUrl}/verify-email?token=${encodeURIComponent(token)}`;
  await notify(db, {
    userId: user.id,
    email: user.email,
    type: 'verify_email',
    subject: 'Confirm your PAHADI ROOTS account',
    body: `<p>Hello ${user.fullName || 'there'},</p><p>Please confirm your email address to finish setting up your account.</p>
      <p><a href="${link}" style="display:inline-block;background:#243D32;color:#F7F3EB;padding:12px 20px;text-decoration:none">Confirm email</a></p>
      <p style="font-size:13px;color:#6B6F68">If you did not create this account, you can ignore this message.</p>`,
    dedupeKey: `verify:${user.id}:${new Date().toISOString().slice(0, 10)}`,
  });
  return env.allowDevAuthHelpers && !env.smtp.configured ? link : null;
}

export function authRouter(db: Db): Router {
  const router = Router();

  router.post('/register', authLimiter(20), async (req, res) => {
    const input = parse(registerSchema, req.body);
    const email = normalizeEmail(input.email);
    const existing = queryOne<{ id: string }>(db, 'SELECT id FROM users WHERE email = ?', email);
    if (existing) {
      throw conflict('An account with that email already exists. Sign in or reset your password.', 'email_in_use');
    }
    const userId = newId('usr_');
    tx(db, () => {
      execute(db, 'INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)', userId, email, hashPassword(input.password));
      execute(
        db,
        'INSERT INTO profiles (id, full_name, marketing_consent) VALUES (?, ?, ?)',
        userId,
        input.fullName.trim(),
        input.marketingConsent ? 1 : 0,
      );
      execute(db, "INSERT INTO user_roles (user_id, role) VALUES (?, 'customer')", userId);
    });
    if (input.marketingConsent) {
      execute(
        db,
        `INSERT INTO newsletter_subscribers (id, email, consent_at, source) VALUES (?, ?, ?, 'registration')
         ON CONFLICT(email) DO UPDATE SET consent_at = excluded.consent_at, unsubscribed_at = NULL`,
        newId('nws_'),
        email,
        new Date().toISOString(),
      );
    }

    const token = createSession(db, userId);
    setSessionCookie(req, res, token);
    const cart = ensureCart(db, userId, (req.cookies as Record<string, string> | undefined)?.[CART_COOKIE] ?? null);
    setCartCookie(res, cart.token);
    const devVerifyUrl = await issueVerification(db, { id: userId, email, fullName: input.fullName });
    res.status(201).json({
      user: {
        id: userId,
        email,
        fullName: input.fullName,
        roles: ['customer'],
        sellerId: null,
        sellerStatus: null,
        emailVerified: false,
      },
      devVerifyUrl,
    });
  });

  router.get('/me', (req, res) => {
    res.json({ user: req.user ?? null });
  });

  router.post('/login', authLimiter(15), (req, res) => {
    const input = parse(loginSchema, req.body);
    const user = queryOne<{ id: string; email: string; password_hash: string; is_disabled: number; full_name: string }>(
      db,
      `SELECT u.id, u.email, u.password_hash, u.is_disabled, p.full_name
         FROM users u LEFT JOIN profiles p ON p.id = u.id WHERE u.email = ?`,
      normalizeEmail(input.email),
    );
    const valid = user ? verifyPassword(input.password, user.password_hash) : false;
    if (!user || !valid || user.is_disabled) {
      throw unauthorized('That email and password combination is not recognised.');
    }
    const token = createSession(db, user.id);
    setSessionCookie(req, res, token);
    const cart = ensureCart(db, user.id, (req.cookies as Record<string, string> | undefined)?.[CART_COOKIE] ?? null);
    setCartCookie(res, cart.token);
    res.json({ ok: true });
  });

  router.post('/logout', requireAuth, (req, res) => {
    destroySession(db, sessionToken(req));
    clearSessionCookie(req, res);
    res.json({ ok: true });
  });

  router.post('/verify-email', authLimiter(20), (req, res) => {
    const input = parse(z.object({ token: z.string().min(20).max(200) }), req.body);
    const row = queryOne<{ user_id: string }>(
      db,
      'SELECT user_id FROM email_verification_tokens WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?',
      sha256(input.token),
      new Date().toISOString(),
    );
    if (!row) throw badRequest('That confirmation link is invalid or has expired. Request a new one.');
    tx(db, () => {
      execute(db, 'UPDATE email_verification_tokens SET used_at = ? WHERE token_hash = ?', new Date().toISOString(), sha256(input.token));
      execute(db, 'UPDATE users SET email_verified = 1, updated_at = ? WHERE id = ?', new Date().toISOString(), row.user_id);
    });
    res.json({ ok: true });
  });

  router.post('/resend-verification', authLimiter(5), requireAuth, async (req, res) => {
    if (req.user!.emailVerified) {
      res.json({ ok: true, message: 'Your email is already confirmed.' });
      return;
    }
    const devVerifyUrl = await issueVerification(db, {
      id: req.user!.id,
      email: req.user!.email,
      fullName: req.user!.fullName,
    });
    res.json({ ok: true, devVerifyUrl });
  });

  router.post('/forgot-password', authLimiter(5), async (req, res) => {
    const input = parse(z.object({ email: emailSchema }), req.body);
    const user = queryOne<{ id: string; email: string; full_name: string }>(
      db,
      'SELECT u.id, u.email, p.full_name FROM users u LEFT JOIN profiles p ON p.id = u.id WHERE u.email = ?',
      input.email,
    );
    let devResetUrl: string | null = null;
    if (user) {
      const token = randomToken(32);
      execute(
        db,
        'INSERT INTO password_reset_tokens (token_hash, user_id, expires_at) VALUES (?, ?, ?)',
        sha256(token),
        user.id,
        new Date(Date.now() + 3600_000).toISOString(),
      );
      const link = `${env.appUrl}/reset-password?token=${encodeURIComponent(token)}`;
      await notify(db, {
        userId: user.id,
        email: user.email,
        type: 'password_reset',
        subject: 'Reset your PAHADI ROOTS password',
        body: `<p>We received a request to reset your password. This link expires in one hour.</p>
          <p><a href="${link}" style="display:inline-block;background:#243D32;color:#F7F3EB;padding:12px 20px;text-decoration:none">Choose a new password</a></p>
          <p style="font-size:13px;color:#6B6F68">If this wasn’t you, no action is needed.</p>`,
        dedupeKey: `reset:${user.id}:${Math.floor(Date.now() / 3600_000)}`,
      });
      if (env.allowDevAuthHelpers && !env.smtp.configured) devResetUrl = link;
    }
    res.json({
      ok: true,
      message: 'If that email is registered, a reset link has been sent.',
      ...(devResetUrl ? { devResetUrl } : {}),
    });
  });

  router.post('/reset-password', authLimiter(10), (req, res) => {
    const input = parse(
      z.object({ token: z.string().min(20).max(200), password: passwordSchema }),
      req.body,
    );
    const row = queryOne<{ user_id: string }>(
      db,
      'SELECT user_id FROM password_reset_tokens WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?',
      sha256(input.token),
      new Date().toISOString(),
    );
    if (!row) throw badRequest('That reset link is invalid or has expired. Request a new one.');
    tx(db, () => {
      execute(db, 'UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', hashPassword(input.password), new Date().toISOString(), row.user_id);
      execute(db, 'UPDATE password_reset_tokens SET used_at = ? WHERE token_hash = ?', new Date().toISOString(), sha256(input.token));
      execute(db, 'DELETE FROM sessions WHERE user_id = ?', row.user_id);
    });
    res.json({ ok: true, message: 'Password updated. Sign in with your new password.' });
  });

  // Dev-only helper: never exposed in production and clearly labelled in the UI.
  router.get('/dev/last-reset-link', requireAuth, (req, res) => {
    if (!env.allowDevAuthHelpers) throw badRequest('Not available.');
    const row = queryOne<{ token_hash: string }>(
      db,
      'SELECT token_hash FROM password_reset_tokens WHERE user_id = ? AND used_at IS NULL ORDER BY created_at DESC LIMIT 1',
      req.user!.id,
    );
    res.json({
      devNote: 'Raw reset tokens are hashed; use the link shown when the request was made.',
      hasPendingToken: Boolean(row),
      tokenPreview: row ? `${crypto.createHash('sha1').update(row.token_hash).digest('hex').slice(0, 8)}…` : null,
    });
  });

  return router;
}
