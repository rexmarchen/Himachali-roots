import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const IMAGES_DIR = path.resolve('public', 'images');
const HOME_DIR = path.resolve('public', 'images', 'home');

async function optimizeImages() {
  console.log('Optimizing heavy images in', IMAGES_DIR);
  await fs.mkdir(HOME_DIR, { recursive: true });

  // 1. Generate responsive variants for hero-apple-orchard.jpg
  const orchard = path.join(IMAGES_DIR, 'hero-apple-orchard.jpg');
  console.log('Processing hero-apple-orchard...');
  await sharp(orchard)
    .resize({ width: 720, withoutEnlargement: true })
    .jpeg({ quality: 80, progressive: true })
    .toFile(path.join(HOME_DIR, 'apple-orchard-720.jpg'));
  await sharp(orchard)
    .resize({ width: 1100, withoutEnlargement: true })
    .jpeg({ quality: 82, progressive: true })
    .toFile(path.join(HOME_DIR, 'apple-orchard-1100.jpg'));
  await sharp(orchard)
    .resize({ width: 1800, withoutEnlargement: true })
    .jpeg({ quality: 82, progressive: true })
    .toFile(path.join(HOME_DIR, 'apple-orchard-1800.jpg'));

  // 2. Generate responsive variants for hero-snow-peaks.jpg
  const snowPeaks = path.join(IMAGES_DIR, 'hero-snow-peaks.jpg');
  console.log('Processing hero-snow-peaks...');
  await sharp(snowPeaks)
    .resize({ width: 720, withoutEnlargement: true })
    .jpeg({ quality: 80, progressive: true })
    .toFile(path.join(HOME_DIR, 'snow-peaks-720.jpg'));
  await sharp(snowPeaks)
    .resize({ width: 1100, withoutEnlargement: true })
    .jpeg({ quality: 82, progressive: true })
    .toFile(path.join(HOME_DIR, 'snow-peaks-1100.jpg'));
  await sharp(snowPeaks)
    .resize({ width: 1800, withoutEnlargement: true })
    .jpeg({ quality: 82, progressive: true })
    .toFile(path.join(HOME_DIR, 'snow-peaks-1800.jpg'));

  // 3. Generate responsive variants for maker-orchard.jpg
  const makerOrchard = path.join(IMAGES_DIR, 'maker-orchard.jpg');
  console.log('Processing maker-orchard...');
  await sharp(makerOrchard)
    .resize({ width: 720, withoutEnlargement: true })
    .jpeg({ quality: 80, progressive: true })
    .toFile(path.join(HOME_DIR, 'maker-orchard-720.jpg'));
  await sharp(makerOrchard)
    .resize({ width: 1100, withoutEnlargement: true })
    .jpeg({ quality: 82, progressive: true })
    .toFile(path.join(HOME_DIR, 'maker-orchard-1100.jpg'));
  await sharp(makerOrchard)
    .resize({ width: 1800, withoutEnlargement: true })
    .jpeg({ quality: 82, progressive: true })
    .toFile(path.join(HOME_DIR, 'maker-orchard-1800.jpg'));

  // 4. Optimize other large images in public/images in-place
  const files = await fs.readdir(IMAGES_DIR, { withFileTypes: true });
  for (const entry of files) {
    if (!entry.isFile()) continue;
    const ext = path.extname(entry.name).toLowerCase();
    if (ext !== '.jpg' && ext !== '.jpeg' && ext !== '.png') continue;

    const fullPath = path.join(IMAGES_DIR, entry.name);
    const stats = await fs.stat(fullPath);
    if (stats.size > 350 * 1024) {
      console.log(`Optimizing ${entry.name} (${(stats.size / 1024).toFixed(0)} KB)...`);
      try {
        const inputBuf = await fs.readFile(fullPath);
        if (ext === '.png') {
          const buf = await sharp(inputBuf)
            .resize({ width: 1400, withoutEnlargement: true })
            .png({ quality: 80, compressionLevel: 9, effort: 7 })
            .toBuffer();
          if (buf.length < stats.size) {
            await fs.writeFile(fullPath, buf);
            console.log(`  Reduced ${entry.name}: ${(stats.size / 1024).toFixed(0)} KB -> ${(buf.length / 1024).toFixed(0)} KB`);
          }
        } else {
          const buf = await sharp(inputBuf)
            .resize({ width: 1400, withoutEnlargement: true })
            .jpeg({ quality: 80, progressive: true, mozjpeg: true })
            .toBuffer();
          if (buf.length < stats.size) {
            await fs.writeFile(fullPath, buf);
            console.log(`  Reduced ${entry.name}: ${(stats.size / 1024).toFixed(0)} KB -> ${(buf.length / 1024).toFixed(0)} KB`);
          }
        }
      } catch (err) {
        console.warn(`  Could not optimize ${entry.name}:`, err.message);
      }
    }
  }

  console.log('Optimization complete!');
}

optimizeImages().catch(console.error);
