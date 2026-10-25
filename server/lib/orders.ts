import { env } from '../env.js';
import { execute, queryAll, queryOne, tx, type Db } from '../db.js';
import type {
  OrderAddress,
  OrderItemSummary,
  OrderView,
  SellerOrderView,
  ShipmentView,
} from '../../shared/types.js';
import { AppError, badRequest, conflict, notFound } from './http.js';
import { audit } from './audit.js';
import { allocate, commissionOn, evaluateCoupon, resolveCommissionBp, shippingFor, taxComponentInclusive } from './pricing.js';
import { newId, orderNumber, sellerOrderReference } from './ids.js';
import type { SessionUser } from '../../shared/types.js';

interface CheckoutInput {
  userId: string;
  email: string;
  cartId: string;
  address: OrderAddress;
  couponCode?: string;
  customerNote?: string;
  idempotencyKey: string;
  isDemo?: boolean;
}

interface RawLine {
  product_id: string;
  name: string;
  sku: string;
  slug: string;
  unit_price_paise: number;
  quantity: number;
  tax_rate_bp: number;
  category_id: string;
  seller_id: string;
  seller_name: string;
  quantity_available: number;
  product_status: string;
  seller_status: string;
  image_url: string | null;
  is_demo: number;
}

export function validateAddress(address: OrderAddress): void {
  const fail = (field: string, message: string) => {
    throw badRequest(message, { [field]: message });
  };
  if (!address.fullName || address.fullName.trim().length < 2) fail('fullName', 'Enter the recipient’s full name.');
  if (!/^[6-9]\d{9}$/.test(address.phone.replace(/\s|-/g, ''))) fail('phone', 'Enter a valid 10-digit Indian mobile number.');
  if (!address.line1 || address.line1.trim().length < 4) fail('line1', 'Enter the street address.');
  if (!address.city || address.city.trim().length < 2) fail('city', 'Enter the city or town.');
  if (!/^\d{6}$/.test(address.pincode)) fail('pincode', 'Enter a valid 6-digit PIN code.');
  if (!address.state || address.state.trim().length < 2) fail('state', 'Enter the state.');
}

export function createOrder(db: Db, input: CheckoutInput): { orderId: string; orderNumber: string; totalPaise: number } {
  const existing = queryOne<{ id: string; user_id: string; order_number: string; total_paise: number }>(
    db,
    'SELECT id, user_id, order_number, total_paise FROM orders WHERE idempotency_key = ?',
    input.idempotencyKey,
  );
  if (existing) {
    if (existing.user_id !== input.userId) throw conflict('Duplicate checkout key.');
    return { orderId: existing.id, orderNumber: existing.order_number, totalPaise: existing.total_paise };
  }

  validateAddress(input.address);

  const lines = queryAll<RawLine>(
    db,
    `SELECT ci.product_id, p.name, p.sku, p.slug, p.price_paise AS unit_price_paise, ci.quantity,
            p.tax_rate_bp, p.category_id, p.status AS product_status, p.is_demo,
            s.id AS seller_id, s.business_name AS seller_name, s.status AS seller_status,
            i.quantity - i.reserved_quantity AS quantity_available,
            (SELECT url FROM product_images pi WHERE pi.product_id = p.id ORDER BY sort_order LIMIT 1) AS image_url
       FROM cart_items ci
       JOIN products p ON p.id = ci.product_id
       JOIN inventory i ON i.product_id = p.id
       JOIN seller_profiles s ON s.id = p.seller_id
      WHERE ci.cart_id = ?
      ORDER BY ci.created_at`,
    input.cartId,
  );

  if (lines.length === 0) throw badRequest('Your bag is empty.');

  for (const line of lines) {
    if (line.product_status !== 'approved' || line.seller_status !== 'approved') {
      throw conflict(`${line.name} is no longer available. Remove it from your bag to continue.`, 'item_unavailable');
    }
    if (line.quantity > line.quantity_available) {
      throw conflict(
        `Only ${Math.max(0, line.quantity_available)} of ${line.name} available. Update your bag to continue.`,
        'insufficient_stock',
      );
    }
  }

  const subtotal = lines.reduce((sum, line) => sum + line.unit_price_paise * line.quantity, 0);
  let couponId: string | null = null;
  let couponCode: string | null = null;
  let discount = 0;
  if (input.couponCode) {
    const result = evaluateCoupon(db, input.couponCode, input.userId, subtotal);
    couponId = result.coupon.id;
    couponCode = result.coupon.code;
    discount = result.discountPaise;
  }
  const shipping = shippingFor(subtotal - discount);

  const itemDiscounts = allocate(
    discount,
    lines.map((line) => line.unit_price_paise * line.quantity),
  );

  interface BuiltItem {
    line: RawLine;
    lineSubtotal: number;
    discount: number;
    tax: number;
    rateBp: number;
    commission: number;
    earning: number;
  }

  const rateCache = new Map<string, number>();
  const built: BuiltItem[] = lines.map((line, index) => {
    const lineSubtotal = line.unit_price_paise * line.quantity;
    const lineDiscount = itemDiscounts[index];
    const key = `${line.seller_id}:${line.category_id}`;
    let rateBp = rateCache.get(key);
    if (rateBp === undefined) {
      rateBp = resolveCommissionBp(db, line.seller_id, line.category_id);
      rateCache.set(key, rateBp);
    }
    const basis = lineSubtotal - lineDiscount;
    const commission = commissionOn(basis, rateBp);
    return {
      line,
      lineSubtotal,
      discount: lineDiscount,
      tax: taxComponentInclusive(basis, line.tax_rate_bp),
      rateBp,
      commission,
      earning: basis - commission,
    };
  });

  const sellerIds = [...new Set(built.map((item) => item.line.seller_id))];
  const sellerWeights = sellerIds.map((sellerId) =>
    built.filter((item) => item.line.seller_id === sellerId).reduce((sum, item) => sum + item.lineSubtotal, 0),
  );
  const sellerShipping = allocate(shipping, sellerWeights);

  const sellerSummaries = sellerIds.map((sellerId, index) => {
    const items = built.filter((item) => item.line.seller_id === sellerId);
    const sellerSubtotal = items.reduce((sum, item) => sum + item.lineSubtotal, 0);
    const sellerDiscount = items.reduce((sum, item) => sum + item.discount, 0);
    const commission = items.reduce((sum, item) => sum + item.commission, 0);
    const earning = items.reduce((sum, item) => sum + item.earning, 0);
    const tax = items.reduce((sum, item) => sum + item.tax, 0);
    const basis = sellerSubtotal - sellerDiscount;
    return {
      sellerId,
      items,
      subtotal: sellerSubtotal,
      discount: sellerDiscount,
      shipping: sellerShipping[index],
      tax,
      total: sellerSubtotal - sellerDiscount + sellerShipping[index],
      commission,
      earning,
      // Blended effective rate when a seller's basket spans categories.
      rateBp: basis > 0 ? Math.round((commission * 10000) / basis) : (items[0]?.rateBp ?? env.defaultCommissionBp),
    };
  });

  const id = newId('ord_');
  const number = orderNumber();
  const now = new Date();
  const expires = new Date(now.getTime() + env.reservationMinutes * 60_000).toISOString();
  const provider = env.razorpay.configured ? 'razorpay' : 'unconfigured';
  const total = subtotal - discount + shipping;
  const isDemoOrder = input.isDemo !== undefined
    ? (input.isDemo ? 1 : 0)
    : (lines.some((l) => l.is_demo === 1) || env.simulatedCheckoutEnabled || env.allowDevPayments ? 1 : 0);

  tx(db, () => {
    for (const item of built) {
      const reserved = execute(
        db,
        `UPDATE inventory SET reserved_quantity = reserved_quantity + ?, updated_at = ?
          WHERE product_id = ? AND quantity - reserved_quantity >= ?`,
        item.line.quantity,
        now.toISOString(),
        item.line.product_id,
        item.line.quantity,
      );
      if (Number(reserved.changes) !== 1) {
        throw conflict(`${item.line.name} just sold out. Please review your bag.`, 'insufficient_stock');
      }
      execute(
        db,
        `INSERT INTO inventory_movements (id, product_id, change, reason, reference, note)
         VALUES (?, ?, ?, 'reservation', ?, ?)`,
        newId('mov_'),
        item.line.product_id,
        item.line.quantity,
        number,
        'Reserved at checkout',
      );
    }

    execute(
      db,
      `INSERT INTO orders (id, order_number, user_id, email, status, subtotal_paise, discount_paise, shipping_paise,
                           tax_paise, total_paise, coupon_code, shipping_address, customer_note,
                           reservation_expires_at, idempotency_key, placed_at, is_demo)
       VALUES (?, ?, ?, ?, 'pending_payment', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      number,
      input.userId,
      input.email,
      subtotal,
      discount,
      shipping,
      built.reduce((sum, item) => sum + item.tax, 0),
      total,
      couponCode,
      JSON.stringify(input.address),
      input.customerNote ?? null,
      expires,
      input.idempotencyKey,
      now.toISOString(),
      isDemoOrder,
    );

    for (const summary of sellerSummaries) {
      const sellerOrderId = newId('sor_');
      execute(
        db,
        `INSERT INTO seller_orders (id, order_id, seller_id, reference, status, subtotal_paise, discount_paise,
                                    shipping_paise, tax_paise, total_paise, commission_rate_bp, commission_paise,
                                    seller_earning_paise)
         VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?)`,
        sellerOrderId,
        id,
        summary.sellerId,
        sellerOrderReference(),
        summary.subtotal,
        summary.discount,
        summary.shipping,
        summary.tax,
        summary.total,
        summary.rateBp,
        summary.commission,
        summary.earning,
      );
      for (const item of summary.items) {
        execute(
          db,
          `INSERT INTO order_items (id, order_id, seller_order_id, product_id, seller_id, name, sku, image_url,
                                    unit_price_paise, quantity, line_subtotal_paise, discount_paise, tax_rate_bp,
                                    tax_paise, commission_rate_bp, commission_paise, seller_earning_paise)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          newId('oit_'),
          id,
          sellerOrderId,
          item.line.product_id,
          item.line.seller_id,
          item.line.name,
          item.line.sku,
          item.line.image_url,
          item.line.unit_price_paise,
          item.line.quantity,
          item.lineSubtotal,
          item.discount,
          item.line.tax_rate_bp,
          item.tax,
          item.rateBp,
          item.commission,
          item.earning,
        );
      }
    }

    execute(
      db,
      `INSERT INTO payments (id, order_id, provider, amount_paise, status)
       VALUES (?, ?, ?, ?, 'created')`,
      newId('pay_'),
      id,
      provider,
      total,
    );

    if (couponId) {
      execute(
        db,
        'INSERT INTO coupon_redemptions (id, coupon_id, user_id, order_id, discount_paise) VALUES (?, ?, ?, ?, ?)',
        newId('red_'),
        couponId,
        input.userId,
        id,
        discount,
      );
      execute(db, 'UPDATE coupons SET used_count = used_count + 1 WHERE id = ?', couponId);
    }

    execute(db, "UPDATE carts SET status = 'converted', updated_at = ? WHERE id = ?", now.toISOString(), input.cartId);
  });

  return { orderId: id, orderNumber: number, totalPaise: total };
}

