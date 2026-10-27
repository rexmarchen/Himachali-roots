import crypto from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { env } from '../env.js';
import { execute, queryOne, tx, type Db } from '../db.js';
import {
  clearSessionCookie,
  createSession,
  destroySession,
  getSessionUser,
  hasUsablePassword,
  hashPassword,
  NO_PASSWORD_MARKER,
  normalizeEmail,
  requireAuth,
  rotateSession,
  sessionToken,
  setSessionCookie,
  sha256,
  verifyPassword,
} from '../lib/auth.js';
import { verifyGoogleIdToken as verifyGoogleIdTokenWithGoogle, type GoogleProfile } from '../lib/google.js';
import { audit } from '../lib/audit.js';
import { parse, unauthorized, badRequest, conflict, forbidden, AppError } from '../lib/http.js';
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

const googleSchema = z.object({
  credential: z.string().min(20, 'Google did not return a usable credential.').max(8192),
});

const googleLinkSchema = z.object({
  linkToken: z.string().min(20, 'Start Google sign-in again.').max(200),
  password: z.string().min(1, 'Enter your account password.').max(200),
});

const LINK_CHALLENGE_MINUTES = 10;
// A real scrypt comparison runs even when the email is unknown, so response
// timing does not reveal whether an account exists.
const DUMMY_PASSWORD_HASH = hashPassword('not-a-real-account-password-0');

interface AuthUserRow {
  id: string;
  email: string;
  password_hash: string;
  is_disabled: number;
  email_verified: number;
  full_name: string;
}

interface IdentityRow {
  id: string;
  user_id: string;
  provider_user_id: string;
}

interface LinkChallengeRow {
  provider_user_id: string;
  provider_email: string;
  email_verified: number;
  display_name: string | null;
  avatar_url: string | null;
}

export interface AuthRouterDeps {
  /** Injected so the verification boundary can be tested without network calls. */
  verifyGoogleIdToken: (credential: string) => Promise<GoogleProfile>;
}

function findUserByEmail(db: Db, email: string): AuthUserRow | undefined {
  return queryOne<AuthUserRow>(
    db,
    `SELECT u.id, u.email, u.password_hash, u.is_disabled, u.email_verified,
            COALESCE(p.full_name, '') AS full_name
       FROM users u LEFT JOIN profiles p ON p.id = u.id
      WHERE u.email = ?`,
    email,
  );
}

function findIdentity(db: Db, providerUserId: string): IdentityRow | undefined {
  return queryOne<IdentityRow>(
    db,
    "SELECT id, user_id, provider_user_id FROM auth_identities WHERE provider = 'google' AND provider_user_id = ?",
    providerUserId,
  );
}

function issueLinkChallenge(db: Db, profile: GoogleProfile): string {
  const token = randomToken(32);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + LINK_CHALLENGE_MINUTES * 60_000).toISOString();
  execute(db, 'DELETE FROM auth_link_challenges WHERE expires_at <= ? OR used_at IS NOT NULL', now.toISOString());
  execute(
    db,
    "DELETE FROM auth_link_challenges WHERE provider = 'google' AND provider_user_id = ? AND used_at IS NULL",
    profile.sub,
  );
  execute(
    db,
    `INSERT INTO auth_link_challenges
       (token_hash, provider, provider_user_id, provider_email, email_verified, display_name, avatar_url, expires_at)
     VALUES (?, 'google', ?, ?, ?, ?, ?, ?)`,
    sha256(token),
    profile.sub,
    profile.email,
    profile.emailVerified ? 1 : 0,
    profile.name,
    profile.picture,
    expiresAt,
  );
  return token;
}

function recordGoogleIdentity(db: Db, userId: string, profile: GoogleProfile): void {
  const now = new Date().toISOString();
  execute(
    db,
    `INSERT INTO auth_identities
       (id, user_id, provider, provider_user_id, provider_email, email_verified, display_name, avatar_url, last_sign_in_at)
     VALUES (?, ?, 'google', ?, ?, ?, ?, ?, ?)`,
    newId('aid_'),
    userId,
    profile.sub,
    profile.email,
    profile.emailVerified ? 1 : 0,
    profile.name,
    profile.picture,
    now,
  );
}

