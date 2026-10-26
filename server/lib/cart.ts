import type { Response } from 'express';
import { env } from '../env.js';
import { execute, queryAll, queryOne, type Db } from '../db.js';
import type { CartLine, CartView } from '../../shared/types.js';
import { conflict, notFound } from './http.js';
import { newId, randomToken } from './ids.js';
import { shippingFor } from './pricing.js';

export const CART_COOKIE = 'pr_cart';

interface CartRow {
  id: string;
  user_id: string | null;
  token: string;
  status: string;
}

interface CartLineRow {
  product_id: string;
  slug: string;
  name: string;
  image_url: string | null;
  image_alt: string | null;
  price_paise: number;
  promo_price_paise: number | null;
  quantity: number;
  stock: number;
  reserved: number;
  product_status: string;
  seller_id: string;
  seller_name: string;
  seller_status: string;
}

export function ensureCart(db: Db, userId: string | null, token: string | null): { cart: CartRow; token: string } {
  if (userId) {
    const existing = queryOne<CartRow>(
      db,
      "SELECT * FROM carts WHERE user_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1",
      userId,
    );
    if (existing) {
      if (token && token !== existing.token) {
        const guest = queryOne<CartRow>(db, "SELECT * FROM carts WHERE token = ? AND status = 'active' AND user_id IS NULL", token);
        if (guest) mergeCartInto(db, guest.id, existing.id);
      }
      return { cart: existing, token: existing.token };
    }
    const cartToken = randomToken(24);
    const id = newId('crt_');
    execute(db, 'INSERT INTO carts (id, user_id, token) VALUES (?, ?, ?)', id, userId, cartToken);
    // Merge a guest cart created before sign-in.
    if (token) {
      const guest = queryOne<CartRow>(db, "SELECT * FROM carts WHERE token = ? AND status = 'active' AND user_id IS NULL", token);
      if (guest) mergeCartInto(db, guest.id, id);
    }
    return { cart: { id, user_id: userId, token: cartToken, status: 'active' }, token: cartToken };
  }

  if (token) {
    const existing = queryOne<CartRow>(db, "SELECT * FROM carts WHERE token = ? AND status = 'active'", token);
    if (existing) return { cart: existing, token: existing.token };
  }
  const cartToken = randomToken(24);
  const id = newId('crt_');
  execute(db, 'INSERT INTO carts (id, token) VALUES (?, ?)', id, cartToken);
  return { cart: { id, user_id: null, token: cartToken, status: 'active' }, token: cartToken };
}

function mergeCartInto(db: Db, guestCartId: string, userCartId: string): void {
  const guestItems = queryAll<{ product_id: string; quantity: number }>(
    db,
    'SELECT product_id, quantity FROM cart_items WHERE cart_id = ?',
    guestCartId,
  );
  for (const item of guestItems) {
    const existing = queryOne<{ id: string; quantity: number }>(
      db,
      'SELECT id, quantity FROM cart_items WHERE cart_id = ? AND product_id = ?',
      userCartId,
      item.product_id,
    );
    if (existing) {
      execute(
        db,
        'UPDATE cart_items SET quantity = ? WHERE id = ?',
        Math.min(99, existing.quantity + item.quantity),
        existing.id,
      );
    } else {
      execute(
        db,
        'INSERT INTO cart_items (id, cart_id, product_id, quantity) VALUES (?, ?, ?, ?)',
        newId('ci_'),
        userCartId,
        item.product_id,
        item.quantity,
      );
    }
  }
  execute(db, "UPDATE carts SET status = 'converted', updated_at = ? WHERE id = ?", new Date().toISOString(), guestCartId);
}

export function setCartCookie(res: Response, token: string): void {
  res.cookie(CART_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.appUrl.startsWith('https://'),
    path: '/',
    maxAge: 90 * 86400_000,
  });
}

