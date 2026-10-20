import type {
  ApiErrorBody,
  ApiErrorCode,
  IngestResponse,
  LeaderboardResponse,
  SubmitScoreRequest,
  SubmitScoreResponse,
  UploadResponse,
} from '@lr/shared/api';
import type { Difficulty } from '@lr/shared/difficulty';

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

/** Uploads face images (ING-7). The server keeps nothing (D-2). */
export function uploadFaces(files: readonly File[]): Promise<UploadResponse> {
  const form = new FormData();
  for (const f of files) form.append('faces', f, f.name);
  return request('/api/faces/upload', { method: 'POST', body: form });
}

export function getLeaderboard(difficulty: Difficulty): Promise<LeaderboardResponse> {
  return request(`/api/leaderboard/${difficulty}`, { method: 'GET' });
}

/** Safe to retry with the same `submissionId`: the server stores a run once. */
export function submitScore(
  difficulty: Difficulty,
  body: SubmitScoreRequest,
): Promise<SubmitScoreResponse> {
  return request(`/api/leaderboard/${difficulty}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}
