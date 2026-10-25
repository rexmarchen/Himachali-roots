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

type ApiOptions = Omit<RequestInit, 'body'> & { body?: unknown };

async function getStaticFallback<T>(path: string): Promise<T | null> {
  const cleanPath = path.split('?')[0];

  try {
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
      if (res.ok) return (await res.json()) as T;
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
    if (cleanPath === '/auth/me') {
      return { user: null } as unknown as T;
    }
    if (cleanPath === '/cart' || cleanPath === '/cart/items') {
      return {
        cart: {
          id: 'guest',
          items: [],
          subtotalPaise: 0,
          shippingPaise: 0,
          discountPaise: 0,
          totalPaise: 0,
          freeShippingRemainingPaise: null,
          appliedCoupon: null,
          itemCount: 0,
        },
      } as unknown as T;
    }
    if (cleanPath === '/account/wishlist') {
      return { items: [] } as unknown as T;
    }
  } catch {
    // ignore fallback fetch error
  }

  return null;
}

export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const { body, headers, ...rest } = options;
  const isForm = body instanceof FormData;
  let response: Response;

  try {
    response = await fetch(`/api${path}`, {
      credentials: 'same-origin',
      ...rest,
      headers: {
        ...CSRF_HEADER,
        ...(isForm || body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(headers as Record<string, string> | undefined),
      },
      body: isForm ? body : body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (networkError) {
    const fallback = await getStaticFallback<T>(path);
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

  // If response is not ok or is not JSON (e.g. 404 or static host SPA rewrite returning HTML)
  if (!response.ok || parsed === null) {
    const fallback = await getStaticFallback<T>(path);
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