export interface PaymentInit {
  provider: 'razorpay' | 'unconfigured';
  keyId?: string;
  providerOrderId?: string;
  amountPaise: number;
  orderNumber: string;
  message?: string;
  devPaymentsEnabled: boolean;
}

export async function initializeOrderPayment(db: Db, orderId: string, userId: string): Promise<PaymentInit> {
  const order = queryOne<{ id: string; user_id: string; status: string; total_paise: number; order_number: string; reservation_expires_at: string | null }>(
    db,
    'SELECT id, user_id, status, total_paise, order_number, reservation_expires_at FROM orders WHERE id = ?',
    orderId,
  );
  if (!order || order.user_id !== userId) throw notFound('Order not found.');
  if (order.status !== 'pending_payment') throw conflict('This order is not awaiting payment.');
  if (order.reservation_expires_at && order.reservation_expires_at < new Date().toISOString()) {
    releaseExpiredOrders(db);
    throw conflict('Your checkout window expired and stock was released. Please place the order again.', 'reservation_expired');
  }
  if (!env.razorpay.configured) {
    return {
      provider: 'unconfigured',
      amountPaise: order.total_paise,
      orderNumber: order.order_number,
      message:
        'Online payment is not configured on this deployment. The order is saved with stock reserved, but it is not paid.',
      devPaymentsEnabled: env.allowDevPayments,
    };
  }

  const payment = queryOne<{ id: string; provider_order_id: string | null }>(
    db,
    "SELECT id, provider_order_id FROM payments WHERE order_id = ? AND status IN ('created','pending') ORDER BY created_at DESC LIMIT 1",
    orderId,
  );
  if (payment?.provider_order_id) {
    return {
      provider: 'razorpay',
      keyId: env.razorpay.keyId,
      providerOrderId: payment.provider_order_id,
      amountPaise: order.total_paise,
      orderNumber: order.order_number,
      devPaymentsEnabled: env.allowDevPayments,
    };
  }

  const { createRazorpayOrder } = await import('./payments.js');
  const rzp = await createRazorpayOrder(order.total_paise, order.order_number, { order_id: orderId });
  execute(
    db,
    'UPDATE payments SET provider_order_id = ?, status = ?, provider = ? WHERE id = ?',
    rzp.id,
    'pending',
    'razorpay',
    payment?.id ?? '',
  );
  if (!payment) {
    execute(
      db,
      `INSERT INTO payments (id, order_id, provider, provider_order_id, amount_paise, status)
       VALUES (?, ?, 'razorpay', ?, ?, 'pending')`,
      newId('pay_'),
      orderId,
      rzp.id,
      order.total_paise,
    );
  }
  return {
    provider: 'razorpay',
    keyId: env.razorpay.keyId,
    providerOrderId: rzp.id,
    amountPaise: order.total_paise,
    orderNumber: order.order_number,
    devPaymentsEnabled: env.allowDevPayments,
  };
}

interface PaidParams {
  orderId: string;
  provider: string;
  providerEventId: string;
  providerPaymentId: string;
  amountPaise: number;
  method?: string;
  providerOrderId?: string;
  summary?: Record<string, unknown>;
}

