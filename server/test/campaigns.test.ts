import crypto from 'node:crypto';
import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { CampaignSummary } from '../../shared/types.js';
import { closeDb, queryOne, type Db } from '../db.js';
import {
  ADDRESS,
  IDS,
  addToCart,
  checkout,
  login,
  mutate,
  resetDb,
  seedFixtures,
  setupTestApp,
} from './helpers.js';

let app: Express;
let db: Db;

const POSTER = '/images/campaigns/pahadi-festive-glow-diwali-1672.webp';
const SLUG = 'pahadi-festive-glow';

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

type Agent = Awaited<ReturnType<typeof login>>;

async function adminAgent(): Promise<Agent> {
  return login(app, 'admin@test.local');
}

async function createCampaign(
  agent: Agent,
  overrides: Record<string, unknown> = {},
): Promise<CampaignSummary> {
  const response = await mutate(agent.post('/api/admin/campaigns')).send({
    name: 'Pahadi Festive Glow',
    slug: SLUG,
    description: 'A Diwali collection from reviewed Himachali makers.',
    posterUrl: POSTER,
    posterAlt: 'Pahadi Festive Glow Diwali poster',
    maxDiscountBp: 3000,
    ...overrides,
  });
  expect(response.status).toBe(201);
  return response.body.campaign as CampaignSummary;
}

async function addProduct(agent: Agent, campaignId: string, productId: string, promoPricePaise: number) {
  return mutate(agent.post(`/api/admin/campaigns/${campaignId}/products`)).send({
    productId,
    promoPricePaise,
  });
}

async function activate(agent: Agent, campaignId: string) {
  return mutate(agent.patch(`/api/admin/campaigns/${campaignId}`)).send({ status: 'active' });
}

interface OfferItem {
  slug: string;
  pricePaise: number;
  originalPricePaise: number | null;
  discountPercent: number | null;
  campaignSlug: string | null;
  campaignName: string | null;
}

function item(response: request.Response, slug: string): OfferItem | undefined {
  return (response.body.items as OfferItem[]).find((product) => product.slug === slug);
}

