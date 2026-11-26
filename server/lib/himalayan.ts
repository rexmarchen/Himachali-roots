import type { Db } from '../db.js';
import type { CraftEntity, HubFaq, RegionEntity } from '../../shared/types.js';
import { countDescriptionWords } from '../../shared/productCompliance.js';
import { DEFAULT_HIMALAYAN_CRAFTS, DEFAULT_HIMALAYAN_REGIONS } from './himalayanSeeds.js';
import { DEMO_PRODUCT_SQL } from './seo.js';

export interface RegionRow {
  id: string;
  name: string;
  slug: string;
  short_name: string;
  intro_text: string;
  hero_image: string | null;
  famous_crafts_json: string;
  famous_foods_json: string;
  faqs_json: string;
  sort_order: number;
  is_active: number;
  product_count?: number;
}

export interface CraftRow {
  id: string;
  name: string;
  slug: string;
  intro_text: string;
  history: string;
  how_to_identify: string;
  hero_image: string | null;
  faqs_json: string;
  sort_order: number;
  is_active: number;
  product_count?: number;
}

export interface RegionCraftCombo {
  region: RegionEntity;
  craft?: CraftEntity;
  category?: { id: string; name: string; slug: string; description: string | null };
  subjectName: string;
  subjectSlug: string;
  introText: string;
  faqs: HubFaq[];
  productCount: number;
}

export function slugifyValue(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function parseJsonArray<T>(raw: string | null | undefined, fallback: T[]): T[] {
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : fallback;
  } catch {
    return fallback;
  }
}

export function mapRegionRow(row: RegionRow): RegionEntity {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    shortName: row.short_name || row.name,
    introText: row.intro_text,
    heroImage: row.hero_image,
    famousCrafts: parseJsonArray<string>(row.famous_crafts_json, []),
    famousFoods: parseJsonArray<string>(row.famous_foods_json, []),
    faqs: parseJsonArray<HubFaq>(row.faqs_json, []),
    sortOrder: row.sort_order,
    isActive: row.is_active === 1,
    ...(row.product_count !== undefined ? { productCount: Number(row.product_count) } : {}),
  };
}

export function mapCraftRow(row: CraftRow): CraftEntity {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    introText: row.intro_text,
    history: row.history,
    howToIdentify: row.how_to_identify,
    heroImage: row.hero_image,
    faqs: parseJsonArray<HubFaq>(row.faqs_json, []),
    sortOrder: row.sort_order,
    isActive: row.is_active === 1,
    ...(row.product_count !== undefined ? { productCount: Number(row.product_count) } : {}),
  };
}

export function seedDefaultRegionsAndCrafts(db: Db): void {
  const insR = db.prepare(`
    INSERT OR IGNORE INTO regions
      (id, name, slug, short_name, intro_text, hero_image, famous_crafts_json, famous_foods_json, faqs_json, sort_order, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `);
  for (const r of DEFAULT_HIMALAYAN_REGIONS) {
    insR.run(
      r.id,
      r.name,
      r.slug,
      r.shortName,
      r.introText,
      r.heroImage,
      JSON.stringify(r.famousCrafts),
      JSON.stringify(r.famousFoods),
      JSON.stringify(r.faqs),
      r.sortOrder,
    );
  }
  const insC = db.prepare(`
    INSERT OR IGNORE INTO crafts
      (id, name, slug, intro_text, history, how_to_identify, hero_image, faqs_json, sort_order, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `);
  for (const c of DEFAULT_HIMALAYAN_CRAFTS) {
    insC.run(
      c.id,
      c.name,
      c.slug,
      c.introText,
      c.history,
      c.howToIdentify,
      c.heroImage,
      JSON.stringify(c.faqs),
      c.sortOrder,
    );
  }
  db.prepare('INSERT OR IGNORE INTO slug_redirects (old_path, new_path) VALUES (?, ?)').run(
    '/regions/kashmir',
    '/regions/jammu-and-kashmir',
  );
  db.prepare('INSERT OR IGNORE INTO slug_redirects (old_path, new_path) VALUES (?, ?)').run(
    '/regions/darjeeling',
    '/regions/darjeeling-kalimpong',
  );
}

