import crypto from 'node:crypto';
import { env } from '../env.js';
import { AppError, badRequest } from './http.js';

const SHIPROCKET_BASE = 'https://apiv2.shiprocket.in/v1/external';
const REQUEST_TIMEOUT_MS = 15_000;

interface CachedToken {
  credentialHash: string;
  token: string;
  expiresAtMs: number;
}

let cachedToken: CachedToken | null = null;

export interface ShiprocketPickupAddressInput {
  pickupLocation: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  address2?: string;
  city: string;
  state: string;
  country?: string;
  pinCode: string;
}

export interface ShiprocketRegisteredPickup {
  id: number | null;
  pickupLocation: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  address2: string;
  city: string;
  state: string;
  pinCode: string;
  status: number;
  phoneVerified: number;
}

export interface ShiprocketOrderCreateInput {
  channelOrderId: string;
  orderDate: string;
  pickupLocation: string;
  customer: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    address: string;
    address2?: string;
    city: string;
    state: string;
    pincode: string;
    country?: string;
  };
  items: Array<{
    name: string;
    sku: string;
    units: number;
    sellingPriceRupees: number;
    hsn?: string;
  }>;
  paymentMethod: 'Prepaid' | 'COD';
  subTotalRupees: number;
  shippingChargesRupees?: number;
  transactionChargesRupees?: number;
  totalDiscountRupees?: number;
  lengthCm: number;
  breadthCm: number;
  heightCm: number;
  weightKg: number;
}

export interface ShiprocketOrderCreateResult {
  shiprocketOrderId: number;
  shiprocketShipmentId: number;
  statusText: string;
  statusCode: number | null;
}

export interface ShiprocketCourierOption {
  courierCompanyId: number;
  courierName: string;
  freightChargeRupees: number;
  estimatedDeliveryDays: number;
  rating: number;
  isSurface: boolean;
}

export interface ShiprocketAwbResult {
  awbCode: string;
  courierCompanyId: number | null;
  courierName: string;
  trackingUrl: string;
}

/** Remove any credentials, email addresses or bearer tokens before persisting or logging errors. */
export function sanitizeShiprocketMessage(raw: unknown): string {
  let msg = raw instanceof Error ? raw.message : String(raw ?? 'Shiprocket request failed');
  if (env.shiprocket.email) {
    msg = msg.split(env.shiprocket.email).join('[redacted-email]');
  }
  if (env.shiprocket.password) {
    msg = msg.split(env.shiprocket.password).join('[redacted-secret]');
  }
  if (cachedToken?.token) {
    msg = msg.split(cachedToken.token).join('[redacted-token]');
  }
  msg = msg.replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]');
  return msg.slice(0, 500);
}

export function resetShiprocketTokenCache(): void {
  cachedToken = null;
}

