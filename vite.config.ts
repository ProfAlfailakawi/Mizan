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
            // Firestore is reached only through a dynamic import (see lib/firebase.ts), so
            // leave it unassigned and let Rollup give it its own on-demand chunk. Forcing
            // it into vendor-firebase would drag 132 kB gzipped back into the first paint.
            //
            // An earlier attempt pinned it to a *separate eager* chunk instead, which
            // crashed at runtime ("cannot access 'ch' before initialization") because
            // Firebase's packages import each other circularly and the two eager chunks
            // initialised out of order. Behind a dynamic import the ordering is no longer
            // ambiguous: the core chunk is a dependency, so it is always ready first.
            if (id.includes('@firebase/firestore') || id.includes('/firebase/firestore/') ||
                id.includes('/re2js/') || id.includes('webchannel-wrapper')) return undefined;
            if (id.includes('@firebase') || id.includes('/firebase/') || id.includes('/idb/')) return 'vendor-firebase';
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
        : { port: Number(process.env.HMR_PORT || 24678), strictPort: false },
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
