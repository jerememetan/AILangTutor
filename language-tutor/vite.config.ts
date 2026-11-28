import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const proxy = {
  // The lesson API compares the browser's Origin with the forwarded Host.
  '/api/lesson': { target: 'http://127.0.0.1:8787', changeOrigin: false },
};

export default defineConfig({
  plugins: [react()],
  server: { proxy },
  preview: { proxy },
});
