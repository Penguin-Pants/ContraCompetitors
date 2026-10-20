import type { FastifyInstance, FastifyRequest } from 'fastify';
import multipart from '@fastify/multipart';
import type { UploadResponse } from '@lr/shared/api';
import type { FaceCrop } from '../faces/crop.ts';
import { PoolRejected, PoolTimeout } from '../faces/pool.ts';
import { toDto } from '../ingest/faceDto.ts';
import { MAX_FACES } from '../ingest/images.ts';
import { sendError } from '../errors.ts';

export const UPLOAD_MAX_FILES = 10;
export const UPLOAD_MAX_BYTES = 5 * 1024 * 1024;

/**
 * POST /api/faces/upload (ING-7, D-2): up to 10 images of 5 MB each, processed in memory with the
 * same decode, detect and crop path. Nothing is written to disk or to the cache.
 */
/**
 * True for a browser request sent by another site. A multipart POST needs no CORS preflight, so
 * without this a third-party page could make its visitors use their upload slots. Requests
 * without these headers (curl, operations scripts) pass.
 */
function crossSite(req: FastifyRequest): boolean {
  const site = req.headers['sec-fetch-site'];
  if (site) return site !== 'same-origin' && site !== 'none';
  const origin = req.headers.origin;
  if (!origin) return false;
  try {
    const o = new URL(origin);
    // Same normalization on both sides (a default port is dropped).
    return o.host !== new URL(`${o.protocol}//${req.host}`).host;
  } catch {
    return true;
  }
}

export async function uploadRoutes(app: FastifyInstance) {
  await app.register(multipart, {
    limits: {
      files: UPLOAD_MAX_FILES,
      fileSize: UPLOAD_MAX_BYTES,
      fields: 0,
      parts: UPLOAD_MAX_FILES,
    },
  });
  app.post('/api/faces/upload', async (req, reply) => {
    const s = app.services;
    if (crossSite(req))
      return sendError(reply, 403, 'bad_request', 'Uploads must come from this site.');
    if (!req.isMultipart())
      return sendError(reply, 400, 'upload_rejected', 'Send images as multipart/form-data.');
    if (!s.uploadLimiter.tryConsume(req.ip)) {
      return sendError(
        reply,
        429,
        'rate_limited',
        'Too many uploads from your network. Try again later.',
      );
    }
    const deadline = s.clock() + s.ingestionMs;
    const faces = new Map<string, FaceCrop>();
    let accepted = 0;
    let rejected = 0;
    try {
      for await (const part of req.files()) {
        // In memory only: the file stream goes to a Buffer, never to a temp file.
        const bytes = await part.toBuffer();
        try {
          const crops = await s.detect(bytes, deadline - s.clock());
          accepted++;
          for (const c of crops) if (faces.size < MAX_FACES) faces.set(c.id, c);
        } catch (err) {
          if (!(err instanceof PoolRejected)) throw err;
          rejected++;
        }
      }
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === 'FST_REQ_FILE_TOO_LARGE')
        return sendError(reply, 400, 'upload_rejected', 'Each image must be 5 MB or less.');
      if (code === 'FST_FILES_LIMIT' || code === 'FST_PARTS_LIMIT') {
        return sendError(
          reply,
          400,
          'upload_rejected',
          `Upload at most ${UPLOAD_MAX_FILES} images.`,
        );
      }
      if (err instanceof PoolTimeout) {
        return sendError(reply, 400, 'upload_rejected', 'The images took too long to process.');
      }
      throw err;
    }
    if (accepted === 0) {
      return sendError(
        reply,
        400,
        'upload_rejected',
        rejected ? 'Only JPEG, PNG, WebP or GIF images are accepted.' : 'No images received.',
      );
    }
    req.log.info(
      { outcome: 'ok', files: accepted + rejected, rejected, faces: faces.size },
      'upload',
    );
    const res: UploadResponse = { faces: [...faces.values()].map(toDto) };
    return res;
  });
}
