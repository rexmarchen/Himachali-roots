import { complianceGroupFor } from './productCompliance.js';

function readEnvBrand(): string {
  try {
    const procEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
    const raw = procEnv?.VITE_BRAND_NAME ?? procEnv?.BRAND_NAME;
    if (raw && raw.trim()) return raw.trim();
  } catch {
    // Browser environments without process.env fall back cleanly.
  }
  return 'Dear Hills';
}

export const MARKETPLACE_DEFAULT_ORIGIN = 'https://www.dearhills.in';
export const BRAND_NAME = readEnvBrand();
export const BRAND_DOMAIN = 'dearhills.in';
export const BRAND_ALTERNATE_NAMES = ['DEAR HILLS', 'DearHills', 'dearhills', 'dearhills.in'] as const;
export const BRAND_LOGO_URL = `${MARKETPLACE_DEFAULT_ORIGIN}/favicon-192x192.png`;
export const MARKETPLACE_HOME_TITLE = `${BRAND_NAME} — Authentic Himalayan Goods | DearHills.in`;
export const MARKETPLACE_HOME_DESCRIPTION =
  `Official DearHills (${BRAND_DOMAIN}) marketplace for authentic Indian Himalayan handloom shawls, regional teas, raw honey & mountain crafts.`;
export const SHOP_SEO_TITLE = `Shop Himalayan Handloom, Crafts & Food | ${BRAND_NAME}`;
export const SHOP_SEO_COLLECTION_NAME = 'Shop Authentic Himalayan Handloom, Crafts & Mountain Harvest';
export const SHOP_SEO_DESCRIPTION =
  'Browse handmade Pashmina, Kullu & Kinnauri shawls, Aipan art, Kangra & Darjeeling tea, and pure mountain honey direct from verified Himalayan artisans.';
export const MAKERS_SEO_TITLE = `Himalayan Makers & Artisan Workshops | ${BRAND_NAME}`;
export const MAKERS_SEO_DESCRIPTION =
  'Discover generational weavers, orchardists, tea planters, beekeepers, and woodworkers across Himachal, Uttarakhand, Kashmir, Ladakh, Sikkim & the Eastern Hills.';
export const BECOME_MAKER_SEO_TITLE = `Sell with ${BRAND_NAME} — Himalayan Artisan Onboarding`;
export const BECOME_MAKER_SEO_DESCRIPTION =
  `Join ${BRAND_NAME} to share authentic Himalayan handloom, tea, honey, orchard harvest and village craft with customers across India.`;

export function fitSeoTitle(rawTitle: string, maxLength = 60, brand = BRAND_NAME): string {
  const clean = rawTitle.replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLength) return clean;
  const suffix = ` | ${brand}`;
  if (clean.endsWith(suffix)) {
    const budget = maxLength - suffix.length;
    if (budget > 12) {
      const head = clean.slice(0, clean.length - suffix.length).trim();
      const shortened = head.length <= budget ? head : `${head.slice(0, budget - 1).trim()}…`;
      return `${shortened}${suffix}`;
    }
  }
  return `${clean.slice(0, maxLength - 1).trim()}…`;
}

export function fitSeoDescription(rawDescription: string, maxLength = 158): string {
  return cleanSeoText(rawDescription, maxLength);
}

export function buildRegionHubTitle(regionName: string, brand = BRAND_NAME): string {
  const full = `Handmade Products from ${regionName} | ${brand}`;
  if (full.length <= 60) return full;
  return fitSeoTitle(`${regionName} Handmade Products | ${brand}`, 60, brand);
}

export function buildCraftHubTitle(craftName: string, brand = BRAND_NAME): string {
  const full = `${craftName} from the Himalayas: Authentic & Handmade | ${brand}`;
  if (full.length <= 60) return full;
  const medium = `${craftName}: Authentic Himalayan Craft | ${brand}`;
  if (medium.length <= 60) return medium;
  return fitSeoTitle(`${craftName} | ${brand}`, 60, brand);
}

