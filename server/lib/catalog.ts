import { queryAll, queryOne, type Db } from '../db.js';
import type { Category, Paged, ProductDetail, ProductSummary, Review } from '../../shared/types.js';
import { notFound } from './http.js';
import { attachCampaignMeta } from './campaigns.js';

const PUBLIC_CONDITION = "p.status = 'approved' AND s.status = 'approved' AND s.store_status = 'active'";

interface SummaryRow {
  id: string;
  slug: string;
  name: string;
  short_description: string;
  price_paise: number;
  promo_price_paise: number | null;
  compare_at_price_paise: number | null;
  image_url: string | null;
  image_alt: string | null;
  seller_name: string;
  seller_slug: string;
  category_name: string;
  category_slug: string;
  stock: number;
  is_demo: number;
  region: string | null;
  is_featured: number;
  rating_average: number | null;
  rating_count: number;
}

function mapSummary(row: SummaryRow): ProductSummary {
  const campaignPrice =
    row.promo_price_paise !== null && row.promo_price_paise < row.price_paise ? row.promo_price_paise : null;
  const pricePaise = campaignPrice ?? row.price_paise;
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    shortDescription: row.short_description,
    pricePaise,
    compareAtPricePaise: row.compare_at_price_paise,
    originalPricePaise: campaignPrice === null ? null : row.price_paise,
    discountPercent:
      campaignPrice === null ? null : Math.round(((row.price_paise - campaignPrice) / row.price_paise) * 100),
    campaignSlug: null,
    campaignName: null,
    imageUrl: row.image_url,
    imageAlt: row.image_alt,
    sellerName: row.seller_name,
    sellerSlug: row.seller_slug,
    categoryName: row.category_name,
    categorySlug: row.category_slug,
    stock: row.stock,
    isDemo: row.is_demo === 1,
    region: row.region,
    isFeatured: row.is_featured === 1,
    ratingAverage: row.rating_average,
    ratingCount: row.rating_count,
  };
}

const SUMMARY_SELECT = `
  SELECT p.id, p.slug, p.name, p.short_description, p.price_paise, p.compare_at_price_paise,
         p.region, p.is_featured, p.is_demo, acp.promo_price_paise,
         i.quantity - i.reserved_quantity AS stock,
         s.business_name AS seller_name, s.slug AS seller_slug,
         c.name AS category_name, c.slug AS category_slug,
         (SELECT url FROM product_images pi WHERE pi.product_id = p.id ORDER BY sort_order LIMIT 1) AS image_url,
         (SELECT alt FROM product_images pi WHERE pi.product_id = p.id ORDER BY sort_order LIMIT 1) AS image_alt,
         (SELECT ROUND(AVG(r.rating), 1) FROM reviews r WHERE r.product_id = p.id AND r.status = 'published') AS rating_average,
         (SELECT COUNT(*) FROM reviews r WHERE r.product_id = p.id AND r.status = 'published') AS rating_count
    FROM products p
    JOIN seller_profiles s ON s.id = p.seller_id
    JOIN categories c ON c.id = p.category_id
    JOIN inventory i ON i.product_id = p.id
    LEFT JOIN active_campaign_prices acp ON acp.product_id = p.id
`;

