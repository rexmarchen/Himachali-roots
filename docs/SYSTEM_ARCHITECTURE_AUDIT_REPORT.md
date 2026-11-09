# DEAR HILLS — ENTERPRISE SYSTEM ARCHITECTURE AUDIT REPORT

**Target Platform:** [Dear Hills Marketplace](https://dearhills.in)  
**Audit Date:** November 9, 2026  
**Operating Context:** Node.js 22.5+, Express 5.1.0, React 19.2.0, SQLite / PostgreSQL  
**Audit Scope:** 22 Business Modules, Full-Stack Architecture, Security (OWASP ASVS), Concurrency, Financial Ledger, and Deployment Reliability.

---

## 1. Executive Summary

The Dear Hills marketplace connects consumers across India with authentic artisans, farmers, self-help groups, and small producers from Himachal Pradesh and adjoining Himalayan regions.

This audit evaluates the codebase to establish a production-grade, enterprise-ready baseline. The system avoids superficial mocks; it implements a relational e-commerce engine with server-side repricing, atomic inventory reservation, multi-seller order splitting, session rotation, and financial ledger calculations verified by **216 automated tests across 24 test suites**.

### Key Audit Findings

1. **Architecture Classification:** Transitioning from an Express/SQLite monolith into an enterprise **Modular Monolith** organized by Domain-Driven Design (DDD) principles and Clean/Hexagonal Architecture (Ports and Adapters).
2. **Current Test Status:** `npm test` passes **216/216 tests** (24 suites). `npm run typecheck` passes with **0 errors**. `npm run lint` passes with **0 errors** (14 warnings). `npm run build` succeeds cleanly in **3.10 seconds**.
3. **Critical Runtime Bug Identified (BUG-01):** The seller product editor (`SellerPages.tsx`) crashes with an unhandled JavaScript `TypeError: Cannot read properties of undefined (reading '...')` because `categoryRates` is omitted in `GET /api/seller/config` (`server/routes/seller.ts`).
4. **Service Stub Schema Divergence:** Modules `03_customers`, `04_sellers`, `14_financial_ledger`, `15_seller_payouts`, and `21_analytics` contain standalone classes that reference non-existent columns (e.g., `shop_name` instead of `business_name`, `user_id` instead of `id` on `profiles`, `type = 'order_credit'` instead of CHECK constraint `type IN ('sale','commission','refund','adjustment','settlement')`). The real, battle-tested domain logic currently resides in `server/lib/orders.ts`.
5. **Database Concurrency Risks:** SQLite in WAL mode allows concurrent readers, but only 1 concurrent writer. High-concurrency flash sales or simultaneous checkouts risk table contention (`SQLITE_BUSY`). A seamless, tested migration path to PostgreSQL with connection pooling (PgBouncer) is required for horizontal scaling.

---

## 2. Technology Stack & Component Architecture

| Layer | Technologies & Libraries | Production Architectural Status |
|---|---|---|
| **Frontend Framework** | React 19.2.0, React Router DOM 7.9.4 | Single Page Application (SPA), Client-Side Routing |
| **State & Data Fetching** | TanStack React Query 5.90.5 | Query caching, stale-while-revalidate, optimistic mutations |
| **Styling & Design System** | Tailwind CSS 4.1.16, `@tailwindcss/vite` | Modern CSS `@theme` variables, Cormorant Garamond & Manrope fonts |
| **Backend Runtime & API** | Node.js (>=22.5), Express 5.1.0, TypeScript 5.9.3 | Modular Monolith: REST API routes under `/api/*`, static asset serving |
| **Database Engine** | SQLite via built-in `node:sqlite` (`DatabaseSync`) | Single-node relational storage, `WAL` journal mode, `NORMAL` synchronous, atomic `BEGIN IMMEDIATE` transactions |
| **Target Scalable Database** | PostgreSQL via `PostgresAdapter` & connection pooling | Evaluated for multi-node horizontal scaling; requires async repository ports |
| **Authentication** | Custom cookie-based session engine (`pr_session`) | Opaque SHA-256 hashed tokens, Argon2id & scrypt hashing, session rotation, Google OAuth ID token verification |
| **File Storage** | Multer 2.0.2 + `StoragePort` (`LocalStorageAdapter`, `S3StorageAdapter`) | Magic-byte signature checking (JPEG, PNG, WebP, PDF); isolated private storage for seller KYC documents |
| **Payment Gateway** | Razorpay Node SDK 2.9.8 & Checkout.js | Server-side order creation, HMAC-SHA256 signature verification, webhook handler with raw body, refund tracking |
| **Transactional Email** | Resend API (HTTP fetch) + Nodemailer 10.2.1 | Idempotent dispatch with bounded retries, sanitised error logs, `outbox_events` / `notifications` queue |
| **Shipping & Logistics** | Shiprocket API v2 + Manual Carrier logging | Automated adhoc order creation, AWB assignment, pickup scheduling, tracking webhook handler |
| **Security & Hardening** | Helmet 8.1.0, `express-rate-limit` 8.1.0, `csrfGuard` | Strict CSP, custom request header check (`X-Requested-With`), Origin allowlisting, secure SameSite cookies |
| **Testing & Quality** | Vitest 5.0.5, Supertest 7.1.4, ESLint 9.38.0 | In-memory SQLite fixtures, integration test coverage across all major user and administrative journeys |
| **DevOps & Hosting** | Docker (multi-stage), Caddy reverse proxy, Railway, Vercel | Single Docker container running Express with loopback binding; Caddy handles TLS and domain routing |

---

## 3. Prioritized Risk & Vulnerability Matrix

| Risk ID | Severity | Category | Description | Remediation Plan |
|---|---|---|---|---|
| **RSK-01** | **P0 (Blocker)** | Runtime Bug | Seller product editor crashes on load due to `categoryRates` undefined on `sellerConfig.data.commission`. | Add `defaultBp` & `categoryRates` to `/api/seller/config` and add optional chaining in `SellerPages.tsx`. |
| **RSK-02** | **P1 (High)** | Architecture | Module stubs in `03`, `04`, `14`, `15`, `21` use divergent table schemas and column names. | Align module service classes to wrap real database queries and domain logic from `server/lib/*`. |
| **RSK-03** | **P1 (High)** | Scalability | SQLite table locking blocks concurrent writes under high transaction volume. | Implement async repository layer and complete PostgreSQL migration plan for multi-node deployments. |
| **RSK-04** | **P1 (High)** | Operations | Transactional email is unconfigured (`none`); customer OTPs, order receipts, and reset emails are dropped. | Configure Resend API key or SMTP relay in production environment. |
| **RSK-05** | **P2 (Medium)** | Security | Admin console relies on single-factor password; no Multi-Factor Authentication (MFA / TOTP). | Implement TOTP MFA for admin accounts in Phase 4. |
| **RSK-06** | **P2 (Medium)** | Compliance | GST tax invoices, HSN mappings, and formal invoice PDF series are not generated. | Implement GST calculation and tax invoice generation prior to trading at scale. |

