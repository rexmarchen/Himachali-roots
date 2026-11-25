import { queryAll, queryOne, type Db } from '../db.js';
import { env } from '../env.js';
import { BLOG_POSTS } from '../../shared/blog.js';
import { POLICY_KEYS } from '../../shared/content.js';
import {
  buildCategoryFallbackDescription,
  buildCategorySeoTitle,
  buildProductFallbackDescription,
  buildProductSeoTitle,
  cleanSeoText,
} from '../../shared/seo.js';

export { cleanSeoText };
import {
  effectiveCampaignStatus,
  getCampaignBySlug,
  getFeaturedCampaign,
  isCampaignPageVisible,
  type CampaignRow,
} from './campaigns.js';
import { shippingFor } from './pricing.js';
import { getPolicy, getSiteContent } from './site.js';

export interface SeoMetadata {
  title: string;
  description: string;
  canonicalUrl: string;
  imageUrl?: string;
  ogType?: 'website' | 'product' | 'article' | 'profile';
  jsonLd?: Record<string, unknown> | Array<Record<string, unknown>>;
  noindex?: boolean;
  statusCode?: number;
}

const DEFAULT_ORIGIN = 'https://www.dearhills.in';
const DEFAULT_TITLE = 'DEAR HILLS — Authentic Himalayan Handloom, Organic Harvest & Mountain Goods';
const DEFAULT_DESCRIPTION =
  'Curated marketplace for authentic products made and grown in Himachal Pradesh — handloom shawls, Kangra tea, raw honey, orchard fruits and traditional crafts.';

/**
 * Authoritative SQL predicates for excluding seeded demo stores, demo SKUs,
 * and ₹1 test listings from search indexing and Google Merchant feeds.
 *
 * Requires table aliases `s` (seller_profiles) and optional `u` (users).
 */
export const DEMO_SELLER_SQL = `(
  LOWER(s.slug) LIKE '%-demo'
  OR LOWER(s.slug) = 'demo'
  OR LOWER(s.business_name) LIKE '%(demo)%'
  OR (u.email IS NOT NULL AND LOWER(u.email) LIKE '%.test')
)`;

/**
 * Requires table aliases `p` (products), `s` (seller_profiles), and `u` (users).
 */
export const DEMO_PRODUCT_SQL = `(
  p.is_demo = 1
  OR UPPER(p.sku) LIKE 'DEMO-%'
  OR p.price_paise <= 100
  OR LOWER(p.short_description) LIKE '%test transaction%'
  OR ${DEMO_SELLER_SQL}
)`;

export function isDemoSellerInput(seller: {
  slug?: string | null;
  name?: string | null;
  email?: string | null;
}): boolean {
  const slug = (seller.slug ?? '').trim().toLowerCase();
  const name = (seller.name ?? '').trim().toLowerCase();
  const email = (seller.email ?? '').trim().toLowerCase();
  return (
    slug === 'demo' ||
    slug.endsWith('-demo') ||
    name.includes('(demo)') ||
    email.endsWith('.test')
  );
}

export function isDemoProductInput(product: {
  isDemo?: boolean | number | null;
  sku?: string | null;
  pricePaise?: number | null;
  shortDescription?: string | null;
  sellerSlug?: string | null;
  sellerName?: string | null;
  sellerEmail?: string | null;
}): boolean {
  const sku = (product.sku ?? '').trim().toUpperCase();
  const short = (product.shortDescription ?? '').trim().toLowerCase();
  return (
    Boolean(product.isDemo) ||
    sku.startsWith('DEMO-') ||
    (typeof product.pricePaise === 'number' && product.pricePaise <= 100) ||
    short.includes('test transaction') ||
    isDemoSellerInput({
      slug: product.sellerSlug,
      name: product.sellerName,
      email: product.sellerEmail,
    })
  );
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function resolveOrigin(hostHeader?: string): string {
  if (env.isProduction) return DEFAULT_ORIGIN;
  if (!hostHeader) return env.appUrl.startsWith('http') ? env.appUrl : DEFAULT_ORIGIN;
  if (hostHeader.includes('dearhills.in')) return DEFAULT_ORIGIN;
  return `http://${hostHeader}`;
}

function toAbsoluteUrl(origin: string, url: string | null | undefined, fallback?: string): string {
  if (!url) return fallback ?? `${origin}/images/home/kalpa-dawn-1100.jpg`;
  return url.startsWith('http') ? url : `${origin}${url.startsWith('/') ? '' : '/'}${url}`;
}

function queryStr(
  queryParams: Record<string, string | string[] | undefined> | undefined,
  key: string,
): string | undefined {
  const val = queryParams?.[key];
  if (typeof val === 'string') return val.trim() || undefined;
  if (Array.isArray(val)) {
    const first = val.find((item): item is string => typeof item === 'string' && item.trim().length > 0);
    return first?.trim() || undefined;
  }
  return undefined;
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function shippingDetailsJsonLd(pricePaise: number) {
  const rate = (shippingFor(pricePaise) / 100).toFixed(2);
  return {
    '@type': 'OfferShippingDetails',
    shippingRate: {
      '@type': 'MonetaryAmount',
      value: rate,
      currency: 'INR',
    },
    shippingDestination: {
      '@type': 'DefinedRegion',
      addressCountry: 'IN',
    },
    deliveryTime: {
      '@type': 'ShippingDeliveryTime',
      handlingTime: {
        '@type': 'QuantitativeValue',
        minValue: 1,
        maxValue: 2,
        unitCode: 'DAY',
      },
      transitTime: {
        '@type': 'QuantitativeValue',
        minValue: 3,
        maxValue: 7,
        unitCode: 'DAY',
      },
    },
  };
}

function merchantReturnPolicyJsonLd() {
  return {
    '@type': 'MerchantReturnPolicy',
    applicableCountry: 'IN',
    returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow',
    merchantReturnDays: 7,
    returnMethod: 'https://schema.org/ReturnByMail',
    returnFees: 'https://schema.org/ReturnFeesCustomerResponsibility',
  };
}

function breadcrumbList(origin: string, items: Array<{ name: string; path?: string }>) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, idx) => ({
      '@type': 'ListItem',
      position: idx + 1,
      name: item.name,
      ...(item.path !== undefined ? { item: item.path ? `${origin}${item.path}` : origin } : {}),
    })),
  };
}

