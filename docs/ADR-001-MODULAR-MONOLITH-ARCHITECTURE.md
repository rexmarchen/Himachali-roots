# ADR-001: Modular Monolith, Hexagonal Architecture & Reliability Engineering

**Status:** Approved  
**Date:** November 9, 2026  
**Decision Makers:** Lead System Architect, Principal Full-Stack Engineer, Security Auditor  
**Applies To:** Dear Hills Marketplace Core Platform  

---

## 1. Context and Problem Statement

Dear Hills is scaling from a regional e-commerce store into a multi-vendor marketplace connecting consumers across India with Himalayan makers. As traffic, concurrent orders, sellers, and transactions grow, the system requires an architecture that:
- Guarantees data consistency, zero overselling, and idempotent financial calculations.
- Eliminates single points of failure without introducing the operational overhead of microservices prematurely.
- Provides clean boundaries between 22 business modules so individual domains can be extracted in the future without rewriting core logic.
- Delivers horizontal scalability, comprehensive observability, and defense-in-depth security.

---

## 2. Core Architectural Decisions

### Decision 1: Modular Monolith with Clean / Hexagonal Architecture
- **Inverted Dependencies:** Business logic and domain entities never depend on external libraries, transport protocols, or database drivers. They depend solely on **Ports** (TypeScript interfaces).
- **Explicit Module Boundaries:** Modules interact through public service interfaces, not by directly mutating each other's database tables or internal state.
- **Future Extraction:** Any module (e.g., `12_payments` or `16_shipping`) can be separated into an independent service simply by swapping the in-process port adapter for an HTTP/gRPC adapter, requiring zero changes to domain business logic.

### Decision 2: Transactional Outbox Pattern for Asynchronous Events
- **Problem Solved:** Two-phase commit failures (e.g., saving an order in the database succeeds, but sending an email or publishing a webhook fails or crashes).
- **Mechanism:** All domain events (`order.placed`, `order.paid`, `seller.approved`) are written to the `outbox_events` table inside the same database transaction as the entity.
- **Execution:** A dedicated `OutboxWorker` (runnable in-process or as an independent daemon via `server/workers/outboxRunner.ts`) claims events, routes them to registered consumers, tracks retries with exponential backoff, and isolates dead-letter items.

### Decision 3: Database Strategy — Relational Consistency & PostgreSQL Migration
- **Current Development & Single-Node:** SQLite via Node 22 built-in `node:sqlite` (`DatabaseSync`), configured with WAL mode (`journal_mode = WAL`), `synchronous = NORMAL`, and atomic `BEGIN IMMEDIATE` transactions.
- **Horizontal Scaling Target:** PostgreSQL with connection pooling (PgBouncer). To accommodate the asynchronous nature of PostgreSQL drivers (`pg` / `postgres`) without breaking synchronous controllers, domain repositories will be organized around async port contracts.
- **Data Integrity:** Strict foreign keys (`PRAGMA foreign_keys = ON`), check constraints, and unique indices.

### Decision 4: Financial Ledger & Marketplace Economics
- **Integer Paise Everywhere:** All financial quantities are stored as integers in paise (₹1.00 = 100 paise). No floating-point math is ever permitted.
- **Marketplace Split:** Deterministic 12% Dear Hills platform commission (1200 basis points) and 88% seller share, snapshotted at the moment of order creation.
- **Dual-Entry Ledger:** `seller_ledger_entries` records sales, commissions, cancellations, and settlements as immutable discrete transactions.
- **7-Day Return Holding Window:** Seller funds remain `'pending'` during transit. Upon delivery, `available_at` is set to `delivery_timestamp + 7 days`. Admin payout batches only disburse mature, verified balances.

### Decision 5: Defense-in-Depth Security Architecture (OWASP ASVS Baseline)
- **Password Security:** **Argon2id** (RFC 9106) with automatic upgrade from legacy `scrypt` hashes upon successful verification.
- **Server-Side RBAC:** Strict server-side verification using `RbacService`. Customer vs. Seller vs. Admin roles are verified on every protected API call.
- **Tenant Isolation (BOLA Guard):** Sellers can only access their own resources (`user.sellerId === sellerId`). Customer data is inaccessible across accounts.
- **Storage Isolation:** Public product imagery is served via CDN; private seller verification documents (Aadhaar, PAN, FSSAI) are stored in quarantined storage and accessed solely via authenticated, short-lived presigned URLs.

