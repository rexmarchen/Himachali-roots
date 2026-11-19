import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';

const dbPath = fs.existsSync('/data/pahadi-roots.db') ? '/data/pahadi-roots.db' : 'data/pahadi-roots.db';
const db = new DatabaseSync(dbPath);
const res = db.prepare("UPDATE product_images SET url = '/images/product-shawl.jpg' WHERE url = '/images/shawl.jpg'").run();
console.log('Updated broken shawl image in DB (' + dbPath + '):', res.changes);