export interface ProductQuery {
  q?: string;
  category?: string;
  seller?: string;
  region?: string;
  minPricePaise?: number;
  maxPricePaise?: number;
  inStock?: boolean;
  featured?: boolean;
  campaignId?: string;
  sort?: 'relevance' | 'newest' | 'price_asc' | 'price_desc' | 'popular';
  page?: number;
  pageSize?: number;
  excludeId?: string;
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export function categoryIdsFor(db: Db, slug: string): string[] {
  const category = queryOne<{ id: string }>(db, 'SELECT id FROM categories WHERE slug = ? AND is_active = 1', slug);
  if (!category) return [];
  const children = queryAll<{ id: string }>(db, 'SELECT id FROM categories WHERE parent_id = ? AND is_active = 1', category.id);
  return [category.id, ...children.map((child) => child.id)];
}

export function listProducts(db: Db, query: ProductQuery): Paged<ProductSummary> {
  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(48, Math.max(1, query.pageSize ?? 12));
  const conditions: string[] = [PUBLIC_CONDITION];
  const params: (string | number)[] = [];

  if (query.q?.trim()) {
    const like = `%${escapeLike(query.q.trim())}%`;
    conditions.push(
      `(p.name LIKE ? ESCAPE '\\' OR p.short_description LIKE ? ESCAPE '\\' OR p.description LIKE ? ESCAPE '\\'
        OR p.materials LIKE ? ESCAPE '\\' OR p.origin_place LIKE ? ESCAPE '\\' OR s.business_name LIKE ? ESCAPE '\\'
        OR c.name LIKE ? ESCAPE '\\')`,
    );
    params.push(like, like, like, like, like, like, like);
  }
  if (query.category) {
    const ids = categoryIdsFor(db, query.category);
    if (ids.length === 0) {
      return { items: [], page, pageSize, total: 0, totalPages: 0 };
    }
    conditions.push(`p.category_id IN (${ids.map(() => '?').join(',')})`);
    params.push(...ids);
  }
  if (query.seller) {
    conditions.push('s.slug = ?');
    params.push(query.seller);
  }
  if (query.region) {
    conditions.push('p.region = ?');
    params.push(query.region);
  }
  if (query.minPricePaise !== undefined) {
    conditions.push('COALESCE(acp.promo_price_paise, p.price_paise) >= ?');
    params.push(query.minPricePaise);
  }
  if (query.maxPricePaise !== undefined) {
    conditions.push('COALESCE(acp.promo_price_paise, p.price_paise) <= ?');
    params.push(query.maxPricePaise);
  }
  if (query.inStock) {
    conditions.push('i.quantity > i.reserved_quantity');
  }
  if (query.featured) {
    conditions.push('p.is_featured = 1');
  }
  if (query.campaignId) {
    conditions.push(
      `acp.product_id IS NOT NULL
       AND EXISTS (SELECT 1 FROM campaign_products cp WHERE cp.campaign_id = ? AND cp.product_id = p.id)`,
    );
    params.push(query.campaignId);
  }
  if (query.excludeId) {
    conditions.push('p.id != ?');
    params.push(query.excludeId);
  }

  const where = conditions.join(' AND ');
  const totalRow = queryOne<{ total: number }>(
    db,
    `SELECT COUNT(*) AS total FROM products p
       JOIN seller_profiles s ON s.id = p.seller_id
       JOIN categories c ON c.id = p.category_id
       JOIN inventory i ON i.product_id = p.id
       LEFT JOIN active_campaign_prices acp ON acp.product_id = p.id
      WHERE ${where}`,
    ...params,
  );
  const total = totalRow?.total ?? 0;

  let orderBy = 'p.is_featured DESC, p.created_at DESC';
  if (query.sort === 'newest') orderBy = 'p.created_at DESC';
  else if (query.sort === 'price_asc') orderBy = 'COALESCE(acp.promo_price_paise, p.price_paise) ASC';
  else if (query.sort === 'price_desc') orderBy = 'COALESCE(acp.promo_price_paise, p.price_paise) DESC';
  else if (query.sort === 'popular') {
    orderBy = `(SELECT COALESCE(SUM(oi.quantity),0) FROM order_items oi
                 JOIN orders o ON o.id = oi.order_id
                WHERE oi.product_id = p.id AND o.paid_at IS NOT NULL) DESC, p.is_featured DESC, p.created_at DESC`;
  } else if (query.sort === 'relevance' && query.q?.trim()) {
    orderBy = 'p.name LIKE ? DESC, p.is_featured DESC, p.created_at DESC';
    params.push(`${escapeLike(query.q.trim())}%`);
  }

  const rows = queryAll<SummaryRow>(
    db,
    `${SUMMARY_SELECT} WHERE ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
    ...params,
    pageSize,
    (page - 1) * pageSize,
  );

  return {
    items: attachCampaignMeta(db, rows.map(mapSummary)),
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
  };
}

export function getProduct(db: Db, slug: string): ProductDetail {
  const row = queryOne<
    SummaryRow & {
      description: string;
      sku: string;
      unit: string;
      weight_g: number | null;
      dimensions: string | null;
      materials: string | null;
      care_instructions: string | null;
      food_info: string | null;
      origin_place: string | null;
      origin_verified: number;
      attributes: string | null;
      tax_rate_bp: number;
      seller_id: string;
      seller_tagline: string | null;
      seller_story: string | null;
      seller_region: string | null;
      seller_logo_url: string | null;
      seller_cover_url: string | null;
      category_id: string;
      created_at: string;
    }
  >(
    db,
    `SELECT p.*, i.quantity - i.reserved_quantity AS stock, acp.promo_price_paise,
            s.business_name AS seller_name, s.slug AS seller_slug, s.id AS seller_id,
            s.tagline AS seller_tagline, s.story AS seller_story, s.region AS seller_region,
            s.logo_url AS seller_logo_url, s.cover_url AS seller_cover_url,
            c.name AS category_name, c.slug AS category_slug,
            (SELECT url FROM product_images pi WHERE pi.product_id = p.id ORDER BY sort_order LIMIT 1) AS image_url,
            (SELECT alt FROM product_images pi WHERE pi.product_id = p.id ORDER BY sort_order LIMIT 1) AS image_alt,
            (SELECT ROUND(AVG(r.rating), 1) FROM reviews r WHERE r.product_id = p.id AND r.status = 'published') AS rating_average,
            (SELECT COUNT(*) FROM reviews r WHERE r.product_id = p.id AND r.status = 'published') AS rating_count
       FROM products p
       JOIN seller_profiles s ON s.id = p.seller_id
       JOIN categories c ON c.id = p.category_id
       JOIN inventory i ON i.product_id = p.id
       LEFT JOIN active_campaign_prices acp ON acp.product_id = p.id
      WHERE p.slug = ? AND p.status = 'approved' AND s.status = 'approved' AND s.store_status = 'active'`,
    slug,
  );
  if (!row) throw notFound('That product is not available.');

  const summary = attachCampaignMeta(db, [mapSummary(row)])[0];

  const images = queryAll<{ id: string; url: string; alt: string; credit: string | null }>(
    db,
    'SELECT id, url, alt, credit FROM product_images WHERE product_id = ? ORDER BY sort_order',
    row.id,
  );
  const reviews = queryAll<{
    id: string;
    rating: number;
    title: string | null;
    body: string;
    full_name: string;
    created_at: string;
    order_item_id: string;
  }>(
    db,
    `SELECT r.id, r.rating, r.title, r.body, r.created_at, r.order_item_id,
            COALESCE(NULLIF(p.full_name,''), 'Verified customer') AS full_name
       FROM reviews r
       JOIN users u ON u.id = r.user_id
       LEFT JOIN profiles p ON p.id = u.id
      WHERE r.product_id = ? AND r.status = 'published'
      ORDER BY r.created_at DESC LIMIT 30`,
    row.id,
  );
  const distribution: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
  for (const review of reviews) distribution[String(review.rating)] += 1;

  const related = listProducts(db, {
    category: row.category_slug,
    excludeId: row.id,
    pageSize: 4,
    sort: 'newest',
  }).items;

  let attributes: Record<string, string> | null = null;
  try {
    attributes = row.attributes ? (JSON.parse(row.attributes) as Record<string, string>) : null;
  } catch {
    attributes = null;
  }

  const mappedReviews: Review[] = reviews.map((review) => ({
    id: review.id,
    rating: review.rating,
    title: review.title,
    body: review.body,
    authorName: review.full_name,
    createdAt: review.created_at,
    verifiedPurchase: true,
  }));

  return {
    ...summary,
    description: row.description,
    sku: row.sku,
    unit: row.unit,
    weightG: row.weight_g,
    dimensions: row.dimensions,
    materials: row.materials,
    careInstructions: row.care_instructions,
    foodInfo: row.food_info,
    originPlace: row.origin_place,
    originVerified: row.origin_verified === 1,
    varietyGrade: (row as { variety_grade?: string | null }).variety_grade ?? null,
    harvestInfo: (row as { harvest_info?: string | null }).harvest_info ?? null,
    dispatchConditions: (row as { dispatch_conditions?: string | null }).dispatch_conditions ?? null,
    attributes,
    taxRateBp: row.tax_rate_bp,
    images,
    seller: {
      id: row.seller_id,
      name: row.seller_name,
      slug: row.seller_slug,
      tagline: row.seller_tagline,
      story: row.seller_story,
      region: row.seller_region,
      logoUrl: row.seller_logo_url,
      coverUrl: row.seller_cover_url,
    },
    category: { id: row.category_id, name: row.category_name, slug: row.category_slug },
    reviews: mappedReviews,
    reviewSummary: {
      average: mappedReviews.length
        ? Math.round((mappedReviews.reduce((sum, review) => sum + review.rating, 0) / mappedReviews.length) * 10) / 10
        : null,
      count: mappedReviews.length,
      distribution,
    },
    related,
    returnPolicy:
      '7-day return window for unused, unopened items in original packaging. Perishable food and personalised items are not returnable unless damaged or incorrect. Return shipping is covered when the fault is ours.',
    shippingEstimate: 'Dispatched within 2 working days. Delivery usually takes 3–7 working days after dispatch.',
  };
}

export function listCategories(db: Db): Category[] {
  return queryAll<{
    id: string;
    name: string;
    slug: string;
    description: string | null;
    parent_id: string | null;
    image_url: string | null;
    product_count: number;
  }>(
    db,
    `SELECT c.id, c.name, c.slug, c.description, c.parent_id, c.image_url,
            (SELECT COUNT(*) FROM products p
              JOIN seller_profiles s ON s.id = p.seller_id
             WHERE p.category_id = c.id AND p.status = 'approved' AND s.status = 'approved'
               AND s.store_status = 'active') AS product_count
       FROM categories c WHERE c.is_active = 1 ORDER BY c.sort_order, c.name`,
  ).map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    parentId: row.parent_id,
    imageUrl: row.image_url,
    productCount: row.product_count,
  }));
}

export interface PublicMakersFilter {
  q?: string;
  category?: string;
  region?: string;
  verified?: boolean | string;
  page?: number | string;
  limit?: number | string;
  pageSize?: number | string;
  sort?: string;
}

export function listPublicMakers(db: Db, query: PublicMakersFilter = {}): {
  makers: {
    id: string;
    name: string;
    slug: string;
    sellerType: string;
    sellerCategory: string | null;
    tagline: string | null;
    story: string | null;
    region: string | null;
    village: string | null;
    logoUrl: string | null;
    coverUrl: string | null;
    imageUrl: string | null;
    productCount: number;
    categories: { id: string; name: string; slug: string }[];
    specialities: string[];
    isVerified: boolean;
    yearsOperating: number | null;
    approvedAt: string | null;
    createdAt: string;
  }[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  filters: {
    categories: { id: string; name: string; slug: string; count: number }[];
    regions: { region: string; count: number }[];
  };
} {
  const page = Math.max(1, Math.floor(Number(query.page) || 1));
  const limit = Math.min(48, Math.max(1, Math.floor(Number(query.limit ?? query.pageSize) || 12)));
  const offset = (page - 1) * limit;

  const conditions: string[] = ["s.status = 'approved'", "s.store_status = 'active'"];
  const params: (string | number)[] = [];

  const q = typeof query.q === 'string' ? query.q.trim() : '';
  if (q) {
    conditions.push(
      '(s.business_name LIKE ? OR s.tagline LIKE ? OR s.story LIKE ? OR s.region LIKE ? OR s.village LIKE ?)',
    );
    const pattern = `%${q}%`;
    params.push(pattern, pattern, pattern, pattern, pattern);
  }

  const category = typeof query.category === 'string' ? query.category.trim() : '';
  if (category && category !== 'all') {
    conditions.push(
      `(s.seller_category = ? OR EXISTS (
        SELECT 1 FROM products p JOIN categories c ON c.id = p.category_id
         WHERE p.seller_id = s.id AND p.status = 'approved' AND (c.slug = ? OR c.id = ?)
      ) OR EXISTS (
        SELECT 1 FROM seller_applications sa
         WHERE sa.seller_id = s.id AND sa.status = 'approved' AND sa.categories LIKE ?
      ))`,
    );
    params.push(category, category, category, `%"${category}"%`);
  }

  const region = typeof query.region === 'string' ? query.region.trim() : '';
  if (region && region !== 'all') {
    conditions.push('LOWER(s.region) = LOWER(?)');
    params.push(region);
  }

  const verified = query.verified === true || query.verified === 'true' || query.verified === '1';
  if (verified) {
    conditions.push('s.verified_at IS NOT NULL');
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;

  const countRow = queryOne<{ count: number }>(
    db,
    `SELECT COUNT(*) AS count FROM seller_profiles s ${whereClause}`,
    ...params,
  );
  const total = countRow?.count ?? 0;

  let orderBy = 'product_count DESC, s.business_name ASC';
  if (query.sort === 'name_asc') {
    orderBy = 's.business_name ASC';
  } else if (query.sort === 'name_desc') {
    orderBy = 's.business_name DESC';
  } else if (query.sort === 'newest') {
    orderBy = 's.approved_at DESC, s.created_at DESC';
  }

  const rows = queryAll<{
    id: string;
    name: string;
    slug: string;
    seller_type: string;
    seller_category: string | null;
    tagline: string | null;
    story: string | null;
    region: string | null;
    village: string | null;
    logo_url: string | null;
    cover_url: string | null;
    verified_at: string | null;
    approved_at: string | null;
    created_at: string;
    product_count: number;
    image_url: string | null;
    product_categories_json: string | null;
    app_categories_json: string | null;
    specialities_json: string | null;
    years_operating: number | null;
  }>(
    db,
    `SELECT s.id, s.business_name AS name, s.slug, s.seller_type, s.seller_category, s.tagline, s.story,
            s.region, s.village, s.logo_url, s.cover_url, s.verified_at, s.approved_at, s.created_at,
            (SELECT COUNT(*) FROM products p WHERE p.seller_id = s.id AND p.status = 'approved') AS product_count,
            (SELECT pi.url FROM products p JOIN product_images pi ON pi.product_id = p.id
              WHERE p.seller_id = s.id AND p.status = 'approved' ORDER BY p.is_featured DESC, pi.sort_order LIMIT 1) AS image_url,
            (SELECT json_group_array(json_object('id', sub.id, 'name', sub.name, 'slug', sub.slug))
               FROM (SELECT DISTINCT c.id, c.name, c.slug
                       FROM products p JOIN categories c ON c.id = p.category_id
                      WHERE p.seller_id = s.id AND p.status = 'approved') sub) AS product_categories_json,
            (SELECT la.categories FROM seller_applications la
              WHERE la.seller_id = s.id AND la.status = 'approved' ORDER BY la.revision DESC LIMIT 1) AS app_categories_json,
            (SELECT json_extract(la.data_json, '$.productGroups') FROM seller_applications la
              WHERE la.seller_id = s.id ORDER BY la.revision DESC LIMIT 1) AS specialities_json,
            (SELECT json_extract(la.data_json, '$.yearsOperating') FROM seller_applications la
              WHERE la.seller_id = s.id ORDER BY la.revision DESC LIMIT 1) AS years_operating
       FROM seller_profiles s
      ${whereClause}
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?`,
    ...params,
    limit,
    offset,
  );

  const categoryFilters = queryAll<{ id: string; name: string; slug: string; count: number }>(
    db,
    `SELECT c.id, c.name, c.slug, COUNT(DISTINCT s.id) AS count
       FROM categories c
       JOIN products p ON p.category_id = c.id
       JOIN seller_profiles s ON s.id = p.seller_id
      WHERE p.status = 'approved' AND s.status = 'approved' AND s.store_status = 'active'
      GROUP BY c.id, c.name, c.slug
      ORDER BY count DESC, c.sort_order ASC`,
  );

  const regionFilters = queryAll<{ region: string; count: number }>(
    db,
    `SELECT s.region, COUNT(*) AS count
       FROM seller_profiles s
      WHERE s.status = 'approved' AND s.store_status = 'active'
        AND s.region IS NOT NULL AND s.region != ''
      GROUP BY s.region
      ORDER BY count DESC, s.region ASC`,
  );

  const makers = rows.map((row) => {
    let categories: { id: string; name: string; slug: string }[] = [];
    try {
      if (row.product_categories_json) {
        categories = JSON.parse(row.product_categories_json);
      }
    } catch {
      categories = [];
    }

    let specialities: string[] = [];
    try {
      if (row.specialities_json) {
        const parsed = JSON.parse(row.specialities_json);
        if (Array.isArray(parsed)) specialities = parsed.filter((item): item is string => typeof item === 'string');
      }
    } catch {
      specialities = [];
    }

    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      sellerType: row.seller_type,
      sellerCategory: row.seller_category,
      tagline: row.tagline,
      story: row.story,
      region: row.region,
      village: row.village,
      logoUrl: row.logo_url,
      coverUrl: row.cover_url,
      imageUrl: row.image_url ?? row.cover_url ?? row.logo_url,
      productCount: row.product_count,
      categories,
      specialities,
      isVerified: Boolean(row.verified_at),
      yearsOperating: row.years_operating ? Number(row.years_operating) : null,
      approvedAt: row.approved_at,
      createdAt: row.created_at,
    };
  });

  return {
    makers,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
    filters: {
      categories: categoryFilters,
      regions: regionFilters,
    },
  };
}

export function listPublicSellers(db: Db) {
  return listPublicMakers(db, { limit: 48 }).makers;
}

export function getSellerStorefront(db: Db, slug: string) {
  const seller = queryOne<{
    id: string;
    name: string;
    slug: string;
    seller_type: string;
    seller_category: string | null;
    tagline: string | null;
    story: string | null;
    region: string | null;
    village: string | null;
    logo_url: string | null;
    cover_url: string | null;
    verified_at: string | null;
    approved_at: string | null;
    created_at: string;
    product_count: number;
    image_url: string | null;
    product_categories_json: string | null;
    specialities_json: string | null;
    years_operating: number | null;
  }>(
    db,
    `SELECT s.id, s.business_name AS name, s.slug, s.seller_type, s.seller_category, s.tagline, s.story,
            s.region, s.village, s.logo_url, s.cover_url, s.verified_at, s.approved_at, s.created_at,
            (SELECT COUNT(*) FROM products p WHERE p.seller_id = s.id AND p.status = 'approved') AS product_count,
            (SELECT pi.url FROM products p JOIN product_images pi ON pi.product_id = p.id
              WHERE p.seller_id = s.id AND p.status = 'approved' ORDER BY p.is_featured DESC, pi.sort_order LIMIT 1) AS image_url,
            (SELECT json_group_array(json_object('id', sub.id, 'name', sub.name, 'slug', sub.slug))
               FROM (SELECT DISTINCT c.id, c.name, c.slug
                       FROM products p JOIN categories c ON c.id = p.category_id
                      WHERE p.seller_id = s.id AND p.status = 'approved') sub) AS product_categories_json,
            (SELECT json_extract(la.data_json, '$.productGroups') FROM seller_applications la
              WHERE la.seller_id = s.id ORDER BY la.revision DESC LIMIT 1) AS specialities_json,
            (SELECT json_extract(la.data_json, '$.yearsOperating') FROM seller_applications la
              WHERE la.seller_id = s.id ORDER BY la.revision DESC LIMIT 1) AS years_operating
       FROM seller_profiles s
      WHERE s.slug = ? AND s.status = 'approved' AND s.store_status = 'active'`,
    slug,
  );
  if (!seller) throw notFound('That maker is not available.');

  let categories: { id: string; name: string; slug: string }[] = [];
  try {
    if (seller.product_categories_json) categories = JSON.parse(seller.product_categories_json);
  } catch {
    categories = [];
  }

  let specialities: string[] = [];
  try {
    if (seller.specialities_json) {
      const parsed = JSON.parse(seller.specialities_json);
      if (Array.isArray(parsed)) specialities = parsed.filter((item): item is string => typeof item === 'string');
    }
  } catch {
    specialities = [];
  }

  return {
    id: seller.id,
    name: seller.name,
    slug: seller.slug,
    sellerType: seller.seller_type,
    sellerCategory: seller.seller_category,
    tagline: seller.tagline,
    story: seller.story,
    region: seller.region,
    village: seller.village,
    logoUrl: seller.logo_url,
    coverUrl: seller.cover_url,
    imageUrl: seller.image_url ?? seller.cover_url ?? seller.logo_url,
    productCount: seller.product_count,
    categories,
    specialities,
    isVerified: Boolean(seller.verified_at),
    yearsOperating: seller.years_operating ? Number(seller.years_operating) : null,
    approvedAt: seller.approved_at,
    createdAt: seller.created_at,
  };
}

export function getRegions(db: Db): { region: string; productCount: number }[] {
  return queryAll<{ region: string; product_count: number }>(
    db,
    `SELECT p.region, COUNT(*) AS product_count
       FROM products p JOIN seller_profiles s ON s.id = p.seller_id
      WHERE p.status = 'approved' AND s.status = 'approved' AND s.store_status = 'active'
        AND p.region IS NOT NULL AND p.region != ''
      GROUP BY p.region ORDER BY product_count DESC`,
  ).map((row) => ({ region: row.region, productCount: row.product_count }));
}
