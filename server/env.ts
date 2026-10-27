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

function list(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((entry) => entry.trim().replace(/\/$/, ''))
    .filter(Boolean);
}

const nodeEnv = process.env.NODE_ENV ?? 'development';
const isProduction = nodeEnv === 'production';

const sameSiteRaw = (process.env.SESSION_COOKIE_SAMESITE ?? 'lax').toLowerCase();
const sessionSameSite: 'lax' | 'strict' | 'none' =
  sameSiteRaw === 'strict' || sameSiteRaw === 'none' ? sameSiteRaw : 'lax';

export const env = {
  nodeEnv,
  isProduction,
  isTest: nodeEnv === 'test',
  port: int(process.env.PORT, 8787),
  appUrl: (process.env.APP_BASE_URL ?? process.env.APP_URL ?? 'http://localhost:5173').replace(/\/$/, ''),
  databasePath: process.env.DATABASE_PATH ?? path.resolve(process.cwd(), 'data', 'pahadi-roots.db'),
  uploadDir: process.env.UPLOAD_DIR ?? path.resolve(process.cwd(), 'storage', 'uploads'),
  privateDocsDir: process.env.PRIVATE_DOCS_DIR ?? path.resolve(process.cwd(), 'storage', 'private', 'seller-docs'),
  trustProxy: bool(process.env.TRUST_PROXY, false),
  sessionDays: int(process.env.SESSION_DAYS, 30),
  sessionIdleDays: int(process.env.SESSION_IDLE_DAYS, 7),
  sessionSameSite,
  /** Extra browser origins allowed to call the API with credentials (split frontend/API deployments). */
  allowedOrigins: list(process.env.ALLOWED_ORIGINS),
  googleClientId: (process.env.GOOGLE_CLIENT_ID ?? '').trim(),
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
  email: {
    resendApiKey: (process.env.RESEND_API_KEY ?? '').trim(),
    from: process.env.EMAIL_FROM ?? 'PAHADI ROOTS <no-reply@pahadiroots.example>',
    supportEmail: process.env.SUPPORT_EMAIL ?? 'hello@pahadiroots.example',
    adminNotificationEmail: (process.env.ADMIN_NOTIFICATION_EMAIL ?? process.env.SUPPORT_EMAIL ?? 'hello@pahadiroots.example').trim(),
    timeoutMs: int(process.env.EMAIL_TIMEOUT_MS, 10_000),
    maxAttempts: Math.max(1, Math.min(5, int(process.env.EMAIL_MAX_ATTEMPTS, 3))),
    get provider(): 'resend' | 'smtp' | 'none' {
      if (this.resendApiKey) return 'resend';
      if (env.smtp.configured) return 'smtp';
      return 'none';
    },
    get configured() {
      return this.provider !== 'none';
    },
    get fromIsPlaceholder() {
      return /@[^>]*\.example>?$/i.test(this.from) || this.supportEmail.endsWith('.example');
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
      problems.push('CRITICAL: SIMULATED_CHECKOUT_ENABLED and ALLOW_DEV_PAYMENTS must never be enabled in production.');
    }
    if (env.allowDevAuthHelpers) problems.push('CRITICAL: ALLOW_DEV_AUTH_HELPERS must never be enabled in production.');
    if (!env.appUrl.startsWith('https://')) problems.push('CRITICAL: APP_URL must be an https:// URL in production.');
    if (!env.razorpay.configured) problems.push('Razorpay keys are not configured — live checkout is disabled and orders remain pending payment.');
    if (!env.razorpay.webhookSecret) problems.push('RAZORPAY_WEBHOOK_SECRET is not configured — payment captures will not be verified by webhook.');
    if (!env.email.configured) {
      problems.push('No transactional email provider is configured — Resend (RESEND_API_KEY) or SMTP is required for order email.');
    } else if (env.email.fromIsPlaceholder) {
      problems.push('EMAIL_FROM/SUPPORT_EMAIL still use placeholder .example addresses.');
    }
    if (!fs.existsSync(env.databasePath)) problems.push('Database file does not exist; run migrations/seed before starting.');
    if (!env.googleClientId) problems.push('GOOGLE_CLIENT_ID is not configured — Google sign-in will be hidden.');
    if (env.googleClientId && !env.googleClientId.endsWith('.apps.googleusercontent.com')) {
      problems.push('GOOGLE_CLIENT_ID does not look like a Google Web Client ID.');
    }
    if (env.sessionIdleDays < 1 || env.sessionIdleDays > env.sessionDays) {
      problems.push('CRITICAL: SESSION_IDLE_DAYS must be between 1 and SESSION_DAYS.');
    }
    if (env.sessionSameSite === 'none' && !env.appUrl.startsWith('https://')) {
      problems.push('CRITICAL: SESSION_COOKIE_SAMESITE=none requires APP_URL to use https://.');
    }
    for (const origin of env.allowedOrigins) {
      if (!origin.startsWith('https://')) {
        problems.push(`CRITICAL: ALLOWED_ORIGINS entry must use https:// in production: ${origin}`);
      }
    }
    if (!env.trustProxy) {
      problems.push('TRUST_PROXY is disabled — rate limits and secure-cookie detection may see the proxy IP.');
    }
    if (!env.email.adminNotificationEmail || env.email.adminNotificationEmail.endsWith('.example')) {
      problems.push('ADMIN_NOTIFICATION_EMAIL is not configured with a real monitored inbox.');
    }
  }
  return problems;
}

export function criticalProductionIssues(issues = assertProductionConfig()): string[] {
  return issues.filter((issue) => issue.startsWith('CRITICAL:'));
}
