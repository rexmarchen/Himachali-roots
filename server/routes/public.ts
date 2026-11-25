import crypto from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { env } from '../env.js';
import { execute, queryAll, queryOne, type Db } from '../db.js';
import { getProduct, getRegions, getSellerStorefront, listCategories, listProducts, listPublicMakers, listPublicSellers } from '../lib/catalog.js';
import {
  campaignStats,
  effectiveCampaignStatus,
  getCampaignBySlug,
  getFeaturedCampaign,
  isCampaignPageVisible,
  mapCampaign,
  type CampaignRow,
} from '../lib/campaigns.js';
import { clientIp, notFound, parse } from '../lib/http.js';
import { newId } from '../lib/ids.js';
import { getPolicy, getSiteContent } from '../lib/site.js';
import { paymentProviderStatus } from '../lib/payments.js';
import { shippingFor } from '../lib/pricing.js';
import { notify } from '../lib/email.js';
import {
  cleanSeoText,
  countRealCampaignProducts,
  DEMO_PRODUCT_SQL,
  DEMO_SELLER_SQL,
} from '../lib/seo.js';
import { buildProductFallbackDescription } from '../../shared/seo.js';
import { BLOG_POSTS } from '../../shared/blog.js';

function optInt(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const n = Number(Array.isArray(value) ? value[0] : value);
  return Number.isFinite(n) ? Math.round(n) : undefined;
}

function str(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  return value.trim();
}

