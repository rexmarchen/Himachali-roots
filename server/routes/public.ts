import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { env } from '../env.js';
import { execute, queryAll, queryOne, type Db } from '../db.js';
import { getProduct, getRegions, getSellerStorefront, listCategories, listProducts, listPublicSellers } from '../lib/catalog.js';
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
import { notify } from '../lib/email.js';

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
    const products = listProducts(db, { featured: true, pageSize: 4, sort: 'newest' });
    const newArrivals = listProducts(db, { pageSize: 4, sort: 'newest' });
    const gifting =
      content.homepage.gifting.categorySlug
        ? listProducts(db, { category: content.homepage.gifting.categorySlug, pageSize: 3 })
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
         JOIN seller_profiles s ON s.id = p.seller_id AND s.status = 'approved'
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
         JOIN users u ON u.id = r.user_id
         LEFT JOIN profiles p ON p.id = u.id
        WHERE r.status = 'published'
        ORDER BY r.created_at DESC LIMIT 3`,
    );

    const counts = queryOne<{ products: number; sellers: number; regions: number }>(
      db,
      `SELECT
         (SELECT COUNT(*) FROM products p JOIN seller_profiles s ON s.id = p.seller_id
           WHERE p.status = 'approved' AND s.status = 'approved') AS products,
         (SELECT COUNT(*) FROM seller_profiles WHERE status = 'approved') AS sellers,
         (SELECT COUNT(DISTINCT p.region) FROM products p JOIN seller_profiles s ON s.id = p.seller_id
           WHERE p.status = 'approved' AND s.status = 'approved' AND p.region IS NOT NULL) AS regions`,
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
      pageSize: optInt(req.query.pageSize) ?? 12,
    });
    res.json({
      ...result,
      filters: {
        categories: listCategories(db),
        sellers: listPublicSellers(db).map((seller) => ({ name: seller.name, slug: seller.slug })),
        regions: getRegions(db),
        priceRangePaise: queryOne<{ min: number | null; max: number | null }>(
          db,
          "SELECT MIN(price_paise) AS min, MAX(price_paise) AS max FROM products WHERE status = 'approved'",
        ),
      },
    });
  });

  router.get(['/products/:slug', '/shop/products/:slug'], (req, res) => {
    res.json({ product: getProduct(db, String(req.params.slug)) });
  });

  router.get('/campaigns/:slug', (req, res) => {
    const campaign = getCampaignBySlug(db, String(req.params.slug));
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
             JOIN seller_profiles s ON s.id = p.seller_id AND s.status = 'approved'
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
             JOIN seller_profiles s ON s.id = p.seller_id AND s.status = 'approved'
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

  router.get('/sellers', (_req, res) => {
    res.json({ sellers: listPublicSellers(db) });
  });

  router.get('/sellers/:slug', (req, res) => {
    const seller = getSellerStorefront(db, req.params.slug);
    const products = listProducts(db, { seller: seller.slug, pageSize: 24, sort: 'newest' });
    res.json({ seller, products });
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

  router.get('/health', (_req, res) => {
    let databaseOk = true;
    try {
      queryOne(db, 'SELECT 1 AS ok');
    } catch {
      databaseOk = false;
    }
    const payments = paymentProviderStatus();
    res.status(databaseOk ? 200 : 503).json({
      status: databaseOk ? 'ok' : 'degraded',
      database: databaseOk ? 'up' : 'down',
      payments: payments.configured ? 'configured' : 'unconfigured',
      shipping: env.shiprocket.configured ? 'configured' : 'manual-only',
      email: env.smtp.configured ? 'configured' : 'unconfigured',
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  });

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

export function sitemapRouter(db: Db): Router {
  const router = Router();
  router.get('/sitemap.xml', (_req, res) => {
    const base = env.appUrl;
    const staticPaths = ['/', '/shop', '/makers', '/about', '/sourcing', '/contact', '/faq'];
    const policyPaths = ['shipping', 'returns', 'privacy', 'terms', 'seller-terms', 'authenticity', 'cookies'].map(
      (key) => `/policies/${key}`,
    );
    const products = queryAll<{ slug: string; updated_at: string }>(
      db,
      `SELECT p.slug, p.updated_at FROM products p JOIN seller_profiles s ON s.id = p.seller_id
        WHERE p.status = 'approved' AND s.status = 'approved'`,
    );
    const sellers = queryAll<{ slug: string }>(db, "SELECT slug FROM seller_profiles WHERE status = 'approved'");
    const campaigns = queryAll<Pick<CampaignRow, 'id' | 'slug' | 'status' | 'starts_at' | 'ends_at'>>(
      db,
      "SELECT id, slug, status, starts_at, ends_at FROM campaigns WHERE status = 'active'",
    ).filter(
      (campaign) =>
        effectiveCampaignStatus(campaign) === 'active' && campaignStats(db, campaign.id).productCount > 0,
    );
    const escape = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
    const urls = [
      ...staticPaths.map((path) => `<url><loc>${escape(base + path)}</loc></url>`),
      ...policyPaths.map((path) => `<url><loc>${escape(base + path)}</loc></url>`),
      ...campaigns.map((campaign) => `<url><loc>${escape(`${base}/offers/${campaign.slug}`)}</loc></url>`),
      ...sellers.map((seller) => `<url><loc>${escape(`${base}/makers/${seller.slug}`)}</loc></url>`),
      ...products.map(
        (product) =>
          `<url><loc>${escape(`${base}/shop/${product.slug}`)}</loc><lastmod>${escape(product.updated_at.slice(0, 10))}</lastmod></url>`,
      ),
    ].join('');
    res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`);
  });
  router.get('/robots.txt', (_req, res) => {
    res
      .type('text/plain')
      .send(`User-agent: *\nAllow: /\nDisallow: /account\nDisallow: /admin\nDisallow: /sell\nDisallow: /checkout\nDisallow: /api\nSitemap: ${env.appUrl}/sitemap.xml\n`);
  });
  return router;
}
