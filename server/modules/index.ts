/**
 * DEAR HILLS — MODULAR MONOLITH
 * 
 * Re-exports the 22 Bounded Domain Modules conforming to Clean / Hexagonal Architecture.
 */

export * as AuthModule from './01_auth/index.js';
export * as UsersModule from './02_users/index.js';
export * as CustomersModule from './03_customers/index.js';
export * as SellersModule from './04_sellers/index.js';
export * as SellerVerificationModule from './05_seller_verification/index.js';
export * as CatalogModule from './06_catalog/index.js';
export * as CategoriesModule from './07_categories/index.js';
export * as ProductApprovalModule from './08_product_approval/index.js';
export * as InventoryModule from './09_inventory/index.js';
export * as CartCheckoutModule from './10_cart_checkout/index.js';
export * as OrdersModule from './11_orders/index.js';
export * as PaymentsModule from './12_payments/index.js';
export * as CommissionModule from './13_commission/index.js';
export * as FinancialLedgerModule from './14_financial_ledger/index.js';
export * as SellerPayoutsModule from './15_seller_payouts/index.js';
export * as ShippingModule from './16_shipping/index.js';
export * as ReturnsModule from './17_returns/index.js';
export * as RefundsModule from './18_refunds/index.js';
export * as NotificationsModule from './19_notifications/index.js';
export * as AdminModule from './20_admin/index.js';
export * as AnalyticsModule from './21_analytics/index.js';
export * as AuditLoggingModule from './22_audit_logging/index.js';

