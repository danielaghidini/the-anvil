import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
export default defineConfig({ root: resolve('frontend'), plugins: [react(), { name: 'watch-shared', configureServer(server) { server.watcher.add(resolve('shared')); } }], server: { port: Number(process.env.FOLLOWER_WEB_PORT || 5173), host: '127.0.0.1', proxy: { '/api': `http://127.0.0.1:${Number(process.env.FOLLOWER_PORT || 4318)}` } }, build: { outDir: resolve('dist'), emptyOutDir: true } });