export function markOrderPaid(db: Db, params: PaidParams): { alreadyProcessed: boolean; status: string } {
  return tx(db, () => {
    const eventInsert = execute(
      db,
      `INSERT OR IGNORE INTO payment_events (id, provider, provider_event_id, order_id, type, summary)
       VALUES (?, ?, ?, ?, 'payment.captured', ?)`,
      newId('pev_'),
      params.provider,
      params.providerEventId,
      params.orderId,
      JSON.stringify(params.summary ?? {}).slice(0, 2000),
    );
    if (Number(eventInsert.changes) === 0) {
      return { alreadyProcessed: true, status: 'paid' };
    }

    const order = queryOne<{
      id: string;
      status: string;
      total_paise: number;
      paid_at: string | null;
      reservation_expires_at: string | null;
    }>(db, 'SELECT id, status, total_paise, paid_at, reservation_expires_at FROM orders WHERE id = ?', params.orderId);
    if (!order) throw notFound('Order not found.');

    if (order.total_paise !== params.amountPaise) {
      audit(db, null, 'payment.amount_mismatch', 'order', order.id, null, {
        expected: order.total_paise,
        received: params.amountPaise,
        provider: params.provider,
      });
      throw new AppError(
        409,
        'payment_amount_mismatch',
        'The captured amount does not match the order. Payment recorded for manual reconciliation.',
      );
    }

    if (!['pending_payment', 'expired'].includes(order.status)) {
      return { alreadyProcessed: true, status: order.status };
    }

    // A late capture after reservation release: re-reserve if possible, otherwise
    // keep the payment recorded, release any partial reservations, and raise a
    // refund for manual/admin handling.
    let stockIssue = false;
    if (order.status === 'expired') {
      const items = queryAll<{ product_id: string; name: string; quantity: number }>(
        db,
        'SELECT product_id, name, quantity FROM order_items WHERE order_id = ?',
        order.id,
      );
      const newlyReserved: { product_id: string; quantity: number }[] = [];
      for (const item of items) {
        const reserved = execute(
          db,
          `UPDATE inventory SET reserved_quantity = reserved_quantity + ?, updated_at = ?
            WHERE product_id = ? AND quantity - reserved_quantity >= ?`,
          item.quantity,
          new Date().toISOString(),
          item.product_id,
          item.quantity,
        );
        if (Number(reserved.changes) !== 1) {
          stockIssue = true;
          break;
        }
        newlyReserved.push(item);
      }
      if (stockIssue) {
        for (const item of newlyReserved) {
          execute(
            db,
            'UPDATE inventory SET reserved_quantity = MAX(0, reserved_quantity - ?) WHERE product_id = ?',
            item.quantity,
            item.product_id,
          );
        }
        const paymentRow = queryOne<{ id: string }>(
          db,
          'SELECT id FROM payments WHERE order_id = ? ORDER BY created_at DESC LIMIT 1',
          order.id,
        );
        execute(
          db,
          `INSERT INTO refunds (id, order_id, payment_id, amount_paise, reason, status, requested_by)
           VALUES (?, ?, ?, ?, ?, 'requested', 'system')`,
          newId('ref_'),
          order.id,
          paymentRow?.id ?? null,
          order.total_paise,
          'Late payment captured after stock reservation expired. Requires review.',
        );
        audit(db, null, 'payment.late_capture', 'order', order.id, null, {
          stockIssue: true,
          amount: order.total_paise,
        });
      }
    }

    const payment = queryOne<{ id: string }>(
      db,
      'SELECT id FROM payments WHERE order_id = ? ORDER BY created_at DESC LIMIT 1',
      order.id,
    );
    if (payment) {
      execute(
        db,
        `UPDATE payments SET status = 'paid', provider = ?, provider_payment_id = COALESCE(?, provider_payment_id),
                method = ?, verified_at = ?, provider_order_id = COALESCE(?, provider_order_id)
          WHERE id = ?`,
        params.provider,
        params.providerPaymentId,
        params.method ?? null,
        new Date().toISOString(),
        params.providerOrderId ?? null,
        payment.id,
      );
    }

    const isDev = params.provider === 'dev-simulation';
    execute(
      db,
      `UPDATE orders SET status = 'paid', paid_at = ? ${isDev ? ', is_demo = 1' : ''} WHERE id = ?`,
      new Date().toISOString(),
      order.id,
    );

    const dispatchBy = new Date(Date.now() + 2 * 86400_000).toISOString();
    const sellerOrders = queryAll<{
      id: string;
      seller_id: string;
      subtotal_paise: number;
      discount_paise: number;
      commission_rate_bp: number;
      commission_paise: number;
      seller_earning_paise: number;
    }>(db, 'SELECT * FROM seller_orders WHERE order_id = ?', order.id);

    for (const so of sellerOrders) {
      const basis = so.subtotal_paise - so.discount_paise;
      execute(
        db,
        `INSERT OR IGNORE INTO commission_entries (id, seller_order_id, seller_id, basis_paise, rate_bp, amount_paise)
         VALUES (?, ?, ?, ?, ?, ?)`,
        newId('cme_'),
        so.id,
        so.seller_id,
        basis,
        so.commission_rate_bp,
        so.commission_paise,
      );
      execute(
        db,
        `INSERT OR IGNORE INTO seller_ledger_entries
           (id, seller_id, order_id, seller_order_id, type, amount_paise, status, reference, note, created_at)
         VALUES (?, ?, ?, ?, 'sale', ?, 'pending', ?, ?, ?)`,
        newId('led_'),
        so.seller_id,
        order.id,
        so.id,
        basis,
        `sale:${so.id}`,
        'Product value after discount, before commission',
        new Date().toISOString(),
      );
      execute(
        db,
        `INSERT OR IGNORE INTO seller_ledger_entries
           (id, seller_id, order_id, seller_order_id, type, amount_paise, status, reference, note, created_at)
         VALUES (?, ?, ?, ?, 'commission', ?, 'pending', ?, ?, ?)`,
        newId('led_'),
        so.seller_id,
        order.id,
        so.id,
        -so.commission_paise,
        `commission:${so.id}`,
        `Marketplace commission at ${(so.commission_rate_bp / 100).toFixed(2)}%`,
        new Date().toISOString(),
      );
      execute(db, 'UPDATE seller_orders SET dispatch_by = ?, updated_at = ? WHERE id = ?', dispatchBy, new Date().toISOString(), so.id);
    }

    audit(db, null, 'payment.captured', 'order', order.id, null, {
      provider: params.provider,
      paymentId: params.providerPaymentId,
      amount: params.amountPaise,
      stockIssue,
    });
    return { alreadyProcessed: false, status: 'paid' };
  });
}

export async function notifyOrderPaid(db: Db, orderId: string): Promise<void> {
  const { notify } = await import('./email.js');
  const order = queryOne<{ order_number: string; total_paise: number; email: string; user_id: string }>(
    db,
    'SELECT order_number, total_paise, email, user_id FROM orders WHERE id = ?',
    orderId,
  );
  if (!order) return;
  await notify(db, {
    userId: order.user_id,
    email: order.email,
    type: 'payment_confirmed',
    subject: `Payment received for ${order.order_number}`,
    body: `<p>We have received your payment. Your order is confirmed and the makers have been notified.</p>
      <p><strong>Order:</strong> ${order.order_number}<br/><strong>Total:</strong> ₹${(order.total_paise / 100).toLocaleString('en-IN')}</p>`,
    dedupeKey: `order-paid:${orderId}`,
  });

  const sellers = queryAll<{ email: string; user_id: string; seller_order_id: string; reference: string }>(
    db,
    `SELECT u.email, u.id AS user_id, so.id AS seller_order_id, so.reference
       FROM seller_orders so
       JOIN seller_profiles sp ON sp.id = so.seller_id
       JOIN users u ON u.id = sp.user_id
      WHERE so.order_id = ?`,
    orderId,
  );
  for (const seller of sellers) {
    await notify(db, {
      userId: seller.user_id,
      email: seller.email,
      type: 'seller_new_order',
      subject: `New order ${seller.reference} — confirm within 48 hours`,
      body: `<p>A customer order has been paid and is ready for you to confirm.</p>
        <p><strong>Seller order:</strong> ${seller.reference}<br/><strong>Parent order:</strong> ${order.order_number}</p>
        <p>Sign in to your seller dashboard to confirm availability and book dispatch.</p>`,
      dedupeKey: `seller-new-order:${seller.seller_order_id}`,
    });
  }
}

