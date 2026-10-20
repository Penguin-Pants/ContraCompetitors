import type { Difficulty } from './difficulty.ts';

/** A cropped face. `id` is the SHA-256 of the crop bytes; it is stable for the life of the store. */
export interface FaceDto {
  id: string;
  dataUrl: string;
  width: number;
  height: number;
}

export interface IngestRequest {
  url: string;
}

export interface IngestResponse {
  domain: string;
  /** 0, 1 or 2 brand colors as `#rrggbb`. */
  colors: string[];
  faces: FaceDto[];
  partial: boolean;
  source: 'cache' | 'static' | 'headless';
}

export interface UploadResponse {
  faces: FaceDto[];
}

export const API_ERROR_CODES = [
  'invalid_url',
  'unreachable',
  'blocked_domain',
  'rate_limited',
  'bad_request',
  'not_found',
  'upload_rejected',
  'busy',
  'internal',
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export interface ApiErrorBody {
  error: ApiErrorCode;
  message: string;
}

export interface ScoreRow {
  id: number;
  initials: string;
  timeMs: number;
  createdAt: number;
}

export interface LeaderboardResponse {
  difficulty: Difficulty;
  rows: ScoreRow[];
}

export interface SubmitScoreRequest {
  submissionId: string;
  initials: string;
  timeMs: number;
}

export interface SubmitScoreResponse extends LeaderboardResponse {
  /** The stored row id, or null when the run did not place in the Top 10. */
  rowId: number | null;
}