export function buildRegionCraftTitle(craftName: string, regionName: string, brand = BRAND_NAME): string {
  const full = `${craftName} from ${regionName}: Buy Direct from Artisans | ${brand}`;
  if (full.length <= 60) return full;
  const medium = `${craftName} from ${regionName} | ${brand}`;
  if (medium.length <= 60) return medium;
  return fitSeoTitle(`${craftName} · ${regionName} | ${brand}`, 60, brand);
}

export function buildProductImageAlt(productName: string, regionName: string | null | undefined, makerName: string | null | undefined): string {
  const region = (regionName ?? '').trim() || 'the Indian Himalayas';
  const maker = (makerName ?? '').trim() || BRAND_NAME;
  return `${productName} handmade in ${region} by ${maker}`;
}

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

export interface ProductSeoInput {
  name: string;
  categorySlug?: string | null;
  categoryName?: string | null;
  originPlace?: string | null;
  region?: string | null;
  craftType?: string | null;
  materials?: string | null;
}

export interface CategorySeoInput {
  name: string;
  slug?: string | null;
}

export function cleanSeoText(text: string | null | undefined, maxLength = 160): string {
  if (!text) return '';
  const clean = text
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (clean.length <= maxLength) return clean;
  return clean.slice(0, maxLength - 1).trim() + '…';
}

export function productTitleSuffix(categorySlug?: string | null, categoryName?: string | null): string {
  const slug = (categorySlug ?? '').trim().toLowerCase();
  const group = complianceGroupFor(categorySlug, categoryName);

  if (group === 'raw_produce') {
    return 'Fresh Himachal Harvest';
  }
  if (group === 'food') {
    if (slug === 'tea-and-infusions') return 'Authentic Himachal Tea';
    if (slug === 'pantry-and-preserves') return 'Pure Himachal Pantry';
    if (slug === 'cold-pressed-oils') return 'Pure Himachal Harvest';
    return 'Authentic Himalayan Harvest';
  }
  if (group === 'textile') {
    return 'Authentic Handloom Himachal';
  }
  if (group === 'clothing') {
    return 'Authentic Himachali Craft';
  }
  if (group === 'craft') {
    return 'Authentic Handcrafted Himachal';
  }
  return 'Authentic Himachal Origin';
}

export function buildProductSeoTitle(input: ProductSeoInput): string {
  const craftOrMaterial = (input.craftType || input.materials || '').trim();
  const region = (input.region || '').trim();
  if (craftOrMaterial && region) {
    return fitSeoTitle(`${input.name} | ${craftOrMaterial} from ${region} | ${BRAND_NAME}`, 60, BRAND_NAME);
  }
  const suffix = productTitleSuffix(input.categorySlug, input.categoryName);
  const full = `${input.name} — ${suffix} | ${BRAND_NAME}`;
  if (full.length <= 60) return full;
  const compactSuffix = suffix.replace(/^(?:Authentic|Fresh|Pure)\s+/i, '').trim();
  const compact = `${input.name} — ${compactSuffix} | ${BRAND_NAME}`;
  if (compact.length <= 60) return compact;
  return fitSeoTitle(compact, 60, BRAND_NAME);
}

export function buildProductFallbackDescription(input: ProductSeoInput): string {
  const origin = (input.originPlace || input.region || '').trim() || 'Himachal Pradesh';
  const group = complianceGroupFor(input.categorySlug, input.categoryName);
  let text: string;
  switch (group) {
    case 'raw_produce':
      text = `Buy fresh ${input.name} harvested in ${origin}. Direct from verified Himalayan growers on Dear Hills.`;
      break;
    case 'food':
      text = `Buy pure ${input.name} sourced from ${origin}. Authentic Himalayan harvest from verified local producers on Dear Hills.`;
      break;
    case 'textile':
      text = `Shop authentic ${input.name} handwoven in ${origin}. Genuine Himachali handloom from verified artisans on Dear Hills.`;
      break;
    case 'clothing':
      text = `Shop authentic ${input.name} made in ${origin}. Direct from verified Himachali makers on Dear Hills.`;
      break;
    case 'craft':
      text = `Shop authentic ${input.name} handcrafted in ${origin}. Genuine Himalayan craft from verified local artisans on Dear Hills.`;
      break;
    default:
      text = `Shop authentic ${input.name} from ${origin}. Verified Himalayan origin and quality on Dear Hills.`;
      break;
  }
  return cleanSeoText(text, 160);
}