export function releaseExpiredOrders(db: Db, now = new Date()): number {
  const expired = queryAll<{ id: string; order_number: string }>(
    db,
    `SELECT id, order_number FROM orders
      WHERE status = 'pending_payment' AND reservation_expires_at IS NOT NULL AND reservation_expires_at < ?`,
    now.toISOString(),
  );
  let count = 0;
  for (const order of expired) {
    tx(db, () => {
      const items = queryAll<{ product_id: string; quantity: number }>(
        db,
        'SELECT product_id, quantity FROM order_items WHERE order_id = ?',
        order.id,
      );
      for (const item of items) {
        execute(
          db,
          'UPDATE inventory SET reserved_quantity = MAX(0, reserved_quantity - ?), updated_at = ? WHERE product_id = ?',
          item.quantity,
          now.toISOString(),
          item.product_id,
        );
        execute(
          db,
          `INSERT INTO inventory_movements (id, product_id, change, reason, reference, note)
           VALUES (?, ?, ?, 'release', ?, 'Checkout reservation expired')`,
          newId('mov_'),
          item.product_id,
          -item.quantity,
          order.order_number,
        );
      }
      execute(db, "UPDATE orders SET status = 'expired' WHERE id = ? AND status = 'pending_payment'", order.id);
      execute(db, "UPDATE payments SET status = 'cancelled' WHERE order_id = ? AND status IN ('created','pending')", order.id);
      const redemption = queryOne<{ coupon_id: string }>(
        db,
        'SELECT coupon_id FROM coupon_redemptions WHERE order_id = ?',
        order.id,
      );
      if (redemption) {
        execute(db, 'DELETE FROM coupon_redemptions WHERE order_id = ?', order.id);
        execute(db, 'UPDATE coupons SET used_count = MAX(0, used_count - 1) WHERE id = ?', redemption.coupon_id);
      }
      audit(db, null, 'order.expired', 'order', order.id, { status: 'pending_payment' }, { status: 'expired' });
      count += 1;
    });
  }
  return count;
}

interface OrderRow {
  id: string;
  order_number: string;
  user_id: string;
  email: string;
  status: string;
  subtotal_paise: number;
  discount_paise: number;
  shipping_paise: number;
  tax_paise: number;
  total_paise: number;
  coupon_code: string | null;
  shipping_address: string;
  placed_at: string;
  paid_at: string | null;
  reservation_expires_at: string | null;
  is_demo: number;
}

export function getOrderView(db: Db, orderId: string): OrderView {
  const order = queryOne<OrderRow>(db, 'SELECT * FROM orders WHERE id = ?', orderId);
  if (!order) throw notFound('Order not found.');

  const sellers = queryAll<{
    id: string;
    seller_id: string;
    business_name: string;
    reference: string;
    status: string;
    subtotal_paise: number;
    discount_paise: number;
    shipping_paise: number;
    tax_paise: number;
    total_paise: number;
    commission_paise: number;
    seller_earning_paise: number;
    dispatch_by: string | null;
    shipped_at: string | null;
    delivered_at: string | null;
  }>(
    db,
    `SELECT so.*, sp.business_name FROM seller_orders so
       JOIN seller_profiles sp ON sp.id = so.seller_id
      WHERE so.order_id = ? ORDER BY so.created_at`,
    orderId,
  );

  const items = queryAll<{
    id: string;
    seller_order_id: string;
    name: string;
    sku: string;
    image_url: string | null;
    quantity: number;
    unit_price_paise: number;
    line_subtotal_paise: number;
    status: string;
    review_id: string | null;
    seller_name: string;
  }>(
    db,
    `SELECT oi.*, sp.business_name AS seller_name, r.id AS review_id
       FROM order_items oi
       JOIN seller_profiles sp ON sp.id = oi.seller_id
       LEFT JOIN reviews r ON r.order_item_id = oi.id
      WHERE oi.order_id = ? ORDER BY oi.created_at`,
    orderId,
  );

  const sellerOrders: SellerOrderView[] = sellers.map((seller) => {
    const shipmentRow = queryOne<{
      id: string;
      carrier: string;
      tracking_number: string;
      tracking_url: string | null;
      status: string;
      shipped_at: string;
      delivered_at: string | null;
    }>(db, 'SELECT * FROM shipments WHERE seller_order_id = ?', seller.id);
    let shipment: ShipmentView | null = null;
    if (shipmentRow) {
      const events = queryAll<{ status: string; description: string | null; occurred_at: string }>(
        db,
        'SELECT status, description, occurred_at FROM shipment_events WHERE shipment_id = ? ORDER BY occurred_at',
        shipmentRow.id,
      );
      shipment = {
        carrier: shipmentRow.carrier,
        trackingNumber: shipmentRow.tracking_number,
        trackingUrl: shipmentRow.tracking_url,
        status: shipmentRow.status,
        shippedAt: shipmentRow.shipped_at,
        deliveredAt: shipmentRow.delivered_at,
        events: events.map((e) => ({ status: e.status, description: e.description, occurredAt: e.occurred_at })),
      };
    }
    const sellerItems: OrderItemSummary[] = items
      .filter((item) => item.seller_order_id === seller.id)
      .map((item) => ({
        id: item.id,
        name: item.name,
        sku: item.sku,
        imageUrl: item.image_url,
        quantity: item.quantity,
        unitPricePaise: item.unit_price_paise,
        lineSubtotalPaise: item.line_subtotal_paise,
        status: item.status,
        sellerName: item.seller_name,
        sellerOrderId: item.seller_order_id,
        canReview: item.status === 'delivered' && !item.review_id,
        reviewed: Boolean(item.review_id),
      }));
    return {
      id: seller.id,
      reference: seller.reference,
      status: seller.status,
      sellerName: seller.business_name,
      subtotalPaise: seller.subtotal_paise,
      shippingPaise: seller.shipping_paise,
      discountPaise: seller.discount_paise,
      taxPaise: seller.tax_paise,
      totalPaise: seller.total_paise,
      commissionPaise: seller.commission_paise,
      sellerEarningPaise: seller.seller_earning_paise,
      items: sellerItems,
      shipment,
      dispatchBy: seller.dispatch_by,
      shippedAt: seller.shipped_at,
      deliveredAt: seller.delivered_at,
    };
  });

  const payment = queryOne<{ provider: string; status: string; provider_payment_id: string | null }>(
    db,
    'SELECT provider, status, provider_payment_id FROM payments WHERE order_id = ? ORDER BY created_at DESC LIMIT 1',
    orderId,
  );

  const cancellable = sellerOrders.every((so) => ['pending', 'confirmed'].includes(so.status));
  const returnWindowEnd = Date.now() - 7 * 86400_000;
  const returnable = sellerOrders.some(
    (so) => so.status === 'delivered' && so.deliveredAt && new Date(so.deliveredAt).getTime() > returnWindowEnd,
  );

  return {
    id: order.id,
    orderNumber: order.order_number,
    status: order.status,
    email: order.email,
    subtotalPaise: order.subtotal_paise,
    discountPaise: order.discount_paise,
    shippingPaise: order.shipping_paise,
    taxPaise: order.tax_paise,
    totalPaise: order.total_paise,
    couponCode: order.coupon_code,
    placedAt: order.placed_at,
    paidAt: order.paid_at,
    shippingAddress: JSON.parse(order.shipping_address) as OrderAddress,
    sellerOrders,
    payment: payment ? { provider: payment.provider, status: payment.status, providerPaymentId: payment.provider_payment_id } : null,
    canCancel: order.status === 'paid' && cancellable,
    canRequestReturn: order.status !== 'cancelled' && returnable,
    reservationExpiresAt: order.reservation_expires_at,
    isDemo: order.is_demo === 1,
  };
}

