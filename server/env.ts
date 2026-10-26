import fs from 'node:fs';
import path from 'node:path';

// Load .env without adding a dependency. Existing process env wins.
try {
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) process.loadEnvFile(envPath);
} catch {
  // .env is optional; defaults below apply.
}

function bool(value: string | undefined, fallback = false): boolean {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function int(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const nodeEnv = process.env.NODE_ENV ?? 'development';
const isProduction = nodeEnv === 'production';

export const env = {
  nodeEnv,
  isProduction,
  isTest: nodeEnv === 'test',
  port: int(process.env.PORT, 8787),
  appUrl: (process.env.APP_URL ?? 'http://localhost:5173').replace(/\/$/, ''),
  databasePath: process.env.DATABASE_PATH ?? path.resolve(process.cwd(), 'data', 'pahadi-roots.db'),
  uploadDir: process.env.UPLOAD_DIR ?? path.resolve(process.cwd(), 'storage', 'uploads'),
  privateDocsDir: process.env.PRIVATE_DOCS_DIR ?? path.resolve(process.cwd(), 'storage', 'private', 'seller-docs'),
  trustProxy: bool(process.env.TRUST_PROXY, false),
  sessionDays: int(process.env.SESSION_DAYS, 30),
  defaultCommissionBp: int(process.env.DEFAULT_COMMISSION_BP, 1500),
  freeShippingThresholdPaise: int(process.env.FREE_SHIPPING_THRESHOLD_PAISE, 149900),
  flatShippingPaise: int(process.env.FLAT_SHIPPING_PAISE, 7900),
  reservationMinutes: int(process.env.RESERVATION_MINUTES, 30),
  allowDevPayments: bool(process.env.ALLOW_DEV_PAYMENTS, false) && !isProduction,
  simulatedCheckoutEnabled: bool(process.env.SIMULATED_CHECKOUT_ENABLED ?? process.env.ALLOW_DEV_PAYMENTS, false) && !isProduction,
  allowDevAuthHelpers: bool(process.env.ALLOW_DEV_AUTH_HELPERS, false) && !isProduction,
  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID ?? '',
    keySecret: process.env.RAZORPAY_KEY_SECRET ?? '',
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET ?? '',
    get configured() {
      return Boolean(this.keyId && this.keySecret);
    },
  },
  smtp: {
    host: process.env.SMTP_HOST ?? '',
    port: int(process.env.SMTP_PORT, 587),
    user: process.env.SMTP_USER ?? '',
    pass: process.env.SMTP_PASS ?? '',
    from: process.env.EMAIL_FROM ?? 'PAHADI ROOTS <no-reply@pahadiroots.example>',
    supportEmail: process.env.SUPPORT_EMAIL ?? 'hello@pahadiroots.example',
    get configured() {
      return Boolean(this.host && this.user && this.pass);
    },
  },
  shiprocket: {
    email: process.env.SHIPROCKET_EMAIL ?? '',
    password: process.env.SHIPROCKET_PASSWORD ?? '',
    pickupLocation: process.env.SHIPROCKET_PICKUP_LOCATION ?? '',
    get configured() {
      return Boolean(this.email && this.password);
    },
  },
  sentryDsn: process.env.SENTRY_DSN ?? '',
  logLevel: process.env.LOG_LEVEL ?? 'info',
} as const;

export function assertProductionConfig(): string[] {
  const problems: string[] = [];
  if (env.isProduction) {
    if (env.allowDevPayments || env.simulatedCheckoutEnabled || bool(process.env.SIMULATED_CHECKOUT_ENABLED, false)) {
      problems.push('SIMULATED_CHECKOUT_ENABLED and ALLOW_DEV_PAYMENTS must never be enabled in production.');
    }
    if (env.allowDevAuthHelpers) problems.push('ALLOW_DEV_AUTH_HELPERS must never be enabled in production.');
    if (!env.appUrl.startsWith('https://')) problems.push('APP_URL must be an https:// URL in production.');
    if (!env.razorpay.configured) problems.push('Razorpay keys are not configured — live checkout will be disabled.');
    if (!env.smtp.configured) problems.push('SMTP is not configured — transactional email will be skipped.');
    if (!fs.existsSync(env.databasePath)) problems.push('Database file does not exist; run migrations/seed before starting.');
  }
  return problems;
}
