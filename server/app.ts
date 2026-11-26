import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { env } from './env.js';
import type { Db } from './db.js';
import { adminSessionToken, attachUser, isAdminNetworkAllowed, loadSessionUser, sessionToken } from './lib/auth.js';
import { auditContextStorage } from './lib/audit.js';
import { clientIp, corsMiddleware, csrfGuard, errorMiddleware } from './lib/http.js';
import { authRouter, type AuthRouterDeps } from './routes/auth.js';
import { publicRouter, sitemapRouter } from './routes/public.js';
import { shopRouter, type ShopRouterDeps } from './routes/shop.js';
import { accountRouter } from './routes/account.js';
import { sellerRouter } from './routes/seller.js';
import { adminRouter } from './routes/admin.js';
import { getSeoMetadata, injectSeoIntoHtml } from './lib/seo.js';
import { resolveSlugRedirect } from './lib/himalayan.js';

import { MetricsRegistry } from './core/telemetry/metrics.js';

export type AppDeps = Partial<AuthRouterDeps> &
  Partial<ShopRouterDeps> & {
    requireAdminMfa?: boolean;
  };

export function createApp(db: Db, deps: AppDeps = {}): express.Express {
  const app = express();
  const requireAdminMfa = deps.requireAdminMfa ?? env.requireAdminMfa;
  app.disable('x-powered-by');
  if (env.trustProxy) app.set('trust proxy', 1);

  if (env.isProduction && env.appUrl.startsWith('https://')) {
    app.use((req, res, next) => {
      if (req.path.startsWith('/api/health')) {
        next();
        return;
      }
      const proto = (req.get('x-forwarded-proto') || req.protocol || '').split(',')[0].trim().toLowerCase();
      if (proto === 'https' || req.secure) {
        next();
        return;
      }
      const host = req.get('x-forwarded-host') || req.get('host');
      if (host && (req.method === 'GET' || req.method === 'HEAD')) {
        res.redirect(301, `https://${host}${req.originalUrl}`);
        return;
      }
      res.status(403).json({ error: { code: 'https_required', message: 'HTTPS is required.' } });
    });
  }

  app.use((req, res, next) => {
    const supplied = req.get('x-request-id');
    const requestId =
      supplied && /^[A-Za-z0-9._-]{8,64}$/.test(supplied) ? supplied : crypto.randomUUID();
    res.locals.requestId = requestId;
    res.setHeader('X-Request-Id', requestId);

    const start = Date.now();
    res.on('finish', () => {
      MetricsRegistry.getInstance().recordRequest({
        path: req.path,
        method: req.method,
        statusCode: res.statusCode,
        durationMs: Date.now() - start,
        timestamp: start,
      });
    });

    auditContextStorage.run({ ip: clientIp(req) }, next);
  });

  app.use(
    helmet({
      contentSecurityPolicy: env.isProduction
        ? {
            useDefaults: true,
            directives: {
              'default-src': ["'self'"],
              'script-src': [
                "'self'",
                'https://accounts.google.com',
                'https://checkout.razorpay.com',
                'https://cdn.razorpay.com',
              ],
              'style-src': ["'self'", "'unsafe-inline'"],
              'img-src': ["'self'", 'data:', 'https:'],
              'font-src': ["'self'", 'data:'],
              'connect-src': [
                "'self'",
                'https://accounts.google.com',
                'https://api.razorpay.com',
                'https://lumberjack.razorpay.com',
                'https://checkout.razorpay.com',
                'https://cdn.razorpay.com',
              ],
              'frame-src': [
                'https://accounts.google.com',
                'https://api.razorpay.com',
                'https://checkout.razorpay.com',
              ],
              'object-src': ["'none'"],
              'base-uri': ["'self'"],
              'form-action': ["'self'"],
              'frame-ancestors': ["'none'"],
            },
          }
        : false,
      crossOriginEmbedderPolicy: false,
      crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      hsts: env.isProduction ? { maxAge: 31536000, includeSubDomains: true } : false,
    }),
  );

  app.use('/api', (_req, res, next) => {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    next();
  });
  app.use('/api', corsMiddleware);

  app.use((_req, res, next) => {
    // Disable browser features the storefront never needs. Payment Sheet/Checkout
    // does not require any of these device APIs.
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), usb=()');
    next();
  });

  app.use(
    express.json({
      limit: '250kb',
      verify: (req, _res, buf) => {
        if (req.url?.includes('/api/webhooks/')) {
          (req as express.Request & { rawBody?: Buffer }).rawBody = Buffer.from(buf);
        }
      },
    }),
  );
  app.use(express.urlencoded({ extended: false, limit: '50kb' }));
  app.use(cookieParser());

  app.use('/api', csrfGuard);
  app.use('/api', attachUser(db));
  app.use(
    '/api',
    rateLimit({
      windowMs: 60_000,
      limit: env.isTest ? 100_000 : 600,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: { error: { code: 'rate_limited', message: 'Too many requests. Please slow down.' } },
    }),
  );

  app.use('/api/auth', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use('/api/auth', authRouter(db, deps));
  app.use('/api', publicRouter(db));
  app.use('/api', shopRouter(db, deps));
  app.use('/api/account', accountRouter(db));
  app.use('/api/seller', sellerRouter(db));
  app.use('/api/admin', adminRouter(db, { requireAdminMfa }));
  app.use('/', sitemapRouter(db));

  // Server-side deny-by-default guard for /admin and /admin/* HTML routes.
  app.use('/admin', (req, res, next) => {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');

    if (!isAdminNetworkAllowed(req)) {
      res.status(403).type('text/plain').send('Administrator access is restricted on this host or network.');
      return;
    }

    const adminUser = loadSessionUser(db, adminSessionToken(req), 'admin');
    const standardUser = loadSessionUser(db, sessionToken(req), 'standard');
    if (!adminUser && !standardUser) {
      res.redirect(302, `/login?next=${encodeURIComponent(req.originalUrl || '/admin')}`);
      return;
    }

    const actor = adminUser ?? standardUser!;
    if (!actor.roles.includes('admin')) {
      res
        .status(403)
        .type('text/html; charset=utf-8')
        .send('<!doctype html><html><head><title>403 Forbidden</title></head><body><h1>403 Forbidden</h1><p>Administrator access required.</p></body></html>');
      return;
    }

    if (!adminUser) {
      res.redirect(302, `/login?next=${encodeURIComponent(req.originalUrl || '/admin')}`);
      return;
    }

    if (requireAdminMfa && !adminUser.mfaEnabled) {
      res.redirect(302, '/account/profile?mfa=required');
      return;
    }

    next();
  });

  app.use(
    '/uploads',
    express.static(env.uploadDir, {
      index: false,
      dotfiles: 'deny',
      maxAge: '7d',
      setHeaders: (res) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
      },
    }),
  );

  // Serve the built SPA from dist if present (in production or when built).
  const dist = path.resolve(process.cwd(), 'dist');
  const distExists = fs.existsSync(path.join(dist, 'index.html'));

  if (env.isProduction || distExists) {
    // Immutable fingerprinted JS/CSS chunks: 1 year cache
    app.use(
      '/assets',
      express.static(path.join(dist, 'assets'), {
        index: false,
        immutable: true,
        maxAge: '1y',
        setHeaders: (res) => {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        },
      }),
    );
    // Public images: 30 days cache with stale-while-revalidate
    app.use(
      '/images',
      express.static(path.join(dist, 'images'), {
        index: false,
        maxAge: '30d',
        setHeaders: (res) => {
          res.setHeader('Cache-Control', 'public, max-age=2592000, stale-while-revalidate=86400');
        },
      }),
    );
    // Public video assets: 30 days cache with stale-while-revalidate for instant repeat loads
    app.use(
      '/videos',
      express.static(path.join(dist, 'videos'), {
        index: false,
        maxAge: '30d',
        setHeaders: (res) => {
          res.setHeader('Cache-Control', 'public, max-age=2592000, stale-while-revalidate=86400');
        },
      }),
    );
    app.use(express.static(dist, { index: false, maxAge: '1h' }));
    let cachedRawIndexHtml: string | null = null;
    let cachedRawIndexMtime = 0;

    app.use((req, res, next) => {
      if ((req.method !== 'GET' && req.method !== 'HEAD') || req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
        next();
        return;
      }
      const redirectTarget = resolveSlugRedirect(db, req.path);
      if (redirectTarget) {
        res.redirect(301, redirectTarget);
        return;
      }
      const indexPath = path.join(dist, 'index.html');
      if (!fs.existsSync(indexPath)) {
        res.status(503).type('text/plain').send('Frontend build not found. Run `npm run build`.');
        return;
      }

      try {
        const stats = fs.statSync(indexPath);
        if (!cachedRawIndexHtml || stats.mtimeMs > cachedRawIndexMtime) {
          cachedRawIndexHtml = fs.readFileSync(indexPath, 'utf8');
          cachedRawIndexMtime = stats.mtimeMs;
        }

        const host = req.get('x-forwarded-host') || req.get('host') || undefined;
        const seo = getSeoMetadata(db, req.path, host, req.query as Record<string, string | string[] | undefined>);
        const transformedHtml = injectSeoIntoHtml(cachedRawIndexHtml, seo);

        if (seo.noindex) {
          res.setHeader('X-Robots-Tag', 'noindex, nofollow');
          res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
          res.setHeader('Pragma', 'no-cache');
        } else {
          // Public pages: no-cache ensures browsers always check ETag and immediately load new fingerprinted bundles on deployment
          res.setHeader(
            'X-Robots-Tag',
            'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1',
          );
          res.setHeader('Cache-Control', 'no-cache, must-revalidate');
          res.setHeader('Pragma', 'no-cache');
        }

        res.status(seo.statusCode ?? 200).type('text/html; charset=utf-8').send(transformedHtml);
      } catch {
        res.sendFile(indexPath);
      }
    });
  } else {
    // Development fallback when dist is not built yet: redirect browser requests to Vite dev server
    app.use((req, res, next) => {
      if ((req.method !== 'GET' && req.method !== 'HEAD') || req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
        next();
        return;
      }
      res.redirect(env.appUrl + req.originalUrl);
    });
  }

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: { code: 'not_found', message: 'API endpoint not found.' } });
  });

  app.use(errorMiddleware);
  return app;
}
