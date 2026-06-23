import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

// Порт бэкенда (apps/api) для dev-proxy. По умолчанию 3000.
const API_PORT = process.env.PORT || '3000';

export default defineConfig({
  plugins: [react()],
  // VITE_* переменные читаем из общего .env в корне монорепо.
  envDir: resolve(here, '../../'),
  server: {
    host: true, // слушать 0.0.0.0 — нужно для доступа через туннель
    allowedHosts: true, // принимать любой Host (cloudflared/ngrok дают случайный домен)
    // Один туннель: фронт проксирует API-маршруты на локальный бэкенд,
    // поэтому второй туннель и CORS в деве не нужны. Только dev-режим.
    proxy: {
      '/auth': { target: `http://localhost:${API_PORT}`, changeOrigin: true },
      '/me': { target: `http://localhost:${API_PORT}`, changeOrigin: true },
      '/lots': { target: `http://localhost:${API_PORT}`, changeOrigin: true },
      '/admin': { target: `http://localhost:${API_PORT}`, changeOrigin: true },
      '/media': { target: `http://localhost:${API_PORT}`, changeOrigin: true },
      '/profiles': { target: `http://localhost:${API_PORT}`, changeOrigin: true },
      '/support': { target: `http://localhost:${API_PORT}`, changeOrigin: true },
      '/health': { target: `http://localhost:${API_PORT}`, changeOrigin: true },
    },
  },
});
