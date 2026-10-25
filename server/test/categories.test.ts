import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, type Db } from '../db.js';
import { IDS, login, mutate, resetDb, seedFixtures, setupTestApp } from './helpers.js';

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

describe('admin category management', () => {
  it('creates a category and makes it available to the public shop', async () => {
    const admin = await login(app, 'admin@test.local');
    const created = await mutate(admin.post('/api/admin/categories')).send({
      name: 'Winter Apothecary',
      slug: 'winter-apothecary',
      description: 'Small-batch mountain preparations.',
      imageUrl: '/images/product-honey.jpg',
      sortOrder: 25,
      isActive: true,
    });
    expect(created.status).toBe(201);
    expect(created.body.category.name).toBe('Winter Apothecary');
    expect(created.body.category.product_count).toBe(0);

    const publicList = await request(app).get('/api/categories');
    expect(publicList.status).toBe(200);
    expect(publicList.body.categories.some((category: { slug: string }) => category.slug === 'winter-apothecary')).toBe(true);
  });

  it('rejects duplicate slugs and category loops', async () => {
    const admin = await login(app, 'admin@test.local');
    const duplicate = await mutate(admin.post('/api/admin/categories')).send({
      name: 'Another Weaves',
      slug: 'test-weaves',
    });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('slug_in_use');

    const loop = await mutate(admin.patch(`/api/admin/categories/${IDS.category}`)).send({
      parentId: IDS.category,
    });
    expect(loop.status).toBe(400);
  });

  it('does not deactivate a category that still contains products', async () => {
    const admin = await login(app, 'admin@test.local');
    const response = await mutate(admin.patch(`/api/admin/categories/${IDS.category}`)).send({
      isActive: false,
    });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('category_in_use');
  });

  it('keeps category management restricted to administrators', async () => {
    const customer = await login(app, 'customer@test.local');
    const response = await mutate(customer.post('/api/admin/categories')).send({
      name: 'Customer Category',
      slug: 'customer-category',
    });
    expect(response.status).toBe(403);
  });
});
