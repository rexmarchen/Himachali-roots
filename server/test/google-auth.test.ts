import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, execute, queryAll, queryOne, type Db } from '../db.js';
import { NO_PASSWORD_MARKER, SESSION_COOKIE } from '../lib/auth.js';
import { profileFromClaims, type GoogleProfile } from '../lib/google.js';
import { AppError } from '../lib/http.js';
import { IDS, TEST_PASSWORD, login, mutate, resetDb, seedFixtures, setupTestApp } from './helpers.js';

const GOOGLE_CLIENT_ID = 'test-client.apps.googleusercontent.com';

let app: Express;
let db: Db;

const profiles: Record<string, GoogleProfile> = {
  'fake-google-credential-new-0001': {
    sub: 'google-sub-new-0001',
    email: 'new.google@test.local',
    emailVerified: true,
    name: 'New Google Customer',
    picture: 'https://example.test/avatar.png',
  },
  'fake-google-credential-returning-0002': {
    sub: 'google-sub-return-0002',
    email: 'returning.google@test.local',
    emailVerified: true,
    name: 'Returning Google Customer',
    picture: null,
  },
  'fake-google-credential-existing-0003': {
    sub: 'google-sub-existing-0003',
    email: 'customer@test.local',
    emailVerified: true,
    name: 'Existing Customer',
    picture: null,
  },
  'fake-google-credential-second-0004': {
    sub: 'google-sub-second-0004',
    email: 'customer@test.local',
    emailVerified: true,
    name: 'Second Google Identity',
    picture: null,
  },
};

async function fakeVerify(credential: string): Promise<GoogleProfile> {
  if (credential === 'invalid-google-token') {
    throw new AppError(401, 'google_token_invalid', 'That Google sign-in could not be verified.');
  }
  const profile = profiles[credential];
  if (!profile) throw new AppError(401, 'google_token_invalid', 'That Google sign-in could not be verified.');
  return profile;
}

function cookieFrom(response: { headers: Record<string, unknown> }): string {
  const raw = response.headers['set-cookie'];
  const joined = Array.isArray(raw) ? raw.join('; ') : String(raw ?? '');
  const match = joined.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));
  return match ? `${SESSION_COOKIE}=${match[1]}` : '';
}

function googleSignIn(agent: ReturnType<typeof request.agent>, credential: string) {
  return mutate(agent.post('/api/auth/google')).send({ credential });
}

beforeAll(() => {
  ({ app, db } = setupTestApp({ verifyGoogleIdToken: fakeVerify }));
});

afterAll(() => {
  closeDb();
});

beforeEach(() => {
  resetDb(db);
  seedFixtures(db);
});

describe('Google ID-token claim validation', () => {
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: 'https://accounts.google.com',
    aud: GOOGLE_CLIENT_ID,
    exp: now + 300,
    sub: 'google-sub-claims-01',
    email: 'Claims@Example.test',
    email_verified: true,
    name: 'Claims Person',
  };

  it('normalises a valid verified profile', () => {
    const profile = profileFromClaims(claims, GOOGLE_CLIENT_ID);
    expect(profile.email).toBe('claims@example.test');
    expect(profile.sub).toBe(claims.sub);
    expect(profile.emailVerified).toBe(true);
  });

  it('rejects the wrong audience', () => {
    expect(() => profileFromClaims(claims, 'other-client.apps.googleusercontent.com')).toThrow();
  });

  it('rejects the wrong issuer', () => {
    expect(() => profileFromClaims({ ...claims, iss: 'https://evil.example' }, GOOGLE_CLIENT_ID)).toThrow();
  });

  it('rejects an expired token', () => {
    expect(() => profileFromClaims({ ...claims, exp: now - 1 }, GOOGLE_CLIENT_ID)).toThrow();
  });

  it('rejects an unverified email', () => {
    try {
      profileFromClaims({ ...claims, email_verified: false }, GOOGLE_CLIENT_ID);
      throw new Error('expected rejection');
    } catch (error) {
      expect((error as { status: number }).status).toBe(403);
      expect((error as { code: string }).code).toBe('google_email_unverified');
    }
  });

  it('rejects a token without a stable subject or email', () => {
    expect(() => profileFromClaims({ ...claims, sub: '' }, GOOGLE_CLIENT_ID)).toThrow();
    expect(() => profileFromClaims({ ...claims, email: undefined }, GOOGLE_CLIENT_ID)).toThrow();
  });
});

