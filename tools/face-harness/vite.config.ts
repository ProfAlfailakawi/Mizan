import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

/* بناءُ المِشْحَن وحدَه: الهويّةُ تُستبدل، وما سواها الشيفرةُ الحقيقيّةُ كما هي. */
export default defineConfig({
  root: __dirname,
  /* وأنماطُ الشاشة الحقيقيّة (Tailwind وindex.css) — فتُصوَّر كما يراها الطالب. */
  plugins: [react(), tailwindcss()],
  publicDir: path.resolve(__dirname, '../../public'),
  resolve: {
    alias: [
      { find: path.resolve(__dirname, '../../src/lib/firebase.ts'), replacement: path.resolve(__dirname, 'firebase-stub.ts') },
      { find: /^\.\/firebase$/, replacement: path.resolve(__dirname, 'firebase-stub.ts') },
    ],
  },
  server: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
    /* الشاشةُ تنادي مسارَها على أصلها، فيُمرَّر إلى خادم المِشْحَن. */
    proxy: { '/api': { target: 'http://127.0.0.1:4322', changeOrigin: false } },
  },
});
