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
 * The SPA talks only to the real API. There is deliberately no localStorage
 * session fallback and no static catalogue fallback: when the API is down we
 * surface an error instead of inventing a signed-in user or stale products.
 */
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
    throw new ApiError(0, 'network_error', 'Could not reach the server. Check your connection and try again.');
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

  if (!response.ok || parsed === null) {
    const shape = parsed as Partial<ApiErrorShape> | null;
    const error = shape?.error;
    throw new ApiError(
      response.status,
      error?.code ?? (parsed === null ? 'invalid_response' : 'request_failed'),
      error?.message ??
        (parsed === null
          ? 'The server returned an unexpected response. If this site is hosted statically, the API is not deployed here.'
          : `The request failed (${response.status}).`),
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