describe('Google sign-in', () => {
  it('creates one customer on first sign-in and establishes a session', async () => {
    const agent = request.agent(app);
    const response = await googleSignIn(agent, 'fake-google-credential-new-0001');
    expect(response.status).toBe(201);
    expect(response.body.user.email).toBe('new.google@test.local');
    expect(response.body.user.roles).toEqual(['customer']);
    expect(response.body.user.hasPassword).toBe(false);
    expect(response.body.user.authProviders).toEqual(['google']);
    expect(cookieFrom(response)).toContain(`${SESSION_COOKIE}=`);

    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe('new.google@test.local');

    const user = queryOne<{ password_hash: string; email_verified: number }>(
      db,
      'SELECT password_hash, email_verified FROM users WHERE email = ?',
      'new.google@test.local',
    );
    expect(user?.password_hash).toBe(NO_PASSWORD_MARKER);
    expect(user?.email_verified).toBe(1);

    const identities = queryAll<{ provider: string; provider_user_id: string }>(
      db,
      'SELECT provider, provider_user_id FROM auth_identities',
    );
    expect(identities).toHaveLength(1);
    expect(identities[0]).toMatchObject({ provider: 'google', provider_user_id: 'google-sub-new-0001' });
  });

  it('signs in a returning user by Google subject, not by email', async () => {
    const first = request.agent(app);
    const created = await googleSignIn(first, 'fake-google-credential-new-0001');
    const userId = created.body.user.id as string;

    const second = request.agent(app);
    const again = await googleSignIn(second, 'fake-google-credential-new-0001');
    expect(again.status).toBe(200);
    expect(again.body.user.id).toBe(userId);

    const users = queryAll<{ id: string }>(db, 'SELECT id FROM users WHERE email = ?', 'new.google@test.local');
    expect(users).toHaveLength(1);
  });

  it('handles concurrent first-time sign-ins without duplicate accounts', async () => {
    const [a, b] = await Promise.all([
      googleSignIn(request.agent(app), 'fake-google-credential-new-0001'),
      googleSignIn(request.agent(app), 'fake-google-credential-new-0001'),
    ]);
    expect([a.status, b.status].every((status) => status === 200 || status === 201)).toBe(true);

    const users = queryAll<{ id: string }>(db, 'SELECT id FROM users WHERE email = ?', 'new.google@test.local');
    const identities = queryAll<{ id: string }>(db, 'SELECT id FROM auth_identities WHERE provider_user_id = ?', 'google-sub-new-0001');
    expect(users).toHaveLength(1);
    expect(identities).toHaveLength(1);
  });

  it('refuses sign-in for a disabled account', async () => {
    const agent = request.agent(app);
    const created = await googleSignIn(agent, 'fake-google-credential-new-0001');
    execute(db, 'UPDATE users SET is_disabled = 1 WHERE id = ?', created.body.user.id);
    const response = await googleSignIn(request.agent(app), 'fake-google-credential-new-0001');
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('forbidden');
  });

  it('rejects an invalid credential', async () => {
    const response = await googleSignIn(request.agent(app), 'invalid-google-token');
    expect(response.status).toBe(401);
  });

  it('refuses password login for a Google-only account', async () => {
    await googleSignIn(request.agent(app), 'fake-google-credential-new-0001');
    const response = await mutate(request(app).post('/api/auth/login')).send({
      email: 'new.google@test.local',
      password: 'Anything123!',
    });
    expect(response.status).toBe(401);
  });
});