/* ------------------------------------------------------------------ */
/* Fulfilment                                                          */
/* ------------------------------------------------------------------ */

export type SellerAction = 'confirm' | 'pack' | 'ship' | 'deliver' | 'cancel';

export function sellerOrderAction(
  db: Db,
  params: {
    sellerOrderId: string;
    ownerSellerId?: string;
    actor: SessionUser;
    action: SellerAction;
    carrier?: string;
    trackingNumber?: string;
    trackingUrl?: string;
    note?: string;
  },
): void {
  const so = queryOne<{
    id: string;
    order_id: string;
    seller_id: string;
    status: string;
    total_paise: number;
    order_number: string;
    paid_at: string | null;
  }>(
    db,
    `SELECT so.*, o.order_number, o.paid_at FROM seller_orders so
       JOIN orders o ON o.id = so.order_id WHERE so.id = ?`,
    params.sellerOrderId,
  );
  if (!so) throw notFound('Seller order not found.');
  if (params.ownerSellerId && so.seller_id !== params.ownerSellerId) throw notFound('Seller order not found.');
  if (!so.paid_at) throw conflict('This order has not been paid yet.');
  if (so.status === 'cancelled') throw conflict('This order is already cancelled.');

  const action = params.action;
  const now = new Date();

  if (action === 'confirm') {
    if (so.status !== 'pending') throw conflict('Only a new order can be confirmed.');
    execute(db, "UPDATE seller_orders SET status = 'confirmed', updated_at = ? WHERE id = ?", now.toISOString(), so.id);
  } else if (action === 'pack') {
    if (!['pending', 'confirmed'].includes(so.status)) throw conflict('This order cannot be packed from its current state.');
    execute(db, "UPDATE seller_orders SET status = 'packed', updated_at = ? WHERE id = ?", now.toISOString(), so.id);
  } else if (action === 'ship') {
    if (!['confirmed', 'packed'].includes(so.status)) {
      throw conflict('Confirm the order and prepare it before marking it shipped.');
    }
    const carrier = params.carrier?.trim();
    const tracking = params.trackingNumber?.trim();
    if (!carrier || carrier.length < 2) throw badRequest('Enter the courier or carrier name.', { carrier: 'Required' });
    if (!tracking || tracking.length < 4) throw badRequest('Enter the tracking number.', { trackingNumber: 'Required' });

    tx(db, () => {
      execute(
        db,
        "UPDATE seller_orders SET status = 'shipped', shipped_at = ?, updated_at = ? WHERE id = ?",
        now.toISOString(),
        now.toISOString(),
        so.id,
      );
      const items = queryAll<{ product_id: string; quantity: number }>(
        db,
        'SELECT product_id, quantity FROM order_items WHERE seller_order_id = ?',
        so.id,
      );
      for (const item of items) {
        execute(
          db,
          `UPDATE inventory SET quantity = quantity - ?, reserved_quantity = reserved_quantity - ?, updated_at = ?
            WHERE product_id = ? AND quantity >= ? AND reserved_quantity >= ?`,
          item.quantity,
          item.quantity,
          now.toISOString(),
          item.product_id,
          item.quantity,
          item.quantity,
        );
        execute(
          db,
          `INSERT INTO inventory_movements (id, product_id, change, reason, reference, note)
           VALUES (?, ?, ?, 'sale', ?, 'Dispatched to customer')`,
          newId('mov_'),
          item.product_id,
          -item.quantity,
          so.order_number,
        );
      }
      execute(
        db,
        `INSERT INTO shipments (id, seller_order_id, provider, carrier, tracking_number, tracking_url, status, shipped_at)
         VALUES (?, ?, 'manual', ?, ?, ?, 'shipped', ?)`,
        newId('shp_'),
        so.id,
        carrier,
        tracking,
        params.trackingUrl?.trim() || null,
        now.toISOString(),
      );
      const shipment = queryOne<{ id: string }>(db, 'SELECT id FROM shipments WHERE seller_order_id = ?', so.id);
      execute(
        db,
        `INSERT OR IGNORE INTO shipment_events (id, shipment_id, event_id, status, description, occurred_at)
         VALUES (?, ?, ?, 'shipped', ?, ?)`,
        newId('she_'),
        shipment?.id ?? '',
        `manual-ship:${so.id}`,
        `Handed to ${carrier}`,
        now.toISOString(),
      );
      execute(
        db,
        "UPDATE order_items SET status = 'shipped' WHERE seller_order_id = ? AND status = 'ordered'",
        so.id,
      );
    });
  } else if (action === 'deliver') {
    if (so.status !== 'shipped') throw conflict('Only a shipped order can be marked delivered.');
    const shipment = queryOne<{ id: string }>(db, 'SELECT id FROM shipments WHERE seller_order_id = ?', so.id);
    if (!shipment) throw conflict('No shipment record exists for this order.');
    tx(db, () => {
      execute(
        db,
        "UPDATE seller_orders SET status = 'delivered', delivered_at = ?, updated_at = ? WHERE id = ?",
        now.toISOString(),
        now.toISOString(),
        so.id,
      );
      execute(
        db,
        "UPDATE shipments SET status = 'delivered', delivered_at = ? WHERE id = ?",
        now.toISOString(),
        shipment.id,
      );
      execute(
        db,
        `INSERT OR IGNORE INTO shipment_events (id, shipment_id, event_id, status, description, occurred_at)
         VALUES (?, ?, ?, 'delivered', 'Delivery recorded via seller portal', ?)`,
        newId('she_'),
        shipment.id,
        `manual-deliver:${so.id}`,
        now.toISOString(),
      );
      execute(db, "UPDATE order_items SET status = 'delivered' WHERE seller_order_id = ? AND status = 'shipped'", so.id);
      const availableAt = new Date(now.getTime() + 7 * 86400_000).toISOString();
      execute(
        db,
        `UPDATE seller_ledger_entries SET status = 'eligible', available_at = ?
          WHERE seller_order_id = ? AND status = 'pending'`,
        availableAt,
        so.id,
      );
      audit(db, params.actor, 'seller_order.delivered', 'seller_order', so.id, { status: 'shipped' }, { status: 'delivered' });
    });
  } else if (action === 'cancel') {
    if (!['pending', 'confirmed', 'packed'].includes(so.status)) {
      throw conflict('Shipped or delivered orders must go through the return process.');
    }
    tx(db, () => {
      const items = queryAll<{ product_id: string; quantity: number }>(
        db,
        'SELECT product_id, quantity FROM order_items WHERE seller_order_id = ?',
        so.id,
      );
      for (const item of items) {
        execute(
          db,
          'UPDATE inventory SET reserved_quantity = MAX(0, reserved_quantity - ?), updated_at = ? WHERE product_id = ?',
          item.quantity,
          now.toISOString(),
          item.product_id,
        );
        execute(
          db,
          `INSERT INTO inventory_movements (id, product_id, change, reason, reference, note)
           VALUES (?, ?, ?, 'release', ?, 'Seller order cancelled')`,
          newId('mov_'),
          item.product_id,
          -item.quantity,
          so.order_number,
        );
      }
      execute(db, "UPDATE seller_orders SET status = 'cancelled', updated_at = ? WHERE id = ?", now.toISOString(), so.id);
      execute(db, "UPDATE order_items SET status = 'cancelled' WHERE seller_order_id = ?", so.id);
      execute(
        db,
        `UPDATE seller_ledger_entries SET status = 'reversed'
          WHERE seller_order_id = ? AND status = 'pending'`,
        so.id,
      );
      const existingRefund = queryOne<{ id: string }>(
        db,
        "SELECT id FROM refunds WHERE seller_order_id = ? AND status NOT IN ('rejected','failed')",
        so.id,
      );
      if (!existingRefund) {
        const payment = queryOne<{ id: string }>(
          db,
          "SELECT id FROM payments WHERE order_id = ? AND status = 'paid' ORDER BY created_at DESC LIMIT 1",
          so.order_id,
        );
        execute(
          db,
          `INSERT INTO refunds (id, order_id, seller_order_id, payment_id, amount_paise, reason, status, requested_by)
           VALUES (?, ?, ?, ?, ?, ?, 'requested', ?)`,
          newId('ref_'),
          so.order_id,
          so.id,
          payment?.id ?? null,
          so.total_paise,
          params.note?.trim() || 'Seller order cancelled before dispatch',
          params.actor.id,
        );
      }
      audit(db, params.actor, 'seller_order.cancelled', 'seller_order', so.id, { status: so.status }, { status: 'cancelled' });
    });
  }

  refreshOrderStatus(db, so.order_id);
}

