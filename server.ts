import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT || 3000);
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      system: 'MIZAN',
      version: '3.0.0',
      aiCriticalPath: false,
      quranSourcePolicy: 'approved-vault-only',
      time: new Date().toISOString()
    });
  });

  // This route deliberately does not fabricate AI insight. A deployed tenant must
  // connect a scoped repository and an authorized model provider before enabling it.
  app.post('/api/copilot/query', (_req, res) => {
    res.status(501).json({
      code: 'COPILOT_PROVIDER_NOT_CONNECTED',
      message: 'Connect a tenant-scoped telemetry repository and server-side AI provider before enabling MIZAN Copilot.'
    });
  });

  // Never return "authentic" for an arbitrary token. Public verification must query
  // a signed, minimal certificate verification record created by the certificate service.
  app.get('/api/certificates/verify/:token', (_req, res) => {
    res.status(501).json({
      code: 'CERTIFICATE_REPOSITORY_NOT_CONNECTED',
      message: 'Public certificate verification requires the production certificate repository.'
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath, { maxAge: '1h', etag: true }));
    app.get('*', (_req, res) => res.sendFile(path.join(distPath, 'index.html')));
  }

  app.listen(PORT, '0.0.0.0', () => console.log(`MIZAN running on :${PORT}`));
}

startServer().catch(err => { console.error(err); process.exit(1); });
