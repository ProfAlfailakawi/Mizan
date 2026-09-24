import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

/* مِشْحَنُ سطح المصحف: المكوّنُ الحقيقيّ، والبياناتُ تُحقن من المتصفّح (Playwright). */
export default defineConfig({
  root: __dirname,
  publicDir: path.resolve(__dirname, '../../public'),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      { find: path.resolve(__dirname, '../../src/lib/firebase.ts'), replacement: path.resolve(__dirname, '../face-harness/firebase-stub.ts') },
      { find: /^\.\/firebase$/, replacement: path.resolve(__dirname, '../face-harness/firebase-stub.ts') },
    ],
  },
  server: { host: '127.0.0.1', port: 4174, strictPort: true },
});
