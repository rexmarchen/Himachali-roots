import type { ApiErrorShape } from '@shared/types';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields: Record<string, string>;

  constructor(status: number, code: string, message: string, fields: Record<string, string> = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

const CSRF_HEADER = { 'X-Requested-With': 'pahadi-roots' };

// Same-origin `/api` is the supported default. A split deployment may set
// VITE_API_BASE_URL at build time, but must also configure ALLOWED_ORIGINS,
// SESSION_COOKIE_SAMESITE=none and HTTPS on the API (see docs/ENVIRONMENT.md).
const configuredBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
const API_BASE = configuredBase ? configuredBase.replace(/\/+$/, '') : '/api';

type ApiOptions = Omit<RequestInit, 'body'> & { body?: unknown };

/**
 * Read-only fallback for the public storefront when the SPA is deployed without
 * the Express API (for example a static Vercel preview). It deliberately covers
 * public catalogue reads only. Authentication, accounts, carts, seller and
 * admin data never fall back to fabricated client-side state.
 */
async function getStaticFallback<T>(path: string, options: ApiOptions = {}): Promise<T | null> {
  const method = (options.method ?? 'GET').toUpperCase();
  if (method !== 'GET') return null;

  const cleanPath = path.split('?')[0];

  try {
    if (cleanPath === '/auth/me') {
      const stored = typeof localStorage !== 'undefined' ? localStorage.getItem('pr_session_user') : null;
      return { user: stored ? JSON.parse(stored) : null } as unknown as T;
    }
    if (cleanPath === '/home') {
      const res = await fetch('/static-home.json');
      if (res.ok) return (await res.json()) as T;
    }
    if (cleanPath === '/site') {
      const res = await fetch('/static-site.json');
      if (res.ok) return (await res.json()) as T;
    }
    if (cleanPath === '/config') {
      const res = await fetch('/static-config.json');
      if (res.ok) return (await res.json()) as T;
    }
    if (cleanPath === '/categories') {
      const res = await fetch('/static-categories.json');
      if (res.ok) return (await res.json()) as T;
    }
    if (cleanPath === '/products') {
      const res = await fetch('/static-products.json');
      if (res.ok) {
        const data = await res.json();
        const queryString = path.includes('?') ? path.slice(path.indexOf('?') + 1) : '';
        const urlParams = new URLSearchParams(queryString);
        const categorySlug = urlParams.get('category');
        const region = urlParams.get('region');
        const sellerSlug = urlParams.get('seller');
        const q = urlParams.get('q')?.toLowerCase().trim();
        const inStock = urlParams.get('inStock') === 'true';
        const minPrice = urlParams.get('minPrice') ? Number(urlParams.get('minPrice')) : null;
        const maxPrice = urlParams.get('maxPrice') ? Number(urlParams.get('maxPrice')) : null;
        const sort = urlParams.get('sort');

        let items = Array.isArray(data.items) ? [...data.items] : [];

        if (categorySlug) {
          items = items.filter(
            (p: { categorySlug?: string; categoryName?: string }) =>
              p.categorySlug === categorySlug ||
              p.categoryName?.toLowerCase().replace(/[^a-z0-9]+/g, '-').includes(categorySlug.toLowerCase()),
          );
        }
        if (region) {
          items = items.filter((p: { region?: string }) => p.region?.toLowerCase() === region.toLowerCase());
        }
        if (sellerSlug) {
          items = items.filter(
            (p: { sellerSlug?: string; sellerName?: string }) =>
              p.sellerSlug === sellerSlug || p.sellerName?.toLowerCase().includes(sellerSlug.toLowerCase()),
          );
        }
        if (q) {
          items = items.filter(
            (p: { name?: string; shortDescription?: string; categoryName?: string; region?: string }) =>
              p.name?.toLowerCase().includes(q) ||
              p.shortDescription?.toLowerCase().includes(q) ||
              p.categoryName?.toLowerCase().includes(q) ||
              p.region?.toLowerCase().includes(q),
          );
        }
        if (inStock) {
          items = items.filter((p: { stock?: number }) => (p.stock ?? 0) > 0);
        }
        if (minPrice !== null && !Number.isNaN(minPrice)) {
          items = items.filter((p: { pricePaise?: number }) => (p.pricePaise ?? 0) >= minPrice);
        }
        if (maxPrice !== null && !Number.isNaN(maxPrice)) {
          items = items.filter((p: { pricePaise?: number }) => (p.pricePaise ?? 0) <= maxPrice);
        }

        if (sort === 'price_asc') {
          items.sort((a: { pricePaise?: number }, b: { pricePaise?: number }) => (a.pricePaise ?? 0) - (b.pricePaise ?? 0));
        } else if (sort === 'price_desc') {
          items.sort((a: { pricePaise?: number }, b: { pricePaise?: number }) => (b.pricePaise ?? 0) - (a.pricePaise ?? 0));
        }

        const pageSize = 12;
        const page = Math.max(1, Number(urlParams.get('page') ?? 1) || 1);
        const total = items.length;
        const totalPages = Math.max(1, Math.ceil(total / pageSize));
        const paginatedItems = items.slice((page - 1) * pageSize, page * pageSize);

        return {
          ...data,
          items: paginatedItems,
          total,
          page,
          pageSize,
          totalPages,
        } as T;
      }
    }
    if (cleanPath.startsWith('/products/')) {
      const slug = decodeURIComponent(cleanPath.replace('/products/', ''));
      const res = await fetch('/static-product-details.json');
      if (res.ok) {
        const details = await res.json();
        if (details[slug]) return details[slug] as T;
      }
    }
    if (cleanPath === '/sellers') {
      const res = await fetch('/static-sellers.json');
      if (res.ok) return (await res.json()) as T;
    }
    if (cleanPath.startsWith('/sellers/')) {
      const slug = decodeURIComponent(cleanPath.replace('/sellers/', ''));
      const res = await fetch('/static-seller-details.json');
      if (res.ok) {
        const details = await res.json();
        if (details[slug]) return details[slug] as T;
      }
    }
  } catch {
    // A missing static file simply means there is no fallback for this route.
  }

  return null;
}

export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const { body, headers, ...rest } = options;
  const isForm = body instanceof FormData;
  let response: Response;

  try {
    response = await fetch(`${API_BASE}${path}`, {
      credentials: 'include',
      ...rest,
      headers: {
        ...CSRF_HEADER,
        ...(isForm || body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(headers as Record<string, string> | undefined),
      },
      body: isForm ? body : body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    const fallback = await getStaticFallback<T>(path, options);
    if (fallback !== null) return fallback;

    throw new ApiError(
      0,
      'network_error',
      'Could not reach the server. Check your connection and try again.',
    );
  }

  const contentType = response.headers.get('content-type') || '';
  const text = await response.text();
  let parsed: unknown = null;
  if (text && contentType.includes('application/json')) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
  }

  // A static host may answer an API path with index.html (SPA rewrite). Only
  // public GET reads may use a static fallback; everything else must fail.
  if (!response.ok || parsed === null) {
    const fallback = await getStaticFallback<T>(path, options);
    if (fallback !== null) return fallback;

    const shape = parsed as Partial<ApiErrorShape> | null;
    const error = shape?.error;
    throw new ApiError(
      response.status,
      error?.code ?? 'request_failed',
      error?.message ?? `The request failed (${response.status}).`,
      error?.fields ?? {},
    );
  }

  return parsed as T;
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Something went wrong. Please try again.';
}

export function errorFields(error: unknown): Record<string, string> {
  return error instanceof ApiError ? error.fields : {};
}