export function buildCategorySeoTitle(input: CategorySeoInput): string {
  const group = complianceGroupFor(input.slug, input.name);
  switch (group) {
    case 'raw_produce':
      return `${input.name} — Fresh Himachal Harvest | Dear Hills`;
    case 'food':
      return `${input.name} — Authentic Himalayan Harvest | Dear Hills`;
    case 'textile':
      return `${input.name} — Authentic Handloom Himachal | Dear Hills`;
    case 'clothing':
      return `${input.name} — Authentic Himachali Woollens & Apparel | Dear Hills`;
    case 'craft':
      return `${input.name} — Authentic Handcrafted Himachal | Dear Hills`;
    default:
      return `${input.name} — Authentic Himachal Origin | Dear Hills`;
  }
}

export function buildCategoryFallbackDescription(input: CategorySeoInput): string {
  const group = complianceGroupFor(input.slug, input.name);
  let text: string;
  switch (group) {
    case 'raw_produce':
      text = `Shop fresh ${input.name} harvested across Himachal Pradesh. Direct from verified mountain orchards and growers on Dear Hills.`;
      break;
    case 'food':
      text = `Buy pure ${input.name} sourced from Himachal Pradesh. Direct from verified mountain growers and food producers on Dear Hills.`;
      break;
    case 'textile':
      text = `Shop authentic ${input.name} handwoven across Himachal Pradesh. Direct from verified mountain weavers on Dear Hills.`;
      break;
    case 'clothing':
      text = `Shop authentic ${input.name} made across Himachal Pradesh. Direct from verified mountain makers on Dear Hills.`;
      break;
    case 'craft':
      text = `Shop authentic ${input.name} handcrafted across Himachal Pradesh. Direct from verified mountain artisans on Dear Hills.`;
      break;
    default:
      text = `Explore authentic ${input.name} made and grown across Himachal Pradesh. Direct from verified mountain makers and growers on Dear Hills.`;
      break;
  }
  return cleanSeoText(text, 160);
}

export function buildProductShortFallback(input: ProductSeoInput): string {
  const originRaw = (input.originPlace || input.region || '').trim() || 'Himachal Pradesh';
  const originLocation = originRaw.toLowerCase().includes('himachal') ? originRaw : `${originRaw}, Himachal Pradesh`;
  const slug = (input.categorySlug ?? '').trim().toLowerCase();
  const group = complianceGroupFor(input.categorySlug, input.categoryName);
  let text: string;
  switch (group) {
    case 'raw_produce':
      text = `Fresh ${input.name} harvested in ${originLocation}.`;
      break;
    case 'food':
      if (slug === 'tea-and-infusions') {
        text = `Orthodox ${input.name} sourced directly from ${originLocation}.`;
      } else if (slug === 'pantry-and-preserves') {
        text = `Pure ${input.name} prepared from ${originRaw} mountain harvests.`;
      } else if (slug === 'cold-pressed-oils') {
        text = `Pure cold-pressed ${input.name} from ${originLocation}.`;
      } else {
        text = `Pure ${input.name} sourced from ${originLocation}.`;
      }
      break;
    case 'textile':
      text = `Handwoven ${input.name} crafted on looms in ${originLocation}.`;
      break;
    case 'clothing':
      text = `Authentic ${input.name} made in ${originLocation}.`;
      break;
    case 'craft':
      text = `Handcrafted ${input.name} made by artisans in ${originLocation}.`;
      break;
    default:
      text = `Authentic ${input.name} sourced from ${originLocation}.`;
      break;
  }
  return cleanSeoText(text, 160);
}
