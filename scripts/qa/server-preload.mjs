// Preload for the app server in QA: Google's public cert endpoint is replaced by the rig's cert so
// the REAL token verification code runs against rig-minted tokens. Nothing else is altered.
import fs from 'node:fs';
import path from 'node:path';
const dir = process.env.MIZAN_QA_DIR || path.join(process.cwd(), '.mizan-data', 'qa');
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input?.url || String(input);
  if (url.includes('robot/v1/metadata/x509/securetoken@system.gserviceaccount.com')) {
    const cert = fs.readFileSync(path.join(dir, 'jwt.crt'), 'utf8');
    return new Response(JSON.stringify({ 'qa-key-1': cert }), { status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'max-age=3600' } });
  }
  return realFetch(input, init);
};