function touchGoogleIdentity(db: Db, userId: string, profile: GoogleProfile): void {
  execute(
    db,
    `UPDATE auth_identities
        SET provider_email = ?, email_verified = ?, display_name = ?, avatar_url = ?,
            last_sign_in_at = ?, updated_at = ?
      WHERE provider = 'google' AND user_id = ?`,
    profile.email,
    profile.emailVerified ? 1 : 0,
    profile.name,
    profile.picture,
    new Date().toISOString(),
    new Date().toISOString(),
    userId,
  );
}

function attachCart(db: Db, req: Request, res: Response, userId: string): void {
  const cart = ensureCart(db, userId, (req.cookies as Record<string, string> | undefined)?.[CART_COOKIE] ?? null);
  setCartCookie(res, cart.token);
}

function signInResponse(db: Db, req: Request, res: Response, userId: string) {
  rotateSession(db, req, res, userId);
  attachCart(db, req, res, userId);
  return { ok: true, user: getSessionUser(db, userId) };
}

function disabledError() {
  return forbidden('This account is disabled. Contact support if you believe this is a mistake.');
}

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
  return env.allowDevAuthHelpers && !env.email.configured ? link : null;
}

export function authRouter(db: Db, deps: Partial<AuthRouterDeps> = {}): Router {
  const router = Router();
  const verifyGoogle = deps.verifyGoogleIdToken ?? verifyGoogleIdTokenWithGoogle;

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
      user: getSessionUser(db, userId),
      devVerifyUrl,
    });
  });

  router.get('/me', (req, res) => {
    res.json({ user: req.user ?? null });
  });

  router.post('/login', authLimiter(15), (req, res) => {
    const input = parse(loginSchema, req.body);
    const user = findUserByEmail(db, normalizeEmail(input.email));
    // Provider-only accounts have no usable password; compare against a dummy
    // hash so their response timing matches an unknown email.
    const storedHash = user && hasUsablePassword(user.password_hash) ? user.password_hash : DUMMY_PASSWORD_HASH;
    const valid = verifyPassword(input.password, storedHash) && Boolean(user && hasUsablePassword(user.password_hash));
    if (!user || !valid) {
      throw unauthorized('That email and password combination is not recognised.');
    }
    if (user.is_disabled) throw disabledError();
    const body = signInResponse(db, req, res, user.id);
    res.json(body);
  });

  router.post('/logout', (req, res) => {
    // Clear the cookie even when the session is already expired so a browser
    // cannot keep sending a dead identifier.
    destroySession(db, sessionToken(req));
    clearSessionCookie(req, res);
    res.json({ ok: true });
  });

  /**
   * Google Identity Services sign-in.
   *
   * The credential is a signed ID token verified server-side. A matching
   * provider subject logs the user in. A matching email with no linked subject
   * does NOT merge accounts: it returns a short-lived challenge and the client
   * must prove ownership of the existing password before linking.
   */
  router.post('/google', authLimiter(20), async (req, res) => {
    const input = parse(googleSchema, req.body);
    const profile = await verifyGoogle(input.credential);

    const identity = findIdentity(db, profile.sub);
    if (identity) {
      const user = queryOne<AuthUserRow>(
        db,
        `SELECT u.id, u.email, u.password_hash, u.is_disabled, u.email_verified,
                COALESCE(p.full_name, '') AS full_name
           FROM users u LEFT JOIN profiles p ON p.id = u.id WHERE u.id = ?`,
        identity.user_id,
      );
      if (!user) throw unauthorized();
      if (user.is_disabled) throw disabledError();
      touchGoogleIdentity(db, user.id, profile);
      const body = signInResponse(db, req, res, user.id);
      audit(db, { id: user.id, email: user.email }, 'auth.google.signin', 'user', user.id);
      res.json(body);
      return;
    }

    const existing = findUserByEmail(db, profile.email);
    if (existing) {
      const linkToken = issueLinkChallenge(db, profile);
      res.json({
        ok: false,
        linkingRequired: true,
        linkToken,
        email: profile.email,
        message: 'An account already uses this email address. Confirm your existing password to link Google sign-in.',
      });
      return;
    }

    const userId = newId('usr_');
    const fullName = profile.name || profile.email.split('@')[0];
    let token: string;
    try {
      token = tx(db, () => {
        execute(
          db,
          'INSERT INTO users (id, email, password_hash, email_verified) VALUES (?, ?, ?, ?)',
          userId,
          profile.email,
          NO_PASSWORD_MARKER,
          profile.emailVerified ? 1 : 0,
        );
        execute(db, 'INSERT INTO profiles (id, full_name) VALUES (?, ?)', userId, fullName.slice(0, 120));
        execute(db, "INSERT INTO user_roles (user_id, role) VALUES (?, 'customer')", userId);
        recordGoogleIdentity(db, userId, profile);
        return createSession(db, userId);
      });
    } catch (error) {
      // Concurrent first sign-ins can race on the email or subject uniqueness.
      // Re-read the winner and issue a session for the same user.
      const raced = findIdentity(db, profile.sub);
      if (raced) {
        const racedUser = queryOne<AuthUserRow>(
          db,
          `SELECT u.id, u.email, u.password_hash, u.is_disabled, u.email_verified,
                  COALESCE(p.full_name, '') AS full_name
             FROM users u LEFT JOIN profiles p ON p.id = u.id WHERE u.id = ?`,
          raced.user_id,
        );
        if (!racedUser) throw error;
        if (racedUser.is_disabled) throw disabledError();
        const body = signInResponse(db, req, res, racedUser.id);
        res.json(body);
        return;
      }
      const racedUser = findUserByEmail(db, profile.email);
      if (racedUser) {
        const linkToken = issueLinkChallenge(db, profile);
        res.json({
          ok: false,
          linkingRequired: true,
          linkToken,
          email: profile.email,
          message: 'An account already uses this email address. Confirm your existing password to link Google sign-in.',
        });
        return;
      }
      throw error;
    }

    destroySession(db, sessionToken(req));
    setSessionCookie(req, res, token);
    attachCart(db, req, res, userId);
    audit(db, { id: userId, email: profile.email }, 'auth.google.register', 'user', userId);
    res.status(201).json({ ok: true, user: getSessionUser(db, userId), linkingRequired: false });
  });

  /** Complete explicit linking by proving ownership of the existing password. */
  router.post('/google/link', authLimiter(10), (req, res) => {
    const input = parse(googleLinkSchema, req.body);
    const now = new Date().toISOString();
    const challenge = queryOne<LinkChallengeRow>(
      db,
      `SELECT provider_user_id, provider_email, email_verified, display_name, avatar_url
         FROM auth_link_challenges
        WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?`,
      sha256(input.linkToken),
      now,
    );
    if (!challenge) {
      throw badRequest('That linking request has expired. Start Google sign-in again.');
    }

    const user = findUserByEmail(db, challenge.provider_email);
    if (!user || user.is_disabled) {
      throw badRequest('That linking request is no longer valid. Start again.');
    }
    if (!verifyPassword(input.password, user.password_hash)) {
      throw unauthorized('That password is not correct. Linking was not completed.');
    }

    const linkedSubject = findIdentity(db, challenge.provider_user_id);
    if (linkedSubject && linkedSubject.user_id !== user.id) {
      throw conflict('That Google account is already linked to a different account.', 'google_already_linked');
    }
    const linkedUser = queryOne<{ id: string }>(
      db,
      "SELECT id FROM auth_identities WHERE provider = 'google' AND user_id = ?",
      user.id,
    );
    if (linkedUser) {
      throw conflict('A different Google account is already linked to this account.', 'google_account_has_identity');
    }

    const profile: GoogleProfile = {
      sub: challenge.provider_user_id,
      email: challenge.provider_email,
      emailVerified: challenge.email_verified === 1,
      name: challenge.display_name,
      picture: challenge.avatar_url,
    };
    const token = tx(db, () => {
      execute(
        db,
        'UPDATE auth_link_challenges SET used_at = ? WHERE token_hash = ?',
        now,
        sha256(input.linkToken),
      );
      recordGoogleIdentity(db, user.id, profile);
      execute(
        db,
        'UPDATE users SET email_verified = 1, updated_at = ? WHERE id = ?',
        now,
        user.id,
      );
      return createSession(db, user.id);
    });
    destroySession(db, sessionToken(req));
    setSessionCookie(req, res, token);
    attachCart(db, req, res, user.id);
    audit(db, { id: user.id, email: user.email }, 'auth.google.link', 'user', user.id);
    res.json({ ok: true, user: getSessionUser(db, user.id), linkingRequired: false });
  });

  /** Remove Google sign-in. A usable password must remain as a fallback. */
  router.post('/google/unlink', authLimiter(10), requireAuth, (req, res) => {
    const input = parse(z.object({ password: z.string().min(1).max(200) }), req.body);
    const user = queryOne<{ password_hash: string }>(db, 'SELECT password_hash FROM users WHERE id = ?', req.user!.id);
    if (!user || !hasUsablePassword(user.password_hash)) {
      throw badRequest('Set a password before removing Google sign-in, so you cannot lose access to the account.');
    }
    if (!verifyPassword(input.password, user.password_hash)) {
      throw unauthorized('That password is not correct.');
    }
    const identity = queryOne<{ id: string }>(
      db,
      "SELECT id FROM auth_identities WHERE provider = 'google' AND user_id = ?",
      req.user!.id,
    );
    if (!identity) throw badRequest('Google sign-in is not linked to this account.');
    execute(db, 'DELETE FROM auth_identities WHERE id = ?', identity.id);
    audit(db, { id: req.user!.id, email: req.user!.email }, 'auth.google.unlink', 'user', req.user!.id);
    res.json({ ok: true, user: getSessionUser(db, req.user!.id) });
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

  const OTP_EXPIRY_MINUTES = 5;
  const OTP_COOLDOWN_SECONDS = 60;
  const OTP_MAX_ATTEMPTS = 5;
  const RESET_AUTH_MINUTES = 15;

  function hashOtp(userId: string, otp: string): string {
    return sha256(`recovery_otp:${userId}:${otp}`);
  }

  function recoveryError(code: string, message: string) {
    return new AppError(400, code, message);
  }

  router.post('/forgot-password', authLimiter(5), async (req, res) => {
    const input = parse(z.object({ email: emailSchema }), req.body);
    const email = normalizeEmail(input.email);
    const user = queryOne<{ id: string; email: string; full_name: string; is_disabled: number }>(
      db,
      `SELECT u.id, u.email, COALESCE(p.full_name, '') AS full_name, u.is_disabled FROM users u LEFT JOIN profiles p ON p.id = u.id WHERE u.email = ?`,
      email,
    );
    let devOtp: string | null = null;
    let devResetUrl: string | null = null;

    if (user && !user.is_disabled) {
      const now = new Date();
      const nowIso = now.toISOString();

      // Check 60-second resend cooldown on active OTP
      const recent = queryOne<{ resend_available_at: string }>(
        db,
        `SELECT resend_available_at FROM auth_recovery_otps
          WHERE user_id = ? AND purpose = 'password_reset' AND consumed_at IS NULL AND resend_available_at > ?
          ORDER BY created_at DESC LIMIT 1`,
        user.id,
        nowIso,
      );
      if (recent) {
        throw recoveryError('cooldown_active', 'Please wait a moment before requesting another verification code.');
      }

      // Invalidate previous unconsumed OTPs for this account
      execute(
        db,
        `UPDATE auth_recovery_otps SET consumed_at = ? WHERE user_id = ? AND purpose = 'password_reset' AND consumed_at IS NULL`,
        nowIso,
        user.id,
      );

      // Generate cryptographically secure 6-digit OTP
      const otp = String(crypto.randomInt(100000, 1000000));
      const otpId = newId('otp_');
      const otpHash = hashOtp(user.id, otp);
      const expiresAt = new Date(now.getTime() + OTP_EXPIRY_MINUTES * 60_000).toISOString();
      const resendAt = new Date(now.getTime() + OTP_COOLDOWN_SECONDS * 1000).toISOString();

      execute(
        db,
        `INSERT INTO auth_recovery_otps
           (id, user_id, email, purpose, otp_hash, attempts, max_attempts, expires_at, resend_available_at)
         VALUES (?, ?, ?, 'password_reset', ?, 0, ?, ?, ?)`,
        otpId,
        user.id,
        user.email,
        otpHash,
        OTP_MAX_ATTEMPTS,
        expiresAt,
        resendAt,
      );

      // Backwards-compatible legacy reset link
      const legacyToken = randomToken(32);
      execute(
        db,
        'INSERT INTO password_reset_tokens (token_hash, user_id, expires_at) VALUES (?, ?, ?)',
        sha256(legacyToken),
        user.id,
        new Date(now.getTime() + 3600_000).toISOString(),
      );
      const link = `${env.appUrl}/reset-password?token=${encodeURIComponent(legacyToken)}`;

      await notify(db, {
        userId: user.id,
        email: user.email,
        type: 'password_reset_otp',
        subject: `Your Dear Hills password reset code: ${otp}`,
        body: `<div style="font-family:sans-serif;max-width:540px;color:#243D32">
          <h2 style="font-size:22px;color:#243D32;margin-bottom:12px">Dear Hills Account Recovery</h2>
          <p>Hello ${user.full_name || 'there'},</p>
          <p>We received a request to reset your password. Use the verification code below:</p>
          <div style="background:#F7F3EB;border:1px solid #D9D2C5;padding:16px;text-align:center;margin:20px 0">
            <span style="font-family:monospace;font-size:32px;font-weight:bold;letter-spacing:6px;color:#243D32">${otp}</span>
          </div>
          <p style="font-size:13px;color:#666">This verification code expires in <strong>5 minutes</strong>. If you did not make this request, you can safely ignore this email.</p>
        </div>`,
        dedupeKey: `otp:${user.id}:${nowIso.slice(0, 16)}`,
      });

      if (env.allowDevAuthHelpers || env.isTest) {
        devOtp = otp;
        if (!env.email.configured) devResetUrl = link;
      }
    }

    res.json({
      ok: true,
      message: 'If that email is registered, a 6-digit verification code has been sent.',
      ...(devOtp ? { devOtp } : {}),
      ...(devResetUrl ? { devResetUrl } : {}),
    });
  });

  router.post('/verify-reset-otp', authLimiter(10), (req, res) => {
    const input = parse(
      z.object({
        email: emailSchema,
        otp: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit verification code.'),
      }),
      req.body,
    );
    const email = normalizeEmail(input.email);
    const user = queryOne<{ id: string; email: string; is_disabled: number }>(
      db,
      'SELECT id, email, is_disabled FROM users WHERE email = ?',
      email,
    );
    if (!user || user.is_disabled) {
      throw recoveryError('otp_not_found', 'That verification code is invalid or has expired.');
    }

    const nowIso = new Date().toISOString();
    const record = queryOne<{
      id: string;
      user_id: string;
      otp_hash: string;
      attempts: number;
      max_attempts: number;
      expires_at: string;
      consumed_at: string | null;
    }>(
      db,
      `SELECT id, user_id, otp_hash, attempts, max_attempts, expires_at, consumed_at
         FROM auth_recovery_otps
        WHERE user_id = ? AND purpose = 'password_reset'
        ORDER BY created_at DESC LIMIT 1`,
      user.id,
    );

    if (!record) {
      throw recoveryError('otp_not_found', 'No verification code request was found for this account.');
    }

    if (record.consumed_at) {
      throw recoveryError('otp_consumed', 'That verification code has already been used. Please request a new code.');
    }

    if (record.expires_at <= nowIso) {
      throw recoveryError('otp_expired', 'That verification code has expired. Please request a new code.');
    }

    if (record.attempts >= record.max_attempts) {
      execute(db, 'UPDATE auth_recovery_otps SET consumed_at = ? WHERE id = ?', nowIso, record.id);
      throw recoveryError('too_many_attempts', 'Too many incorrect attempts. Please request a new code.');
    }

    const expectedHash = hashOtp(user.id, input.otp);
    const isMatch = crypto.timingSafeEqual(Buffer.from(record.otp_hash), Buffer.from(expectedHash));

    if (!isMatch) {
      const newAttempts = record.attempts + 1;
      execute(db, 'UPDATE auth_recovery_otps SET attempts = ? WHERE id = ?', newAttempts, record.id);
      const remaining = record.max_attempts - newAttempts;
      if (remaining <= 0) {
        execute(db, 'UPDATE auth_recovery_otps SET consumed_at = ? WHERE id = ?', nowIso, record.id);
        throw recoveryError('too_many_attempts', 'Too many incorrect attempts. Please request a new code.');
      }
      throw recoveryError('invalid_otp', `Incorrect code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`);
    }

    // Atomic OTP consumption and issue of short-lived reset authorization
    const resetAuthorization = randomToken(32);
    const authExpiresAt = new Date(Date.now() + RESET_AUTH_MINUTES * 60_000).toISOString();

    tx(db, () => {
      execute(db, 'UPDATE auth_recovery_otps SET consumed_at = ? WHERE id = ?', nowIso, record.id);
      execute(
        db,
        `INSERT INTO auth_reset_authorizations (token_hash, user_id, purpose, expires_at)
         VALUES (?, ?, 'password_reset', ?)`,
        sha256(resetAuthorization),
        user.id,
        authExpiresAt,
      );
    });

    audit(db, { id: user.id, email: user.email }, 'auth.otp.verified', 'user', user.id);
    res.json({
      ok: true,
      message: 'Verification code confirmed.',
      resetAuthorization,
    });
  });

  router.post('/reset-password', authLimiter(10), async (req, res) => {
    const input = parse(
      z
        .object({
          resetAuthorization: z.string().min(20).max(200).optional(),
          token: z.string().min(20).max(200).optional(),
          password: passwordSchema,
          confirmPassword: z.string().optional(),
        })
        .refine((data) => data.resetAuthorization || data.token, {
          message: 'Reset authorization token is required.',
          path: ['resetAuthorization'],
        })
        .refine((data) => !data.confirmPassword || data.password === data.confirmPassword, {
          message: 'The two passwords do not match.',
          path: ['confirmPassword'],
        }),
      req.body,
    );

    const rawToken = input.resetAuthorization || input.token!;
    const tokenHash = sha256(rawToken);
    const nowIso = new Date().toISOString();

    const authRow = queryOne<{ user_id: string; used_at: string | null; expires_at: string }>(
      db,
      `SELECT user_id, used_at, expires_at FROM auth_reset_authorizations
        WHERE token_hash = ? AND purpose = 'password_reset'
        ORDER BY created_at DESC LIMIT 1`,
      tokenHash,
    );

    let userId: string | undefined;
    let isAuthTable = false;

    if (authRow) {
      if (authRow.used_at) {
        throw recoveryError('authorization_consumed', 'That reset authorization has already been used. Please restart recovery.');
      }
      if (authRow.expires_at <= nowIso) {
        throw recoveryError('authorization_expired', 'That reset authorization has expired. Please restart recovery.');
      }
      userId = authRow.user_id;
      isAuthTable = true;
    }

    if (!userId) {
      const legacyRow = queryOne<{ user_id: string; used_at: string | null; expires_at: string }>(
        db,
        'SELECT user_id, used_at, expires_at FROM password_reset_tokens WHERE token_hash = ? ORDER BY expires_at DESC LIMIT 1',
        tokenHash,
      );
      if (legacyRow) {
        if (legacyRow.used_at) {
          throw recoveryError('authorization_consumed', 'That reset link has already been used.');
        }
        if (legacyRow.expires_at <= nowIso) {
          throw recoveryError('authorization_expired', 'That reset link has expired.');
        }
        userId = legacyRow.user_id;
      }
    }

    if (!userId) {
      throw recoveryError('invalid_authorization', 'That reset authorization is invalid or has expired. Please restart recovery.');
    }

    tx(db, () => {
      execute(
        db,
        'UPDATE users SET password_hash = ?, password_changed_at = ?, updated_at = ? WHERE id = ?',
        hashPassword(input.password),
        nowIso,
        nowIso,
        userId,
      );
      if (isAuthTable) {
        execute(db, 'UPDATE auth_reset_authorizations SET used_at = ? WHERE token_hash = ?', nowIso, tokenHash);
      } else {
        execute(db, 'UPDATE password_reset_tokens SET used_at = ? WHERE token_hash = ?', nowIso, tokenHash);
      }
      // Invalidate all active sessions for this user
      execute(db, 'DELETE FROM sessions WHERE user_id = ?', userId);
    });

    const user = queryOne<{ email: string; full_name: string }>(
      db,
      `SELECT u.email, COALESCE(p.full_name, '') AS full_name FROM users u LEFT JOIN profiles p ON p.id = u.id WHERE u.id = ?`,
      userId,
    );
    if (user) {
      await notify(db, {
        userId,
        email: user.email,
        type: 'password_changed',
        subject: 'Your Dear Hills password has been changed',
        body: `<p>Hello ${user.full_name || 'there'},</p>
          <p>The password for your Dear Hills account was recently updated. All existing sessions were signed out for security.</p>
          <p>If you did not make this change, please contact our support team immediately.</p>`,
        dedupeKey: `pwd_changed:${userId}:${nowIso.slice(0, 13)}`,
      });
    }

    audit(db, { id: userId, email: user?.email ?? '' }, 'auth.password.reset', 'user', userId);
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
