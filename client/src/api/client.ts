import type { ApiErrorBody, ApiErrorCode, IngestResponse } from '@lr/shared/api';

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;

  constructor(code: ApiErrorCode, status: number, message: string) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

async function request<T>(url: string, init: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new ApiError('unreachable', 0, 'Network error');
  }
  if (res.ok) return (await res.json()) as T;
  let body: Partial<ApiErrorBody> = {};
  try {
    body = (await res.json()) as ApiErrorBody;
  } catch {
    // Non-JSON error body.
  }
  throw new ApiError(body.error ?? 'internal', res.status, body.message ?? `HTTP ${res.status}`);
}

export function ingest(url: string): Promise<IngestResponse> {
  return request('/api/ingest', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url }),
  });
}
