import type { FastifyInstance } from 'fastify';

export function healthRoutes(app: FastifyInstance) {
  app.get('/api/health', async () => ({ status: 'ok' }));
}
