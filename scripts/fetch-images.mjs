/**
 * Fetch illustrative, openly licensed photographs from Wikimedia Commons.
 * Development assets only: run before seeding, then replace product photography
 * with the business's own images. Attribution is written to
 * public/images/credits.json and surfaced on /credits.
 *
 * Usage: node scripts/fetch-images.mjs
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const API = 'https://commons.wikimedia.org/w/api.php';
const OUT_DIR = path.resolve('public', 'images');

const WANTED = [
  {
    file: 'hero-village',
    title: 'Batheri Village Mandi Himachal Jul20 D72 16806.jpg',
    note: 'Batheri village, Mandi district',
  },
  {
    file: 'editorial-terrace',
    title: 'Fields and Alpine View - Neddi - Himachal Pradesh - India (26812171335).jpg',
    note: 'Fields near Neddi, Himachal Pradesh',
  },
  {
    file: 'editorial-spinning',
    title: 'Women spinning wool, Dobhi, Kullu district.jpg',
    note: 'Women spinning wool, Kullu district',
  },
  {
    file: 'weaving',
    title: 'Kullvi Pattu Weaving in Kullu district,1.jpg',
    note: 'Kullvi pattu weaving, Kullu district',
  },
  {
    file: 'makers-hands',
    title: 'Kullvi Pattu Weaving in Kullu district,3.jpg',
    note: 'Kullvi pattu weaving, Kullu district',
  },
  {
    file: 'product-shawl',
    title: 'Kullvi Pattu Weaving in Kullu district,5.jpg',
    note: 'Kullvi pattu weaving, Kullu district',
  },
  {
    file: 'product-socks',
    title: 'Hand-knitted Himachali socks,2.jpg',
    note: 'Hand-knitted Himachali socks',
  },
  { file: 'product-tea', title: 'Tea Gardens Dharamshala.jpg', note: 'Tea gardens, Dharamshala' },
  { file: 'product-honey', title: 'Small Honey Jar with Honeycomb.jpg', note: 'Honey jar (illustrative)' },
  { file: 'product-apricot', title: 'Ab food 04.jpg', note: 'Dried apricots (illustrative)' },
  { file: 'product-rajma', title: 'Kidney beans.jpg', note: 'Kidney beans (illustrative)' },
  { file: 'product-cap', title: 'Himachali Caps (87069779).jpeg', note: 'Himachali caps' },
  { file: 'product-pickle', title: 'Mango Pickle Home Made Style.JPG', note: 'Indian pickle (illustrative)' },
  { file: 'product-walnut', title: 'Juglans regia Echte Walnussfrucht 3.jpg', note: 'Walnuts (illustrative)' },
  {
    file: 'region-kangra',
    title: 'View of Kangra valley from Fort 02.JPG',
    note: 'Kangra valley',
  },
  {
    file: 'region-kinnaur',
    title: 'Chini village and Kila (Kalpa), Kinnaur, Himachal Pradesh 01.jpg',
    note: 'Kalpa, Kinnaur',
  },
  {
    file: 'region-lahaul',
    title: 'Keylong West Lahaul Himachal Oct22 A7C 03375 panorama.jpg',
    note: 'Keylong, Lahaul',
  },
  {
    file: 'region-chamba',
    title: 'Chamba city and river Ravi, Himachal Pradesh India.jpg',
    note: 'Chamba town and the Ravi',
  },
];

const ALLOWED_LICENSE = /^(cc0|cc by|cc by-sa|public domain|pd|no restrictions)/i;
const BANNED_LICENSE = /nc|nd|non-?commercial|no ?deriv/i;

const headers = {
  'User-Agent': 'PahadiRootsLocalDev/0.1 (local development image sourcing; contact: dev@pahadiroots.local)',
};

function stripHtml(value = '') {
  return value.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

function pickLicense(meta) {
  return meta?.LicenseShortName?.value ?? meta?.License?.value ?? meta?.UsageTerms?.value ?? '';
}

async function fetchWithRetry(url, attempts = 4) {
  let wait = 1500;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const response = await fetch(url, { headers });
    if (response.status !== 429 && response.status < 500) return response;
    if (attempt === attempts) return response;
    await new Promise((resolve) => setTimeout(resolve, wait));
    wait *= 2;
  }
  throw new Error('unreachable');
}

async function imageInfo(titles) {
  const params = new URLSearchParams({
    action: 'query',
    titles,
    prop: 'imageinfo',
    iiprop: 'url|size|extmetadata',
    iiurlwidth: '1800',
    format: 'json',
  });
  const response = await fetchWithRetry(`${API}?${params}`);
  if (!response.ok) throw new Error(`Commons API ${response.status}`);
  const json = await response.json();
  return Object.values(json.query?.pages ?? {})[0];
}

async function download(spec) {
  const page = await imageInfo(`File:${spec.title}`);
  const info = page?.imageinfo?.[0];
  if (!info?.thumburl) {
    console.warn(`✗ not found: ${spec.title}`);
    return null;
  }
  const meta = info.extmetadata ?? {};
  const license = pickLicense(meta);
  if (!ALLOWED_LICENSE.test(license) || BANNED_LICENSE.test(license)) {
    console.warn(`✗ licence not allowed: ${spec.title} — ${license}`);
    return null;
  }
  const response = await fetchWithRetry(info.thumburl.split('?')[0]);
  if (!response.ok) {
    console.warn(`✗ download failed (${response.status}): ${spec.title}`);
    return null;
  }
  const contentType = response.headers.get('content-type') ?? 'image/jpeg';
  if (!contentType.startsWith('image/')) {
    console.warn(`✗ unexpected content type ${contentType}: ${spec.title}`);
    return null;
  }
  const ext = contentType.includes('png') ? '.png' : contentType.includes('webp') ? '.webp' : '.jpg';
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length < 20_000) return null;
  await fs.writeFile(path.join(OUT_DIR, `${spec.file}${ext}`), buffer);
  return {
    file: `/images/${spec.file}${ext}`,
    title: spec.title,
    author: stripHtml(meta.Artist?.value ?? 'Unknown') || 'Unknown',
    license: stripHtml(license),
    licenseUrl: meta.LicenseUrl?.value ?? '',
    sourceUrl: info.descriptionurl ?? `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(spec.title)}`,
    note: spec.note,
  };
}

await fs.mkdir(OUT_DIR, { recursive: true });
const credits = [];
for (const spec of WANTED) {
  const credit = await download(spec);
  if (credit) {
    credits.push(credit);
    console.log(`✓ ${credit.file} — ${credit.license} — ${credit.title}`);
  }
  await new Promise((resolve) => setTimeout(resolve, 250));
}
await fs.writeFile(path.join(OUT_DIR, 'credits.json'), JSON.stringify({ fetchedAt: new Date().toISOString(), credits }, null, 2));
console.log(`\nSaved ${credits.length} images and credits.json`);