export function publicRouter(db: Db): Router {
  const router = Router();

  router.get('/home', (_req, res) => {
    const content = getSiteContent(db);
    const categories = listCategories(db).filter((category) => !category.parentId);
    const makers = listPublicSellers(db).slice(0, 3);
    const products = listProducts(db, { featured: true, pageSize: 8, sort: 'newest' });
    const newArrivals = listProducts(db, { pageSize: 8, sort: 'newest' });
    const catalogPreview = listProducts(db, { pageSize: 12, sort: 'popular' });
    const gifting =
      content.homepage.gifting.categorySlug
        ? listProducts(db, { category: content.homepage.gifting.categorySlug, pageSize: 4 })
        : { items: [] };

    const bestsellerRows = queryAll<{
      slug: string;
      name: string;
      price_paise: number;
      image_url: string | null;
      image_alt: string | null;
      seller_name: string;
      units: number;
    }>(
      db,
      `SELECT p.slug, p.name, p.price_paise, s.business_name AS seller_name,
              SUM(oi.quantity) AS units,
              (SELECT url FROM product_images pi WHERE pi.product_id = p.id ORDER BY sort_order LIMIT 1) AS image_url,
              (SELECT alt FROM product_images pi WHERE pi.product_id = p.id ORDER BY sort_order LIMIT 1) AS image_alt
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id AND o.paid_at IS NOT NULL
         JOIN products p ON p.id = oi.product_id AND p.status = 'approved'
         JOIN seller_profiles s ON s.id = p.seller_id AND s.status = 'approved' AND s.store_status = 'active'
        WHERE o.created_at >= ?
        GROUP BY p.id
        ORDER BY units DESC
        LIMIT 4`,
      new Date(Date.now() - 90 * 86400_000).toISOString(),
    );

    const reviews = queryAll<{
      id: string;
      rating: number;
      body: string;
      created_at: string;
      full_name: string;
      product_name: string;
      product_slug: string;
    }>(
      db,
      `SELECT r.id, r.rating, r.body, r.created_at, p.full_name, pr.name AS product_name, pr.slug AS product_slug
         FROM reviews r
         JOIN products pr ON pr.id = r.product_id AND pr.status = 'approved'
         JOIN seller_profiles sr ON sr.id = pr.seller_id AND sr.status = 'approved' AND sr.store_status = 'active'
         JOIN users u ON u.id = r.user_id
         LEFT JOIN profiles p ON p.id = u.id
        WHERE r.status = 'published'
        ORDER BY r.created_at DESC LIMIT 3`,
    );

    const counts = queryOne<{ products: number; sellers: number; regions: number }>(
      db,
      `SELECT
         (SELECT COUNT(*) FROM products p JOIN seller_profiles s ON s.id = p.seller_id
           WHERE p.status = 'approved' AND s.status = 'approved' AND s.store_status = 'active') AS products,
         (SELECT COUNT(*) FROM seller_profiles WHERE status = 'approved' AND store_status = 'active') AS sellers,
         (SELECT COUNT(DISTINCT p.region) FROM products p JOIN seller_profiles s ON s.id = p.seller_id
           WHERE p.status = 'approved' AND s.status = 'approved' AND s.store_status = 'active'
             AND p.region IS NOT NULL) AS regions`,
    );

    const featuredCampaignRow = getFeaturedCampaign(db);
    const featuredStats = featuredCampaignRow ? campaignStats(db, featuredCampaignRow.id) : null;

    res.json({
      content,
      categories,
      makers,
      campaign: featuredCampaignRow
        ? mapCampaign(featuredCampaignRow, featuredStats!.productCount, featuredStats!.maxDiscountPercent)
        : null,
      bestsellers: bestsellerRows.map((row) => ({
        slug: row.slug,
        name: row.name,
        pricePaise: row.price_paise,
        imageUrl: row.image_url,
        imageAlt: row.image_alt,
        sellerName: row.seller_name,
        unitsSold: row.units,
      })),
      featured: products.items,
      newArrivals: newArrivals.items,
      catalogPreview: catalogPreview.items,
      gifting: gifting.items,
      regions: getRegions(db).slice(0, 6),
      reviews: reviews.map((review) => ({
        id: review.id,
        rating: review.rating,
        body: review.body,
        createdAt: review.created_at,
        authorName: (review.full_name || 'Verified customer').split(' ')[0],
        productName: review.product_name,
        productSlug: review.product_slug,
      })),
      counts: counts ?? { products: 0, sellers: 0, regions: 0 },
      generatedAt: new Date().toISOString(),
    });
  });

  router.get('/categories', (_req, res) => {
    const categories = listCategories(db);
    res.json({
      categories: categories.filter((category) => !category.parentId),
      subcategories: categories.filter((category) => category.parentId),
    });
  });

  router.get(['/products', '/shop/products'], (req, res) => {
    const sortRaw = str(req.query.sort);
    const sort = (['relevance', 'newest', 'price_asc', 'price_desc', 'popular'] as const).includes(
      sortRaw as 'newest',
    )
      ? (sortRaw as 'newest' | 'price_asc' | 'price_desc' | 'popular' | 'relevance')
      : 'relevance';
    const result = listProducts(db, {
      q: str(req.query.q),
      category: str(req.query.category),
      seller: str(req.query.seller),
      region: str(req.query.region),
      minPricePaise: optInt(req.query.minPrice),
      maxPricePaise: optInt(req.query.maxPrice),
      inStock: req.query.inStock === 'true',
      featured: req.query.featured === 'true',
      sort,
      page: optInt(req.query.page) ?? 1,
      pageSize: optInt(req.query.pageSize) ?? 24,
    });
    res.json({
      ...result,
      filters: {
        categories: listCategories(db),
        sellers: listPublicSellers(db).map((seller) => ({ name: seller.name, slug: seller.slug })),
        regions: getRegions(db),
        priceRangePaise: queryOne<{ min: number | null; max: number | null }>(
          db,
          `SELECT MIN(p.price_paise) AS min, MAX(p.price_paise) AS max
             FROM products p
             JOIN seller_profiles s ON s.id = p.seller_id
            WHERE p.status = 'approved' AND s.status = 'approved' AND s.store_status = 'active'`,
        ),
      },
    });
  });

  router.get(['/products/:slug', '/shop/products/:slug'], (req, res) => {
    res.json({ product: getProduct(db, String(req.params.slug)) });
  });

  router.get('/campaigns/:slug', (req, res) => {
    const rawSlug = String(req.params.slug).toLowerCase();
    let campaign = getCampaignBySlug(db, String(req.params.slug));
    if (!campaign && ['seasonal', 'seasonal-collection', 'festive', 'festive-glow', 'pahadi-festive'].includes(rawSlug)) {
      campaign =
        getFeaturedCampaign(db) ??
        queryOne<CampaignRow>(db, "SELECT * FROM campaigns WHERE status = 'active' ORDER BY created_at DESC LIMIT 1");
    }
    // Draft and archived campaigns are editorial work in progress: they are not
    // publicly addressable at all. Scheduled and expired campaigns are visible
    // so a shared link does not silently break, but nothing is purchasable.
    if (!campaign || !isCampaignPageVisible(campaign)) {
      throw notFound('That offer is not available.');
    }
    const status = effectiveCampaignStatus(campaign);
    const purchasable = status === 'active';

    const sortRaw = str(req.query.sort);
    const sort = (['relevance', 'newest', 'price_asc', 'price_desc', 'popular'] as const).includes(
      sortRaw as 'newest',
    )
      ? (sortRaw as 'newest' | 'price_asc' | 'price_desc' | 'popular' | 'relevance')
      : 'newest';

    const result = purchasable
      ? listProducts(db, {
          category: str(req.query.category),
          seller: str(req.query.seller),
          sort,
          page: optInt(req.query.page) ?? 1,
          pageSize: optInt(req.query.pageSize) ?? 12,
          campaignId: campaign.id,
        })
      : { items: [], page: 1, pageSize: 12, total: 0, totalPages: 0 };

    const categories = purchasable
      ? queryAll<{ id: string; name: string; slug: string; productCount: number }>(
          db,
          `SELECT c.id, c.name, c.slug, COUNT(*) AS productCount
             FROM campaign_products cp
             JOIN active_campaign_prices acp ON acp.product_id = cp.product_id
             JOIN products p ON p.id = cp.product_id AND p.status = 'approved'
             JOIN seller_profiles s ON s.id = p.seller_id AND s.status = 'approved' AND s.store_status = 'active'
             JOIN categories c ON c.id = p.category_id
            WHERE cp.campaign_id = ?
            GROUP BY c.id
            ORDER BY c.name`,
          campaign.id,
        )
      : [];

    const sellers = purchasable
      ? queryAll<{ name: string; slug: string }>(
          db,
          `SELECT DISTINCT s.business_name AS name, s.slug
             FROM campaign_products cp
             JOIN active_campaign_prices acp ON acp.product_id = cp.product_id
             JOIN products p ON p.id = cp.product_id AND p.status = 'approved'
             JOIN seller_profiles s ON s.id = p.seller_id AND s.status = 'approved' AND s.store_status = 'active'
            WHERE cp.campaign_id = ?
            ORDER BY s.business_name`,
          campaign.id,
        )
      : [];

    const priceRange = purchasable
      ? queryOne<{ min: number | null; max: number | null }>(
          db,
          `SELECT MIN(acp.promo_price_paise) AS min, MAX(acp.promo_price_paise) AS max
             FROM campaign_products cp
             JOIN active_campaign_prices acp ON acp.product_id = cp.product_id
            WHERE cp.campaign_id = ?`,
          campaign.id,
        )
      : undefined;

    res.json({
      campaign: (() => {
        const stats = campaignStats(db, campaign.id);
        return mapCampaign(campaign, stats.productCount, stats.maxDiscountPercent);
      })(),
      purchasable,
      ...result,
      filters: {
        categories,
        sellers,
        priceRangePaise: priceRange ?? { min: null, max: null },
      },
    });
  });

  router.get('/makers', (req, res) => {
    const query = {
      q: str(req.query.q),
      category: str(req.query.category),
      region: str(req.query.region),
      verified: req.query.verified === 'true' ? true : req.query.verified === 'false' ? false : undefined,
      sort: str(req.query.sort) as 'products' | 'name_asc' | 'name_desc' | 'newest' | undefined,
      page: optInt(req.query.page),
      limit: optInt(req.query.limit) ?? optInt(req.query.pageSize),
    };
    const result = listPublicMakers(db, query);
    res.json({
      success: true,
      data: result,
      makers: result.makers,
      sellers: result.makers,
      pagination: result.pagination,
      filters: result.filters,
    });
  });

  router.get('/makers/:slug', (req, res) => {
    const seller = getSellerStorefront(db, req.params.slug);
    const products = listProducts(db, { seller: seller.slug, pageSize: 24, sort: 'newest' });
    res.json({
      success: true,
      data: { seller, products },
      seller,
      products,
    });
  });

  router.get('/sellers', (req, res) => {
    const query = {
      q: str(req.query.q),
      category: str(req.query.category),
      region: str(req.query.region),
      verified: req.query.verified === 'true' ? true : req.query.verified === 'false' ? false : undefined,
      sort: str(req.query.sort) as 'products' | 'name_asc' | 'name_desc' | 'newest' | undefined,
      page: optInt(req.query.page),
      limit: optInt(req.query.limit) ?? optInt(req.query.pageSize) ?? 48,
    };
    const result = listPublicMakers(db, query);
    res.json({
      success: true,
      data: result,
      sellers: result.makers,
      makers: result.makers,
      pagination: result.pagination,
      filters: result.filters,
    });
  });

  router.get('/sellers/:slug', (req, res) => {
    const seller = getSellerStorefront(db, req.params.slug);
    const products = listProducts(db, { seller: seller.slug, pageSize: 24, sort: 'newest' });
    res.json({
      success: true,
      data: { seller, products },
      seller,
      products,
    });
  });

  router.get('/regions', (_req, res) => {
    res.json({ regions: getRegions(db) });
  });

  router.get('/site', (_req, res) => {
    res.json({ content: getSiteContent(db) });
  });

  router.get('/policies/:key', (req, res) => {
    res.json({ policy: getPolicy(db, req.params.key) });
  });

  router.get('/config', (_req, res) => {
    const payments = paymentProviderStatus();
    res.json({
      payments,
      shipping: {
        freeThresholdPaise: env.freeShippingThresholdPaise,
        flatRatePaise: env.flatShippingPaise,
      },
      supportEmail: env.smtp.supportEmail,
      supportEmailIsPlaceholder: env.smtp.supportEmail.endsWith('.example'),
      devMode: !env.isProduction,
      devAuthHelpers: env.allowDevAuthHelpers,
      googleClientId: env.googleClientId || null,
      googleEnabled: Boolean(env.googleClientId),
      legalReviewRequired: true,
      commissionBasisNote:
        'Commission is calculated on product value after discounts, excluding shipping and taxes.',
    });
  });

  router.post(
    '/newsletter',
    rateLimit({
      windowMs: 60 * 60_000,
      limit: env.isTest ? 1000 : 10,
      message: { error: { code: 'rate_limited', message: 'Too many attempts. Try again later.' } },
      standardHeaders: 'draft-8',
      legacyHeaders: false,
    }),
    (req, res) => {
      const input = parse(
        z.object({
          email: z.string().trim().toLowerCase().email('Enter a valid email address.').max(254),
          consent: z.literal(true, { message: 'Please confirm you want to receive occasional emails.' }),
          source: z.string().max(40).optional(),
        }),
        req.body,
      );
      const existing = queryOne<{ id: string; unsubscribed_at: string | null }>(
        db,
        'SELECT id, unsubscribed_at FROM newsletter_subscribers WHERE email = ?',
        input.email,
      );
      if (existing && !existing.unsubscribed_at) {
        res.json({ ok: true, status: 'already_subscribed', message: 'You are already on the list.' });
        return;
      }
      if (existing) {
        execute(
          db,
          'UPDATE newsletter_subscribers SET unsubscribed_at = NULL, consent_at = ? WHERE id = ?',
          new Date().toISOString(),
          existing.id,
        );
      } else {
        execute(
          db,
          'INSERT INTO newsletter_subscribers (id, email, consent_at, source) VALUES (?, ?, ?, ?)',
          newId('nws_'),
          input.email,
          new Date().toISOString(),
          input.source?.slice(0, 40) ?? 'footer',
        );
      }
      res.status(201).json({
        ok: true,
        status: 'subscribed',
        message: 'Thank you. We will write only when there is something worth sharing.',
      });
    },
  );

  router.post(
    '/contact',
    rateLimit({
      windowMs: 60 * 60_000,
      limit: env.isTest ? 1000 : 8,
      message: { error: { code: 'rate_limited', message: 'Too many messages. Please email us directly.' } },
      standardHeaders: 'draft-8',
      legacyHeaders: false,
    }),
    async (req, res) => {
      const input = parse(
        z.object({
          name: z.string().trim().min(2, 'Enter your name.').max(120),
          email: z.string().trim().toLowerCase().email('Enter a valid email address.').max(254),
          subject: z.string().trim().min(3, 'Add a subject.').max(160),
          message: z.string().trim().min(20, 'Please add a little more detail.').max(4000),
          orderNumber: z.string().trim().max(40).optional(),
          website: z.string().max(0).optional(),
        }),
        req.body,
      );
      if (input.website) {
        res.json({ ok: true, reference: 'SUP-IGNORED' });
        return;
      }
      const id = newId('sup_');
      execute(
        db,
        `INSERT INTO support_tickets (id, user_id, email, name, subject, message, order_number)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        id,
        req.user?.id ?? null,
        input.email,
        input.name,
        input.subject,
        input.message,
        input.orderNumber ?? null,
      );
      await notify(db, {
        email: env.smtp.supportEmail,
        type: 'support_ticket',
        subject: `Support: ${input.subject}`,
        body: `<p><strong>From:</strong> ${input.name} &lt;${input.email}&gt;<br/><strong>Order:</strong> ${input.orderNumber ?? '—'}</p><p>${input.message.replaceAll('<', '&lt;')}</p>`,
        dedupeKey: `support:${id}`,
      });
      const reference = id.replace('sup_', 'SUP-').slice(0, 14).toUpperCase();
      auditSupport(db, id, input.email, clientIp(req));
      res.status(201).json({
        ok: true,
        reference,
        message:
          'Your message has been recorded. If email delivery is not configured on this deployment, the team will still see it in the support queue.',
      });
    },
  );

  // Liveness must not touch dependencies: it only answers "is this process up?".
  router.get('/health/live', (_req, res) => {
    res.json({ status: 'ok', uptimeSeconds: Math.round(process.uptime()), timestamp: new Date().toISOString() });
  });

  // Readiness checks the only essential dependency: SQLite and the schema that
  // authentication and sessions actually query. A migration row alone did not
  // catch an auth-schema mismatch in production.
  const readiness = (_req: Request, res: Response) => {
    let databaseOk = true;
    let authOk = true;
    let migration = 0;
    try {
      queryOne(db, 'SELECT 1 AS ok');
      migration = queryOne<{ version: number }>(db, 'SELECT MAX(version) AS version FROM schema_migrations')?.version ?? 0;
      queryOne(
        db,
        `SELECT u.id, u.email, u.password_hash, u.is_disabled, u.email_verified,
                u.mfa_secret, u.mfa_enabled_at,
                COALESCE(p.full_name, '') AS full_name
           FROM users u LEFT JOIN profiles p ON p.id = u.id LIMIT 1`,
      );
      queryOne(db, 'SELECT token_hash, user_id, expires_at, last_seen_at FROM sessions LIMIT 1');
      queryOne(db, 'SELECT id, user_id, token_hash, attempts, expires_at FROM mfa_challenges LIMIT 1');
      queryOne(db, 'SELECT id, payout_status, payout_status_before_hold FROM seller_profiles LIMIT 1');
      if (typeof crypto.argon2Sync !== 'function') authOk = false;
    } catch {
      databaseOk = false;
      authOk = false;
    }
    const ready = databaseOk && authOk && migration >= 13;
    res.status(ready ? 200 : 503).json({
      status: ready ? 'ok' : 'degraded',
      ready,
      database: databaseOk ? 'up' : 'down',
      schema: migration >= 13 && authOk ? 'current' : 'outdated',
      auth: authOk ? 'ok' : 'mismatch',
      timestamp: new Date().toISOString(),
    });
  };
  router.get(['/health', '/health/ready'], readiness);

  return router;
}

function auditSupport(db: Db, id: string, email: string, ip: string): void {
  try {
    execute(
      db,
      `INSERT INTO audit_logs (id, actor_id, actor_email, action, entity_type, entity_id, after_json)
       VALUES (?, NULL, ?, 'support.created', 'support_ticket', ?, ?)`,
      newId('aud_'),
      email,
      id,
      JSON.stringify({ channel: 'web', ipHint: ip.split('.').slice(0, 2).join('.') + '.x.x' }),
    );
  } catch {
    // Support submission must not fail because audit insertion failed.
  }
}

const GOOGLE_PRODUCT_CATEGORIES: Record<string, string> = {
  'shawls-and-weaves': 'Apparel & Accessories > Clothing Accessories > Scarves & Shawls',
  knitwear: 'Apparel & Accessories > Clothing',
  'caps-and-headwear': 'Apparel & Accessories > Clothing Accessories > Hats',
  'tea-and-infusions': 'Food, Beverages & Tobacco > Beverages > Tea & Infusions',
  'fruits-and-fresh-produce': 'Food, Beverages & Tobacco > Food Items > Fruits & Vegetables',
  'dry-fruit-and-nuts': 'Food, Beverages & Tobacco > Food Items > Nuts & Seeds',
  'pantry-and-preserves': 'Food, Beverages & Tobacco > Food Items > Condiments & Sauces',
  'cold-pressed-oils': 'Food, Beverages & Tobacco > Food Items > Cooking & Baking Ingredients > Cooking Oils',
  'pulses-and-staples': 'Food, Beverages & Tobacco > Food Items > Grains, Rice & Cereal',
  'crafts-and-handicrafts': 'Home & Garden > Decor',
  'traditional-goods-and-essentials': 'Home & Garden > Decor',
  gifting: 'Arts & Entertainment > Party & Celebration > Gift Giving > Gift Baskets',
};

export function sitemapRouter(db: Db): Router {
  const router = Router();

  function resolveSitemapBase(req: Request): string {
    if (env.isProduction) return 'https://www.dearhills.in';
    const host = req.get('x-forwarded-host') || req.get('host') || '';
    if (host.includes('dearhills.in')) return 'https://www.dearhills.in';
    if (host) {
      const proto = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
      return `${proto}://${host}`;
    }
    return env.appUrl.startsWith('http') ? env.appUrl : 'https://www.dearhills.in';
  }

  const stripXmlControlChars = (value: string): string => {
    let out = '';
    for (let i = 0; i < value.length; i += 1) {
      const code = value.charCodeAt(i);
      if (code === 0x09 || code === 0x0a || code === 0x0d || (code >= 0x20 && code !== 0x7f)) {
        out += value[i];
      }
    }
    return out;
  };

  const escapeXml = (value: string) =>
    stripXmlControlChars(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&apos;');

  const formatIsoNoMs = (iso: string) => iso.replace(/\.\d{3}Z$/, 'Z');

  const toAbsolute = (base: string, url: string) =>
    url.startsWith('http') ? url : `${base}${url.startsWith('/') ? '' : '/'}${url}`;

  router.get('/sitemap.xml', (req, res) => {
    const base = resolveSitemapBase(req);
    const staticEntries = [
      { path: '/', priority: '1.0', changefreq: 'daily' },
      { path: '/shop', priority: '0.9', changefreq: 'daily' },
      { path: '/blog', priority: '0.8', changefreq: 'daily' },
      { path: '/makers', priority: '0.8', changefreq: 'weekly' },
      { path: '/become-a-maker', priority: '0.8', changefreq: 'weekly' },
      { path: '/about', priority: '0.7', changefreq: 'monthly' },
      { path: '/sourcing', priority: '0.7', changefreq: 'monthly' },
      { path: '/contact', priority: '0.6', changefreq: 'monthly' },
      { path: '/faq', priority: '0.6', changefreq: 'monthly' },
    ];

    const policyPaths = ['shipping', 'returns', 'privacy', 'terms', 'seller-terms', 'authenticity', 'cookies'].map(
      (key) => `/policies/${key}`,
    );

    const categories = queryAll<{ slug: string; last_updated: string | null }>(
      db,
      `SELECT c.slug,
              (SELECT MAX(p.updated_at)
                 FROM products p
                 JOIN seller_profiles s ON s.id = p.seller_id
                 LEFT JOIN users u ON u.id = s.user_id
                WHERE (p.category_id = c.id OR p.category_id IN (SELECT ch.id FROM categories ch WHERE ch.parent_id = c.id AND ch.is_active = 1))
                  AND p.status = 'approved'
                  AND s.status = 'approved'
                  AND s.store_status = 'active'
                  AND NOT ${DEMO_PRODUCT_SQL}) AS last_updated
         FROM categories c
        WHERE c.is_active = 1
          AND EXISTS (
            SELECT 1
              FROM products p
              JOIN seller_profiles s ON s.id = p.seller_id
              LEFT JOIN users u ON u.id = s.user_id
             WHERE (p.category_id = c.id OR p.category_id IN (SELECT ch.id FROM categories ch WHERE ch.parent_id = c.id AND ch.is_active = 1))
               AND p.status = 'approved'
               AND s.status = 'approved'
               AND s.store_status = 'active'
               AND NOT ${DEMO_PRODUCT_SQL}
          )
        ORDER BY c.sort_order ASC`,
    );

    const products = queryAll<{ id: string; slug: string; name: string; updated_at: string }>(
      db,
      `SELECT p.id, p.slug, p.name, p.updated_at
         FROM products p
         JOIN seller_profiles s ON s.id = p.seller_id
         LEFT JOIN users u ON u.id = s.user_id
        WHERE p.status = 'approved'
          AND s.status = 'approved'
          AND s.store_status = 'active'
          AND NOT ${DEMO_PRODUCT_SQL}
        ORDER BY p.is_featured DESC, p.updated_at DESC`,
    );

    const productImagesById = new Map<string, { url: string; alt: string }[]>();
    if (products.length > 0) {
      const imageRows = queryAll<{ product_id: string; url: string; alt: string }>(
        db,
        `SELECT product_id, url, alt
           FROM product_images
          WHERE product_id IN (${products.map(() => '?').join(',')})
          ORDER BY sort_order ASC`,
        ...products.map((p) => p.id),
      );
      for (const row of imageRows) {
        const list = productImagesById.get(row.product_id) ?? [];
        list.push({ url: row.url, alt: row.alt });
        productImagesById.set(row.product_id, list);
      }
    }

    const sellers = queryAll<{
      slug: string;
      business_name: string;
      cover_url: string | null;
      logo_url: string | null;
      updated_at: string | null;
    }>(
      db,
      `SELECT s.slug, s.business_name, s.cover_url, s.logo_url,
              COALESCE(s.updated_at, s.created_at) AS updated_at
         FROM seller_profiles s
         LEFT JOIN users u ON u.id = s.user_id
        WHERE s.status = 'approved'
          AND s.store_status = 'active'
          AND NOT ${DEMO_SELLER_SQL}`,
    );

    const campaigns = queryAll<Pick<CampaignRow, 'id' | 'slug' | 'status' | 'starts_at' | 'ends_at'>>(
      db,
      "SELECT id, slug, status, starts_at, ends_at FROM campaigns WHERE status = 'active'",
    ).filter(
      (campaign) =>
        effectiveCampaignStatus(campaign) === 'active' && countRealCampaignProducts(db, campaign.id) > 0,
    );

    const urls = [
      ...staticEntries.map(
        (entry) =>
          `<url><loc>${escapeXml(base + entry.path)}</loc><changefreq>${entry.changefreq}</changefreq><priority>${entry.priority}</priority></url>`,
      ),
      ...categories.map((category) => {
        const lastmod = category.last_updated ? `<lastmod>${escapeXml(category.last_updated.slice(0, 10))}</lastmod>` : '';
        return `<url><loc>${escapeXml(`${base}/categories/${category.slug}`)}</loc>${lastmod}<changefreq>weekly</changefreq><priority>0.8</priority></url>`;
      }),
      ...campaigns.map(
        (campaign) =>
          `<url><loc>${escapeXml(`${base}/offers/${campaign.slug}`)}</loc><changefreq>daily</changefreq><priority>0.8</priority></url>`,
      ),
      ...sellers.map((seller) => {
        const lastmod = seller.updated_at ? `<lastmod>${escapeXml(seller.updated_at.slice(0, 10))}</lastmod>` : '';
        const imgUrl = seller.cover_url ?? seller.logo_url;
        const imgTag = imgUrl
          ? `<image:image><image:loc>${escapeXml(toAbsolute(base, imgUrl))}</image:loc><image:title>${escapeXml(seller.business_name)}</image:title></image:image>`
          : '';
        return `<url><loc>${escapeXml(`${base}/makers/${seller.slug}`)}</loc>${lastmod}<changefreq>weekly</changefreq><priority>0.7</priority>${imgTag}</url>`;
      }),
      ...products.map((product) => {
        const imgs = productImagesById.get(product.id) ?? [];
        const imgTags = imgs
          .map(
            (img) =>
              `<image:image><image:loc>${escapeXml(toAbsolute(base, img.url))}</image:loc><image:title>${escapeXml(product.name)}</image:title></image:image>`,
          )
          .join('');
        return `<url><loc>${escapeXml(`${base}/shop/${product.slug}`)}</loc><lastmod>${escapeXml(product.updated_at.slice(0, 10))}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority>${imgTags}</url>`;
      }),
      ...BLOG_POSTS.map((post) => {
        const fullImg = toAbsolute(base, post.coverImage);
        return `<url><loc>${escapeXml(`${base}/blog/${post.slug}`)}</loc><lastmod>${escapeXml(post.publishedAt)}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority><image:image><image:loc>${escapeXml(fullImg)}</image:loc><image:title>${escapeXml(post.title)}</image:title></image:image></url>`;
      }),
      ...policyPaths.map(
        (path) =>
          `<url><loc>${escapeXml(base + path)}</loc><changefreq>monthly</changefreq><priority>0.4</priority></url>`,
      ),
    ].join('');

    res
      .type('application/xml')
      .set('Cache-Control', 'public, max-age=300, s-maxage=3600')
      .send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">${urls}</urlset>`);
  });

  router.get('/feeds/google-merchant.xml', (req, res) => {
    const base = resolveSitemapBase(req);

    const rows = queryAll<{
      id: string;
      slug: string;
      name: string;
      short_description: string;
      description: string;
      price_paise: number;
      promo_price_paise: number | null;
      sku: string;
      weight_g: number | null;
      region: string | null;
      origin_place: string | null;
      stock: number;
      seller_name: string;
      category_name: string;
      category_slug: string;
    }>(
      db,
      `SELECT p.id, p.slug, p.name, p.short_description, p.description, p.price_paise,
              p.sku, p.weight_g, COALESCE(NULLIF(p.region, ''), s.region) AS region, p.origin_place,
              acp.promo_price_paise,
              i.quantity - i.reserved_quantity AS stock,
              s.business_name AS seller_name,
              c.name AS category_name, c.slug AS category_slug
         FROM products p
         JOIN seller_profiles s ON s.id = p.seller_id
         LEFT JOIN users u ON u.id = s.user_id
         JOIN categories c ON c.id = p.category_id
         JOIN inventory i ON i.product_id = p.id
         LEFT JOIN active_campaign_prices acp ON acp.product_id = p.id
        WHERE p.status = 'approved'
          AND s.status = 'approved'
          AND s.store_status = 'active'
          AND p.price_paise > 0
          AND NOT ${DEMO_PRODUCT_SQL}
        ORDER BY p.is_featured DESC, p.updated_at DESC`,
    );

    const imagesByProduct = new Map<string, string[]>();
    if (rows.length > 0) {
      const imgRows = queryAll<{ product_id: string; url: string }>(
        db,
        `SELECT product_id, url
           FROM product_images
          WHERE product_id IN (${rows.map(() => '?').join(',')})
          ORDER BY sort_order ASC`,
        ...rows.map((r) => r.id),
      );
      for (const img of imgRows) {
        const list = imagesByProduct.get(img.product_id) ?? [];
        list.push(toAbsolute(base, img.url));
        imagesByProduct.set(img.product_id, list);
      }
    }

    const campaignMetaByProduct = new Map<string, { name: string; startsAt: string | null; endsAt: string | null }>();
    const promoIds = rows.filter((r) => r.promo_price_paise !== null && r.promo_price_paise < r.price_paise).map((r) => r.id);
    if (promoIds.length > 0) {
      const campRows = queryAll<{
        product_id: string;
        name: string;
        starts_at: string | null;
        ends_at: string | null;
      }>(
        db,
        `SELECT cp.product_id, c.name, c.starts_at, c.ends_at
           FROM campaign_products cp
           JOIN campaigns c ON c.id = cp.campaign_id
          WHERE cp.product_id IN (${promoIds.map(() => '?').join(',')})
            AND c.status = 'active'
            AND (c.starts_at IS NULL OR c.starts_at <= strftime('%Y-%m-%dT%H:%M:%fZ','now'))
            AND (c.ends_at IS NULL OR c.ends_at >= strftime('%Y-%m-%dT%H:%M:%fZ','now'))
          ORDER BY cp.promo_price_paise ASC`,
        ...promoIds,
      );
      for (const c of campRows) {
        if (!campaignMetaByProduct.has(c.product_id)) {
          campaignMetaByProduct.set(c.product_id, { name: c.name, startsAt: c.starts_at, endsAt: c.ends_at });
        }
      }
    }

    const skuCounts = new Map<string, number>();
    for (const row of rows) {
      const normalizedSku = (row.sku || '').trim().toLowerCase();
      if (normalizedSku) skuCounts.set(normalizedSku, (skuCounts.get(normalizedSku) ?? 0) + 1);
    }

    const itemsXml = rows
      .map((row) => {
        const imgs = imagesByProduct.get(row.id) ?? [];
        const primaryImage = imgs[0] ?? `${base}/images/home/kalpa-dawn-1100.jpg`;
        const additionalImages = imgs.slice(1, 11);
        const hasPromo = row.promo_price_paise !== null && row.promo_price_paise < row.price_paise;
        const effectivePricePaise = hasPromo ? row.promo_price_paise! : row.price_paise;
        const shippingPaise = shippingFor(effectivePricePaise);
        const description =
          cleanSeoText(row.description, 5000) ||
          cleanSeoText(row.short_description, 5000) ||
          buildProductFallbackDescription({
            name: row.name,
            categorySlug: row.category_slug,
            categoryName: row.category_name,
            originPlace: row.origin_place,
            region: row.region,
          });
        const googleCat = GOOGLE_PRODUCT_CATEGORIES[row.category_slug];
        const campaignMeta = campaignMetaByProduct.get(row.id);

        const rawSku = (row.sku || '').trim();
        const isDuplicateSku = rawSku ? (skuCounts.get(rawSku.toLowerCase()) ?? 0) > 1 : false;
        const merchantId =
          rawSku && !isDuplicateSku
            ? rawSku.slice(0, 50)
            : rawSku
              ? `${rawSku.slice(0, 30)}-${row.id.replace(/[^A-Za-z0-9]/g, '').slice(-12)}`.slice(0, 50)
              : row.id.slice(0, 50);

        const parts = [
          `<g:id>${escapeXml(merchantId)}</g:id>`,
          `<g:title>${escapeXml(row.name.slice(0, 150))}</g:title>`,
          `<g:description>${escapeXml(description)}</g:description>`,
          `<g:link>${escapeXml(`${base}/shop/${row.slug}`)}</g:link>`,
          `<g:image_link>${escapeXml(primaryImage)}</g:image_link>`,
          ...additionalImages.map((img) => `<g:additional_image_link>${escapeXml(img)}</g:additional_image_link>`),
          `<g:condition>new</g:condition>`,
          `<g:availability>${row.stock > 0 ? 'in_stock' : 'out_of_stock'}</g:availability>`,
          `<g:price>${(row.price_paise / 100).toFixed(2)} INR</g:price>`,
          ...(hasPromo ? [`<g:sale_price>${(row.promo_price_paise! / 100).toFixed(2)} INR</g:sale_price>`] : []),
          ...(hasPromo && campaignMeta?.startsAt && campaignMeta?.endsAt
            ? [
                `<g:sale_price_effective_date>${escapeXml(
                  `${formatIsoNoMs(campaignMeta.startsAt)}/${formatIsoNoMs(campaignMeta.endsAt)}`,
                )}</g:sale_price_effective_date>`,
              ]
            : []),
          `<g:brand>Dear Hills</g:brand>`,
          `<g:identifier_exists>false</g:identifier_exists>`,
          `<g:product_type>${escapeXml(row.category_name)}</g:product_type>`,
          ...(googleCat ? [`<g:google_product_category>${escapeXml(googleCat)}</g:google_product_category>`] : []),
          `<g:shipping><g:country>IN</g:country><g:service>Standard Shipping</g:service><g:price>${(shippingPaise / 100).toFixed(2)} INR</g:price></g:shipping>`,
          ...(row.weight_g && row.weight_g > 0 ? [`<g:shipping_weight>${row.weight_g} g</g:shipping_weight>`] : []),
          ...(row.region ? [`<g:custom_label_0>${escapeXml(row.region)}</g:custom_label_0>`] : []),
          `<g:custom_label_1>${escapeXml(row.seller_name)}</g:custom_label_1>`,
          ...(campaignMeta?.name ? [`<g:custom_label_2>${escapeXml(campaignMeta.name)}</g:custom_label_2>`] : []),
        ];

        return `<item>${parts.join('')}</item>`;
      })
      .join('');

    const feedXml = `<?xml version="1.0" encoding="UTF-8"?><rss xmlns:g="http://base.google.com/ns/1.0" version="2.0"><channel><title>DEAR HILLS — Authentic Himachali Marketplace Product Feed</title><link>${escapeXml(base)}</link><description>Curated marketplace for authentic products made and grown in Himachal Pradesh.</description>${itemsXml}</channel></rss>`;

    res
      .type('application/xml')
      .set('Cache-Control', 'public, max-age=900, s-maxage=3600')
      .send(feedXml);
  });

  router.get('/robots.txt', (req, res) => {
    const base = resolveSitemapBase(req);
    res
      .type('text/plain; charset=utf-8')
      .set('Cache-Control', 'public, max-age=86400')
      .send(`User-agent: *
Allow: /
Allow: /sellers/
Disallow: /account
Disallow: /admin
Disallow: /seller
Disallow: /checkout
Disallow: /api/
Disallow: /onboarding
Disallow: /cart
Disallow: /login
Disallow: /register
Disallow: /forgot-password
Disallow: /reset-password
Disallow: /verify-email

Sitemap: ${base}/sitemap.xml
`);
  });

  return router;
}