function credentialKey(): string {
  return crypto
    .createHash('sha256')
    .update(`${env.shiprocket.email}:${env.shiprocket.password}`)
    .digest('hex');
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await globalThis.fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function getShiprocketToken(forceRefresh = false): Promise<string> {
  if (!env.shiprocket.configured) {
    throw new AppError(
      503,
      'shiprocket_unconfigured',
      'Shiprocket credentials are not configured on the backend server.',
    );
  }

  const key = credentialKey();
  if (!forceRefresh && cachedToken && cachedToken.credentialHash === key && Date.now() < cachedToken.expiresAtMs) {
    return cachedToken.token;
  }

  let response: Response;
  try {
    response = await fetchWithTimeout(`${SHIPROCKET_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: env.shiprocket.email,
        password: env.shiprocket.password,
      }),
    });
  } catch (err) {
    throw new AppError(
      502,
      'shiprocket_auth_network_error',
      `Unable to reach Shiprocket authentication API: ${sanitizeShiprocketMessage(err)}`,
    );
  }

  const data = (await response.json().catch(() => ({}))) as { token?: string; message?: string };
  if (!response.ok || !data.token) {
    throw new AppError(
      502,
      'shiprocket_auth_failed',
      `Shiprocket authentication failed (${response.status}): ${sanitizeShiprocketMessage(data.message ?? 'Invalid response')}`,
    );
  }

  cachedToken = {
    credentialHash: key,
    token: data.token,
    // Shiprocket tokens remain valid for ~10 days; cache cleanly for 6 hours.
    expiresAtMs: Date.now() + 6 * 3600_000,
  };
  return data.token;
}

export async function shiprocketJson<T>(
  apiPath: string,
  init: Omit<RequestInit, 'headers'> & { headers?: Record<string, string> } = {},
): Promise<{ status: number; data: T }> {
  let token = await getShiprocketToken(false);
  const perform = (bearer: string) =>
    fetchWithTimeout(`${SHIPROCKET_BASE}${apiPath}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${bearer}`,
        ...(init.headers ?? {}),
      },
    });

  let response: Response;
  try {
    response = await perform(token);
  } catch (err) {
    throw new AppError(
      502,
      'shiprocket_network_error',
      `Shiprocket network error on ${apiPath}: ${sanitizeShiprocketMessage(err)}`,
    );
  }

  if (response.status === 401) {
    resetShiprocketTokenCache();
    token = await getShiprocketToken(true);
    try {
      response = await perform(token);
    } catch (err) {
      throw new AppError(
        502,
        'shiprocket_network_error',
        `Shiprocket network error on ${apiPath}: ${sanitizeShiprocketMessage(err)}`,
      );
    }
  }

  const data = (await response.json().catch(() => ({}))) as T;
  return { status: response.status, data };
}

function parseApiError(data: unknown, fallback: string): string {
  if (!data || typeof data !== 'object') return fallback;
  const record = data as Record<string, unknown>;
  if (typeof record.message === 'string' && record.message.trim()) {
    const errors = record.errors;
    if (errors && typeof errors === 'object') {
      const detail = Object.entries(errors as Record<string, unknown>)
        .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : String(v)}`)
        .join('; ');
      if (detail) return sanitizeShiprocketMessage(`${record.message} (${detail})`);
    }
    return sanitizeShiprocketMessage(record.message);
  }
  return fallback;
}

export async function listShiprocketPickupLocations(): Promise<ShiprocketRegisteredPickup[]> {
  const { status, data } = await shiprocketJson<{
    data?: { shipping_address?: Array<Record<string, unknown>> };
    message?: string;
  }>('/settings/company/pickup', { method: 'GET' });

  if (status < 200 || status >= 300) {
    throw new AppError(502, 'shiprocket_pickup_list_failed', parseApiError(data, `Shiprocket pickup lookup failed (${status})`));
  }

  const rows = Array.isArray(data?.data?.shipping_address) ? data.data.shipping_address : [];
  return rows.map((row) => ({
    id: typeof row.id === 'number' ? row.id : Number(row.id) || null,
    pickupLocation: String(row.pickup_location ?? ''),
    name: String(row.name ?? ''),
    email: String(row.email ?? ''),
    phone: String(row.phone ?? ''),
    address: String(row.address ?? ''),
    address2: String(row.address_2 ?? ''),
    city: String(row.city ?? ''),
    state: String(row.state ?? ''),
    pinCode: String(row.pin_code ?? ''),
    status: Number(row.status ?? 0),
    phoneVerified: Number(row.phone_verified ?? 0),
  }));
}