describe('explicit account linking', () => {
  it('does not merge a matching email without proof of the existing password', async () => {
    const agent = request.agent(app);
    const response = await googleSignIn(agent, 'fake-google-credential-existing-0003');
    expect(response.status).toBe(200);
    expect(response.body.linkingRequired).toBe(true);
    expect(response.body.linkToken).toBeTruthy();
    expect((await agent.get('/api/auth/me')).body.user).toBeNull();

    const identities = queryAll<{ id: string }>(db, 'SELECT id FROM auth_identities WHERE user_id = ?', IDS.customer);
    expect(identities).toHaveLength(0);
  });

  it('rejects linking with the wrong password and accepts the right one once', async () => {
    const agent = request.agent(app);
    const start = await googleSignIn(agent, 'fake-google-credential-existing-0003');
    const linkToken = start.body.linkToken as string;

    const wrong = await mutate(agent.post('/api/auth/google/link')).send({
      linkToken,
      password: 'WrongPassword123!',
    });
    expect(wrong.status).toBe(401);
    expect(queryAll(db, 'SELECT id FROM auth_identities WHERE user_id = ?', IDS.customer)).toHaveLength(0);

    const linked = await mutate(agent.post('/api/auth/google/link')).send({
      linkToken,
      password: TEST_PASSWORD,
    });
    expect(linked.status).toBe(200);
    expect(linked.body.user.id).toBe(IDS.customer);
    expect(linked.body.user.authProviders).toEqual(['google']);
    expect((await agent.get('/api/auth/me')).body.user.id).toBe(IDS.customer);

    const reused = await mutate(request(app).post('/api/auth/google/link')).send({
      linkToken,
      password: TEST_PASSWORD,
    });
    expect(reused.status).toBe(400);
  });

  it('refuses to attach a second Google identity to the same account', async () => {
    const first = request.agent(app);
    const start = await googleSignIn(first, 'fake-google-credential-existing-0003');
    await mutate(first.post('/api/auth/google/link')).send({ linkToken: start.body.linkToken, password: TEST_PASSWORD });

    const second = request.agent(app);
    const secondStart = await googleSignIn(second, 'fake-google-credential-second-0004');
    expect(secondStart.body.linkingRequired).toBe(true);
    const conflictResponse = await mutate(second.post('/api/auth/google/link')).send({
      linkToken: secondStart.body.linkToken,
      password: TEST_PASSWORD,
    });
    expect(conflictResponse.status).toBe(409);
    expect(conflictResponse.body.error.code).toBe('google_account_has_identity');
  });

  it('allows a password account to unlink Google only with its password', async () => {
    const agent = await login(app, 'customer@test.local');
    const start = await googleSignIn(request.agent(app), 'fake-google-credential-existing-0003');
    await mutate(request(app).post('/api/auth/google/link')).send({
      linkToken: start.body.linkToken,
      password: TEST_PASSWORD,
    });

    const noPassword = await mutate(agent.post('/api/auth/google/unlink')).send({});
    expect(noPassword.status).toBe(400);

    const removed = await mutate(agent.post('/api/auth/google/unlink')).send({ password: TEST_PASSWORD });
    expect(removed.status).toBe(200);
    expect(removed.body.user.authProviders).toEqual([]);
  });

  it('refuses Google-only accounts from unlinking their only method', async () => {
    const agent = request.agent(app);
    const created = await googleSignIn(agent, 'fake-google-credential-new-0001');
    expect(created.status).toBe(201);
    const response = await mutate(agent.post('/api/auth/google/unlink')).send({ password: 'anything123' });
    expect(response.status).toBe(400);
  });

  it('lets a Google-only account add a password, then unlink Google', async () => {
    const agent = request.agent(app);
    const created = await googleSignIn(agent, 'fake-google-credential-new-0001');
    expect(created.status).toBe(201);

    const withCurrent = await mutate(agent.post('/api/account/password')).send({
      currentPassword: 'made-up-password',
      newPassword: 'NewPass123!',
    });
    expect(withCurrent.status).toBe(400);

    const set = await mutate(agent.post('/api/account/password')).send({ newPassword: 'NewPass123!' });
    expect(set.status).toBe(200);
    expect((await agent.get('/api/auth/me')).body.user.hasPassword).toBe(true);

    const removed = await mutate(agent.post('/api/auth/google/unlink')).send({ password: 'NewPass123!' });
    expect(removed.status).toBe(200);
    expect(removed.body.user.authProviders).toEqual([]);

    const passwordLogin = await mutate(request(app).post('/api/auth/login')).send({
      email: 'new.google@test.local',
      password: 'NewPass123!',
    });
    expect(passwordLogin.status).toBe(200);
  });
});

