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

/** All API errors use `{ error, message }`. Schema failures are `bad_request`. */
export function installErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((err: FastifyError, req, reply) => {
    if (err.validation) return sendError(reply, 400, 'bad_request', err.message);
    const status =
      err.statusCode && err.statusCode >= 400 && err.statusCode < 500 ? err.statusCode : 500;
    if (status === 500) req.log.error({ err }, 'request failed');
    return sendError(
      reply,
      status,
      status === 500 ? 'internal' : 'bad_request',
      status === 500 ? 'Internal error' : err.message,
    );
  });
}
