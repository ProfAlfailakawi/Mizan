import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    build: {
      rollupOptions: {
        output: {
          // Vendor code changes on a different clock than MIZAN's own screens. Pinning it
          // to stable chunks means a UI release does not re-download 500 kB of Firebase,
          // and the three largest dependencies fetch in parallel instead of end to end.
          manualChunks(id: string) {
            if (!id.includes('node_modules')) return undefined;
            // Firebase's packages import each other circularly, so they must stay in one
            // chunk: splitting firestore out produced a real "cannot access before
            // initialization" crash at runtime because the chunks initialised out of order.
            if (id.includes('@firebase') || id.includes('/firebase/') || id.includes('/re2js/') || id.includes('/idb/')) return 'vendor-firebase';
            if (id.includes('/react-dom/') || id.includes('/react/') || id.includes('/scheduler/')) return 'vendor-react';
            if (id.includes('lucide-react')) return 'vendor-icons';
            return undefined;
          },
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      // HMR previously bound a hard-coded WebSocket port (24678), so a second MIZAN dev
      // instance on the same machine collided ("Port 24678 is already in use") and lost live
      // reload. Derive the HMR port from the dev PORT so parallel instances never clash;
      // override explicitly with HMR_PORT. strictPort:false lets Vite fall forward rather
      // than failing the socket if the derived port is momentarily taken.
      hmr: process.env.DISABLE_HMR === 'true'
        ? false
        : { port: Number(process.env.HMR_PORT || Number(process.env.PORT || 3000) + 21678), strictPort: false },
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