export function refreshOrderStatus(db: Db, orderId: string): string {
  const order = queryOne<{ status: string; paid_at: string | null }>(
    db,
    'SELECT status, paid_at FROM orders WHERE id = ?',
    orderId,
  );
  if (!order) return 'unknown';
  if (['pending_payment', 'expired', 'refunded', 'partially_refunded'].includes(order.status)) return order.status;
  const statuses = queryAll<{ status: string }>(db, 'SELECT status FROM seller_orders WHERE order_id = ?', orderId).map(
    (row) => row.status,
  );
  if (statuses.length === 0) return order.status;
  let next = order.status;
  if (statuses.every((status) => status === 'cancelled')) next = 'cancelled';
  else if (statuses.every((status) => ['delivered', 'returned', 'refunded', 'cancelled'].includes(status))) next = 'fulfilled';
  else if (statuses.some((status) => ['shipped', 'delivered', 'returned'].includes(status))) next = 'partially_fulfilled';
  else if (order.paid_at) next = 'paid';

  const refunded = queryOne<{ total: number }>(
    db,
    "SELECT COALESCE(SUM(amount_paise),0) AS total FROM refunds WHERE order_id = ? AND status = 'completed'",
    orderId,
  );
  if ((refunded?.total ?? 0) > 0) {
    const total = queryOne<{ total_paise: number }>(db, 'SELECT total_paise FROM orders WHERE id = ?', orderId);
    if (total && (refunded?.total ?? 0) >= total.total_paise) next = 'refunded';
    else if (next !== 'cancelled') next = 'partially_refunded';
  }
  if (next !== order.status) {
    execute(db, 'UPDATE orders SET status = ? WHERE id = ?', next, orderId);
  }
  return next;
}

/* ------------------------------------------------------------------ */
/* Refunds                                                             */
/* ------------------------------------------------------------------ */

function applyRefundToLedger(db: Db, refundId: string, orderId: string, sellerOrderId: string | null, amountPaise: number): void {
  if (!sellerOrderId) return;
  const so = queryOne<{
    id: string;
    seller_id: string;
    subtotal_paise: number;
    discount_paise: number;
    total_paise: number;
    commission_paise: number;
    seller_earning_paise: number;
  }>(db, 'SELECT * FROM seller_orders WHERE id = ?', sellerOrderId);
  if (!so || so.total_paise <= 0) return;
  const saleEntry = queryOne<{ status: string }>(
    db,
    "SELECT status FROM seller_ledger_entries WHERE reference = ?",
    `sale:${so.id}`,
  );
  if (saleEntry?.status === 'reversed') return; // cancellation already removed the earning
  const share = Math.min(1, amountPaise / so.total_paise);
  const basis = so.subtotal_paise - so.discount_paise;
  const basisShare = Math.round(basis * share);
  const commissionShare = Math.round(so.commission_paise * share);
  execute(
    db,
    `INSERT OR IGNORE INTO seller_ledger_entries
       (id, seller_id, order_id, seller_order_id, type, amount_paise, status, reference, note, available_at, created_at)
     VALUES (?, ?, ?, ?, 'refund', ?, 'eligible', ?, ?, ?, ?)`,
    newId('led_'),
    so.seller_id,
    orderId,
    so.id,
    -basisShare,
    `refund:${refundId}:value`,
    'Refund deduction against product value',
    new Date().toISOString(),
    new Date().toISOString(),
  );
  execute(
    db,
    `INSERT OR IGNORE INTO seller_ledger_entries
       (id, seller_id, order_id, seller_order_id, type, amount_paise, status, reference, note, available_at, created_at)
     VALUES (?, ?, ?, ?, 'adjustment', ?, 'eligible', ?, ?, ?, ?)`,
    newId('led_'),
    so.seller_id,
    orderId,
    so.id,
    commissionShare,
    `refund:${refundId}:commission`,
    'Proportional commission reversal on refund',
    new Date().toISOString(),
    new Date().toISOString(),
  );
}

export function finalizeRefund(db: Db, refundId: string, providerRefundId: string, providerStatus: string): void {
  tx(db, () => {
    const refund = queryOne<{
      id: string;
      order_id: string;
      seller_order_id: string | null;
      amount_paise: number;
      status: string;
      requested_by: string;
    }>(db, 'SELECT * FROM refunds WHERE id = ?', refundId);
    if (!refund) throw notFound('Refund not found.');
    if (refund.status === 'completed') return;
    if (refund.status === 'rejected') throw conflict('This refund was rejected.');
    execute(
      db,
      `UPDATE refunds SET status = 'completed', provider_refund_id = ?, provider_status = ?, completed_at = ?
        WHERE id = ?`,
      providerRefundId,
      providerStatus,
      new Date().toISOString(),
      refundId,
    );
    applyRefundToLedger(db, refund.id, refund.order_id, refund.seller_order_id, refund.amount_paise);
    if (refund.seller_order_id) {
      const remaining = queryAll<{ amount_paise: number }>(
        db,
        "SELECT amount_paise FROM refunds WHERE seller_order_id = ? AND status = 'completed'",
        refund.seller_order_id,
      ).reduce((sum, row) => sum + row.amount_paise, 0);
      const so = queryOne<{ total_paise: number; status: string }>(
        db,
        'SELECT total_paise, status FROM seller_orders WHERE id = ?',
        refund.seller_order_id,
      );
      if (so && remaining >= so.total_paise) {
        execute(db, "UPDATE seller_orders SET status = 'refunded' WHERE id = ?", refund.seller_order_id);
        execute(db, "UPDATE order_items SET status = 'refunded' WHERE seller_order_id = ?", refund.seller_order_id);
      }
    }
    refreshOrderStatus(db, refund.order_id);
    audit(db, null, 'refund.completed', 'refund', refund.id, { status: refund.status }, {
      status: 'completed',
      providerRefundId,
      amount: refund.amount_paise,
    });
  });
}

