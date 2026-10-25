import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, execute, type Db } from '../db.js';
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

describe('public health and CSRF protection', () => {
  it('reports service health without authentication', async () => {
    const response = await request(app).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
    expect(response.body.database).toBe('up');
  });

  it('rejects a mutating request without the API header', async () => {
    const response = await request(app).post('/api/auth/register').send({
      fullName: 'No Header',
      email: 'noheader@test.local',
      password: 'Password123!',
      acceptedTerms: true,
    });
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('csrf');
  });

  it('rejects a cross-origin mutation', async () => {
    const response = await mutate(request(app).post('/api/auth/register'))
      .set('origin', 'https://evil.example')
      .send({
        fullName: 'Cross Origin',
        email: 'cross@test.local',
        password: 'Password123!',
        acceptedTerms: true,
      });
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('csrf');
  });
});

describe('registration and sessions', () => {
  it('validates weak passwords', async () => {
    const response = await mutate(request(app).post('/api/auth/register')).send({
      fullName: 'Weak Password',
      email: 'weak@test.local',
      password: 'short',
      acceptedTerms: true,
    });
    expect(response.status).toBe(400);
    expect(response.body.error.fields.password).toBeTruthy();
  });

  it('registers a customer and establishes a session', async () => {
    const agent = request.agent(app);
    const response = await mutate(agent.post('/api/auth/register')).send({
      fullName: 'New Customer',
      email: 'new@test.local',
      password: 'Password123!',
      acceptedTerms: true,
    });
    expect(response.status).toBe(201);
    expect(response.body.user.email).toBe('new@test.local');
    expect(response.body.user.roles).toContain('customer');
    expect(String(response.headers['set-cookie'])).toContain('pr_session=');

    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe('new@test.local');
  });

  it('refuses a duplicate email with a stable error code', async () => {
    const response = await mutate(request(app).post('/api/auth/register')).send({
      fullName: 'Duplicate',
      email: 'customer@test.local',
      password: 'Password123!',
      acceptedTerms: true,
    });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('email_in_use');
  });

  it('rejects a wrong password without revealing whether the account exists', async () => {
    const wrong = await mutate(request(app).post('/api/auth/login')).send({
      email: 'customer@test.local',
      password: 'WrongPassword123!',
    });
    const missing = await mutate(request(app).post('/api/auth/login')).send({
      email: 'nobody@test.local',
      password: 'WrongPassword123!',
    });
    expect(wrong.status).toBe(401);
    expect(missing.status).toBe(401);
    expect(wrong.body.error.message).toBe(missing.body.error.message);
  });

  it('refuses login for a disabled account', async () => {
    execute(db, 'UPDATE users SET is_disabled = 1 WHERE id = ?', IDS.customer);
    const response = await mutate(request(app).post('/api/auth/login')).send({
      email: 'customer@test.local',
      password: TEST_PASSWORD,
    });
    expect(response.status).toBe(401);
  });

  it('destroys the session on logout', async () => {
    const agent = await login(app, 'customer@test.local');
    expect((await agent.get('/api/auth/me')).body.user).toBeTruthy();
    const logout = await mutate(agent.post('/api/auth/logout')).send({});
    expect(logout.status).toBe(200);
    expect((await agent.get('/api/auth/me')).body.user).toBeNull();
  });
});

describe('role-based access control', () => {
  it('requires authentication for account data', async () => {
    const response = await request(app).get('/api/account');
    expect(response.status).toBe(401);
  });

  it('blocks customers from admin and seller workspaces', async () => {
    const customer = await login(app, 'customer@test.local');
    expect((await customer.get('/api/admin/overview')).status).toBe(403);
    expect((await customer.get('/api/seller/products')).status).toBe(403);
  });

  it('allows an administrator into the admin workspace', async () => {
    const admin = await login(app, 'admin@test.local');
    const response = await admin.get('/api/admin/overview');
    expect(response.status).toBe(200);
    expect(response.body.metrics).toBeTruthy();
    expect(response.body.integrations.payments.configured).toBe(false);
  });

  it('allows an approved seller into the seller workspace', async () => {
    const seller = await login(app, 'seller@test.local');
    const dashboard = await seller.get('/api/seller/dashboard');
    expect(dashboard.status).toBe(200);
    expect(dashboard.body.products).toBeTruthy();

    const application = await seller.get('/api/seller/application');
    expect(application.status).toBe(200);
    expect(application.body.seller.id).toBe(IDS.seller);
    expect(application.body.seller.status).toBe('approved');
  });
});
