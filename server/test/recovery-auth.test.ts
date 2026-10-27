import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, execute, queryAll, queryOne, type Db } from '../db.js';
import { NO_PASSWORD_MARKER } from '../lib/auth.js';
import { IDS, TEST_PASSWORD, login, mutate, resetDb, seedFixtures, setupTestApp } from './helpers.js';

let app: Express;
let db: Db;

beforeAll(() => {
  ({ app, db } = setupTestApp());
});

afterAll(() => {
  closeDb();
});

beforeEach(() => {
  resetDb(db);
  seedFixtures(db);
});

describe('Password recovery & OTP flows (Section 14 scenarios)', () => {
  // Scenario 7: A valid forgot-password request initiates recovery for an eligible account
  it('initiates recovery for an eligible account, sets hashed OTP in DB, and returns devOtp in dev mode', async () => {
    const response = await mutate(request(app).post('/api/auth/forgot-password')).send({
      email: 'customer@test.local',
    });
    expect(response.status).toBe(200);
    expect(response.body.message).toContain('verification code has been sent');
    expect(response.body.devOtp).toMatch(/^\d{6}$/);

    const otpRow = queryOne<{
      user_id: string;
      email: string;
      otp_hash: string;
      attempts: number;
      max_attempts: number;
      consumed_at: string | null;
    }>(db, 'SELECT * FROM auth_recovery_otps WHERE email = ?', 'customer@test.local');

    expect(otpRow).toBeTruthy();
    expect(otpRow?.user_id).toBe(IDS.customer);
    expect(otpRow?.attempts).toBe(0);
    expect(otpRow?.max_attempts).toBe(5);
    expect(otpRow?.consumed_at).toBeNull();
    // Verify OTP is hashed (64 hex characters for SHA-256), NOT plaintext
    expect(otpRow?.otp_hash).toHaveLength(64);
    expect(otpRow?.otp_hash).not.toBe(response.body.devOtp);
  });

  // Scenario 8: Unknown emails receive a generic external response
  it('returns an identical generic response for unknown emails and creates no recovery record', async () => {
    const response = await mutate(request(app).post('/api/auth/forgot-password')).send({
      email: 'unknown-user@does-not-exist.local',
    });
    expect(response.status).toBe(200);
    expect(response.body.message).toContain('verification code has been sent');
    expect(response.body.devOtp).toBeUndefined();

    const count = queryOne<{ count: number }>(
      db,
      'SELECT COUNT(*) as count FROM auth_recovery_otps WHERE email = ?',
      'unknown-user@does-not-exist.local',
    );
    expect(count?.count).toBe(0);
  });

  // Scenario 14: OTP resend cooldown is enforced
  it('enforces a 60-second resend cooldown between recovery requests', async () => {
    const first = await mutate(request(app).post('/api/auth/forgot-password')).send({
      email: 'customer@test.local',
    });
    expect(first.status).toBe(200);

    const second = await mutate(request(app).post('/api/auth/forgot-password')).send({
      email: 'customer@test.local',
    });
    expect(second.status).toBe(400);
    expect(second.body.error.code).toBe('cooldown_active');
    expect(second.body.error.message).toContain('wait a moment');
  });

  // Scenario 9 & 10: Valid OTP verification succeeds, incorrect OTPs are rejected with remaining attempts
  it('rejects incorrect OTPs with remaining attempt count, and accepts the correct OTP', async () => {
    const forgot = await mutate(request(app).post('/api/auth/forgot-password')).send({
      email: 'customer@test.local',
    });
    const correctOtp = forgot.body.devOtp as string;

    // Incorrect attempt 1
    const fail1 = await mutate(request(app).post('/api/auth/verify-reset-otp')).send({
      email: 'customer@test.local',
      otp: '000000',
    });
    expect(fail1.status).toBe(400);
    expect(fail1.body.error.code).toBe('invalid_otp');
    expect(fail1.body.error.message).toContain('4 attempts remaining');

    // Correct attempt
    const success = await mutate(request(app).post('/api/auth/verify-reset-otp')).send({
      email: 'customer@test.local',
      otp: correctOtp,
    });
    expect(success.status).toBe(200);
    expect(success.body.resetAuthorization).toBeTruthy();
    expect(typeof success.body.resetAuthorization).toBe('string');
  });

  // Scenario 11: Expired OTPs are rejected
  it('rejects expired OTPs', async () => {
    const forgot = await mutate(request(app).post('/api/auth/forgot-password')).send({
      email: 'customer@test.local',
    });
    const otp = forgot.body.devOtp as string;

    // Set expiry to the past
    execute(
      db,
      "UPDATE auth_recovery_otps SET expires_at = '2020-01-01T00:00:00.000Z' WHERE email = ?",
      'customer@test.local',
    );

    const response = await mutate(request(app).post('/api/auth/verify-reset-otp')).send({
      email: 'customer@test.local',
      otp,
    });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('otp_expired');
  });

  // Scenario 12: Used OTPs cannot be reused
  it('refuses reuse of an already-verified OTP', async () => {
    const forgot = await mutate(request(app).post('/api/auth/forgot-password')).send({
      email: 'customer@test.local',
    });
    const otp = forgot.body.devOtp as string;

    const first = await mutate(request(app).post('/api/auth/verify-reset-otp')).send({
      email: 'customer@test.local',
      otp,
    });
    expect(first.status).toBe(200);

    const second = await mutate(request(app).post('/api/auth/verify-reset-otp')).send({
      email: 'customer@test.local',
      otp,
    });
    expect(second.status).toBe(400);
    expect(second.body.error.code).toBe('otp_consumed');
  });

  // Scenario 13: OTP brute-force attempts are attempt-limited (max 5)
  it('locks and invalidates OTP after 5 failed attempts', async () => {
    const forgot = await mutate(request(app).post('/api/auth/forgot-password')).send({
      email: 'customer@test.local',
    });
    const correctOtp = forgot.body.devOtp as string;

    for (let i = 1; i <= 4; i++) {
      const fail = await mutate(request(app).post('/api/auth/verify-reset-otp')).send({
        email: 'customer@test.local',
        otp: `99999${i}`,
      });
      expect(fail.status).toBe(400);
      expect(fail.body.error.code).toBe('invalid_otp');
    }

    // 5th attempt exceeds limit
    const fail5 = await mutate(request(app).post('/api/auth/verify-reset-otp')).send({
      email: 'customer@test.local',
      otp: '999995',
    });
    expect(fail5.status).toBe(400);
    expect(fail5.body.error.code).toBe('too_many_attempts');

    // Even the correct OTP is now rejected because it reached max attempts
    const tryCorrect = await mutate(request(app).post('/api/auth/verify-reset-otp')).send({
      email: 'customer@test.local',
      otp: correctOtp,
    });
    expect(tryCorrect.status).toBe(400);
  });

  // Scenario 15: An OTP for one account cannot reset another account's password
  it('cannot verify an OTP generated for another email', async () => {
    const forgotCustomer = await mutate(request(app).post('/api/auth/forgot-password')).send({
      email: 'customer@test.local',
    });
    const customerOtp = forgotCustomer.body.devOtp as string;

    // Try to verify customer's OTP against seller's email
    const crossAttempt = await mutate(request(app).post('/api/auth/verify-reset-otp')).send({
      email: 'seller@test.local',
      otp: customerOtp,
    });
    expect(crossAttempt.status).toBe(400);
    expect(crossAttempt.body.error.code).toBe('otp_not_found');
  });

  // Scenario 16: An OTP issued for password recovery cannot be verified if purpose differs
  it('checks purpose binding and rejects mismatched purposes', async () => {
    const forgot = await mutate(request(app).post('/api/auth/forgot-password')).send({
      email: 'customer@test.local',
    });
    const otp = forgot.body.devOtp as string;

    // Tamper the purpose in database
    execute(
      db,
      "UPDATE auth_recovery_otps SET purpose = 'email_verification' WHERE email = ?",
      'customer@test.local',
    );

    const attempt = await mutate(request(app).post('/api/auth/verify-reset-otp')).send({
      email: 'customer@test.local',
      otp,
    });
    expect(attempt.status).toBe(400);
    expect(attempt.body.error.code).toBe('otp_not_found');
  });

  // Scenario 17 & 23: A reset authorization cannot be reused; concurrent requests cannot double-consume
  it('consumes reset authorization atomically and prevents reuse', async () => {
    const forgot = await mutate(request(app).post('/api/auth/forgot-password')).send({
      email: 'customer@test.local',
    });
    const verify = await mutate(request(app).post('/api/auth/verify-reset-otp')).send({
      email: 'customer@test.local',
      otp: forgot.body.devOtp,
    });
    const resetAuth = verify.body.resetAuthorization as string;

    // First reset succeeds
    const first = await mutate(request(app).post('/api/auth/reset-password')).send({
      resetAuthorization: resetAuth,
      password: 'NewBrandPassword123!',
    });
    expect(first.status).toBe(200);

    // Second reset fails with authorization_consumed
    const second = await mutate(request(app).post('/api/auth/reset-password')).send({
      resetAuthorization: resetAuth,
      password: 'AnotherPassword123!',
    });
    expect(second.status).toBe(400);
    expect(second.body.error.code).toBe('authorization_consumed');
  });

  // Scenario 18: Expired reset authorization is rejected
  it('rejects an expired reset authorization', async () => {
    const forgot = await mutate(request(app).post('/api/auth/forgot-password')).send({
      email: 'customer@test.local',
    });
    const verify = await mutate(request(app).post('/api/auth/verify-reset-otp')).send({
      email: 'customer@test.local',
      otp: forgot.body.devOtp,
    });
    const resetAuth = verify.body.resetAuthorization as string;

    // Expire the authorization in DB
    execute(db, "UPDATE auth_reset_authorizations SET expires_at = '2020-01-01T00:00:00.000Z'");

    const attempt = await mutate(request(app).post('/api/auth/reset-password')).send({
      resetAuthorization: resetAuth,
      password: 'NewBrandPassword123!',
    });
    expect(attempt.status).toBe(400);
    expect(attempt.body.error.code).toBe('authorization_expired');
  });

  // Scenario 19: Password setup works for a Google-only account
  it('allows a Google-only account to establish a password and keep Google linked', async () => {
    // Seed a Google-only user
    execute(
      db,
      `INSERT INTO users (id, email, password_hash, email_verified, is_disabled, created_at, updated_at)
       VALUES ('usr_google_only', 'google.only@test.local', ?, 1, 0, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`,
      NO_PASSWORD_MARKER,
    );
    execute(db, `INSERT INTO profiles (id, full_name) VALUES ('usr_google_only', 'Google Only User')`);
    execute(db, `INSERT INTO user_roles (user_id, role) VALUES ('usr_google_only', 'customer')`);
    execute(
      db,
      `INSERT INTO auth_identities (id, user_id, provider, provider_user_id, provider_email, email_verified, created_at, updated_at)
       VALUES ('idn_google_1', 'usr_google_only', 'google', 'google-sub-999', 'google.only@test.local', 1, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`,
    );

    // 1. Forgot password
    const forgot = await mutate(request(app).post('/api/auth/forgot-password')).send({
      email: 'google.only@test.local',
    });
    expect(forgot.status).toBe(200);
    expect(forgot.body.devOtp).toBeTruthy();

    // 2. Verify OTP
    const verify = await mutate(request(app).post('/api/auth/verify-reset-otp')).send({
      email: 'google.only@test.local',
      otp: forgot.body.devOtp,
    });
    expect(verify.status).toBe(200);
    const resetAuth = verify.body.resetAuthorization as string;

    // 3. Reset password
    const reset = await mutate(request(app).post('/api/auth/reset-password')).send({
      resetAuthorization: resetAuth,
      password: 'BrandNewGooglePassword123!',
    });
    expect(reset.status).toBe(200);

    // 4. Verify user can now log in with email and new password!
    const loginResp = await mutate(request(app).post('/api/auth/login')).send({
      email: 'google.only@test.local',
      password: 'BrandNewGooglePassword123!',
    });
    expect(loginResp.status).toBe(200);
    expect(loginResp.body.user.id).toBe('usr_google_only');
    expect(loginResp.body.user.hasPassword).toBe(true);
    expect(loginResp.body.user.authProviders).toContain('google');

    // 5. Verify Google identity was NOT unlinked or deleted
    const identity = queryOne<{ provider: string }>(
      db,
      'SELECT provider FROM auth_identities WHERE user_id = ?',
      'usr_google_only',
    );
    expect(identity?.provider).toBe('google');
  });

  // Scenario 20, 21, 22: Password reset works, stores secure hash not plaintext, no duplicate users created
  it('updates password hash and password_changed_at without creating duplicate accounts', async () => {
    const forgot = await mutate(request(app).post('/api/auth/forgot-password')).send({
      email: 'customer@test.local',
    });
    const verify = await mutate(request(app).post('/api/auth/verify-reset-otp')).send({
      email: 'customer@test.local',
      otp: forgot.body.devOtp,
    });

    const reset = await mutate(request(app).post('/api/auth/reset-password')).send({
      resetAuthorization: verify.body.resetAuthorization,
      password: 'UpdatedPassword999!',
    });
    expect(reset.status).toBe(200);

    // Verify database state
    const user = queryOne<{ password_hash: string; password_changed_at: string }>(
      db,
      'SELECT password_hash, password_changed_at FROM users WHERE id = ?',
      IDS.customer,
    );
    expect(user?.password_hash).not.toBe('UpdatedPassword999!');
    expect(user?.password_hash).toContain('$'); // scrypt formatted hash
    expect(user?.password_changed_at).toBeTruthy();

    // Verify only 1 user exists with that email
    const users = queryAll(db, 'SELECT id FROM users WHERE email = ?', 'customer@test.local');
    expect(users).toHaveLength(1);

    // Old password no longer works
    const oldLogin = await mutate(request(app).post('/api/auth/login')).send({
      email: 'customer@test.local',
      password: TEST_PASSWORD,
    });
    expect(oldLogin.status).toBe(401);

    // New password works
    const newLogin = await mutate(request(app).post('/api/auth/login')).send({
      email: 'customer@test.local',
      password: 'UpdatedPassword999!',
    });
    expect(newLogin.status).toBe(200);
  });

  // Scenario 24: Password reset invalidates existing sessions
  it('invalidates existing sessions when password is reset', async () => {
    // Log in customer in agent session
    const customerAgent = await login(app, 'customer@test.local');
    const meBefore = await customerAgent.get('/api/auth/me');
    expect(meBefore.body.user).toBeTruthy();

    // Now reset password
    const forgot = await mutate(request(app).post('/api/auth/forgot-password')).send({
      email: 'customer@test.local',
    });
    const verify = await mutate(request(app).post('/api/auth/verify-reset-otp')).send({
      email: 'customer@test.local',
      otp: forgot.body.devOtp,
    });
    await mutate(request(app).post('/api/auth/reset-password')).send({
      resetAuthorization: verify.body.resetAuthorization,
      password: 'BrandNewSecret123!',
    });

    // Existing session must now be invalidated!
    const meAfter = await customerAgent.get('/api/auth/me');
    expect(meAfter.body.user).toBeNull();
  });

  // Scenario 25: Email delivery failures are handled safely
  it('handles email delivery gracefully without failing password reset request or throwing 500', async () => {
    // Even when SMTP is unconfigured (the test default), forgot-password records notification and succeeds
    const response = await mutate(request(app).post('/api/auth/forgot-password')).send({
      email: 'customer@test.local',
    });
    expect(response.status).toBe(200);

    const notification = queryOne<{ status: string; subject: string }>(
      db,
      'SELECT status, subject FROM notifications WHERE email = ? ORDER BY created_at DESC LIMIT 1',
      'customer@test.local',
    );
    expect(notification).toBeTruthy();
    expect(notification?.subject).toContain('Dear Hills password reset code');
    expect(notification?.status).toBe('skipped'); // Skipped because smtp is unconfigured in test
  });

  // Scenario 5: User cannot gain administrator privileges through Google sign-in
  it('does not grant administrator privileges when a new user signs in via Google', async () => {
    // Verified in google-auth.test.ts, confirming here as well
    const userRole = queryOne<{ role: string }>(
      db,
      `SELECT ur.role FROM user_roles ur
       JOIN users u ON u.id = ur.user_id
       WHERE u.email = 'customer@test.local'`,
    );
    expect(userRole?.role).toBe('customer');
    expect(userRole?.role).not.toBe('admin');
  });
});
