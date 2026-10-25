import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { env } from './env.js';
import type { Db } from './db.js';
import { attachUser } from './lib/auth.js';
import { csrfGuard, errorMiddleware } from './lib/http.js';
import { authRouter } from './routes/auth.js';
import { publicRouter, sitemapRouter } from './routes/public.js';
import { shopRouter } from './routes/shop.js';
import { accountRouter } from './routes/account.js';
import { sellerRouter } from './routes/seller.js';
import { adminRouter } from './routes/admin.js';

export function createApp(db: Db): express.Express {
  const app = express();
  app.disable('x-powered-by');
  if (env.trustProxy) app.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: env.isProduction
        ? {
            useDefaults: true,
            directives: {
              'default-src': ["'self'"],
              'script-src': ["'self'", 'https://checkout.razorpay.com'],
              'style-src': ["'self'", "'unsafe-inline'"],
              'img-src': ["'self'", 'data:', 'https:'],
              'font-src': ["'self'", 'data:'],
              'connect-src': [
                "'self'",
                'https://api.razorpay.com',
                'https://lumberjack.razorpay.com',
                'https://checkout.razorpay.com',
              ],
              'frame-src': ['https://api.razorpay.com', 'https://checkout.razorpay.com'],
              'object-src': ["'none'"],
              'base-uri': ["'self'"],
              'form-action': ["'self'"],
              'frame-ancestors': ["'none'"],
            },
          }
        : false,
      crossOriginEmbedderPolicy: false,
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      hsts: env.isProduction ? { maxAge: 31536000, includeSubDomains: true } : false,
    }),
  );

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

  app.use('/api/auth', authRouter(db));
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

  // Production: serve the built SPA. Development uses Vite on :5173.
  if (env.isProduction) {
    const dist = path.resolve(process.cwd(), 'dist');
    app.use(express.static(dist, { index: false, maxAge: '1h' }));
    app.use((req, res, next) => {
      if (req.method !== 'GET' || req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
        next();
        return;
      }
      const indexPath = path.join(dist, 'index.html');
      if (!fs.existsSync(indexPath)) {
        res.status(503).type('text/plain').send('Frontend build not found. Run `npm run build`.');
        return;
      }
      res.sendFile(indexPath);
    });
  }

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: { code: 'not_found', message: 'API endpoint not found.' } });
  });

  app.use(errorMiddleware);
  return app;
}