export function cartLines(db: Db, cartId: string): CartLine[] {
  const rows = queryAll<CartLineRow>(
    db,
    `SELECT ci.product_id, p.slug, p.name, p.price_paise, acp.promo_price_paise, ci.quantity,
            p.status AS product_status,
            i.quantity AS stock, i.reserved_quantity AS reserved,
            s.id AS seller_id, s.business_name AS seller_name, s.status AS seller_status,
            (SELECT url FROM product_images pi WHERE pi.product_id = p.id ORDER BY sort_order LIMIT 1) AS image_url,
            (SELECT alt FROM product_images pi WHERE pi.product_id = p.id ORDER BY sort_order LIMIT 1) AS image_alt
       FROM cart_items ci
       JOIN products p ON p.id = ci.product_id
       JOIN inventory i ON i.product_id = p.id
       JOIN seller_profiles s ON s.id = p.seller_id
       LEFT JOIN active_campaign_prices acp ON acp.product_id = p.id
      WHERE ci.cart_id = ?
      ORDER BY ci.created_at`,
    cartId,
  );
  return rows.map((row) => {
    const available = Math.max(0, row.stock - row.reserved);
    const sellable = available > 0 && row.product_status === 'approved' && row.seller_status === 'approved';
    // The cart shows the live promotional price. It is re-read on every request
    // so an expired or withdrawn campaign can never keep an old price in place.
    const campaignPrice =
      row.promo_price_paise !== null && row.promo_price_paise < row.price_paise ? row.promo_price_paise : null;
    const unitPrice = campaignPrice ?? row.price_paise;
    return {
      productId: row.product_id,
      slug: row.slug,
      name: row.name,
      imageUrl: row.image_url,
      imageAlt: row.image_alt,
      unitPricePaise: unitPrice,
      originalUnitPricePaise: campaignPrice === null ? null : row.price_paise,
      quantity: row.quantity,
      lineTotalPaise: sellable ? unitPrice * row.quantity : 0,
      stock: available,
      maxQuantity: Math.min(99, available),
      sellerId: row.seller_id,
      sellerName: row.seller_name,
      status: row.product_status as CartLine['status'],
    };
  });
}

export function getCartView(db: Db, cartId: string): CartView {
  const lines = cartLines(db, cartId);
  const subtotal = lines.reduce((sum, line) => sum + line.lineTotalPaise, 0);
  return {
    lines,
    subtotalPaise: subtotal,
    itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
    hasUnavailable: lines.some(
      (line) => line.status !== 'approved' || line.stock <= 0 || line.quantity > line.stock,
    ),
    shippingEstimatePaise: shippingFor(subtotal),
    freeShippingThresholdPaise: env.freeShippingThresholdPaise,
  };
}

export function addToCart(db: Db, cartId: string, productId: string, quantity: number): void {
  const product = queryOne<{ id: string; status: string; seller_status: string; name: string }>(
    db,
    `SELECT p.id, p.status, p.name, s.status AS seller_status
       FROM products p JOIN seller_profiles s ON s.id = p.seller_id
      WHERE p.id = ?`,
    productId,
  );
  if (!product) throw notFound('Product not found.');
  if (product.status !== 'approved' || product.seller_status !== 'approved') {
    throw conflict('This product is not currently available.');
  }
  const stock = queryOne<{ available: number }>(
    db,
    'SELECT quantity - reserved_quantity AS available FROM inventory WHERE product_id = ?',
    productId,
  );
  const existing = queryOne<{ id: string; quantity: number }>(
    db,
    'SELECT id, quantity FROM cart_items WHERE cart_id = ? AND product_id = ?',
    cartId,
    productId,
  );
  const available = Math.max(0, stock?.available ?? 0);
  if (available <= 0) throw conflict('This product is out of stock.');
  const desired = (existing?.quantity ?? 0) + quantity;
  if (desired > available) {
    throw conflict(`Only ${available} ${available === 1 ? 'unit is' : 'units are'} available right now.`);
  }
  if (existing) {
    execute(db, 'UPDATE cart_items SET quantity = ? WHERE id = ?', desired, existing.id);
  } else {
    execute(
      db,
      'INSERT INTO cart_items (id, cart_id, product_id, quantity) VALUES (?, ?, ?, ?)',
      newId('ci_'),
      cartId,
      productId,
      quantity,
    );
  }
  execute(db, 'UPDATE carts SET updated_at = ? WHERE id = ?', new Date().toISOString(), cartId);
}

export function updateCartItem(db: Db, cartId: string, productId: string, quantity: number): void {
  if (quantity === 0) {
    execute(db, 'DELETE FROM cart_items WHERE cart_id = ? AND product_id = ?', cartId, productId);
    return;
  }
  const stock = queryOne<{ available: number }>(
    db,
    'SELECT quantity - reserved_quantity AS available FROM inventory WHERE product_id = ?',
    productId,
  );
  const available = Math.max(0, stock?.available ?? 0);
  if (quantity > available) {
    throw conflict(`Only ${available} ${available === 1 ? 'unit is' : 'units are'} available right now.`);
  }
  const result = execute(
    db,
    'UPDATE cart_items SET quantity = ? WHERE cart_id = ? AND product_id = ?',
    quantity,
    cartId,
    productId,
  );
  if (result.changes === 0) throw notFound('That item is no longer in your bag.');
  execute(db, 'UPDATE carts SET updated_at = ? WHERE id = ?', new Date().toISOString(), cartId);
}

export function removeCartItem(db: Db, cartId: string, productId: string): void {
  execute(db, 'DELETE FROM cart_items WHERE cart_id = ? AND product_id = ?', cartId, productId);
  execute(db, 'UPDATE carts SET updated_at = ? WHERE id = ?', new Date().toISOString(), cartId);
}
