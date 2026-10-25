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
  } catch {
    throw new ApiError(
      0,
      'network_error',
      'Could not reach the server. Check your connection and try again.',
    );
  }

  const text = await response.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
  }

  if (!response.ok) {
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
