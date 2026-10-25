/**
 * Prepare homepage photography.
 *
 * Downloads the curated, openly licensed photographs from Wikimedia Commons,
 * resizes them to the exact widths the homepage uses, and writes compact,
 * progressively encoded JPEGs for each breakpoint. Attribution is merged into
 * public/images/credits.json so /credits and the seeded site content stay
 * accurate.
 *
 * Usage: node scripts/prepare-home-images.mjs
 * Re-runs are safe: files are overwritten and credit rows are de-duplicated.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const API = 'https://commons.wikimedia.org/w/api.php';
const OUT_DIR = path.resolve('public', 'images', 'home');
const CREDITS_FILE = path.resolve('public', 'images', 'credits.json');

const SOURCES = [
  {
    id: 'kalpa-dawn',
    title: 'Kinner Kailash Mountain Range (edited).jpg',
    note: 'Hero photograph — Kinnaur Kailash at dawn above Kalpa',
    widths: [1800, 1100, 720],
  },
  {
    id: 'kinnaur-ridge',
    title: 'View from Kalpa.JPG',
    note: 'Hero photograph — deodar slopes and snow peaks above Kalpa, Kinnaur',
    widths: [1800, 1100, 720],
  },
  {
    id: 'kullu-spinning',
    title: 'Women spinning wool, Dobhi, Kullu district.jpg',
    note: 'Hero photograph — hand-spinning wool, Dobhi, Kullu district',
    widths: [1800, 1100, 720],
  },
  {
    id: 'chamba-carving',
    title: 'Closer view of architecture of Laxminarayan temple, Chamba 03.jpg',
    note: 'Hero and editorial photograph — stone carving at Laxminarayan temple, Chamba',
    widths: [1600, 1100, 720],
  },
];

const ALLOWED_LICENSE = /^(cc0|cc by|cc by-sa|public domain|pd|no restrictions)/i;
const BANNED_LICENSE = /nc|nd|non-?commercial|no ?deriv/i;

/* Already-credited repository photographs that only need responsive copies. */
const LOCAL = [
  {
    id: 'batheri',
    file: 'public/images/hero-village.jpg',
    widths: [1800, 1100, 720],
  },
];
const headers = {
  'User-Agent': 'PahadiRootsImagePipeline/1.0 (local build asset preparation; contact: dev@pahadiroots.local)',
};

function stripHtml(value = '') {
  return value.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
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

async function imageInfo(title) {
  const params = new URLSearchParams({
    action: 'query',
    titles: `File:${title}`,
    prop: 'imageinfo',
    iiprop: 'url|size|extmetadata',
    iiurlwidth: '1900',
    format: 'json',
  });
  const response = await fetchWithRetry(`${API}?${params}`);
  if (!response.ok) throw new Error(`Commons API ${response.status}`);
  const json = await response.json();
  return Object.values(json.query?.pages ?? {})[0];
}

async function prepare(source) {
  const page = await imageInfo(source.title);
  const info = page?.imageinfo?.[0];
  if (!info?.thumburl) throw new Error(`not found: ${source.title}`);

  const meta = info.extmetadata ?? {};
  const license = stripHtml(meta.LicenseShortName?.value ?? meta.License?.value ?? '');
  if (!ALLOWED_LICENSE.test(license) || BANNED_LICENSE.test(license)) {
    throw new Error(`licence not allowed: ${source.title} — ${license}`);
  }

  const response = await fetchWithRetry(info.thumburl);
  if (!response.ok) throw new Error(`download failed ${response.status}: ${source.title}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length < 20_000) throw new Error(`file too small: ${source.title}`);

  const base = sharp(buffer, { failOn: 'none' }).rotate();
  const { width: naturalWidth } = await base.metadata();

  for (const width of source.widths) {
    const target = Math.min(width, naturalWidth ?? width);
    await base
      .clone()
      .resize({ width: target, withoutEnlargement: true })
      .jpeg({ quality: 78, mozjpeg: true, progressive: true })
      .toFile(path.join(OUT_DIR, `${source.id}-${width}.jpg`));
  }

  return {
    file: `/images/home/${source.id}-${Math.min(...source.widths)}.jpg`,
    title: source.title,
    author: stripHtml(meta.Artist?.value ?? 'Unknown') || 'Unknown',
    license,
    licenseUrl: meta.LicenseUrl?.value ?? '',
    sourceUrl: info.descriptionurl ?? `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(source.title)}`,
    note: source.note,
  };
}

await fs.mkdir(OUT_DIR, { recursive: true });

for (const item of LOCAL) {
  const buffer = await fs.readFile(item.file);
  const base = sharp(buffer, { failOn: 'none' }).rotate();
  const { width: naturalWidth } = await base.metadata();
  for (const width of item.widths) {
    const target = Math.min(width, naturalWidth ?? width);
    await base
      .clone()
      .resize({ width: target, withoutEnlargement: true })
      .jpeg({ quality: 78, mozjpeg: true, progressive: true })
      .toFile(path.join(OUT_DIR, `${item.id}-${width}.jpg`));
  }
  console.log(`✓ ${item.id} — local copy from ${item.file}`);
}

let credits = { fetchedAt: new Date().toISOString(), credits: [] };
try {
  credits = JSON.parse(await fs.readFile(CREDITS_FILE, 'utf8'));
} catch {
  // Start a fresh credits file when none exists.
}

const prepared = [];
for (const source of SOURCES) {
  const credit = await prepare(source);
  prepared.push({ source, credit });
  console.log(`✓ ${source.id} — ${credit.license} — ${source.title}`);
  await new Promise((resolve) => setTimeout(resolve, 300));
}

const titles = new Set(prepared.map(({ credit }) => credit.title));
credits.credits = [...credits.credits.filter((entry) => !titles.has(entry.title)), ...prepared.map(({ credit }) => credit)];
credits.fetchedAt = new Date().toISOString();
await fs.writeFile(CREDITS_FILE, `${JSON.stringify(credits, null, 2)}\n`);

const files = await fs.readdir(OUT_DIR);
let total = 0;
for (const file of files) {
  const stat = await fs.stat(path.join(OUT_DIR, file));
  total += stat.size;
}
console.log(`\n${prepared.length} photographs, ${files.length} files, ${(total / 1024 / 1024).toFixed(2)} MB total.`);
