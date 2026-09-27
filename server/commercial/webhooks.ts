/*
 * Webhooks لواجهة الشركاء: توقيع HMAC، إعادة محاولة بتراجعٍ أُسّي، سجلّ تسليم، وتعطيلٌ
 * بعد إخفاقاتٍ متتالية. الإرسال الشبكي يتمّ خارج معاملة الحالة، ثم تُسجَّل نتيجته.
 *
 * صيغة التوقيع (على غرار الممارسة الشائعة):
 *   X-Mizan-Signature: t=<unix-seconds>,v1=<hex HMAC-SHA256(secret, `${t}.${body}`)>
 * والمستقبِل يرفض توقيعًا أقدم من نافذة التسامح (افتراضًا 5 دقائق) لمنع إعادة التشغيل.
 */

import crypto from 'crypto';
import { CommercialError, type CommercialState, type EngineCtx } from './engine';
import { WEBHOOK_EVENT_TYPES, type WebhookDeliveryRecord, type WebhookEndpointRecord, type WebhookEventType } from './types';

const iso = (ms: number) => new Date(ms).toISOString();

export const WEBHOOK_MAX_ATTEMPTS = 8;
export const WEBHOOK_DISABLE_AFTER_CONSECUTIVE_FAILURES = 20;
export const WEBHOOK_SIGNATURE_TOLERANCE_SECONDS = 300;

export function signWebhook(secret: string, timestampSeconds: number, body: string) {
  const v1 = crypto.createHmac('sha256', secret).update(`${timestampSeconds}.${body}`).digest('hex');
  return `t=${timestampSeconds},v1=${v1}`;
}

export function verifyWebhookSignature(secret: string, header: string, body: string, nowSeconds = Math.floor(Date.now() / 1000), tolerance = WEBHOOK_SIGNATURE_TOLERANCE_SECONDS) {
  const parts = Object.fromEntries(String(header || '').split(',').map(p => p.split('=', 2) as [string, string]));
  const t = Number(parts.t);
  if (!Number.isInteger(t) || !parts.v1) return false;
  if (Math.abs(nowSeconds - t) > tolerance) return false;
  const expected = Buffer.from(signWebhook(secret, t, body).split('v1=')[1], 'hex');
  const given = Buffer.from(parts.v1, 'hex');
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}

/** Exponential backoff with a cap: 30s, 60s, 2m, 4m … ≤ 6h. */
export function backoffMs(attempt: number) {
  return Math.min(6 * 3_600_000, 30_000 * 2 ** Math.max(0, attempt - 1));
}

export function assertWebhookUrl(url: string) {
  let u: URL;
  try { u = new URL(url); } catch { throw new CommercialError('WEBHOOK_URL_INVALID'); }
  if (u.protocol !== 'https:') throw new CommercialError('WEBHOOK_URL_MUST_BE_HTTPS');
  const host = u.hostname.toLowerCase();
  /* لا تسليم إلى الشبكة الداخلية (SSRF): المضيف المحلي والعناوين الخاصة مرفوضة. */
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal') || /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.)/.test(host) || host === '[::1]' || host === 'metadata.google.internal') {
    throw new CommercialError('WEBHOOK_URL_PRIVATE_NETWORK');
  }
  return u.toString();
}

export function createWebhookEndpoint(ctx: EngineCtx, organizationId: string, input: { url: string; events: string[] }, secretRef: string) {
  const url = assertWebhookUrl(String(input.url || ''));
  const events = [...new Set((input.events || []).filter((e): e is WebhookEventType => (WEBHOOK_EVENT_TYPES as readonly string[]).includes(e)))];
  if (!events.length) throw new CommercialError('WEBHOOK_EVENTS_REQUIRED');
  const t = iso(ctx.at);
  const record: WebhookEndpointRecord = { id: ctx.nextId('WH'), organizationId, url, events, secretRef, status: 'active', consecutiveFailures: 0, createdAt: t, updatedAt: t };
  ctx.s.webhookEndpoints.push(record);
  ctx.audit({ organizationId, action: 'WEBHOOK_ENDPOINT_CREATED', entityType: 'webhook_endpoint', entityId: record.id, reason: `${new URL(url).host} ${events.join(',')}` });
  return record;
}

/** Enqueue one delivery per subscribed endpoint. Called inside the transaction that caused the event. */
export function enqueueWebhookEvent(ctx: EngineCtx, organizationId: string, type: WebhookEventType, data: Record<string, unknown>) {
  const endpoints = ctx.s.webhookEndpoints.filter(e => e.organizationId === organizationId && e.status === 'active' && e.events.includes(type));
  if (!endpoints.length) return [];
  const eventId = `evt_${crypto.randomUUID()}`;
  const payload = JSON.stringify({ id: eventId, type, created: iso(ctx.at), organizationId, apiVersion: 'v1', data });
  return endpoints.map(e => {
    const d: WebhookDeliveryRecord = { id: ctx.nextId('WHD'), endpointId: e.id, organizationId, eventId, eventType: type, payload, attempts: 0, status: 'pending', nextAttemptAt: iso(ctx.at), createdAt: iso(ctx.at) };
    ctx.s.webhookDeliveries.push(d);
    return d;
  });
}

export function dueDeliveries(s: CommercialState, at: number, limit = 50) {
  return s.webhookDeliveries.filter(d => (d.status === 'pending' || d.status === 'failed') && Date.parse(d.nextAttemptAt) <= at).slice(0, limit);
}

/** Record the outcome of one HTTP attempt (idempotent per delivery id + attempt number). */
export function recordDeliveryAttempt(ctx: EngineCtx, deliveryId: string, attemptNumber: number, outcome: { ok: boolean; statusCode?: number; error?: string }) {
  const d = ctx.s.webhookDeliveries.find(x => x.id === deliveryId);
  if (!d || d.attempts >= attemptNumber || d.status === 'delivered' || d.status === 'dead') return d;
  const endpoint = ctx.s.webhookEndpoints.find(e => e.id === d.endpointId);
  d.attempts = attemptNumber;
  d.lastStatusCode = outcome.statusCode;
  d.lastError = outcome.error;
  if (outcome.ok) {
    d.status = 'delivered'; d.deliveredAt = iso(ctx.at);
    if (endpoint) { endpoint.consecutiveFailures = 0; endpoint.updatedAt = iso(ctx.at); }
    return d;
  }
  d.status = d.attempts >= WEBHOOK_MAX_ATTEMPTS ? 'dead' : 'failed';
  d.nextAttemptAt = iso(ctx.at + backoffMs(d.attempts));
  if (endpoint) {
    endpoint.consecutiveFailures++;
    endpoint.updatedAt = iso(ctx.at);
    if (endpoint.consecutiveFailures >= WEBHOOK_DISABLE_AFTER_CONSECUTIVE_FAILURES && endpoint.status === 'active') {
      endpoint.status = 'disabled';
      endpoint.disabledReason = 'CONSECUTIVE_FAILURES';
      ctx.audit({ organizationId: endpoint.organizationId, action: 'WEBHOOK_ENDPOINT_AUTO_DISABLED', entityType: 'webhook_endpoint', entityId: endpoint.id, reason: `${endpoint.consecutiveFailures} consecutive failures` });
    }
  }
  return d;
}
