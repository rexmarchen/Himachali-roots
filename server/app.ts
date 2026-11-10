import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { env } from './env.js';
import type { Db } from './db.js';
import { attachUser } from './lib/auth.js';
import { corsMiddleware, csrfGuard, errorMiddleware } from './lib/http.js';
import { authRouter, type AuthRouterDeps } from './routes/auth.js';
import { publicRouter, sitemapRouter } from './routes/public.js';
import { shopRouter } from './routes/shop.js';
import { accountRouter } from './routes/account.js';
import { sellerRouter } from './routes/seller.js';
import { adminRouter } from './routes/admin.js';

import { MetricsRegistry } from './core/telemetry/metrics.js';

export function createApp(db: Db, deps: Partial<AuthRouterDeps> = {}): express.Express {
  const app = express();
  app.disable('x-powered-by');
  if (env.trustProxy) app.set('trust proxy', 1);

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

    next();
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

  app.use('/api', corsMiddleware);

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
  app.use('/api', shopRouter(db));
  app.use('/api/account', accountRouter(db));
  app.use('/api/seller', sellerRouter(db));
  app.use('/api/admin', adminRouter(db));
  app.use('/', sitemapRouter(db));

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
    // Public video assets: must-revalidate with immediate ETag verification to avoid stale video cache
    app.use(
      '/videos',
      express.static(path.join(dist, 'videos'), {
        index: false,
        maxAge: 0,
        setHeaders: (res) => {
          res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
        },
      }),
    );
    app.use(express.static(dist, { index: false, maxAge: '1h' }));
    app.use((req, res, next) => {
      if ((req.method !== 'GET' && req.method !== 'HEAD') || req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
        next();
        return;
      }
      const indexPath = path.join(dist, 'index.html');
      if (!fs.existsSync(indexPath)) {
        res.status(503).type('text/plain').send('Frontend build not found. Run `npm run build`.');
        return;
      }
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.setHeader('Surrogate-Control', 'no-store');
      res.sendFile(indexPath);
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