/** Match products belonging to a region entity via region_slug or matching text on p.region / s.region. */
export function regionMatchSql(regionSlugParam = '?', regionNameParam = '?'): string {
  return `EXISTS (
    SELECT 1 FROM (SELECT LOWER(${regionSlugParam}) AS rslug, LOWER(${regionNameParam}) AS rname) rm
    WHERE LOWER(COALESCE(p.region_slug, '')) = rm.rslug
       OR LOWER(COALESCE(p.region, '')) = rm.rname
       OR (rm.rslug = 'jammu-and-kashmir' AND LOWER(COALESCE(p.region, '')) IN ('kashmir', 'jammu', 'jammu & kashmir', 'srinagar'))
       OR (rm.rslug = 'himachal-pradesh' AND LOWER(COALESCE(p.region, s.region, '')) IN ('kullu', 'kangra', 'kinnaur', 'chamba', 'shimla', 'mandi', 'lahaul', 'spiti', 'himachal', 'himachal pradesh'))
       OR (rm.rslug = 'uttarakhand' AND LOWER(COALESCE(p.region, s.region, '')) IN ('uttarakhand', 'garhwal', 'kumaon', 'almora', 'nainital', 'munsiyari'))
       OR (rm.rslug = 'darjeeling-kalimpong' AND LOWER(COALESCE(p.region, s.region, '')) IN ('darjeeling', 'kalimpong', 'darjeeling & kalimpong', 'darjeeling/kalimpong'))
  )`;
}

export function listRegions(db: Db, options: { includeInactive?: boolean } = {}): RegionEntity[] {
  const rows = db
    .prepare(
      `SELECT r.*,
              (SELECT COUNT(*)
                 FROM products p
                 JOIN seller_profiles s ON s.id = p.seller_id
                 LEFT JOIN users u ON u.id = s.user_id
                WHERE p.status = 'approved'
                  AND s.status = 'approved'
                  AND s.store_status = 'active'
                  AND NOT ${DEMO_PRODUCT_SQL}
                  AND (
                    LOWER(COALESCE(p.region_slug, '')) = LOWER(r.slug)
                    OR LOWER(COALESCE(p.region, '')) = LOWER(r.name)
                    OR (LOWER(r.slug) = 'jammu-and-kashmir' AND LOWER(COALESCE(p.region, '')) IN ('kashmir', 'jammu', 'jammu & kashmir', 'srinagar'))
                    OR (LOWER(r.slug) = 'himachal-pradesh' AND LOWER(COALESCE(p.region, s.region, '')) IN ('kullu', 'kangra', 'kinnaur', 'chamba', 'shimla', 'mandi', 'lahaul', 'spiti', 'himachal', 'himachal pradesh'))
                    OR (LOWER(r.slug) = 'uttarakhand' AND LOWER(COALESCE(p.region, s.region, '')) IN ('uttarakhand', 'garhwal', 'kumaon', 'almora', 'nainital', 'munsiyari'))
                    OR (LOWER(r.slug) = 'darjeeling-kalimpong' AND LOWER(COALESCE(p.region, s.region, '')) IN ('darjeeling', 'kalimpong', 'darjeeling & kalimpong', 'darjeeling/kalimpong'))
                  )) AS product_count
         FROM regions r
        ${options.includeInactive ? '' : 'WHERE r.is_active = 1'}
        ORDER BY r.sort_order ASC, r.name ASC`,
    )
    .all() as unknown as RegionRow[];
  return rows.map(mapRegionRow);
}

export function getRegionBySlug(db: Db, slug: string): RegionEntity | null {
  const row = db
    .prepare('SELECT * FROM regions WHERE slug = ? AND is_active = 1')
    .get(slug.toLowerCase()) as RegionRow | undefined;
  if (!row) return null;
  const countRow = db
    .prepare(
      `SELECT COUNT(*) AS count
         FROM products p
         JOIN seller_profiles s ON s.id = p.seller_id
         LEFT JOIN users u ON u.id = s.user_id
        WHERE p.status = 'approved'
          AND s.status = 'approved'
          AND s.store_status = 'active'
          AND NOT ${DEMO_PRODUCT_SQL}
          AND ${regionMatchSql('?', '?')}`,
    )
    .get(row.slug, row.name) as { count: number } | undefined;
  return mapRegionRow({ ...row, product_count: countRow?.count ?? 0 });
}