export interface RefundRow {
  id: string;
  order_id: string;
  seller_order_id: string | null;
  payment_id: string | null;
  amount_paise: number;
  reason: string;
  status: string;
  requested_by: string;
  created_at: string;
  order_number?: string;
  seller_name?: string | null;
}

export async function decideRefund(
  db: Db,
  params: {
    refundId: string;
    actor: SessionUser;
    decision: 'approve' | 'reject';
    method?: 'razorpay' | 'manual';
    manualReference?: string;
    note?: string;
  },
): Promise<{ status: string; message: string }> {
  const refund = queryOne<RefundRow & { provider_payment_id: string | null; provider: string | null }>(
    db,
    `SELECT r.*, p.provider_payment_id, p.provider
       FROM refunds r LEFT JOIN payments p ON p.id = r.payment_id
      WHERE r.id = ?`,
    params.refundId,
  );
  if (!refund) throw notFound('Refund not found.');
  if (!['requested', 'approved', 'processing', 'failed'].includes(refund.status)) {
    throw conflict('This refund has already been finalised.');
  }

  if (params.decision === 'reject') {
    tx(db, () => {
      execute(
        db,
        "UPDATE refunds SET status = 'rejected', decided_by = ?, decided_at = ?, provider_status = ? WHERE id = ?",
        params.actor.id,
        new Date().toISOString(),
        'rejected',
        refund.id,
      );
      audit(db, params.actor, 'refund.rejected', 'refund', refund.id, { status: refund.status }, {
        status: 'rejected',
        note: params.note ?? null,
      });
    });
    return { status: 'rejected', message: 'Refund rejected and recorded.' };
  }

  if (!refund.provider_payment_id || refund.provider !== 'razorpay') {
    if (params.method !== 'manual') {
      throw badRequest(
        'No verified Razorpay payment is attached. Record a manual bank/UPI refund with a reference instead.',
        { method: 'Manual refund required.' },
      );
    }
  }

  if (params.method === 'manual') {
    const reference = params.manualReference?.trim();
    if (!reference || reference.length < 4) {
      throw badRequest('Enter the bank/UPI reference for the manual refund.', {
        manualReference: 'Reference is required.',
      });
    }
    tx(db, () => {
      execute(
        db,
        `UPDATE refunds SET status = 'approved', decided_by = ?, decided_at = ?, provider_status = 'manual-approved'
          WHERE id = ?`,
        params.actor.id,
        new Date().toISOString(),
        refund.id,
      );
      audit(db, params.actor, 'refund.manual_approved', 'refund', refund.id, { status: refund.status }, {
        status: 'approved',
        reference,
        note: params.note ?? null,
      });
    });
    finalizeRefund(db, refund.id, `manual:${reference}`, 'manual');
    return { status: 'completed', message: 'Manual refund recorded as completed with reference.' };
  }

  if (!refund.provider_payment_id) {
    throw badRequest('This refund has no provider payment to reverse.', { method: 'Manual refund required.' });
  }
  const { createRazorpayRefund } = await import('./payments.js');
  const providerRefund = await createRazorpayRefund(refund.provider_payment_id, refund.amount_paise, {
    refund_id: refund.id,
    reason: 'Marketplace refund',
  });
  execute(
    db,
    `UPDATE refunds SET status = 'processing', decided_by = ?, decided_at = ?, provider_refund_id = ?,
            provider_status = ? WHERE id = ?`,
    params.actor.id,
    new Date().toISOString(),
    providerRefund.id,
    providerRefund.status,
    refund.id,
  );
  audit(db, params.actor, 'refund.submitted', 'refund', refund.id, { status: refund.status }, {
    status: 'processing',
    providerRefundId: providerRefund.id,
  });
  return {
    status: 'processing',
    message: 'Refund submitted to Razorpay. It will be marked completed only after the provider webhook confirms it.',
  };
}

/* ------------------------------------------------------------------ */
/* Account requests                                                    */
/* ------------------------------------------------------------------ */

export function requestCancellation(
  db: Db,
  params: { orderId: string; sellerOrderId: string; userId: string; actor: SessionUser; reason: string },
): { status: string; message: string } {
  const so = queryOne<{
    id: string;
    order_id: string;
    user_id: string;
    status: string;
    total_paise: number;
    paid_at: string | null;
  }>(
    db,
    `SELECT so.id, so.order_id, so.status, so.total_paise, o.user_id, o.paid_at
       FROM seller_orders so JOIN orders o ON o.id = so.order_id
      WHERE so.id = ? AND so.order_id = ?`,
    params.sellerOrderId,
    params.orderId,
  );
  if (!so || so.user_id !== params.userId) throw notFound('Order not found.');
  if (!so.paid_at) throw conflict('This order has no completed payment.');
  if (!['pending', 'confirmed', 'packed', 'shipped'].includes(so.status)) {
    throw conflict('This shipment can no longer be cancelled. Please request a return after delivery.');
  }

  const id = newId('can_');
  tx(db, () => {
    execute(
      db,
      `INSERT INTO cancellation_requests (id, order_id, seller_order_id, user_id, reason, status)
       VALUES (?, ?, ?, ?, ?, 'requested')`,
      id,
      params.orderId,
      params.sellerOrderId,
      params.userId,
      params.reason.trim().slice(0, 1000),
    );
    if (['pending', 'confirmed', 'packed'].includes(so.status)) {
      sellerOrderAction(db, {
        sellerOrderId: params.sellerOrderId,
        actor: params.actor,
        action: 'cancel',
        note: `Customer cancellation: ${params.reason.trim().slice(0, 200)}`,
      });
      execute(
        db,
        `UPDATE cancellation_requests SET status = 'completed', resolution_note = ?, decided_at = ?
          WHERE id = ?`,
        'Cancelled before dispatch under the published policy. Refund queued for review.',
        new Date().toISOString(),
        id,
      );
      return { status: 'completed', message: 'Order cancelled. Any refund due will be reviewed by our team.' };
    }
    return {
      status: 'requested',
      message: 'Your order has already been handed to the courier. Our team will review the cancellation request.',
    };
  });
  const result = queryOne<{ status: string }>(db, 'SELECT status FROM cancellation_requests WHERE id = ?', id);
  return {
    status: result?.status ?? 'requested',
    message:
      result?.status === 'completed'
        ? 'Order cancelled. Any refund due will be reviewed by our team.'
        : 'Cancellation request submitted for review.',
  };
}

