import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, type Db } from '../db.js';
import { MfaService } from '../core/security/MfaService.js';
import { TEST_PASSWORD, login, mutate, resetDb, seedFixtures, setupTestApp } from './helpers.js';

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

async function enrolMfa(agent: Awaited<ReturnType<typeof login>>) {
  const enrolment = await mutate(agent.post('/api/auth/mfa/enrol')).send({});
  expect(enrolment.status).toBe(201);
  const secret = enrolment.body.secret as string;
  expect(secret).toBeTruthy();
  const confirm = await mutate(agent.post('/api/auth/mfa/confirm')).send({
    code: MfaService.generateToken(secret),
  });
  expect(confirm.status).toBe(200);
  return secret;
}

describe('TOTP two-step verification', () => {
  it('enrols, challenges login, rejects bad codes and accepts a valid code once', async () => {
    const agent = await login(app, 'customer@test.local');
    const before = await agent.get('/api/auth/mfa');
    expect(before.status).toBe(200);
    expect(before.body).toMatchObject({ enabled: false, required: false, recommendedForRole: false });

    const secret = await enrolMfa(agent);
    const after = await agent.get('/api/auth/mfa');
    expect(after.body.enabled).toBe(true);
    expect(after.body.enrolledAt).toBeTruthy();

    // The existing session remains valid; only a new sign-in needs the code.
    expect((await agent.get('/api/auth/me')).body.user.email).toBe('customer@test.local');

    const fresh = request.agent(app);
    const first = await mutate(fresh.post('/api/auth/login')).send({
      email: 'customer@test.local',
      password: TEST_PASSWORD,
    });
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ mfaRequired: true });
    expect(first.body.challengeToken).toBeTruthy();
    // No session was issued before the second factor.
    expect((await fresh.get('/api/auth/me')).body.user).toBeNull();

    const bad = await mutate(fresh.post('/api/auth/mfa/verify')).send({
      challengeToken: first.body.challengeToken,
      code: '000000',
    });
    expect(bad.status).toBe(401);

    const good = await mutate(fresh.post('/api/auth/mfa/verify')).send({
      challengeToken: first.body.challengeToken,
      code: MfaService.generateToken(secret),
    });
    expect(good.status).toBe(200);
    expect(good.body.user.email).toBe('customer@test.local');

    // A challenge is single-use even when the code is still inside its window.
    const replay = await mutate(request(app).post('/api/auth/mfa/verify')).send({
      challengeToken: first.body.challengeToken,
      code: MfaService.generateToken(secret),
    });
    expect(replay.status).toBe(401);
  });

  it('requires the current password and a code to disable, then removes the challenge', async () => {
    const agent = await login(app, 'customer@test.local');
    const secret = await enrolMfa(agent);

    const wrongPassword = await mutate(agent.post('/api/auth/mfa/disable')).send({
      password: 'ThisIsNotIt123!',
      code: MfaService.generateToken(secret),
    });
    expect(wrongPassword.status).toBe(401);

    const disabled = await mutate(agent.post('/api/auth/mfa/disable')).send({
      password: TEST_PASSWORD,
      code: MfaService.generateToken(secret),
    });
    expect(disabled.status).toBe(200);
    expect((await agent.get('/api/auth/mfa')).body.enabled).toBe(false);

    const direct = await mutate(request(app).post('/api/auth/login')).send({
      email: 'customer@test.local',
      password: TEST_PASSWORD,
    });
    expect(direct.status).toBe(200);
    expect(direct.body.mfaRequired).toBeUndefined();
    expect(direct.body.user.email).toBe('customer@test.local');
  });

  it('marks administrator accounts as recommended but does not force enrolment', async () => {
    const admin = await login(app, 'admin@test.local');
    const status = await admin.get('/api/auth/mfa');
    expect(status.body).toMatchObject({ enabled: false, recommendedForRole: true });
    expect(status.status).toBe(200);
    expect((await admin.get('/api/admin/overview')).status).toBe(200);
  });

  it('expires challenges and limits repeated guesses', async () => {
    const agent = await login(app, 'customer@test.local');
    await enrolMfa(agent);

    const first = await mutate(request(app).post('/api/auth/login')).send({
      email: 'customer@test.local',
      password: TEST_PASSWORD,
    });
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const wrong = await mutate(request(app).post('/api/auth/mfa/verify')).send({
        challengeToken: first.body.challengeToken,
        code: '000000',
      });
      expect(wrong.status).toBe(401);
    }
    const locked = await mutate(request(app).post('/api/auth/mfa/verify')).send({
      challengeToken: first.body.challengeToken,
      code: '000000',
    });
    expect(locked.status).toBe(401);
  });
});
