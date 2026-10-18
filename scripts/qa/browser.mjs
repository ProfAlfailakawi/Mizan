// Browser helper for the QA rig: Chromium (preinstalled) with Google hosts mapped to the rig.
import { chromium } from 'playwright';
import fs from 'node:fs';
import { MOCK_PORT, APP_PORT, QA_PASSWORD, USERS_FILE } from './common.mjs';

export const BASE = process.env.MIZAN_QA_BASE || `http://localhost:${APP_PORT}`;
export const loadUsers = () => JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find((p) => fs.existsSync(p));

export async function launch() {
  return chromium.launch({
    executablePath: chromiumPath,
    args: ['--no-sandbox', `--host-resolver-rules=MAP *.googleapis.com 127.0.0.1:${MOCK_PORT}, MAP firebaseinstallations.googleapis.com 127.0.0.1:${MOCK_PORT}`, '--ignore-certificate-errors', '--no-proxy-server'],
  });
}

/** Opens a fresh context for a viewport and wires problem collectors. */
export async function newSession(browser, { width = 1280, height = 900, locale = 'ar' } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, locale: locale === 'ar' ? 'ar-KW' : 'en-US', ignoreHTTPSErrors: true });
  const page = await context.newPage();
  const problems = { console: [], pageerrors: [], http: [], requestfailed: [] };
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) problems.console.push(`${m.type()}: ${m.text().slice(0, 300)}`); });
  page.on('pageerror', (e) => problems.pageerrors.push(String(e.message || e).slice(0, 400)));
  page.on('response', (r) => { const s = r.status(); if (s >= 400) problems.http.push(`${s} ${r.request().method()} ${r.url().replace(BASE, '').slice(0, 160)}`); });
  page.on('requestfailed', (r) => problems.requestfailed.push(`${r.failure()?.errorText} ${r.url().replace(BASE, '').slice(0, 160)}`));
  return { context, page, problems };
}

export async function login(page, email, password = QA_PASSWORD) {
  // A stable device id per account: privileged roles are single-session by design (409 otherwise).
  await page.addInitScript((id) => { try { if (!localStorage.getItem('mizan_device_identity')) localStorage.setItem('mizan_device_identity', id); } catch {} }, `qa-device-${email}`);
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);
  const emailInput = page.locator('input[type="email"], input[autocomplete="username"], input[name="email"]').first();
  await emailInput.waitFor({ timeout: 20000 });
  await emailInput.fill(email);
  await page.locator('input[type="password"]').first().fill(password);
  await page.getByRole('button', { name: /^(دخول|Sign in)$/ }).first().click();
}