export function listCrafts(db: Db, options: { includeInactive?: boolean } = {}): CraftEntity[] {
  const rows = db
    .prepare(
      `SELECT c.*,
              (SELECT COUNT(*)
                 FROM products p
                 JOIN seller_profiles s ON s.id = p.seller_id
                 LEFT JOIN users u ON u.id = s.user_id
                WHERE p.status = 'approved'
                  AND s.status = 'approved'
                  AND s.store_status = 'active'
                  AND NOT ${DEMO_PRODUCT_SQL}
                  AND (LOWER(COALESCE(p.craft_slug, '')) = LOWER(c.slug) OR LOWER(COALESCE(p.craft_type, '')) = LOWER(c.name))) AS product_count
         FROM crafts c
        ${options.includeInactive ? '' : 'WHERE c.is_active = 1'}
        ORDER BY c.sort_order ASC, c.name ASC`,
    )
    .all() as unknown as CraftRow[];
  return rows.map(mapCraftRow);
}

export function getCraftBySlug(db: Db, slug: string): CraftEntity | null {
  const row = db
    .prepare('SELECT * FROM crafts WHERE slug = ? AND is_active = 1')
    .get(slug.toLowerCase()) as CraftRow | undefined;
  if (!row) return null;
  const countRow = db
    .prepare(
      `SELECT COUNT(*) AS count
         FROM products p
         JOIN seller_profiles s ON s.id = p.seller_id
         LEFT JOIN users u ON u.id = s.user_id
        WHERE p.status = 'approved'
          AND s.status = 'approved'
          AND s.store_status = 'active'
          AND NOT ${DEMO_PRODUCT_SQL}
          AND (LOWER(COALESCE(p.craft_slug, '')) = LOWER(?) OR LOWER(COALESCE(p.craft_type, '')) = LOWER(?))`,
    )
    .get(row.slug, row.name) as { count: number } | undefined;
  return mapCraftRow({ ...row, product_count: countRow?.count ?? 0 });
}

