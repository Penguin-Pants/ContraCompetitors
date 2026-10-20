import type { FastifyError, FastifyInstance, FastifyReply } from 'fastify';
import type { ApiErrorBody, ApiErrorCode } from '@lr/shared/api';

export function sendError(
  reply: FastifyReply,
  status: number,
  error: ApiErrorCode,
  message: string,
) {
  const body: ApiErrorBody = { error, message };
  return reply.code(status).send(body);
}

function codeFor(status: number): ApiErrorCode {
  if (status === 404) return 'not_found';
  if (status === 429) return 'rate_limited';
  return status >= 500 ? 'internal' : 'bad_request';
}

/**
 * All API errors use `{ error, message }`. Schema failures are `bad_request`. Unknown `/api`
 * routes are `not_found`; other unknown paths keep a plain-text 404.
 */
export function installErrorHandler(app: FastifyInstance) {
  app.setNotFoundHandler((req, reply) => {
    if (req.url === '/api' || req.url.startsWith('/api/') || req.url.startsWith('/api?'))
      return sendError(reply, 404, 'not_found', 'Not found');
    return reply.code(404).type('text/plain; charset=utf-8').send('Not found');
  });
  app.setErrorHandler((err: FastifyError, req, reply) => {
    if (err.validation) return sendError(reply, 400, 'bad_request', err.message);
    const status =
      err.statusCode && err.statusCode >= 400 && err.statusCode < 500 ? err.statusCode : 500;
    if (status === 500) req.log.error({ err }, 'request failed');
    return sendError(
      reply,
      status,
      codeFor(status),
      status === 500 ? 'Internal error' : err.message,
    );
  });
}
