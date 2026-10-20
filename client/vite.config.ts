import { defineConfig, loadEnv } from 'vite';
import { injectMeta } from '../shared/src/meta.ts';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '..', '');
  return {
    envDir: '..',
    server: {
      port: 5173,
      // Same PORT as the dev server process (root .env, default 3000).
      proxy: { '/api': `http://localhost:${env.PORT || '3000'}` },
    },
    build: { outDir: 'dist', emptyOutDir: true },
    plugins: [
      {
        name: 'page-meta',
        apply: 'serve',
        transformIndexHtml: (html: string) =>
          injectMeta(html, {
            contactEmail: env.CONTACT_EMAIL ?? '',
            sourceUrl: env.SOURCE_URL ?? '',
          }),
      },
    ],
  };
});
