// Copies non-TypeScript server assets into the compiled output so the
// production server can run without the source tree.
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const source = path.join(root, 'server', 'schema.sql');
const destination = path.join(root, 'dist-server', 'server', 'schema.sql');

if (!fs.existsSync(source)) {
  console.error(`Missing ${source}. Cannot build the server.`);
  process.exit(1);
}

fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.copyFileSync(source, destination);
console.log(`Copied schema.sql to ${path.relative(root, destination)}`);
