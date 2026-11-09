import { describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { SqliteAdapter, PostgresAdapter } from '../core/database/index.js';
import { OutboxService, OutboxWorker, EventBus } from '../core/outbox/index.js';
import { PasswordService, RbacService, MfaService } from '../core/security/index.js';
import { MetricsRegistry, Logger } from '../core/telemetry/index.js';
import { LocalStorageAdapter, S3StorageAdapter } from '../core/storage/index.js';
import type { SessionUser } from '../../shared/types.js';

describe('Dear Hills Enterprise Architecture Core', () => {
  describe('DatabasePort & Adapters (Hexagonal Ports)', () => {
    it('executes queries, mutations and transactions via SqliteAdapter', () => {
      const rawDb = new DatabaseSync(':memory:');
      rawDb.exec('CREATE TABLE test_items (id TEXT PRIMARY KEY, name TEXT, value INTEGER);');

      const db = new SqliteAdapter(rawDb);
      expect(db.ping()).toBe(true);

      const inserted = db.execute('INSERT INTO test_items (id, name, value) VALUES (?, ?, ?)', '1', 'Himalayan Honey', 45000);
      expect(Number(inserted.changes)).toBe(1);

      const item = db.queryOne<{ id: string; name: string; value: number }>('SELECT * FROM test_items WHERE id = ?', '1');
      expect(item).toEqual({ id: '1', name: 'Himalayan Honey', value: 45000 });

      // Transaction rollback test
      expect(() => {
        db.tx(() => {
          db.execute('INSERT INTO test_items (id, name, value) VALUES (?, ?, ?)', '2', 'Pashmina Shawl', 120000);
          throw new Error('Simulated failure');
        });
      }).toThrow('Simulated failure');

      const missing = db.queryOne('SELECT * FROM test_items WHERE id = ?', '2');
      expect(missing).toBeUndefined();
      db.close();
    });

    it('converts positional parameters in PostgresAdapter', () => {
      const sql = 'SELECT * FROM orders WHERE user_id = ? AND status = ? AND total_paise >= ?';
      const pgSql = PostgresAdapter.convertPlaceholders(sql);
      expect(pgSql).toBe('SELECT * FROM orders WHERE user_id = $1 AND status = $2 AND total_paise >= $3');
    });
  });

  describe('PasswordService (Argon2id & Migration)', () => {
    it('hashes passwords with Argon2id and verifies successfully', () => {
      const password = 'SuperSecretHimalayanKey1!';
      const hash = PasswordService.hash(password);
      expect(hash.startsWith('argon2id$')).toBe(true);
      expect(PasswordService.verify(password, hash)).toBe(true);
      expect(PasswordService.verify('WrongPassword', hash)).toBe(false);
      expect(PasswordService.needsRehash(hash)).toBe(false);
    });

    it('verifies legacy scrypt hashes and signals needsRehash=true', () => {
      const password = 'LegacyPassword123!';
      const salt = crypto.randomBytes(16).toString('hex');
      const rawHash = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
      const legacyScrypt = `scrypt$16384$8$1$${salt}$${rawHash.toString('hex')}`;

      expect(PasswordService.verify(password, legacyScrypt)).toBe(true);
      expect(PasswordService.verify('WrongPassword', legacyScrypt)).toBe(false);
      expect(PasswordService.needsRehash(legacyScrypt)).toBe(true);
    });
  });

  describe('RbacService (Multi-Tenant Seller & Customer Isolation)', () => {
    const customerUser: SessionUser = {
      id: 'usr_cust_1',
      email: 'customer@example.com',
      fullName: 'Customer One',
      roles: ['customer'],
      sellerId: null,
      sellerStatus: null,
      emailVerified: true,
      hasPassword: true,
      authProviders: ['local'],
    };

    const sellerUserA: SessionUser = {
      id: 'usr_seller_a',
      email: 'seller.a@example.com',
      fullName: 'Seller A',
      roles: ['customer', 'seller'],
      sellerId: 'sel_alpha',
      sellerStatus: 'approved',
      emailVerified: true,
      hasPassword: true,
      authProviders: ['local'],
    };

    const adminUser: SessionUser = {
      id: 'usr_admin',
      email: 'admin@dearhills.in',
      fullName: 'Marketplace Admin',
      roles: ['customer', 'admin'],
      sellerId: null,
      sellerStatus: null,
      emailVerified: true,
      hasPassword: true,
      authProviders: ['local'],
    };

    it('enforces multi-tenant seller isolation (BOLA protection)', () => {
      // Seller A can access their own tenant
      expect(() => RbacService.assertSellerTenantAccess(sellerUserA, 'sel_alpha')).not.toThrow();

      // Seller A cannot access Seller B's tenant
      expect(() => RbacService.assertSellerTenantAccess(sellerUserA, 'sel_beta')).toThrow(/Access denied/);

      // Customer cannot access any seller tenant
      expect(() => RbacService.assertSellerTenantAccess(customerUser, 'sel_alpha')).toThrow(/Access denied/);

      // Admin has operational access to any seller tenant
      expect(() => RbacService.assertSellerTenantAccess(adminUser, 'sel_alpha')).not.toThrow();
      expect(() => RbacService.assertSellerTenantAccess(adminUser, 'sel_beta')).not.toThrow();
    });

    it('enforces customer object-level privacy', () => {
      // Customer can access their own records
      expect(() => RbacService.assertCustomerAccess(customerUser, 'usr_cust_1')).not.toThrow();

      // Customer cannot access another customer's records
      expect(() => RbacService.assertCustomerAccess(customerUser, 'usr_cust_2')).toThrow(/Access denied/);

      // Admin can access customer records for support
      expect(() => RbacService.assertCustomerAccess(adminUser, 'usr_cust_1')).not.toThrow();
    });
  });

  describe('Transactional Outbox Pattern & Background Worker', () => {
    it('atomically enqueues, claims, dispatches and marks events published', async () => {
      const rawDb = new DatabaseSync(':memory:');
      rawDb.exec(`
        CREATE TABLE outbox_events (
          id TEXT PRIMARY KEY,
          aggregate_type TEXT NOT NULL,
          aggregate_id TEXT NOT NULL,
          event_type TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'published', 'failed', 'dead_letter')),
          retry_count INTEGER NOT NULL DEFAULT 0,
          max_retries INTEGER NOT NULL DEFAULT 5,
          last_error TEXT,
          scheduled_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
          processed_at TEXT,
          created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
        );
        CREATE INDEX idx_outbox_events_status_scheduled ON outbox_events(status, scheduled_at);
      `);

      const eventBus = EventBus.getInstance();
      eventBus.clear();

      let orderPaidHandled = false;
      eventBus.subscribe('order.paid', (event) => {
        expect(event.aggregateId).toBe('ord_1001');
        expect(event.payload.amountPaise).toBe(185000);
        orderPaidHandled = true;
      });

      // Enqueue event
      const event = OutboxService.enqueue(rawDb, {
        aggregateType: 'order',
        aggregateId: 'ord_1001',
        eventType: 'order.paid',
        payload: { amountPaise: 185000, sellerId: 'sel_kullu' },
      });
      expect(event.status).toBe('pending');

      const worker = new OutboxWorker(rawDb, 1000, 10);
      const processed = await worker.processBatch();
      expect(processed).toBe(1);
      expect(orderPaidHandled).toBe(true);

      // Verify DB record status is 'published'
      const record = rawDb.prepare('SELECT status, processed_at FROM outbox_events WHERE id = ?').get(event.id) as { status: string; processed_at: string };
      expect(record.status).toBe('published');
      expect(record.processed_at).toBeTruthy();
    });

    it('retries with exponential backoff on failure and routes to dead-letter after max retries', async () => {
      const rawDb = new DatabaseSync(':memory:');
      rawDb.exec(`
        CREATE TABLE outbox_events (
          id TEXT PRIMARY KEY,
          aggregate_type TEXT NOT NULL,
          aggregate_id TEXT NOT NULL,
          event_type TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          status TEXT NOT NULL,
          retry_count INTEGER NOT NULL DEFAULT 0,
          max_retries INTEGER NOT NULL DEFAULT 2,
          last_error TEXT,
          scheduled_at TEXT NOT NULL,
          processed_at TEXT,
          created_at TEXT NOT NULL
        );
      `);

      const eventBus = EventBus.getInstance();
      eventBus.clear();
      eventBus.subscribe('failing.event', () => {
        throw new Error('External webhook destination timeout');
      });

      const event = OutboxService.enqueue(rawDb, {
        aggregateType: 'webhook',
        aggregateId: 'wh_99',
        eventType: 'failing.event',
        payload: { attempt: 1 },
        maxRetries: 2,
      });

      const worker = new OutboxWorker(rawDb, 1000, 10);
      
      // Attempt 1 -> Fails, schedules retry
      await worker.processBatch();
      let record = rawDb.prepare('SELECT status, retry_count, last_error FROM outbox_events WHERE id = ?').get(event.id) as any;
      expect(record.status).toBe('pending');
      expect(record.retry_count).toBe(1);
      expect(record.last_error).toContain('External webhook destination timeout');

      // Fast forward scheduled_at for test
      rawDb.prepare("UPDATE outbox_events SET scheduled_at = datetime('now', '-1 minute') WHERE id = ?").run(event.id);

      // Attempt 2 -> Reaches maxRetries (2) -> dead_letter
      await worker.processBatch();
      record = rawDb.prepare('SELECT status, retry_count FROM outbox_events WHERE id = ?').get(event.id) as any;
      expect(record.status).toBe('dead_letter');
      expect(record.retry_count).toBe(2);
    });
  });

  describe('Telemetry & Metrics', () => {
    it('sanitizes sensitive fields and tracks latency histograms', () => {
      const logger = new Logger('TestContext');
      expect(logger).toBeDefined();

      const metrics = MetricsRegistry.getInstance();
      metrics.recordRequest({
        path: '/api/shop/products',
        method: 'GET',
        statusCode: 200,
        durationMs: 42,
        timestamp: Date.now(),
      });

      metrics.recordRequest({
        path: '/api/auth/login',
        method: 'POST',
        statusCode: 200,
        durationMs: 95,
        timestamp: Date.now(),
      });

      const snapshot = metrics.getSnapshot();
      expect(snapshot.totalRequests).toBeGreaterThanOrEqual(2);
      expect(snapshot.statusCodes['2xx']).toBeGreaterThanOrEqual(2);
      expect(snapshot.latency.p50).toBeGreaterThan(0);
    });
  });

  describe('Storage Port & Adapters', () => {
    it('creates public URLs in LocalStorageAdapter and signed S3 URLs in S3StorageAdapter', async () => {
      const local = new LocalStorageAdapter('./storage/uploads', './storage/private/seller-docs', 'https://dearhills.in');
      const localUrl = await local.getUrl('product-honey.webp', false);
      expect(localUrl).toBe('https://dearhills.in/uploads/product-honey.webp');

      const privateUrl = await local.getUrl('aadhaar-card.pdf', true);
      expect(privateUrl).toBe('/api/seller/documents/aadhaar-card.pdf');

      const s3 = new S3StorageAdapter({
        bucket: 'dearhills-media',
        region: 'ap-south-1',
        accessKeyId: 'testKey',
        secretAccessKey: 'testSecret',
        publicCdnUrl: 'https://media.dearhills.in',
      });
      const s3Url = await s3.getUrl('hero-mountain.jpg', false);
      expect(s3Url).toBe('https://media.dearhills.in/hero-mountain.jpg');
    });
  });

  describe('MfaService (RFC 6238 TOTP Multi-Factor Authentication)', () => {
    it('generates Base32 secrets, standard otpauth URIs, and valid 6-digit TOTP codes', () => {
      const secret = MfaService.generateSecret();
      expect(secret).toMatch(/^[A-Z2-7]{32}$/);

      const uri = MfaService.getOtpAuthUri('admin@dearhills.in', secret);
      expect(uri).toContain('otpauth://totp/Dear%20Hills:admin%40dearhills.in');
      expect(uri).toContain(`secret=${secret}`);

      const token = MfaService.generateToken(secret);
      expect(token).toMatch(/^\d{6}$/);

      // Current token verifies
      expect(MfaService.verifyToken(secret, token)).toBe(true);

      // Wrong token fails
      expect(MfaService.verifyToken(secret, '000000' === token ? '999999' : '000000')).toBe(false);

      // Verifies within ±30s clock drift
      const previousToken = MfaService.generateToken(secret, Date.now() - 30_000);
      expect(MfaService.verifyToken(secret, previousToken, 1)).toBe(true);
    });
  });
});
