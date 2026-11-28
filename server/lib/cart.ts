import type { Request, Response } from 'express';
import { env } from '../env.js';
import { execute, queryAll, queryOne, type Db } from '../db.js';
import type { CartLine, CartView } from '../../shared/types.js';
import { conflict, notFound } from './http.js';
import { newId, randomToken } from './ids.js';
import { shippingFor } from './pricing.js';
import { parseProductVariants } from './externalSourcing.js';

export const CART_COOKIE = 'pr_cart';

interface CartRow {
  id: string;
  user_id: string | null;
  token: string;
  status: string;
}

interface CartLineRow {
  product_id: string;
  variant_id: string;
  variant_label: string | null;
  variants_json: string | null;
  max_order_quantity: number | null;
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
  fulfilment_method: string | null;
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
  const guestItems = queryAll<{ product_id: string; variant_id: string; variant_label: string | null; quantity: number }>(
    db,
    'SELECT product_id, variant_id, variant_label, quantity FROM cart_items WHERE cart_id = ?',
    guestCartId,
  );
  for (const item of guestItems) {
    const existing = queryOne<{ id: string; quantity: number }>(
      db,
      'SELECT id, quantity FROM cart_items WHERE cart_id = ? AND product_id = ? AND variant_id = ?',
      userCartId,
      item.product_id,
      item.variant_id ?? '',
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
        'INSERT INTO cart_items (id, cart_id, product_id, variant_id, variant_label, quantity) VALUES (?, ?, ?, ?, ?, ?)',
        newId('ci_'),
        userCartId,
        item.product_id,
        item.variant_id ?? '',
        item.variant_label ?? null,
        item.quantity,
      );
    }
  }
  execute(db, "UPDATE carts SET status = 'converted', updated_at = ? WHERE id = ?", new Date().toISOString(), guestCartId);
}

export function setCartCookie(res: Response, token: string, req?: Request): void {
  const sameSite = env.sessionSameSite;
  const secure = sameSite === 'none' || env.appUrl.startsWith('https://') || Boolean(req?.secure);
  res.cookie(CART_COOKIE, token, {
    httpOnly: true,
    sameSite,
    secure,
    path: '/',
    maxAge: 90 * 86400_000,
  });
}