export function buildComboIntroText(region: RegionEntity, subjectName: string, craft?: CraftEntity, categoryDesc?: string | null): string {
  const parts: string[] = [];
  if (craft) {
    parts.push(`${craft.name} from ${region.name}: ${craft.introText}`);
    if (craft.history) parts.push(craft.history);
    if (craft.howToIdentify) parts.push(`How to identify genuine ${craft.name} from ${region.name}: ${craft.howToIdentify}`);
  } else if (categoryDesc) {
    parts.push(`${subjectName} from ${region.name}: ${categoryDesc}`);
  }
  parts.push(
    `Every ${subjectName.toLowerCase()} listing from ${region.name} on our marketplace names its workshop or producer cooperative directly, displays transparent origin details, and undergoes human review before publication.`,
  );
  if (region.introText) {
    parts.push(region.introText.split('. ').slice(0, 2).join('. ') + '.');
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * Anti-doorway combination resolver for `/regions/:region/:craftOrCategory`.
 * Strictly requires >= 3 real, approved, non-demo products AND >= 120 words of
 * unique intro copy; otherwise returns null (404 + excluded from sitemap & links).
 */
export function getRegionCraftCombo(
  db: Db,
  regionSlug: string,
  subjectSlug: string,
): RegionCraftCombo | null {
  const region = getRegionBySlug(db, regionSlug);
  if (!region) return null;

  const craft = getCraftBySlug(db, subjectSlug) ?? undefined;
  const category = !craft
    ? (db
        .prepare('SELECT id, name, slug, description FROM categories WHERE slug = ? AND is_active = 1')
        .get(subjectSlug.toLowerCase()) as
        | { id: string; name: string; slug: string; description: string | null }
        | undefined)
    : undefined;

  if (!craft && !category) return null;

  const subjectName = craft ? craft.name : category!.name;
  const subjectSlugClean = craft ? craft.slug : category!.slug;

  let productCount = 0;
  if (craft) {
    const row = db
      .prepare(
        `SELECT COUNT(*) AS count
           FROM products p
           JOIN seller_profiles s ON s.id = p.seller_id
           LEFT JOIN users u ON u.id = s.user_id
          WHERE p.status = 'approved'
            AND s.status = 'approved'
            AND s.store_status = 'active'
            AND NOT ${DEMO_PRODUCT_SQL}
            AND ${regionMatchSql('?', '?')}
            AND (LOWER(COALESCE(p.craft_slug, '')) = LOWER(?) OR LOWER(COALESCE(p.craft_type, '')) = LOWER(?))`,
      )
      .get(region.slug, region.name, craft.slug, craft.name) as { count: number } | undefined;
    productCount = row?.count ?? 0;
  } else if (category) {
    const row = db
      .prepare(
        `SELECT COUNT(*) AS count
           FROM products p
           JOIN seller_profiles s ON s.id = p.seller_id
           LEFT JOIN users u ON u.id = s.user_id
           JOIN categories c ON c.id = p.category_id
          WHERE p.status = 'approved'
            AND s.status = 'approved'
            AND s.store_status = 'active'
            AND NOT ${DEMO_PRODUCT_SQL}
            AND ${regionMatchSql('?', '?')}
            AND (c.id = ? OR c.parent_id = ?)`,
      )
      .get(region.slug, region.name, category.id, category.id) as { count: number } | undefined;
    productCount = row?.count ?? 0;
  }

  if (productCount < 3) return null;

  const introText = buildComboIntroText(region, subjectName, craft, category?.description ?? null);
  if (countDescriptionWords(introText) < 120) return null;

  const faqs: HubFaq[] = craft?.faqs?.length
    ? craft.faqs
    : [
        {
          question: `What makes ${subjectName} from ${region.name} unique?`,
          answer: `${subjectName} crafted or harvested in ${region.name} reflects local climate, regional materials, and generational skills documented on each verified seller page.`,
        },
        {
          question: `How can I verify genuine ${subjectName} from ${region.name}?`,
          answer: `Check the maker profile, district origin field, and materials declaration on every product page; GI-tagged items appear only after admin review.`,
        },
      ];

  return {
    region,
    craft,
    category,
    subjectName,
    subjectSlug: subjectSlugClean,
    introText,
    faqs,
    productCount,
  };
}

export function listIndexableRegionCraftCombos(db: Db): RegionCraftCombo[] {
  const regions = listRegions(db);
  const crafts = listCrafts(db);
  const categories = db
    .prepare('SELECT id, slug FROM categories WHERE is_active = 1')
    .all() as { id: string; slug: string }[];

  const seen = new Set<string>();
  const valid: RegionCraftCombo[] = [];

  for (const r of regions) {
    if ((r.productCount ?? 0) < 3) continue;
    for (const c of crafts) {
      const combo = getRegionCraftCombo(db, r.slug, c.slug);
      if (combo) {
        seen.add(`${r.slug}::${c.slug}`);
        valid.push(combo);
      }
    }
    for (const cat of categories) {
      if (seen.has(`${r.slug}::${cat.slug}`)) continue;
      const combo = getRegionCraftCombo(db, r.slug, cat.slug);
      if (combo) valid.push(combo);
    }
  }
  return valid;
}

export function resolveSlugRedirect(db: Db, requestPath: string): string | null {
  const normalized = (requestPath.replace(/\/+$/, '') || '/').toLowerCase();
  const row = db
    .prepare('SELECT new_path FROM slug_redirects WHERE LOWER(old_path) = ?')
    .get(normalized) as { new_path: string } | undefined;
  return row?.new_path ?? null;
}

export function recordSlugRedirect(db: Db, oldPath: string, newPath: string): void {
  const cleanOld = (oldPath.replace(/\/+$/, '') || '/').toLowerCase();
  const cleanNew = newPath.replace(/\/+$/, '') || '/';
  if (cleanOld === cleanNew.toLowerCase()) return;
  db.prepare(
    `INSERT INTO slug_redirects (old_path, new_path) VALUES (?, ?)
     ON CONFLICT(old_path) DO UPDATE SET new_path = excluded.new_path`,
  ).run(cleanOld, cleanNew);
}
