#!/usr/bin/env node
/**
 * Build the SPA in production mode.
 *
 * Vite reads NODE_ENV from `.env` while resolving its config. A developer's
 * `.env` commonly sets NODE_ENV=development for the API, which makes Vite
 * emit React's development bundle during `npm run build`. Setting NODE_ENV in
 * this parent process before Vite resolves its config keeps the build
 * production-sized without changing the developer's `.env`.
 */
import process from 'node:process';

process.env.NODE_ENV = 'production';

const { build } = await import('vite');

try {
  await build();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}

// Refresh dist/sitemap.xml & dist/robots.txt fallback without mutating tracked public/ files.
// Express serves /sitemap.xml, /robots.txt, and /feeds/google-merchant.xml dynamically at runtime.
if (!process.exitCode) {
  try {
    process.argv.push('--dist-only');
    await import('./generate-sitemap.mjs');
  } catch (e) {
    console.warn('Sitemap post-build warning:', e instanceof Error ? e.message : e);
  }
}