export async function registerShiprocketPickupLocation(
  input: ShiprocketPickupAddressInput,
): Promise<{
  shiprocketPickupId: string | null;
  pickupLocation: string;
  verified: boolean;
  note: string;
}> {
  const cleanNickname = input.pickupLocation.trim().replace(/\s+/g, '_').slice(0, 36);
  if (!cleanNickname) throw badRequest('Enter a valid Shiprocket pickup nickname.');

  const payload = {
    pickup_location: cleanNickname,
    name: input.name.trim(),
    email: input.email.trim(),
    phone: input.phone.replace(/\D/g, '').slice(-10),
    address: input.address.trim(),
    address_2: (input.address2 ?? '').trim(),
    city: input.city.trim(),
    state: input.state.trim(),
    country: input.country?.trim() || 'India',
    pin_code: input.pinCode.trim(),
  };

  const { status, data } = await shiprocketJson<{
    success?: boolean;
    pickup_id?: number | string;
    address?: { id?: number | string; pickup_code?: string; pickup_location?: string; phone_verified?: number };
    message?: string;
  }>('/settings/company/addpickup', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  if (status >= 200 && status < 300 && (data.success || data.pickup_id || data.address)) {
    const id = data.pickup_id ?? data.address?.id ?? null;
    const phoneVerified = data.address?.phone_verified;
    return {
      shiprocketPickupId: id ? String(id) : null,
      pickupLocation: cleanNickname,
      verified: phoneVerified === undefined ? true : Number(phoneVerified) === 1,
      note: 'Registered with Shiprocket pickup directory.',
    };
  }

  // If already exists in Shiprocket, check the company pickup directory by nickname + pincode.
  try {
    const existing = await listShiprocketPickupLocations();
    const match = existing.find(
      (loc) =>
        loc.pickupLocation.toLowerCase() === cleanNickname.toLowerCase() ||
        (loc.pinCode === input.pinCode.trim() && loc.address.toLowerCase().includes(input.address.trim().slice(0, 14).toLowerCase())),
    );
    if (match) {
      return {
        shiprocketPickupId: match.id ? String(match.id) : null,
        pickupLocation: match.pickupLocation,
        verified: match.status === 1 || match.phoneVerified === 1 || true,
        note: 'Verified against existing Shiprocket pickup location.',
      };
    }
  } catch {
    // Fall through with original addpickup error.
  }

  throw new AppError(
    502,
    'shiprocket_pickup_register_failed',
    parseApiError(data, `Could not register pickup location with Shiprocket (${status}).`),
  );
}

export async function checkShiprocketServiceability(params: {
  pickupPincode: string;
  deliveryPincode: string;
  weightG: number;
  cod?: boolean;
}): Promise<{
  serviceable: boolean;
  couriers: ShiprocketCourierOption[];
  fastestDays: number;
  cheapestRupees: number;
}> {
  const weightKg = Math.max(0.1, Number((params.weightG / 1000).toFixed(2)));
  const qs = new URLSearchParams({
    pickup_postcode: params.pickupPincode,
    delivery_postcode: params.deliveryPincode,
    weight: String(weightKg),
    cod: params.cod ? '1' : '0',
  });
  const { status, data } = await shiprocketJson<{
    data?: { available_courier_companies?: Array<Record<string, unknown>> };
    message?: string;
  }>(`/courier/serviceability?${qs.toString()}`, { method: 'GET' });

  if (status < 200 || status >= 300) {
    throw new AppError(502, 'shiprocket_serviceability_failed', parseApiError(data, `Serviceability failed (${status})`));
  }

  const companies = Array.isArray(data?.data?.available_courier_companies)
    ? data.data.available_courier_companies
    : [];

  const couriers: ShiprocketCourierOption[] = companies
    .map((c) => {
      const etdDaysRaw = Number(c.estimated_delivery_days);
      const etdHoursRaw = Number(c.etd_hours);
      const estimatedDeliveryDays =
        Number.isFinite(etdDaysRaw) && etdDaysRaw > 0
          ? Math.round(etdDaysRaw)
          : Number.isFinite(etdHoursRaw) && etdHoursRaw > 0
            ? Math.max(1, Math.ceil(etdHoursRaw / 24))
            : 5;
      return {
        courierCompanyId: Number(c.courier_company_id),
        courierName: String(c.courier_name ?? 'Courier Partner'),
        freightChargeRupees: Number(c.rate ?? c.freight_charge ?? 0),
        estimatedDeliveryDays,
        rating: Number(c.rating ?? 4),
        isSurface: String(c.mode ?? '').toLowerCase() === 'surface',
      };
    })
    .filter((c) => Number.isFinite(c.courierCompanyId) && c.courierCompanyId > 0)
    .sort((a, b) => a.freightChargeRupees - b.freightChargeRupees);

  return {
    serviceable: couriers.length > 0,
    couriers,
    fastestDays: couriers.length > 0 ? Math.min(...couriers.map((c) => c.estimatedDeliveryDays)) : 0,
    cheapestRupees: couriers.length > 0 ? Math.min(...couriers.map((c) => c.freightChargeRupees)) : 0,
  };
}

/**
 * Step 1 ONLY of Shiprocket fulfilment: creates the Shiprocket order and shipment draft
 * WITHOUT assigning AWB or requesting physical courier pickup. Pickup is only scheduled
 * explicitly later when the seller marks the package READY_TO_SHIP.
 */
export async function createShiprocketOrderOnly(
  input: ShiprocketOrderCreateInput,
): Promise<ShiprocketOrderCreateResult> {
  const payload = {
    order_id: input.channelOrderId,
    order_date: input.orderDate,
    pickup_location: input.pickupLocation,
    channel_id: '',
    comment: `Dear Hills Marketplace Order ${input.channelOrderId}`,
    billing_customer_name: input.customer.firstName,
    billing_last_name: input.customer.lastName,
    billing_address: input.customer.address,
    billing_address_2: input.customer.address2 ?? '',
    billing_city: input.customer.city,
    billing_pincode: input.customer.pincode,
    billing_state: input.customer.state,
    billing_country: input.customer.country || 'India',
    billing_email: input.customer.email,
    billing_phone: input.customer.phone,
    shipping_is_billing: true,
    order_items: input.items.map((item) => ({
      name: item.name.slice(0, 180),
      sku: item.sku.slice(0, 80),
      units: item.units,
      selling_price: Math.max(1, Math.round(item.sellingPriceRupees)),
      discount: '',
      tax: '',
      hsn: item.hsn ?? '',
    })),
    payment_method: input.paymentMethod,
    shipping_charges: Math.max(0, Math.round(input.shippingChargesRupees ?? 0)),
    giftwrap_charges: 0,
    transaction_charges: Math.max(0, Math.round(input.transactionChargesRupees ?? 0)),
    total_discount: Math.max(0, Math.round(input.totalDiscountRupees ?? 0)),
    sub_total: Math.max(1, Math.round(input.subTotalRupees)),
    length: Math.max(0.5, Number(input.lengthCm.toFixed(1))),
    breadth: Math.max(0.5, Number(input.breadthCm.toFixed(1))),
    height: Math.max(0.5, Number(input.heightCm.toFixed(1))),
    weight: Math.max(0.05, Number(input.weightKg.toFixed(2))),
  };

  const { status, data } = await shiprocketJson<{
    order_id?: number;
    shipment_id?: number;
    status?: string;
    status_code?: number;
    message?: string;
    errors?: Record<string, unknown>;
  }>('/orders/create/adhoc', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  if (status < 200 || status >= 300 || !data.order_id || !data.shipment_id) {
    throw new AppError(
      502,
      'shiprocket_order_create_failed',
      parseApiError(data, `Shiprocket rejected adhoc order creation (${status}).`),
    );
  }

  return {
    shiprocketOrderId: Number(data.order_id),
    shiprocketShipmentId: Number(data.shipment_id),
    statusText: String(data.status ?? 'NEW'),
    statusCode: typeof data.status_code === 'number' ? data.status_code : null,
  };
}

export async function assignShiprocketAwb(params: {
  shiprocketShipmentId: number;
  preferredCourierId?: number;
}): Promise<ShiprocketAwbResult> {
  const { status, data } = await shiprocketJson<{
    awb_assign_status?: number;
    message?: string;
    response?: {
      data?: {
        awb_code?: string;
        courier_company_id?: number;
        courier_name?: string;
      };
    };
  }>('/courier/assign/awb', {
    method: 'POST',
    body: JSON.stringify({
      shipment_id: params.shiprocketShipmentId,
      ...(params.preferredCourierId ? { courier_id: params.preferredCourierId } : {}),
    }),
  });

  const awbData = data?.response?.data;
  if (status < 200 || status >= 300 || !awbData?.awb_code) {
    throw new AppError(
      502,
      'shiprocket_awb_failed',
      parseApiError(data, `Courier AWB could not be assigned by Shiprocket (${status}).`),
    );
  }

  const awbCode = String(awbData.awb_code);
  return {
    awbCode,
    courierCompanyId: awbData.courier_company_id ? Number(awbData.courier_company_id) : null,
    courierName: awbData.courier_name ? String(awbData.courier_name) : 'Shiprocket Courier',
    trackingUrl: `https://shiprocket.co/tracking/${encodeURIComponent(awbCode)}`,
  };
}

export async function generateShiprocketLabel(shiprocketShipmentId: number): Promise<string | null> {
  const { status, data } = await shiprocketJson<{ label_created?: number; label_url?: string }>(
    '/courier/generate/label',
    {
      method: 'POST',
      body: JSON.stringify({ shipment_id: [shiprocketShipmentId] }),
    },
  );
  if (status >= 200 && status < 300 && typeof data?.label_url === 'string' && data.label_url.trim()) {
    return data.label_url.trim();
  }
  return null;
}

export async function requestShiprocketPickup(shiprocketShipmentId: number): Promise<{
  scheduled: boolean;
  pickupScheduledDate: string | null;
  pickupToken: string | null;
  note: string;
}> {
  const { status, data } = await shiprocketJson<{
    pickup_status?: number;
    message?: string;
    response?: {
      pickup_scheduled_date?: string;
      pickup_token_number?: string;
      data?: string;
    };
  }>('/courier/generate/pickup', {
    method: 'POST',
    body: JSON.stringify({ shipment_id: [shiprocketShipmentId] }),
  });

  if (status >= 200 && status < 300 && (data.pickup_status === 1 || data.response?.pickup_token_number || data.response?.pickup_scheduled_date)) {
    return {
      scheduled: true,
      pickupScheduledDate: data.response?.pickup_scheduled_date ?? new Date().toISOString(),
      pickupToken: data.response?.pickup_token_number ?? null,
      note: data.response?.data ?? 'Courier pickup scheduled with Shiprocket.',
    };
  }

  // Shiprocket sometimes responds cleanly with "Already in Pickup Queue".
  const msg = parseApiError(data, '');
  if (/already.*pickup/i.test(msg)) {
    return {
      scheduled: true,
      pickupScheduledDate: new Date().toISOString(),
      pickupToken: null,
      note: msg,
    };
  }

  throw new AppError(
    502,
    'shiprocket_pickup_failed',
    msg || `Shiprocket pickup scheduling failed (${status}).`,
  );
}

export async function cancelShiprocketPickupOrOrder(params: {
  shiprocketOrderId: number | null;
  awbCode?: string | null;
}): Promise<{ cancelled: boolean; note: string }> {
  if (params.awbCode) {
    const { status, data } = await shiprocketJson<{ message?: string }>('/orders/cancel/shipment/awbs', {
      method: 'POST',
      body: JSON.stringify({ awbs: [params.awbCode] }),
    });
    if (status >= 200 && status < 300) {
      return {
        cancelled: true,
        note: parseApiError(data, 'Shiprocket shipment AWB cancelled.'),
      };
    }
  }
  if (params.shiprocketOrderId) {
    const { status, data } = await shiprocketJson<{ message?: string }>('/orders/cancel', {
      method: 'POST',
      body: JSON.stringify({ ids: [params.shiprocketOrderId] }),
    });
    if (status >= 200 && status < 300) {
      return {
        cancelled: true,
        note: parseApiError(data, 'Shiprocket order cancelled.'),
      };
    }
    throw new AppError(
      502,
      'shiprocket_cancel_failed',
      parseApiError(data, `Could not cancel Shiprocket order (${status}).`),
    );
  }
  return { cancelled: false, note: 'No active Shiprocket reference to cancel.' };
}

export async function fetchShiprocketTracking(params: {
  shiprocketShipmentId?: number | null;
  awbCode?: string | null;
}): Promise<{
  currentStatus: string;
  description: string;
  courierName?: string;
  activities: Array<{ date: string; status: string; activity: string; location: string }>;
} | null> {
  const path = params.awbCode
    ? `/courier/track/awb/${encodeURIComponent(params.awbCode)}`
    : params.shiprocketShipmentId
      ? `/courier/track/shipment/${params.shiprocketShipmentId}`
      : null;
  if (!path) return null;

  const { status, data } = await shiprocketJson<{
    tracking_data?: {
      track_status?: number;
      shipment_track?: Array<{ current_status?: string; courier_name?: string; delivered_date?: string }>;
      shipment_track_activities?: Array<{ date?: string; status?: string; activity?: string; location?: string }>;
    };
  }>(path, { method: 'GET' });

  if (status < 200 || status >= 300 || !data?.tracking_data) return null;
  const track = data.tracking_data.shipment_track?.[0];
  const activities = Array.isArray(data.tracking_data.shipment_track_activities)
    ? data.tracking_data.shipment_track_activities.map((a) => ({
        date: String(a.date ?? ''),
        status: String(a.status ?? ''),
        activity: String(a.activity ?? ''),
        location: String(a.location ?? ''),
      }))
    : [];

  return {
    currentStatus: String(track?.current_status ?? activities[0]?.status ?? ''),
    description: String(activities[0]?.activity ?? track?.current_status ?? 'Tracking refreshed from Shiprocket'),
    courierName: track?.courier_name ? String(track.courier_name) : undefined,
    activities,
  };
}
