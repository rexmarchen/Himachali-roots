import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const db = new DatabaseSync('data/pahadi-roots.db');
const products = db.prepare(`
  SELECT p.id, p.name, p.slug, p.status, s.business_name, s.status as seller_status, s.store_status,
         (SELECT url FROM product_images pi WHERE pi.product_id = p.id ORDER BY sort_order LIMIT 1) AS image_url
  FROM products p
  JOIN seller_profiles s ON s.id = p.seller_id
`).all();

console.log('Total products in DB:', products.length);
for (const p of products) {
  let fileExists = true;
  if (p.image_url && p.image_url.startsWith('/')) {
    const filePath = path.join('public', p.image_url);
    fileExists = fs.existsSync(filePath);
  }
  console.log(`- [${p.status}] [seller: ${p.seller_status}/${p.store_status}] ${p.name} | Image: ${p.image_url} (exists: ${fileExists})`);
}