export function getSeoMetadata(
  db: Db,
  pathname: string,
  hostHeader?: string,
  queryParams?: Record<string, string | string[] | undefined>,
): SeoMetadata {
  const origin = resolveOrigin(hostHeader);
  const normalizedPath = pathname.replace(/\/+$/, '') || '/';
  const fallbackImage = `${origin}/images/home/kalpa-dawn-1100.jpg`;

  // 1. Private / transactional / auth routes: strictly noindex
  if (
    normalizedPath.startsWith('/account') ||
    normalizedPath.startsWith('/admin') ||
    normalizedPath === '/seller' ||
    normalizedPath.startsWith('/seller/') ||
    normalizedPath.startsWith('/checkout') ||
    normalizedPath.startsWith('/onboarding') ||
    normalizedPath === '/cart' ||
    normalizedPath === '/login' ||
    normalizedPath === '/register' ||
    normalizedPath === '/forgot-password' ||
    normalizedPath === '/reset-password' ||
    normalizedPath === '/verify-email'
  ) {
    return {
      title: 'Dear Hills',
      description: DEFAULT_DESCRIPTION,
      canonicalUrl: `${origin}${normalizedPath}`,
      imageUrl: fallbackImage,
      noindex: true,
    };
  }

  // 2. Single Product Route: /shop/:slug or /products/:slug
  const productMatch = normalizedPath.match(/^\/(?:shop|products)\/([^/]+)$/);
  if (productMatch) {
    const slug = safeDecodeURIComponent(productMatch[1]);
    const product = queryOne<{
      id: string;
      name: string;
      slug: string;
      short_description: string | null;
      description: string | null;
      price_paise: number;
      promo_price_paise: number | null;
      sku: string | null;
      origin_place: string | null;
      materials: string | null;
      is_demo: number;
      stock: number;
      business_name: string;
      seller_slug: string;
      seller_email: string | null;
      region: string | null;
      category_name: string;
      category_slug: string;
      rating_average: number | null;
      rating_count: number;
    }>(
      db,
      `SELECT p.id, p.name, p.slug, p.short_description, p.description, p.price_paise, p.sku,
              p.origin_place, p.materials, p.is_demo,
              i.quantity - i.reserved_quantity AS stock,
              acp.promo_price_paise,
              s.business_name, s.slug AS seller_slug, COALESCE(NULLIF(p.region, ''), s.region) AS region, u.email AS seller_email,
              c.name AS category_name, c.slug AS category_slug,
              (SELECT ROUND(AVG(r.rating), 1) FROM reviews r WHERE r.product_id = p.id AND r.status = 'published') AS rating_average,
              (SELECT COUNT(*) FROM reviews r WHERE r.product_id = p.id AND r.status = 'published') AS rating_count
       FROM products p
       JOIN seller_profiles s ON s.id = p.seller_id
       LEFT JOIN users u ON u.id = s.user_id
       JOIN categories c ON c.id = p.category_id
       JOIN inventory i ON i.product_id = p.id
       LEFT JOIN active_campaign_prices acp ON acp.product_id = p.id
       WHERE p.slug = ? AND p.status = 'approved' AND s.status = 'approved' AND s.store_status = 'active'`,
      slug,
    );

    if (!product) {
      return {
        title: 'Listing not available · Dear Hills',
        description: 'This listing may be paused, awaiting review, or removed.',
        canonicalUrl: `${origin}/shop/${encodeURIComponent(slug)}`,
        imageUrl: fallbackImage,
        noindex: true,
        statusCode: 404,
      };
    }

    const images = queryAll<{ url: string }>(
      db,
      'SELECT url FROM product_images WHERE product_id = ? ORDER BY sort_order ASC',
      product.id,
    );
    const imageUrls = images.length
      ? images.map((img) => toAbsoluteUrl(origin, img.url, fallbackImage))
      : [fallbackImage];

    const effectivePricePaise =
      product.promo_price_paise !== null && product.promo_price_paise < product.price_paise
        ? product.promo_price_paise
        : product.price_paise;

    let priceValidUntil = '2027-12-31';
    if (product.promo_price_paise !== null && product.promo_price_paise < product.price_paise) {
      const campaignEnd = queryOne<{ ends_at: string | null }>(
        db,
        `SELECT c.ends_at
         FROM campaign_products cp
         JOIN campaigns c ON c.id = cp.campaign_id
         WHERE cp.product_id = ?
           AND c.status = 'active'
           AND (c.starts_at IS NULL OR c.starts_at <= strftime('%Y-%m-%dT%H:%M:%fZ','now'))
           AND (c.ends_at IS NULL OR c.ends_at >= strftime('%Y-%m-%dT%H:%M:%fZ','now'))
           AND cp.promo_price_paise = ?
         LIMIT 1`,
        product.id,
        product.promo_price_paise,
      );
      if (campaignEnd?.ends_at) {
        priceValidUntil = campaignEnd.ends_at.slice(0, 10);
      }
    }

    const availability =
      product.stock <= 0 ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock';

    const title = buildProductSeoTitle({
      name: product.name,
      categorySlug: product.category_slug,
      categoryName: product.category_name,
    });
    const description =
      cleanSeoText(product.short_description) ||
      cleanSeoText(product.description) ||
      buildProductFallbackDescription({
        name: product.name,
        categorySlug: product.category_slug,
        categoryName: product.category_name,
        originPlace: product.origin_place,
        region: product.region,
      });
    const canonicalUrl = `${origin}/shop/${product.slug}`;

    const isDemo = isDemoProductInput({
      isDemo: product.is_demo === 1,
      sku: product.sku,
      pricePaise: product.price_paise,
      shortDescription: product.short_description,
      sellerSlug: product.seller_slug,
      sellerName: product.business_name,
      sellerEmail: product.seller_email,
    });

    const publishedReviews =
      product.rating_count > 0
        ? queryAll<{
            rating: number;
            title: string | null;
            body: string;
            created_at: string;
            author_name: string;
          }>(
            db,
            `SELECT r.rating, r.title, r.body, r.created_at,
                    COALESCE(NULLIF(pr.full_name, ''), 'Verified customer') AS author_name
             FROM reviews r
             JOIN users ru ON ru.id = r.user_id
             LEFT JOIN profiles pr ON pr.id = ru.id
             WHERE r.product_id = ? AND r.status = 'published'
             ORDER BY r.created_at DESC
             LIMIT 3`,
            product.id,
          )
        : [];

    const productEntity: Record<string, unknown> = {
      '@type': 'Product',
      '@id': `${canonicalUrl}#product`,
      name: product.name,
      url: canonicalUrl,
      image: imageUrls,
      description,
      sku: product.sku || product.id,
      category: product.category_name,
      ...(product.materials ? { material: product.materials } : {}),
      brand: {
        '@type': 'Brand',
        name: 'Dear Hills',
      },
      countryOfOrigin: {
        '@type': 'Country',
        name: 'India',
      },
      offers: {
        '@type': 'Offer',
        url: canonicalUrl,
        priceCurrency: 'INR',
        price: (effectivePricePaise / 100).toFixed(2),
        priceValidUntil,
        availability,
        itemCondition: 'https://schema.org/NewCondition',
        seller: {
          '@type': 'Organization',
          name: product.business_name,
          url: `${origin}/makers/${product.seller_slug}`,
        },
        shippingDetails: shippingDetailsJsonLd(effectivePricePaise),
        hasMerchantReturnPolicy: merchantReturnPolicyJsonLd(),
      },
    };

    if (product.rating_count > 0 && product.rating_average !== null) {
      productEntity.aggregateRating = {
        '@type': 'AggregateRating',
        ratingValue: product.rating_average,
        reviewCount: product.rating_count,
        bestRating: 5,
        worstRating: 1,
      };
      if (publishedReviews.length > 0) {
        productEntity.review = publishedReviews.map((review) => ({
          '@type': 'Review',
          author: {
            '@type': 'Person',
            name: review.author_name,
          },
          datePublished: review.created_at.slice(0, 10),
          reviewRating: {
            '@type': 'Rating',
            ratingValue: review.rating,
            bestRating: 5,
            worstRating: 1,
          },
          ...(review.title ? { name: review.title } : {}),
          reviewBody: review.body,
        }));
      }
    }

    return {
      title,
      description,
      canonicalUrl,
      imageUrl: imageUrls[0],
      ogType: 'product',
      noindex: isDemo,
      jsonLd: {
        '@context': 'https://schema.org',
        '@graph': [
          productEntity,
          breadcrumbList(origin, [
            { name: 'Home', path: '' },
            { name: 'Shop', path: '/shop' },
            { name: product.category_name, path: `/categories/${product.category_slug}` },
            { name: product.name, path: `/shop/${product.slug}` },
          ]),
        ],
      },
    };
  }

  // 3. Category Collection Route: /category/:slug, /categories/:slug, or /shop?category=:slug
  const categoryMatch = normalizedPath.match(/^\/(?:category|categories)\/([^/]+)$/);
  const categorySlug = categoryMatch
    ? safeDecodeURIComponent(categoryMatch[1])
    : normalizedPath === '/shop'
      ? queryStr(queryParams, 'category')
      : null;

  if (categorySlug) {
    const category = queryOne<{
      id: string;
      name: string;
      slug: string;
      description: string | null;
      image_url: string | null;
    }>(
      db,
      'SELECT id, name, slug, description, image_url FROM categories WHERE slug = ? AND is_active = 1',
      categorySlug,
    );

    if (!category) {
      return {
        title: 'Category not found · Dear Hills',
        description: DEFAULT_DESCRIPTION,
        canonicalUrl: `${origin}/shop`,
        imageUrl: fallbackImage,
        noindex: true,
        statusCode: 404,
      };
    }

    const childIds = queryAll<{ id: string }>(
      db,
      'SELECT id FROM categories WHERE parent_id = ? AND is_active = 1',
      category.id,
    ).map((child) => child.id);
    const categoryIds = [category.id, ...childIds];
    const placeholders = categoryIds.map(() => '?').join(',');

    const counts = queryOne<{ real_count: number; total_count: number }>(
      db,
      `SELECT
         COALESCE(SUM(CASE WHEN NOT ${DEMO_PRODUCT_SQL} THEN 1 ELSE 0 END), 0) AS real_count,
         COUNT(*) AS total_count
       FROM products p
       JOIN seller_profiles s ON s.id = p.seller_id
       LEFT JOIN users u ON u.id = s.user_id
       WHERE p.category_id IN (${placeholders})
         AND p.status = 'approved'
         AND s.status = 'approved'
         AND s.store_status = 'active'`,
      ...categoryIds,
    );

    const pageNum = Number(queryStr(queryParams, 'page')) || 1;
    const hasFilteredQuery = Boolean(
      queryStr(queryParams, 'q') ||
        queryStr(queryParams, 'sort') ||
        queryStr(queryParams, 'region') ||
        queryStr(queryParams, 'seller') ||
        queryStr(queryParams, 'minPrice') ||
        queryStr(queryParams, 'maxPrice') ||
        queryStr(queryParams, 'inStock') ||
        pageNum > 1,
    );

    const realProductCount = counts?.real_count ?? 0;
    const title = buildCategorySeoTitle({ name: category.name, slug: category.slug });
    const description =
      cleanSeoText(category.description) ||
      buildCategoryFallbackDescription({ name: category.name, slug: category.slug });
    const canonicalUrl = `${origin}/categories/${category.slug}`;
    const imageUrl = toAbsoluteUrl(origin, category.image_url, `${origin}/images/product-shawl.jpg`);

    return {
      title,
      description,
      canonicalUrl,
      imageUrl,
      ogType: 'website',
      noindex: realProductCount === 0 || hasFilteredQuery,
      jsonLd: {
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'CollectionPage',
            name: `${category.name} — Authentic Himachal Collection`,
            url: canonicalUrl,
            description,
          },
          breadcrumbList(origin, [
            { name: 'Home', path: '' },
            { name: 'Shop', path: '/shop' },
            { name: category.name, path: `/categories/${category.slug}` },
          ]),
        ],
      },
    };
  }

  // 4. Shop Catalog: /shop
  if (normalizedPath === '/shop') {
    const canonicalUrl = `${origin}/shop`;
    const q = queryStr(queryParams, 'q');
    const pageNum = Number(queryStr(queryParams, 'page')) || 1;
    const hasSearchOrFilters = Boolean(
      q ||
        queryStr(queryParams, 'sort') ||
        queryStr(queryParams, 'region') ||
        queryStr(queryParams, 'seller') ||
        queryStr(queryParams, 'minPrice') ||
        queryStr(queryParams, 'maxPrice') ||
        queryStr(queryParams, 'inStock') ||
        queryStr(queryParams, 'featured') ||
        pageNum > 1,
    );

    return {
      title: q
        ? `Search results for “${q}” | Dear Hills`
        : 'Shop Authentic Himachal Handloom, Organic Foods & Mountain Crafts | Dear Hills',
      description:
        'Explore authentic handwoven Kullu shawls, orthodox Kangra tea, raw wildflower honey, Kinnaur walnuts, and mountain crafts directly from Himachal Pradesh artisans.',
      canonicalUrl,
      imageUrl: `${origin}/images/product-shawl.jpg`,
      ogType: 'website',
      noindex: hasSearchOrFilters,
      jsonLd: {
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'CollectionPage',
            name: 'Shop Authentic Himachal Handloom, Organic Foods & Mountain Crafts',
            url: canonicalUrl,
            description:
              'Explore authentic handwoven Kullu shawls, orthodox Kangra tea, raw wildflower honey, Kinnaur walnuts, and mountain crafts directly from Himachal Pradesh artisans.',
          },
          breadcrumbList(origin, [
            { name: 'Home', path: '' },
            { name: 'Shop', path: '/shop' },
          ]),
        ],
      },
    };
  }

  // 5. Seasonal Offers: /offers or /offers/:slug
  const offerMatch = normalizedPath.match(/^\/offers(?:\/([^/]+))?$/);
  if (offerMatch) {
    const requestedSlug = offerMatch[1] ? safeDecodeURIComponent(offerMatch[1]) : 'pahadi-festive-glow';
    const offerPageNum = Number(queryStr(queryParams, 'page')) || 1;
    const hasOfferFilter = Boolean(
      queryStr(queryParams, 'category') ||
        queryStr(queryParams, 'seller') ||
        queryStr(queryParams, 'sort') ||
        offerPageNum > 1,
    );
    let campaign = getCampaignBySlug(db, requestedSlug);
    if (
      !campaign &&
      ['seasonal', 'seasonal-collection', 'festive', 'festive-glow', 'pahadi-festive', 'pahadi-festive-glow'].includes(
        requestedSlug.toLowerCase(),
      )
    ) {
      campaign =
        getFeaturedCampaign(db) ??
        queryOne<CampaignRow>(db, "SELECT * FROM campaigns WHERE status = 'active' ORDER BY created_at DESC LIMIT 1");
    }

    if (!campaign && requestedSlug === 'pahadi-festive-glow') {
      const canonicalUrl = `${origin}/offers/pahadi-festive-glow`;
      const posterUrl = `${origin}/images/campaigns/dearhills-christmas-campaign-1672.webp`;
      const description =
        'A curated seasonal collection from Himachali makers: handwoven wool, Kangra tea, orchard walnuts, wildflower honey and Chamba embroidery.';
      return {
        title: 'Pahadi Festive Glow — Seasonal Mountain Collection | Dear Hills',
        description,
        canonicalUrl,
        imageUrl: posterUrl,
        ogType: 'website',
        noindex: hasOfferFilter,
        jsonLd: {
          '@context': 'https://schema.org',
          '@graph': [
            {
              '@type': 'CollectionPage',
              name: 'Pahadi Festive Glow',
              url: canonicalUrl,
              description,
            },
            breadcrumbList(origin, [
              { name: 'Home', path: '' },
              { name: 'Pahadi Festive Glow', path: '/offers/pahadi-festive-glow' },
            ]),
          ],
        },
      };
    }

    if (!campaign || !isCampaignPageVisible(campaign)) {
      return {
        title: 'Offer not available · Dear Hills',
        description: 'This seasonal offer is not available.',
        canonicalUrl: `${origin}/offers/${encodeURIComponent(requestedSlug)}`,
        imageUrl: fallbackImage,
        noindex: true,
        statusCode: 404,
      };
    }

    const status = effectiveCampaignStatus(campaign);
    const canonicalUrl = `${origin}/offers/${campaign.slug}`;
    const description =
      cleanSeoText(campaign.description) ||
      `${campaign.name} — curated collection of authentic Himachali products from reviewed makers.`;
    const imageUrl = toAbsoluteUrl(
      origin,
      campaign.poster_url,
      `${origin}/images/campaigns/dearhills-christmas-campaign-1672.webp`,
    );

    return {
      title: `${campaign.name} — Seasonal Mountain Collection | Dear Hills`,
      description,
      canonicalUrl,
      imageUrl,
      ogType: 'website',
      noindex: status === 'expired' || hasOfferFilter,
      jsonLd: {
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'CollectionPage',
            name: campaign.name,
            url: canonicalUrl,
            description,
            image: imageUrl,
          },
          breadcrumbList(origin, [
            { name: 'Home', path: '' },
            { name: campaign.name, path: `/offers/${campaign.slug}` },
          ]),
        ],
      },
    };
  }

  // 6. Blog Post: /blog/:slug
  const blogMatch = normalizedPath.match(/^\/blog\/([^/]+)$/);
  if (blogMatch) {
    const slug = safeDecodeURIComponent(blogMatch[1]);
    const post = BLOG_POSTS.find((p) => p.slug === slug);
    if (!post) {
      return {
        title: 'Story not found · Dear Hills Journal',
        description: 'The requested Himalayan heritage guide could not be found.',
        canonicalUrl: `${origin}/blog/${encodeURIComponent(slug)}`,
        imageUrl: fallbackImage,
        noindex: true,
        statusCode: 404,
      };
    }

    const canonicalUrl = `${origin}/blog/${post.slug}`;
    const imageUrl = toAbsoluteUrl(origin, post.coverImage, fallbackImage);

    const graph: Array<Record<string, unknown>> = [
      {
        '@type': 'BlogPosting',
        headline: post.title,
        description: post.metaDescription,
        image: [imageUrl],
        datePublished: post.publishedAt,
        dateModified: post.publishedAt,
        keywords: post.tags.join(', '),
        author: {
          '@type': 'Person',
          name: post.author.name,
          jobTitle: post.author.role,
        },
        publisher: {
          '@type': 'Organization',
          name: 'Dear Hills',
          logo: {
            '@type': 'ImageObject',
            url: `${origin}/favicon.svg`,
          },
        },
        mainEntityOfPage: {
          '@type': 'WebPage',
          '@id': canonicalUrl,
        },
      },
      breadcrumbList(origin, [
        { name: 'Home', path: '' },
        { name: 'Mountain Journal', path: '/blog' },
        { name: post.title, path: `/blog/${post.slug}` },
      ]),
    ];

    if (post.faqs && post.faqs.length > 0) {
      graph.push({
        '@type': 'FAQPage',
        mainEntity: post.faqs.map((faq) => ({
          '@type': 'Question',
          name: faq.question,
          acceptedAnswer: {
            '@type': 'Answer',
            text: faq.answer,
          },
        })),
      });
    }

    return {
      title: post.metaTitle,
      description: post.metaDescription,
      canonicalUrl,
      imageUrl,
      ogType: 'article',
      jsonLd: {
        '@context': 'https://schema.org',
        '@graph': graph,
      },
    };
  }

  // 7. Blog Index: /blog or /journal
  if (normalizedPath === '/blog' || normalizedPath === '/journal') {
    const canonicalUrl = `${origin}/blog`;
    return {
      title: 'Himalayan Journal & Craft Stories | Dear Hills Blog',
      description:
        'Guides and stories celebrating authentic Himachal living — how to identify pure Pahadi honey, Kullu vs Kinnauri shawl weaving, and buying guide for authentic mountain goods.',
      canonicalUrl,
      imageUrl: fallbackImage,
      ogType: 'website',
      jsonLd: {
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'Blog',
            name: 'Dear Hills Mountain Journal',
            url: canonicalUrl,
            description:
              'Stories, cultural guides, and sourcing notes from the high-altitude valleys of Himachal Pradesh.',
            publisher: {
              '@type': 'Organization',
              name: 'Dear Hills',
              logo: `${origin}/favicon.svg`,
            },
          },
          breadcrumbList(origin, [
            { name: 'Home', path: '' },
            { name: 'Mountain Journal', path: '/blog' },
          ]),
        ],
      },
    };
  }

  // 8. Maker Profile: /makers/:slug or /sellers/:slug
  const makerMatch = normalizedPath.match(/^\/(?:makers|sellers)\/([^/]+)$/);
  if (makerMatch) {
    const slug = safeDecodeURIComponent(makerMatch[1]);
    const seller = queryOne<{
      business_name: string;
      slug: string;
      tagline: string | null;
      story: string | null;
      region: string | null;
      village: string | null;
      seller_category: string | null;
      logo_url: string | null;
      cover_url: string | null;
      email: string | null;
    }>(
      db,
      `SELECT s.business_name, s.slug, s.tagline, s.story, s.region, s.village,
              s.seller_category, s.logo_url, s.cover_url, u.email
       FROM seller_profiles s
       LEFT JOIN users u ON u.id = s.user_id
       WHERE s.slug = ? AND s.status = 'approved' AND s.store_status = 'active'`,
      slug,
    );

    if (!seller) {
      return {
        title: 'Maker not available · Dear Hills',
        description: 'This maker storefront may not exist or may not be published yet.',
        canonicalUrl: `${origin}/makers/${encodeURIComponent(slug)}`,
        imageUrl: fallbackImage,
        noindex: true,
        statusCode: 404,
      };
    }

    const title = `${seller.business_name} — Mountain Artisan Story | Dear Hills`;
    const description =
      cleanSeoText(seller.tagline) ||
      cleanSeoText(seller.story) ||
      `Meet ${seller.business_name} from ${seller.region || 'Himachal Pradesh'}. Crafting authentic mountain goods with generational heritage on Dear Hills.`;
    const canonicalUrl = `${origin}/makers/${seller.slug}`;
    const imageUrl = toAbsoluteUrl(origin, seller.cover_url ?? seller.logo_url, fallbackImage);
    const isDemo = isDemoSellerInput({
      slug: seller.slug,
      name: seller.business_name,
      email: seller.email,
    });

    return {
      title,
      description,
      canonicalUrl,
      imageUrl,
      ogType: 'profile',
      noindex: isDemo,
      jsonLd: {
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'Organization',
            name: seller.business_name,
            url: canonicalUrl,
            image: imageUrl,
            description,
            address: {
              '@type': 'PostalAddress',
              addressLocality: seller.village || seller.region || 'Himachal Pradesh',
              addressRegion: 'Himachal Pradesh',
              addressCountry: 'IN',
            },
          },
          breadcrumbList(origin, [
            { name: 'Home', path: '' },
            { name: 'Makers', path: '/makers' },
            { name: seller.business_name, path: `/makers/${seller.slug}` },
          ]),
        ],
      },
    };
  }

  // 9. Makers List: /makers
  if (normalizedPath === '/makers') {
    const canonicalUrl = `${origin}/makers`;
    const makerPageNum = Number(queryStr(queryParams, 'page')) || 1;
    const hasMakerFilter = Boolean(
      queryStr(queryParams, 'q') ||
        queryStr(queryParams, 'category') ||
        queryStr(queryParams, 'region') ||
        queryStr(queryParams, 'verified') ||
        queryStr(queryParams, 'sort') ||
        makerPageNum > 1,
    );
    return {
      title: 'Meet the Mountain Makers & Artisans of Himachal Pradesh | Dear Hills',
      description:
        'Discover the generational weavers, tea planters, beekeepers, and woodworkers crafting heritage goods across the valleys of Himachal Pradesh.',
      canonicalUrl,
      imageUrl: fallbackImage,
      ogType: 'website',
      noindex: hasMakerFilter,
      jsonLd: {
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'CollectionPage',
            name: 'Meet the Mountain Makers & Artisans of Himachal Pradesh',
            url: canonicalUrl,
            description:
              'Discover the generational weavers, tea planters, beekeepers, and woodworkers crafting heritage goods across the valleys of Himachal Pradesh.',
          },
          breadcrumbList(origin, [
            { name: 'Home', path: '' },
            { name: 'Makers', path: '/makers' },
          ]),
        ],
      },
    };
  }

  // 10. About / Our Story
  if (normalizedPath === '/about' || normalizedPath === '/our-story') {
    const canonicalUrl = `${origin}/about`;
    const description =
      'Dear Hills connects conscious global buyers with authentic Himalayan artisans, weavers, and organic farmers in Himachal Pradesh with verified provenance and fair pay.';
    return {
      title: 'Our Story & Philosophy — Preserving Himalayan Living Heritage | Dear Hills',
      description,
      canonicalUrl,
      imageUrl: `${origin}/images/editorial-terrace.jpg`,
      ogType: 'article',
      jsonLd: {
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'AboutPage',
            name: 'About Dear Hills',
            url: canonicalUrl,
            description,
          },
          breadcrumbList(origin, [
            { name: 'Home', path: '' },
            { name: 'About', path: '/about' },
          ]),
        ],
      },
    };
  }

  // 11. How We Source
  if (normalizedPath === '/sourcing') {
    const canonicalUrl = `${origin}/sourcing`;
    const description =
      'Every shawl, tea harvest, honey jar, and handloom piece is verified at source in the mountain valleys of Himachal Pradesh.';
    return {
      title: 'How We Source — Pure Alpine Origin & Ethical Provenance | Dear Hills',
      description,
      canonicalUrl,
      imageUrl: `${origin}/images/weaving.jpg`,
      ogType: 'article',
      jsonLd: {
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'WebPage',
            name: 'How We Source',
            url: canonicalUrl,
            description,
          },
          breadcrumbList(origin, [
            { name: 'Home', path: '' },
            { name: 'How we source', path: '/sourcing' },
          ]),
        ],
      },
    };
  }

  // 12. FAQ Page with FAQPage Structured Data
  if (normalizedPath === '/faq') {
    const canonicalUrl = `${origin}/faq`;
    const faqItems = getSiteContent(db).faq.items;
    const description =
      'Answers about India-wide shipping, 7-day returns, maker verification, platform fees, and authentic Himalayan products on Dear Hills.';

    return {
      title: 'Frequently Asked Questions — Shipping, Returns & Sourcing | Dear Hills',
      description,
      canonicalUrl,
      imageUrl: fallbackImage,
      ogType: 'website',
      jsonLd: {
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'FAQPage',
            mainEntity: faqItems.map((item) => ({
              '@type': 'Question',
              name: item.question,
              acceptedAnswer: {
                '@type': 'Answer',
                text: item.answer,
              },
            })),
          },
          breadcrumbList(origin, [
            { name: 'Home', path: '' },
            { name: 'FAQ', path: '/faq' },
          ]),
        ],
      },
    };
  }

  // 13. Contact Page
  if (normalizedPath === '/contact') {
    const canonicalUrl = `${origin}/contact`;
    const description = 'Reach the Dear Hills support desk about an order, a return, or a maker application.';
    return {
      title: 'Contact & Customer Support | Dear Hills',
      description,
      canonicalUrl,
      imageUrl: fallbackImage,
      ogType: 'website',
      jsonLd: {
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'ContactPage',
            name: 'Contact Dear Hills',
            url: canonicalUrl,
            description,
          },
          breadcrumbList(origin, [
            { name: 'Home', path: '' },
            { name: 'Contact', path: '/contact' },
          ]),
        ],
      },
    };
  }

  // 14. Become a Maker / Sell landing page
  if (normalizedPath === '/become-a-maker' || normalizedPath === '/sell') {
    const canonicalUrl = `${origin}/become-a-maker`;
    const description =
      'Join Dear Hills and bring authentic Himalayan handloom, orthodox tea, raw forest honey, orchard harvest and village craft to conscious customers across India.';
    return {
      title: 'Sell with Dear Hills — Himalayan Artisan & Producer Onboarding',
      description,
      canonicalUrl,
      imageUrl: fallbackImage,
      ogType: 'website',
      jsonLd: {
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'WebPage',
            name: 'Become a Maker on Dear Hills',
            url: canonicalUrl,
            description,
          },
          breadcrumbList(origin, [
            { name: 'Home', path: '' },
            { name: 'Become a Maker', path: '/become-a-maker' },
          ]),
        ],
      },
    };
  }

  // 15. Policy Pages: /policies/:key
  const policyMatch = normalizedPath.match(/^\/policies\/([^/]+)$/);
  if (policyMatch) {
    const key = safeDecodeURIComponent(policyMatch[1]);
    if (!(POLICY_KEYS as readonly string[]).includes(key)) {
      return {
        title: 'Policy not found · Dear Hills',
        description: DEFAULT_DESCRIPTION,
        canonicalUrl: `${origin}/policies/${encodeURIComponent(key)}`,
        imageUrl: fallbackImage,
        noindex: true,
        statusCode: 404,
      };
    }
    const policy = getPolicy(db, key);
    const canonicalUrl = `${origin}/policies/${key}`;
    return {
      title: `${policy.title} | Dear Hills`,
      description: cleanSeoText(policy.summary) || DEFAULT_DESCRIPTION,
      canonicalUrl,
      imageUrl: fallbackImage,
      ogType: 'article',
      jsonLd: {
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'WebPage',
            name: policy.title,
            url: canonicalUrl,
            description: cleanSeoText(policy.summary),
          },
          breadcrumbList(origin, [
            { name: 'Home', path: '' },
            { name: policy.title, path: `/policies/${key}` },
          ]),
        ],
      },
    };
  }

  // 16. Image Credits
  if (normalizedPath === '/credits') {
    const canonicalUrl = `${origin}/credits`;
    const description = 'Photography attribution and licences for images used on Dear Hills.';
    return {
      title: 'Image Credits & Attribution | Dear Hills',
      description,
      canonicalUrl,
      imageUrl: fallbackImage,
      ogType: 'website',
      jsonLd: {
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'WebPage',
            name: 'Image Credits & Attribution',
            url: canonicalUrl,
            description,
          },
          breadcrumbList(origin, [
            { name: 'Home', path: '' },
            { name: 'Image credits', path: '/credits' },
          ]),
        ],
      },
    };
  }

  // 17. Homepage
  if (normalizedPath === '/') {
    const canonicalUrl = `${origin}/`;
    const organization: Record<string, unknown> = {
      '@type': 'Organization',
      '@id': `${origin}/#organization`,
      name: 'Dear Hills',
      url: origin,
      logo: `${origin}/favicon.svg`,
      description: DEFAULT_DESCRIPTION,
      address: {
        '@type': 'PostalAddress',
        addressRegion: 'Himachal Pradesh',
        addressCountry: 'IN',
      },
    };
    if (env.smtp.supportEmail && !env.smtp.supportEmail.endsWith('.example')) {
      organization.contactPoint = {
        '@type': 'ContactPoint',
        email: env.smtp.supportEmail,
        contactType: 'customer service',
        areaServed: 'IN',
        availableLanguage: ['en', 'hi'],
      };
    }

    return {
      title: DEFAULT_TITLE,
      description: DEFAULT_DESCRIPTION,
      canonicalUrl,
      imageUrl: fallbackImage,
      ogType: 'website',
      jsonLd: {
        '@context': 'https://schema.org',
        '@graph': [
          organization,
          {
            '@type': 'WebSite',
            '@id': `${origin}/#website`,
            url: origin,
            name: 'Dear Hills',
            publisher: {
              '@id': `${origin}/#organization`,
            },
            potentialAction: {
              '@type': 'SearchAction',
              target: {
                '@type': 'EntryPoint',
                urlTemplate: `${origin}/shop?q={search_term_string}`,
              },
              'query-input': 'required name=search_term_string',
            },
          },
        ],
      },
    };
  }

  // 18. Unknown / 404 routes: guard against Soft 404 indexing
  return {
    title: 'Page not found · Dear Hills',
    description: DEFAULT_DESCRIPTION,
    canonicalUrl: `${origin}${normalizedPath}`,
    imageUrl: fallbackImage,
    noindex: true,
    statusCode: 404,
  };
}