describe('seasonal campaigns', () => {
  it('applies a validated campaign price to eligible products only', async () => {
    const admin = await adminAgent();
    const campaign = await createCampaign(admin);
    expect((await addProduct(admin, campaign.id, IDS.product, 70_000)).status).toBe(201);
    expect((await activate(admin, campaign.id)).status).toBe(200);

    const offer = await request(app).get(`/api/campaigns/${SLUG}`);
    expect(offer.status).toBe(200);
    expect(offer.body.purchasable).toBe(true);
    expect(offer.body.campaign).toMatchObject({
      name: 'Pahadi Festive Glow',
      status: 'active',
      productCount: 1,
      maxDiscountPercent: 30,
    });
    expect(offer.body.total).toBe(1);

    const shawl = item(offer, 'test-shawl');
    expect(shawl).toMatchObject({
      pricePaise: 70_000,
      originalPricePaise: 100_000,
      discountPercent: 30,
      campaignSlug: SLUG,
      campaignName: 'Pahadi Festive Glow',
    });
    expect(offer.body.filters.categories).toHaveLength(1);
    expect(offer.body.filters.priceRangePaise).toEqual({ min: 70_000, max: 70_000 });

    // The ordinary catalogue shows the same promotional price and keeps the
    // ineligible product at its regular price.
    const catalogue = await request(app).get('/api/products');
    expect(item(catalogue, 'test-shawl')).toMatchObject({
      pricePaise: 70_000,
      originalPricePaise: 100_000,
      discountPercent: 30,
    });
    expect(item(catalogue, 'second-shawl')).toMatchObject({ pricePaise: 50_000, originalPricePaise: null });

    const detail = await request(app).get('/api/products/test-shawl');
    expect(detail.body.product).toMatchObject({ pricePaise: 70_000, originalPricePaise: 100_000, campaignSlug: SLUG });

    const home = await request(app).get('/api/home');
    expect(home.body.campaign).toMatchObject({ slug: SLUG, productCount: 1, maxDiscountPercent: 30 });

    const sitemap = await request(app).get('/sitemap.xml');
    expect(sitemap.text).toContain(`/offers/${SLUG}`);
  });

  it('requires the homepage banner to have both a live campaign and a poster', async () => {
    const admin = await adminAgent();
    const emptyCampaign = await createCampaign(admin, { slug: 'empty-offer' });
    await activate(admin, emptyCampaign.id);
    // A live campaign with no eligible products must not send shoppers to an
    // empty shelf.
    expect((await request(app).get('/api/home')).body.campaign).toBeNull();

    const campaign = await createCampaign(admin, { posterUrl: null });
    await addProduct(admin, campaign.id, IDS.product, 80_000);
    await activate(admin, campaign.id);

    const withoutPoster = await request(app).get('/api/home');
    expect(withoutPoster.body.campaign).toBeNull();
    // The offer page is still addressable without artwork.
    expect((await request(app).get(`/api/campaigns/${SLUG}`)).status).toBe(200);

    await mutate(admin.patch(`/api/admin/campaigns/${campaign.id}`)).send({ posterUrl: POSTER });
    const withPoster = await request(app).get('/api/home');
    expect(withPoster.body.campaign).toMatchObject({ slug: SLUG, posterUrl: POSTER });
  });

  it('rejects invalid promotional prices and discounts above the cap', async () => {
    const admin = await adminAgent();
    const campaign = await createCampaign(admin);

    const equalPrice = await addProduct(admin, campaign.id, IDS.product, 100_000);
    expect(equalPrice.status).toBe(400);

    const overCap = await addProduct(admin, campaign.id, IDS.product, 60_000);
    expect(overCap.status).toBe(400);
    expect(overCap.body.error.fields.promoPricePaise).toBeTruthy();

    const zero = await addProduct(admin, campaign.id, IDS.product, 0);
    expect(zero.status).toBe(400);

    const missing = await addProduct(admin, campaign.id, 'prd_does_not_exist', 50_000);
    expect(missing.status).toBe(404);

    expect((await addProduct(admin, campaign.id, IDS.product, 90_000)).status).toBe(201);
    const duplicate = await addProduct(admin, campaign.id, IDS.product, 90_000);
    expect(duplicate.status).toBe(409);

    const raise = await mutate(admin.patch(`/api/admin/campaigns/${campaign.id}/products/${IDS.product}`)).send({
      promoPricePaise: 50_000,
    });
    expect(raise.status).toBe(400);
  });

  it('keeps drafts and archived campaigns private and administration admin-only', async () => {
    const admin = await adminAgent();
    const campaign = await createCampaign(admin);

    expect((await request(app).get(`/api/campaigns/${SLUG}`)).status).toBe(404);

    const customer = await login(app, 'customer@test.local');
    expect((await customer.get('/api/admin/campaigns')).status).toBe(403);
    expect((await mutate(customer.post('/api/admin/campaigns')).send({ name: 'Not allowed' })).status).toBe(403);

    await addProduct(admin, campaign.id, IDS.product, 70_000);
    await activate(admin, campaign.id);
    expect((await request(app).get(`/api/campaigns/${SLUG}`)).status).toBe(200);

    expect((await mutate(admin.patch(`/api/admin/campaigns/${campaign.id}`)).send({ status: 'archived' })).status).toBe(200);
    expect((await request(app).get(`/api/campaigns/${SLUG}`)).status).toBe(404);

    const catalogue = await request(app).get('/api/products');
    expect(item(catalogue, 'test-shawl')).toMatchObject({ pricePaise: 100_000, originalPricePaise: null });
  });

  it('shows a scheduled campaign without selling or discounting', async () => {
    const admin = await adminAgent();
    const campaign = await createCampaign(admin, {
      startsAt: new Date(Date.now() + 86_400_000).toISOString(),
    });
    await addProduct(admin, campaign.id, IDS.product, 70_000);
    expect((await activate(admin, campaign.id)).status).toBe(200);

    const offer = await request(app).get(`/api/campaigns/${SLUG}`);
    expect(offer.status).toBe(200);
    expect(offer.body.campaign.status).toBe('scheduled');
    expect(offer.body.purchasable).toBe(false);
    expect(offer.body.items).toEqual([]);
    expect(offer.body.total).toBe(0);

    const catalogue = await request(app).get('/api/products');
    expect(item(catalogue, 'test-shawl')).toMatchObject({
      pricePaise: 100_000,
      originalPricePaise: null,
    });
    expect((await request(app).get('/api/home')).body.campaign).toBeNull();
    expect((await request(app).get('/sitemap.xml')).text).not.toContain(`/offers/${SLUG}`);
  });

  it('expires consistently for the campaign page and the catalogue', async () => {
    const admin = await adminAgent();
    const campaign = await createCampaign(admin, { endsAt: '2020-01-02T23:59:59.999Z' });
    await addProduct(admin, campaign.id, IDS.product, 70_000);
    expect((await activate(admin, campaign.id)).status).toBe(200);

    const offer = await request(app).get(`/api/campaigns/${SLUG}`);
    expect(offer.body.campaign.status).toBe('expired');
    expect(offer.body.purchasable).toBe(false);
    expect(offer.body.items).toEqual([]);

    const customer = await login(app, 'customer@test.local');
    const cart = await addToCart(app, customer, IDS.product, 1);
    expect(cart.lines[0]).toMatchObject({ unitPricePaise: 100_000, originalUnitPricePaise: null });
  });

  it('uses the campaign price in cart and checkout and ignores client-supplied money', async () => {
    const admin = await adminAgent();
    const campaign = await createCampaign(admin);
    await addProduct(admin, campaign.id, IDS.product, 70_000);
    await activate(admin, campaign.id);

    const customer = await login(app, 'customer@test.local');
    const cart = await addToCart(app, customer, IDS.product, 1);
    expect(cart.lines[0]).toMatchObject({
      unitPricePaise: 70_000,
      originalUnitPricePaise: 100_000,
      lineTotalPaise: 70_000,
    });
    expect(cart.subtotalPaise).toBe(70_000);

    const tampered = await mutate(customer.post('/api/checkout')).send({
      address: ADDRESS,
      idempotencyKey: crypto.randomUUID(),
      unitPricePaise: 1,
      subtotalPaise: 1,
      discountPaise: 99_999,
      totalPaise: 1,
      lines: [{ productId: IDS.product, quantity: 1, unitPricePaise: 1 }],
    });
    expect(tampered.status).toBe(201);
    expect(tampered.body.order.subtotalPaise).toBe(70_000);
    expect(tampered.body.order.totalPaise).toBe(77_900);

    const orderLine = queryOne<{ unit_price_paise: number; original_unit_price_paise: number | null }>(
      db,
      'SELECT unit_price_paise, original_unit_price_paise FROM order_items WHERE order_id = ?',
      tampered.body.order.id,
    );
    expect(orderLine).toEqual({ unit_price_paise: 70_000, original_unit_price_paise: 100_000 });
  });

  it('withdraws a promotional price from an open cart when the campaign is archived', async () => {
    const admin = await adminAgent();
    const campaign = await createCampaign(admin);
    await addProduct(admin, campaign.id, IDS.product, 70_000);
    await activate(admin, campaign.id);

    const customer = await login(app, 'customer@test.local');
    const firstCart = await addToCart(app, customer, IDS.product, 1);
    expect(firstCart.lines[0].unitPricePaise).toBe(70_000);

    await mutate(admin.patch(`/api/admin/campaigns/${campaign.id}`)).send({ status: 'archived' });

    const refreshed = await customer.get('/api/cart');
    expect(refreshed.body.cart.lines[0]).toMatchObject({ unitPricePaise: 100_000, originalUnitPricePaise: null });
    expect(refreshed.body.cart.subtotalPaise).toBe(100_000);

    const order = await checkout(app, customer);
    expect(order.status).toBe(201);
    expect(order.body.order.subtotalPaise).toBe(100_000);
    expect(order.body.order.totalPaise).toBe(107_900);
  });

  it('prevents the same product from being promised to two live campaigns', async () => {
    const admin = await adminAgent();
    const first = await createCampaign(admin, { slug: 'first-offer' });
    await addProduct(admin, first.id, IDS.product, 70_000);
    await activate(admin, first.id);

    const second = await createCampaign(admin, { slug: 'second-offer' });
    expect((await addProduct(admin, second.id, IDS.product, 80_000)).status).toBe(201);

    const activation = await activate(admin, second.id);
    expect(activation.status).toBe(409);
    expect(activation.body.error.code).toBe('campaign_conflict');

    // The original campaign remains the authoritative price.
    const catalogue = await request(app).get('/api/products');
    expect(item(catalogue, 'test-shawl')).toMatchObject({ pricePaise: 70_000, campaignSlug: 'first-offer' });
  });

  it('validates campaign windows, slugs, and poster URLs', async () => {
    const admin = await adminAgent();

    const backwards = await mutate(admin.post('/api/admin/campaigns')).send({
      name: 'Backwards window',
      startsAt: '2026-10-10T00:00:00.000Z',
      endsAt: '2026-10-01T00:00:00.000Z',
    });
    expect(backwards.status).toBe(400);

    const badPoster = await mutate(admin.post('/api/admin/campaigns')).send({
      name: 'Bad poster',
      posterUrl: 'javascript:alert(1)',
    });
    expect(badPoster.status).toBe(400);

    await createCampaign(admin);
    const duplicateSlug = await mutate(admin.post('/api/admin/campaigns')).send({
      name: 'Another campaign',
      slug: SLUG,
    });
    expect(duplicateSlug.status).toBe(409);
  });

  it('lets administrators edit and delete only drafts, and records the changes', async () => {
    const admin = await adminAgent();
    const campaign = await createCampaign(admin);
    await addProduct(admin, campaign.id, IDS.product, 70_000);

    const edited = await mutate(admin.patch(`/api/admin/campaigns/${campaign.id}`)).send({
      name: 'Pahadi Festive Glow 2026',
      maxDiscountBp: 2500,
    });
    // The existing 30% price is now outside the edited cap, so the edit fails.
    expect(edited.status).toBe(400);

    const safeEdit = await mutate(admin.patch(`/api/admin/campaigns/${campaign.id}`)).send({
      name: 'Pahadi Festive Glow 2026',
    });
    expect(safeEdit.status).toBe(200);
    expect(safeEdit.body.campaign.name).toBe('Pahadi Festive Glow 2026');

    expect((await mutate(admin.delete(`/api/admin/campaigns/${campaign.id}`))).status).toBe(200);

    const activeCampaign = await createCampaign(admin, { slug: 'active-offer' });
    await addProduct(admin, activeCampaign.id, IDS.product2, 40_000);
    await activate(admin, activeCampaign.id);
    expect((await mutate(admin.delete(`/api/admin/campaigns/${activeCampaign.id}`))).status).toBe(409);

    const logs = await admin.get('/api/admin/audit?entityType=campaign');
    const actions = (logs.body.logs as { action: string }[]).map((log) => log.action);
    expect(actions).toContain('campaign.created');
    expect(actions).toContain('campaign.product_added');
    expect(actions).toContain('campaign.updated');
    expect(actions).toContain('campaign.deleted');
  });
});
