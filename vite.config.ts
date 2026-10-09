import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { openaiMiddleware } from './server/openai.mjs';

export default defineConfig(({ mode }) => {
    const env = { ...loadEnv(mode, '.', ''), ...process.env };
    return {
      base: mode === 'web' ? '/sonic-critic/' : '/',
      define: { 'import.meta.env.VITE_PUBLIC_BYOK': JSON.stringify(mode === 'web' ? 'true' : 'false') },
      server: {
        port: 3000,
        host: '127.0.0.1',
      },
      preview: { host: '127.0.0.1', port: 3000 },
      plugins: [react(), {
        name: 'openai-api',
        configureServer(server) { server.middlewares.use(openaiMiddleware(env)); },
        configurePreviewServer(server) { server.middlewares.use(openaiMiddleware(env)); }
      }],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
