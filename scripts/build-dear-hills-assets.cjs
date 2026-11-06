const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const BASE_DIR = path.resolve(__dirname, '../public/images/dear-hills');
const SOURCE_DIR = path.resolve(__dirname, '../public/images');

const DIRS = ['hero', 'categories', 'regions', 'storytelling'];

DIRS.forEach((d) => {
  const target = path.join(BASE_DIR, d);
  if (!fs.existsSync(target)) {
    fs.mkdirSync(target, { recursive: true });
  }
});

const JOBS = [
  // Hero images
  { src: 'home/snow-peaks-1800.jpg', dest: 'hero/snow-peaks.webp', width: 1920, quality: 85 },
  { src: 'home/snow-peaks-1800.jpg', dest: 'hero/snow-peaks-800.webp', width: 800, quality: 80 },
  { src: 'home/apple-orchard-1800.jpg', dest: 'hero/apple-orchard.webp', width: 1920, quality: 85 },
  { src: 'home/apple-orchard-1800.jpg', dest: 'hero/apple-orchard-800.webp', width: 800, quality: 80 },
  { src: 'home/kalpa-dawn-1800.jpg', dest: 'hero/mountain-village.webp', width: 1920, quality: 85 },
  { src: 'home/kalpa-dawn-1800.jpg', dest: 'hero/mountain-village-800.webp', width: 800, quality: 80 },
  { src: 'home/kinnaur-ridge-1800.jpg', dest: 'hero/himalayan-landscape.webp', width: 1920, quality: 85 },
  { src: 'home/kinnaur-ridge-1800.jpg', dest: 'hero/himalayan-landscape-800.webp', width: 800, quality: 80 },
  { src: 'home/maker-orchard-1800.jpg', dest: 'hero/himachal-valley.webp', width: 1920, quality: 85 },
  { src: 'home/maker-orchard-1800.jpg', dest: 'hero/himachal-valley-800.webp', width: 800, quality: 80 },

  // Categories
  { src: 'product-honey.jpg', dest: 'categories/honey.webp', width: 600, quality: 85 },
  { src: 'product-shawl.jpg', dest: 'categories/kullu-shawls.webp', width: 600, quality: 85 },
  { src: 'product-tea.jpg', dest: 'categories/kangra-tea.webp', width: 600, quality: 85 },
  { src: 'product-walnut.jpg', dest: 'categories/walnuts.webp', width: 600, quality: 85 },
  { src: 'product-oil.jpg', dest: 'categories/cold-pressed-oils.webp', width: 600, quality: 85 },
  { src: 'product-rajma.jpg', dest: 'categories/pulses.webp', width: 600, quality: 85 },
  { src: 'product-saffron.jpg', dest: 'categories/shilajit.webp', width: 600, quality: 85 },
  { src: 'product-muffler.jpg', dest: 'categories/knitwear.webp', width: 600, quality: 85 },
  { src: 'product-cap.jpg', dest: 'categories/handicrafts.webp', width: 600, quality: 85 },
  { src: 'maker-food.jpg', dest: 'categories/gifting.webp', width: 600, quality: 85 },
  { src: 'product-apricot.jpg', dest: 'categories/natural-products.webp', width: 600, quality: 85 },
  { src: 'product-pickle.jpg', dest: 'categories/traditional-food.webp', width: 600, quality: 85 },
  { src: 'maker-woodcraft.jpg', dest: 'categories/home-decor.webp', width: 600, quality: 85 },

  // Regions (12 Districts of Himachal)
  { src: 'home/kullu-spinning-1100.jpg', dest: 'regions/kullu.webp', width: 800, quality: 85 },
  { src: 'region-kangra.jpg', dest: 'regions/kangra.webp', width: 800, quality: 85 },
  { src: 'region-kinnaur.jpg', dest: 'regions/kinnaur.webp', width: 800, quality: 85 },
  { src: 'region-lahaul.jpg', dest: 'regions/lahaul-spiti.webp', width: 800, quality: 85 },
  { src: 'home/apple-orchard-1100.jpg', dest: 'regions/shimla.webp', width: 800, quality: 85 },
  { src: 'region-chamba.jpg', dest: 'regions/chamba.webp', width: 800, quality: 85 },
  { src: 'home/batheri-1100.jpg', dest: 'regions/mandi.webp', width: 800, quality: 85 },
  { src: 'product-walnut.jpg', dest: 'regions/solan.webp', width: 800, quality: 85 },
  { src: 'product-honey.jpg', dest: 'regions/sirmaur.webp', width: 800, quality: 85 },
  { src: 'editorial-terrace.jpg', dest: 'regions/bilaspur.webp', width: 800, quality: 85 },
  { src: 'maker-woodcraft.jpg', dest: 'regions/hamirpur.webp', width: 800, quality: 85 },
  { src: 'product-oil.jpg', dest: 'regions/una.webp', width: 800, quality: 85 },

  // Storytelling & Crafts
  { src: 'hands.jpg', dest: 'storytelling/bilona-churn.webp', width: 800, quality: 85 },
  { src: 'home/kullu-spinning-1100.jpg', dest: 'storytelling/traditional-weaving.webp', width: 800, quality: 85 },
  { src: 'region-lahaul.jpg', dest: 'storytelling/seabuckthorn-harvest.webp', width: 800, quality: 85 },
  { src: 'product-oil.jpg', dest: 'storytelling/chulli-oil-press.webp', width: 800, quality: 85 },
  { src: 'region-kangra.jpg', dest: 'storytelling/tea-plucking.webp', width: 800, quality: 85 },
  { src: 'maker-woodcraft.jpg', dest: 'storytelling/artisan-craft.webp', width: 800, quality: 85 },
  { src: 'editorial-terrace.jpg', dest: 'storytelling/mountain-farming.webp', width: 800, quality: 85 },
];

async function processImages() {
  console.log(`Processing ${JOBS.length} images into ${BASE_DIR}...`);
  let success = 0;
  let failed = 0;

  for (const job of JOBS) {
    const srcPath = path.join(SOURCE_DIR, job.src);
    const destPath = path.join(BASE_DIR, job.dest);

    if (!fs.existsSync(srcPath)) {
      console.warn(`[MISSING SOURCE] ${srcPath}`);
      failed++;
      continue;
    }

    try {
      await sharp(srcPath)
        .resize(job.width, null, { withoutEnlargement: true })
        .webp({ quality: job.quality })
        .toFile(destPath);

      const stats = fs.statSync(destPath);
      console.log(`✓ ${job.dest} (${Math.round(stats.size / 1024)} KB)`);
      success++;
    } catch (e) {
      console.error(`✗ Failed to convert ${job.src} -> ${job.dest}:`, e.message);
      failed++;
    }
  }

  console.log(`\nImage Processing Finished: ${success} succeeded, ${failed} failed.`);
}

processImages();
