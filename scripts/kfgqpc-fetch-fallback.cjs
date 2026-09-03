#!/usr/bin/env node
'use strict';

/**
 * MIZAN KFGQPC network compatibility preload.
 *
 * Goal:
 * - keep the normal Node fetch path first;
 * - retry transient network failures;
 * - if Node/undici cannot reach KFGQPC, fall back to curl over IPv4/HTTP1.1;
 * - NEVER follow a redirect without validating that the next hop is still an
 *   official qurancomplex.gov.sa host.
 *
 * This module intentionally contains no credentials and does not weaken any
 * downstream checksum/content validation.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { Readable } = require('node:stream');

const nativeFetch = globalThis.fetch.bind(globalThis);
const MAX_REDIRECTS = 8;
const RETRIES = 3;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function officialUrl(raw) {
  const u = new URL(String(raw));
  const host = u.hostname.toLowerCase();
  if (u.protocol !== 'https:' ||
      !(host === 'qurancomplex.gov.sa' || host.endsWith('.qurancomplex.gov.sa'))) {
    throw new Error(`KFGQPC_FALLBACK_NON_OFFICIAL_URL:${u.toString()}`);
  }
  return u;
}

function headersObject(input) {
  const out = {};
  if (!input) return out;
  const h = new Headers(input);
  for (const [k, v] of h.entries()) out[k.toLowerCase()] = v;
  return out;
}

function parseHeaderFile(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const blocks = raw.split(/\r?\n\r?\n/).filter(Boolean);
  const block = blocks[blocks.length - 1] || '';
  const lines = block.split(/\r?\n/);
  const headers = new Headers();
  for (const line of lines.slice(1)) {
    const i = line.indexOf(':');
    if (i <= 0) continue;
    headers.append(line.slice(0, i).trim(), line.slice(i + 1).trim());
  }
  return headers;
}

function runCurlOnce(url, init) {
  const method = String(init?.method || 'GET').toUpperCase();
  if (!['GET', 'HEAD'].includes(method)) {
    throw new Error(`KFGQPC_FALLBACK_METHOD_NOT_SUPPORTED:${method}`);
  }

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mizan-kfgqpc-curl-'));
  const bodyFile = path.join(dir, 'body.bin');
  const headerFile = path.join(dir, 'headers.txt');
  const supplied = headersObject(init?.headers);
  const originalUa = supplied['user-agent'] || 'MIZAN-KFGQPC';
  const ua = `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 MIZAN-KFGQPC-Fallback/1.0 ${originalUa}`;

  const args = [
    '--ipv4',
    '--http1.1',
    '--proto', '=https',
    '--tlsv1.2',
    '--silent',
    '--show-error',
    '--compressed',
    '--connect-timeout', '25',
    '--max-time', '7200',
    '--retry', '4',
    '--retry-delay', '2',
    '--retry-all-errors',
    '--max-redirs', '0',
    '--dump-header', headerFile,
    '--output', bodyFile,
    '--write-out', '%{http_code}',
    '--user-agent', ua,
  ];

  if (method === 'HEAD') args.push('--head');

  for (const [key, value] of Object.entries(supplied)) {
    if (key === 'user-agent' || key === 'host' || key === 'content-length') continue;
    args.push('--header', `${key}: ${value}`);
  }
  args.push(url.toString());

  const result = spawnSync('curl', args, {
    encoding: 'utf8',
    timeout: 7_250_000,
    maxBuffer: 1024 * 1024,
  });

  if (result.error || result.status !== 0) {
    fs.rmSync(dir, { recursive: true, force: true });
    const detail = String(result.stderr || result.error?.message || 'UNKNOWN').slice(0, 600);
    throw new Error(`KFGQPC_CURL_FAILED:${detail}`);
  }

  const status = Number(String(result.stdout || '').trim());
  if (!Number.isInteger(status) || status < 100 || status > 599) {
    fs.rmSync(dir, { recursive: true, force: true });
    throw new Error(`KFGQPC_CURL_INVALID_STATUS:${String(result.stdout || '').trim()}`);
  }

  const headers = parseHeaderFile(headerFile);
  return { status, headers, bodyFile, dir };
}

async function curlFetch(rawUrl, init = {}) {
  let current = officialUrl(rawUrl);

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const result = runCurlOnce(current, init);

    if (result.status >= 300 && result.status < 400) {
      const location = result.headers.get('location');
      fs.rmSync(result.dir, { recursive: true, force: true });
      if (!location) throw new Error(`KFGQPC_REDIRECT_WITHOUT_LOCATION:${result.status}`);
      current = officialUrl(new URL(location, current).toString());
      continue;
    }

    let body = null;
    if (String(init?.method || 'GET').toUpperCase() !== 'HEAD') {
      const nodeStream = fs.createReadStream(result.bodyFile);
      nodeStream.once('close', () => fs.rmSync(result.dir, { recursive: true, force: true }));
      body = Readable.toWeb(nodeStream);
    } else {
      fs.rmSync(result.dir, { recursive: true, force: true });
    }

    const response = new Response(body, {
      status: result.status,
      headers: result.headers,
    });
    Object.defineProperty(response, 'url', {
      value: current.toString(),
      enumerable: true,
      configurable: true,
    });
    return response;
  }

  throw new Error('KFGQPC_TOO_MANY_REDIRECTS');
}

async function resilientFetch(input, init = {}) {
  const rawUrl = typeof input === 'string' || input instanceof URL ? String(input) : input.url;
  const target = officialUrl(rawUrl);

  let lastError;
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    try {
      return await nativeFetch(input, init);
    } catch (error) {
      lastError = error;
      if (attempt < RETRIES) await sleep(800 * attempt);
    }
  }

  console.warn(JSON.stringify({
    event: 'KFGQPC_NATIVE_FETCH_FAILED_USING_CURL_FALLBACK',
    url: target.toString(),
    reason: lastError instanceof Error ? lastError.message : 'UNKNOWN',
  }));

  return curlFetch(target.toString(), init);
}

globalThis.fetch = resilientFetch;

module.exports = { officialUrl, curlFetch, resilientFetch };