function replaceMetaContent(html: string, attr: 'name' | 'property', key: string, value: string): string {
  const escaped = escapeHtml(value);
  const regex = new RegExp(`<meta\\s+[^>]*${attr}=["']${key}["'][^>]*>`, 'i');
  const tag = `<meta ${attr}="${key}" content="${escaped}" />`;
  if (regex.test(html)) {
    return html.replace(regex, () => tag);
  }
  return html.replace('</head>', () => `    ${tag}\n  </head>`);
}

export function injectSeoIntoHtml(html: string, seo: SeoMetadata): string {
  let result = html;

  const titleTag = `<title>${escapeHtml(seo.title)}</title>`;
  result = result.replace(/<title>[\s\S]*?<\/title>/i, () => titleTag);
  result = replaceMetaContent(result, 'name', 'description', seo.description);
  result = replaceMetaContent(result, 'property', 'og:title', seo.title);
  result = replaceMetaContent(result, 'property', 'og:description', seo.description);
  result = replaceMetaContent(result, 'name', 'twitter:title', seo.title);
  result = replaceMetaContent(result, 'name', 'twitter:description', seo.description);

  if (seo.imageUrl) {
    result = replaceMetaContent(result, 'property', 'og:image', seo.imageUrl);
    result = replaceMetaContent(result, 'name', 'twitter:image', seo.imageUrl);
  }
  if (seo.ogType) {
    result = replaceMetaContent(result, 'property', 'og:type', seo.ogType);
  }

  // Strip all existing canonical, robots, og:url, and structured data tags to avoid duplicates
  result = result.replace(/<link\s+[^>]*rel=["']canonical["'][^>]*>\s*/gi, '');
  result = result.replace(/<meta\s+[^>]*name=["']robots["'][^>]*>\s*/gi, '');
  result = result.replace(/<meta\s+[^>]*property=["']og:url["'][^>]*>\s*/gi, '');
  result = result.replace(/<script\s+[^>]*id=["']seo-structured-data["'][^>]*>[\s\S]*?<\/script>\s*/gi, '');

  const extraHeadTags: string[] = [
    `<link rel="canonical" href="${escapeHtml(seo.canonicalUrl)}" />`,
    `<meta property="og:url" content="${escapeHtml(seo.canonicalUrl)}" />`,
    seo.noindex
      ? '<meta name="robots" content="noindex, nofollow" />'
      : '<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />',
  ];

  if (seo.jsonLd) {
    const safeJson = JSON.stringify(seo.jsonLd).replace(/</g, '\\u003c');
    extraHeadTags.push(
      `<script type="application/ld+json" id="seo-structured-data">${safeJson}</script>`,
    );
  }

  const tagsBlock = '    ' + extraHeadTags.join('\n    ') + '\n  ';
  result = result.replace('</head>', () => `${tagsBlock}</head>`);

  return result;
}