export function cartLines(db: Db, cartId: string): CartLine[] {
  const rows = queryAll<CartLineRow>(
    db,
    `SELECT ci.product_id, ci.variant_id, ci.variant_label, p.variants_json, p.max_order_quantity,
            p.slug, p.name, p.price_paise, acp.promo_price_paise, ci.quantity,
            p.status AS product_status, p.fulfilment_method,
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
    const variants = parseProductVariants(row.variants_json);
    const chosenVariant = row.variant_id ? variants.find((v) => v.id === row.variant_id) : undefined;
    const variantAvailable = chosenVariant ? chosenVariant.available !== false : true;
    const available = Math.max(0, row.stock - row.reserved);
    const maxCap = Math.min(Math.max(1, Number(row.max_order_quantity ?? 10)), 99, available);
    const sellable = available > 0 && variantAvailable && row.product_status === 'approved' && row.seller_status === 'approved';
    const delta = chosenVariant?.priceDeltaPaise ?? 0;
    const baseWithVariant = Math.max(100, row.price_paise + delta);
    // The cart shows the live promotional price. It is re-read on every request
    // so an expired or withdrawn campaign can never keep an old price in place.
    const campaignPrice =
      row.promo_price_paise !== null && row.promo_price_paise < row.price_paise
        ? Math.max(100, row.promo_price_paise + delta)
        : null;
    const unitPrice = campaignPrice ?? baseWithVariant;
    return {
      productId: row.product_id,
      slug: row.slug,
      name: row.name,
      imageUrl: row.image_url,
      imageAlt: row.image_alt,
      unitPricePaise: unitPrice,
      originalUnitPricePaise: campaignPrice === null ? null : baseWithVariant,
      quantity: row.quantity,
      lineTotalPaise: sellable ? unitPrice * row.quantity : 0,
      stock: available,
      maxQuantity: maxCap,
      sellerId: row.seller_id,
      sellerName: row.seller_name,
      status: row.product_status as CartLine['status'],
      fulfilmentMethod: (row.fulfilment_method as CartLine['fulfilmentMethod']) ?? 'SHIPROCKET',
      variantId: row.variant_id || null,
      variantLabel: chosenVariant?.label ?? row.variant_label ?? null,
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

export function addToCart(db: Db, cartId: string, productId: string, quantity: number, variantId?: string): void {
  const product = queryOne<{
    id: string;
    status: string;
    seller_status: string;
    name: string;
    variants_json: string | null;
    max_order_quantity: number | null;
  }>(
    db,
    `SELECT p.id, p.status, p.name, p.variants_json, p.max_order_quantity, s.status AS seller_status
       FROM products p JOIN seller_profiles s ON s.id = p.seller_id
      WHERE p.id = ?`,
    productId,
  );
  if (!product) throw notFound('Product not found.');
  if (product.status !== 'approved' || product.seller_status !== 'approved') {
    throw conflict('This product is not currently available.');
  }
  const variants = parseProductVariants(product.variants_json);
  let resolvedVariantId = (variantId ?? '').trim();
  let resolvedVariantLabel: string | null = null;
  if (variants.length > 0) {
    const match = resolvedVariantId
      ? variants.find((v) => v.id === resolvedVariantId)
      : variants.find((v) => v.available !== false) ?? variants[0];
    if (!match) {
      throw conflict('Selected product option is not available.');
    }
    if (!match.available) {
      throw conflict(`${match.label} is currently unavailable.`);
    }
    resolvedVariantId = match.id;
    resolvedVariantLabel = match.label;
  } else {
    resolvedVariantId = '';
  }

  const stock = queryOne<{ available: number }>(
    db,
    'SELECT quantity - reserved_quantity AS available FROM inventory WHERE product_id = ?',
    productId,
  );
  const existing = queryOne<{ id: string; quantity: number }>(
    db,
    'SELECT id, quantity FROM cart_items WHERE cart_id = ? AND product_id = ? AND variant_id = ?',
    cartId,
    productId,
    resolvedVariantId,
  );
  const available = Math.max(0, stock?.available ?? 0);
  if (available <= 0) throw conflict('This product is out of stock.');
  const maxOrderQty = Math.min(99, Math.max(1, Number(product.max_order_quantity ?? 10)));
  const desired = (existing?.quantity ?? 0) + quantity;
  if (desired > available) {
    throw conflict(`Only ${available} ${available === 1 ? 'unit is' : 'units are'} available right now.`);
  }
  if (desired > maxOrderQty) {
    throw conflict(`Maximum ${maxOrderQty} unit${maxOrderQty === 1 ? '' : 's'} allowed per order for this item.`);
  }
  if (existing) {
    execute(db, 'UPDATE cart_items SET quantity = ?, variant_label = ? WHERE id = ?', desired, resolvedVariantLabel, existing.id);
  } else {
    execute(
      db,
      'INSERT INTO cart_items (id, cart_id, product_id, variant_id, variant_label, quantity) VALUES (?, ?, ?, ?, ?, ?)',
      newId('ci_'),
      cartId,
      productId,
      resolvedVariantId,
      resolvedVariantLabel,
      quantity,
    );
  }
  execute(db, 'UPDATE carts SET updated_at = ? WHERE id = ?', new Date().toISOString(), cartId);
}

export function updateCartItem(db: Db, cartId: string, productId: string, quantity: number, variantId?: string): void {
  const vKey = variantId !== undefined ? variantId.trim() : null;
  if (quantity === 0) {
    if (vKey !== null) {
      execute(db, 'DELETE FROM cart_items WHERE cart_id = ? AND product_id = ? AND variant_id = ?', cartId, productId, vKey);
    } else {
      execute(db, 'DELETE FROM cart_items WHERE cart_id = ? AND product_id = ?', cartId, productId);
    }
    return;
  }
  const prod = queryOne<{ max_order_quantity: number | null }>(db, 'SELECT max_order_quantity FROM products WHERE id = ?', productId);
  const stock = queryOne<{ available: number }>(
    db,
    'SELECT quantity - reserved_quantity AS available FROM inventory WHERE product_id = ?',
    productId,
  );
  const available = Math.max(0, stock?.available ?? 0);
  if (quantity > available) {
    throw conflict(`Only ${available} ${available === 1 ? 'unit is' : 'units are'} available right now.`);
  }
  const maxOrderQty = Math.min(99, Math.max(1, Number(prod?.max_order_quantity ?? 10)));
  if (quantity > maxOrderQty) {
    throw conflict(`Maximum ${maxOrderQty} unit${maxOrderQty === 1 ? '' : 's'} allowed per order for this item.`);
  }
  const result =
    vKey !== null
      ? execute(db, 'UPDATE cart_items SET quantity = ? WHERE cart_id = ? AND product_id = ? AND variant_id = ?', quantity, cartId, productId, vKey)
      : execute(db, 'UPDATE cart_items SET quantity = ? WHERE cart_id = ? AND product_id = ?', quantity, cartId, productId);
  if (result.changes === 0) throw notFound('That item is no longer in your bag.');
  execute(db, 'UPDATE carts SET updated_at = ? WHERE id = ?', new Date().toISOString(), cartId);
}

export function removeCartItem(db: Db, cartId: string, productId: string, variantId?: string): void {
  if (variantId !== undefined) {
    execute(db, 'DELETE FROM cart_items WHERE cart_id = ? AND product_id = ? AND variant_id = ?', cartId, productId, variantId.trim());
  } else {
    execute(db, 'DELETE FROM cart_items WHERE cart_id = ? AND product_id = ?', cartId, productId);
  }
  execute(db, 'UPDATE carts SET updated_at = ? WHERE id = ?', new Date().toISOString(), cartId);
}