export function requestReturn(
  db: Db,
  params: { orderId: string; sellerOrderId: string; userId: string; reason: string; description?: string },
): { id: string } {
  const so = queryOne<{ id: string; status: string; delivered_at: string | null; user_id: string }>(
    db,
    `SELECT so.id, so.status, so.delivered_at, o.user_id
       FROM seller_orders so JOIN orders o ON o.id = so.order_id
      WHERE so.id = ? AND so.order_id = ?`,
    params.sellerOrderId,
    params.orderId,
  );
  if (!so || so.user_id !== params.userId) throw notFound('Order not found.');
  if (so.status !== 'delivered' || !so.delivered_at) throw conflict('Returns can only be requested after delivery.');
  if (new Date(so.delivered_at).getTime() < Date.now() - 7 * 86400_000) {
    throw conflict('The 7-day return window has closed for this item.');
  }
  const existing = queryOne<{ id: string }>(
    db,
    "SELECT id FROM return_requests WHERE seller_order_id = ? AND status NOT IN ('rejected','closed')",
    so.id,
  );
  if (existing) throw conflict('A return request already exists for this shipment.');
  const id = newId('ret_');
  execute(
    db,
    `INSERT INTO return_requests (id, order_id, seller_order_id, user_id, reason, description, status)
     VALUES (?, ?, ?, ?, ?, ?, 'requested')`,
    id,
    params.orderId,
    so.id,
    params.userId,
    params.reason.trim().slice(0, 200),
    params.description?.trim().slice(0, 2000) ?? null,
  );
  return { id };
}

export function createRefundForReturn(
  db: Db,
  params: { returnId: string; actor: SessionUser; amountPaise?: number; note?: string },
): string {
  const ret = queryOne<{
    id: string;
    order_id: string;
    seller_order_id: string;
    status: string;
  }>(db, 'SELECT * FROM return_requests WHERE id = ?', params.returnId);
  if (!ret) throw notFound('Return request not found.');
  const so = queryOne<{ total_paise: number; status: string }>(
    db,
    'SELECT total_paise, status FROM seller_orders WHERE id = ?',
    ret.seller_order_id,
  );
  if (!so) throw notFound('Seller order not found.');
  const payment = queryOne<{ id: string }>(
    db,
    "SELECT id FROM payments WHERE order_id = ? AND status = 'paid' ORDER BY created_at DESC LIMIT 1",
    ret.order_id,
  );
  const refundId = newId('ref_');
  tx(db, () => {
    execute(
      db,
      `INSERT INTO refunds (id, order_id, seller_order_id, payment_id, amount_paise, reason, status, requested_by)
       VALUES (?, ?, ?, ?, ?, ?, 'requested', ?)`,
      refundId,
      ret.order_id,
      ret.seller_order_id,
      payment?.id ?? null,
      params.amountPaise ?? so.total_paise,
      params.note ?? 'Return approved',
      params.actor.id,
    );
    execute(
      db,
      "UPDATE return_requests SET status = 'approved', decided_by = ?, decided_at = ?, resolution_note = ? WHERE id = ?",
      params.actor.id,
      new Date().toISOString(),
      params.note ?? null,
      ret.id,
    );
    audit(db, params.actor, 'return.approved', 'return_request', ret.id, { status: ret.status }, {
      status: 'approved',
      refundId,
    });
  });
  return refundId;
}

/* ------------------------------------------------------------------ */
/* Settlements                                                         */
/* ------------------------------------------------------------------ */

export function generateSettlement(
  db: Db,
  actor: SessionUser,
  sellerId: string,
  periodStart: string,
  periodEnd: string,
): { batchId: string; reference: string; netPaise: number; entryCount: number } {
  return tx(db, () => {
    const entries = queryAll<{
      id: string;
      type: string;
      amount_paise: number;
    }>(
      db,
      `SELECT id, type, amount_paise FROM seller_ledger_entries
        WHERE seller_id = ? AND status = 'eligible' AND settlement_id IS NULL
          AND (available_at IS NULL OR available_at <= ?)
          AND created_at >= ? AND created_at <= ?
        ORDER BY created_at`,
      sellerId,
      new Date().toISOString(),
      periodStart,
      periodEnd,
    );
    if (entries.length === 0) throw badRequest('No eligible ledger entries in that period.');

    const gross = entries.filter((e) => e.type === 'sale').reduce((sum, e) => sum + e.amount_paise, 0);
    const commission = -entries.filter((e) => e.type === 'commission').reduce((sum, e) => sum + e.amount_paise, 0);
    const refunds = -entries.filter((e) => e.type === 'refund').reduce((sum, e) => sum + e.amount_paise, 0);
    const adjustments = entries.filter((e) => e.type === 'adjustment').reduce((sum, e) => sum + e.amount_paise, 0);
    const net = entries.reduce((sum, e) => sum + e.amount_paise, 0);

    if (net < 0) throw badRequest('The selected period nets to a negative balance. Use an adjustment workflow instead.');
    if (net === 0) throw badRequest('The selected period nets to zero. Nothing to settle.');

    const id = newId('stl_');
    const reference = `SET-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    execute(
      db,
      `INSERT INTO settlement_batches
         (id, seller_id, reference, period_start, period_end, gross_paise, commission_paise,
          refunds_paise, adjustments_paise, net_paise, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
      id,
      sellerId,
      reference,
      periodStart,
      periodEnd,
      gross,
      commission,
      refunds,
      adjustments,
      net,
      actor.id,
    );
    for (const entry of entries) {
      execute(
        db,
        'INSERT INTO settlement_items (id, batch_id, ledger_entry_id) VALUES (?, ?, ?)',
        newId('sti_'),
        id,
        entry.id,
      );
      execute(db, 'UPDATE seller_ledger_entries SET settlement_id = ? WHERE id = ?', id, entry.id);
    }
    audit(db, actor, 'settlement.created', 'settlement', id, null, {
      sellerId,
      reference,
      net,
      periodStart,
      periodEnd,
      entryCount: entries.length,
    });
    return { batchId: id, reference, netPaise: net, entryCount: entries.length };
  });
}

export function markSettlementPaid(
  db: Db,
  actor: SessionUser,
  batchId: string,
  providerReference: string,
  note?: string,
): void {
  const reference = providerReference.trim();
  if (reference.length < 4) {
    throw badRequest('Record the bank/UPI payout reference before marking a settlement paid.', {
      providerReference: 'Reference required.',
    });
  }
  tx(db, () => {
    const batch = queryOne<{ id: string; seller_id: string; status: string; net_paise: number }>(
      db,
      'SELECT id, seller_id, status, net_paise FROM settlement_batches WHERE id = ?',
      batchId,
    );
    if (!batch) throw notFound('Settlement not found.');
    if (batch.status === 'paid') throw conflict('This settlement is already marked paid.');
    if (batch.status === 'reversed') throw conflict('This settlement was reversed.');
    execute(
      db,
      `UPDATE settlement_batches SET status = 'paid', provider_reference = ?, paid_at = ?, note = ? WHERE id = ?`,
      reference,
      new Date().toISOString(),
      note ?? null,
      batchId,
    );
    execute(
      db,
      `UPDATE seller_ledger_entries SET status = 'settled'
        WHERE settlement_id = ? AND status = 'eligible'`,
      batchId,
    );
    audit(db, actor, 'settlement.paid', 'settlement', batchId, { status: batch.status }, {
      status: 'paid',
      reference,
      net: batch.net_paise,
    });
  });
}