describe('session hardening', () => {
  it('rotates the session identifier on password login', async () => {
    const first = await mutate(request(app).post('/api/auth/login')).send({
      email: 'customer@test.local',
      password: TEST_PASSWORD,
    });
    const cookieA = cookieFrom(first);
    expect(cookieA).toBeTruthy();

    const second = await mutate(request(app).post('/api/auth/login')).set('Cookie', cookieA).send({
      email: 'customer@test.local',
      password: TEST_PASSWORD,
    });
    const cookieB = cookieFrom(second);
    expect(cookieB).toBeTruthy();
    expect(cookieB).not.toBe(cookieA);

    const oldSession = await request(app).get('/api/auth/me').set('Cookie', cookieA);
    expect(oldSession.body.user).toBeNull();
    const newSession = await request(app).get('/api/auth/me').set('Cookie', cookieB);
    expect(newSession.body.user.id).toBe(IDS.customer);
  });

  it('expires a session after the idle window', async () => {
    const agent = await login(app, 'customer@test.local');
    expect((await agent.get('/api/auth/me')).body.user).toBeTruthy();

    const longAgo = new Date(Date.now() - 30 * 86400_000).toISOString();
    execute(db, 'UPDATE sessions SET last_seen_at = ? WHERE user_id = ?', longAgo, IDS.customer);

    expect((await agent.get('/api/auth/me')).body.user).toBeNull();
  });

  it('expires a session at its absolute expiry', async () => {
    const agent = await login(app, 'customer@test.local');
    execute(db, 'UPDATE sessions SET expires_at = ? WHERE user_id = ?', new Date(Date.now() - 1000).toISOString(), IDS.customer);
    expect((await agent.get('/api/auth/me')).body.user).toBeNull();
  });

  it('clears the cookie on logout even without a live session', async () => {
    const response = await mutate(request(app).post('/api/auth/logout'))
      .set('Cookie', `${SESSION_COOKIE}=not-a-real-token`)
      .send({});
    expect(response.status).toBe(200);
    expect(String(response.headers['set-cookie'])).toContain(`${SESSION_COOKIE}=;`);
  });

  it('accepts a trusted configured origin and rejects an unknown one', async () => {
    const trusted = await mutate(request(app).post('/api/auth/login'))
      .set('origin', 'http://localhost:5173')
      .send({ email: 'customer@test.local', password: TEST_PASSWORD });
    expect(trusted.status).toBe(200);

    const blocked = await mutate(request(app).post('/api/auth/login'))
      .set('origin', 'https://attacker.example')
      .send({ email: 'customer@test.local', password: TEST_PASSWORD });
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('csrf');
  });

  it('exposes liveness and readiness without leaking integration details', async () => {
    const live = await request(app).get('/api/health/live');
    expect(live.status).toBe(200);
    expect(live.body.status).toBe('ok');

    const ready = await request(app).get('/api/health/ready');
    expect(ready.status).toBe(200);
    expect(ready.body).toMatchObject({ status: 'ok', ready: true, database: 'up', schema: 'current' });
    expect(JSON.stringify(ready.body)).not.toMatch(/razorpay|smtp|shiprocket|password/i);
  });
});
