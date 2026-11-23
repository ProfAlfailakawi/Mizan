/**
 * توكنات أجهزة iOS لكل مستخدم، وإرسال الإشعارات الشخصية إليها.
 *
 * كل إشعار جديد في مركز الإشعارات موجّه إلى شخص بعينه (target: user أو users) يُرسل أيضًا
 * إلى أجهزته المسجّلة. الإشعارات العامة (جهة، دور، مسابقة، الجميع) تبقى داخل التطبيق فقط.
 * التوكن الميت يُحذف. الملف يُكتب بصلاحية 0600 ولا يُطبع أي توكن في السجل.
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { Express, RequestHandler } from 'express';
import { APNS_TOKEN_PATTERN, type ApnsSender } from './apns-push';
import type { NotificationRecord } from './notification-center';

type TokenRow = { token: string; userId: string; createdAt: string; updatedAt: string };
const MAX_TOKENS_PER_USER = 10;

export class NativePushTokenStore {
  private file: string;
  constructor(dir: string) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    this.file = path.join(dir, 'native-push-tokens.json');
  }
  private read(): TokenRow[] { try { const rows = JSON.parse(fs.readFileSync(this.file, 'utf8')); return Array.isArray(rows) ? rows : []; } catch { return []; } }
  private write(rows: TokenRow[]) { const tmp = `${this.file}.${process.pid}.${Date.now()}.tmp`; fs.writeFileSync(tmp, JSON.stringify(rows), { mode: 0o600 }); fs.renameSync(tmp, this.file); }
  /** الجهاز الواحد يتبع آخر مستخدم سجّل منه. */
  register(userId: string, token: string) {
    const t = token.toLowerCase(), at = new Date().toISOString();
    const rows = this.read();
    const prev = rows.find(r => r.token === t);
    let next = rows.filter(r => r.token !== t);
    next.push({ token: t, userId, createdAt: prev && prev.userId === userId ? prev.createdAt : at, updatedAt: at });
    const mine = next.filter(r => r.userId === userId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    if (mine.length > MAX_TOKENS_PER_USER) { const drop = new Set(mine.slice(MAX_TOKENS_PER_USER).map(r => r.token)); next = next.filter(r => !drop.has(r.token)); }
    this.write(next);
  }
  unregister(userId: string, token: string) { const t = token.toLowerCase(); const rows = this.read(); const next = rows.filter(r => !(r.token === t && r.userId === userId)); if (next.length !== rows.length) this.write(next); return rows.length - next.length; }
  remove(token: string) { const t = token.toLowerCase(); const rows = this.read(); const next = rows.filter(r => r.token !== t); if (next.length !== rows.length) this.write(next); }
  purgeUser(userId: string) { const rows = this.read(); const next = rows.filter(r => r.userId !== userId); if (next.length !== rows.length) this.write(next); }
  tokensFor(userId: string) { return this.read().filter(r => r.userId === userId).map(r => r.token); }
}

/** المستلمون الشخصيون فقط. */
export const personalRecipients = (n: Pick<NotificationRecord, 'target'>): string[] =>
  n.target.type === 'user' && n.target.userId ? [n.target.userId] : n.target.type === 'users' ? [...new Set(n.target.userIds || [])] : [];

/** الرابط الذي يفتحه التطبيق عند لمس التنبيه: مسار داخلي أو رابط # فقط. */
export const pushUrlFor = (n: Pick<NotificationRecord, 'actionHref'>): string => {
  const href = String(n.actionHref || '').trim();
  if (href.startsWith('#') || (href.startsWith('/') && !href.startsWith('//'))) return href;
  return '#';
};

export function createNativePush(store: NativePushTokenStore, sender: ApnsSender, log: (msg: string) => void = m => console.warn(m)) {
  return {
    configured: () => sender.configured(),
    async deliver(n: NotificationRecord) {
      const report = { sent: 0, failed: 0, removed: 0 };
      if (!sender.configured()) return report;
      const users = personalRecipients(n);
      const message = { title: n.title, body: n.body.slice(0, 400), url: pushUrlFor(n), tag: n.category };
      for (const uid of users) {
        for (const token of store.tokensFor(uid)) {
          const r = await sender.send(token, message, { collapseId: n.id });
          if (r.skipped) continue;
          if (r.ok) { report.sent++; continue; }
          if (r.gone) { report.removed++; store.remove(token); continue; }
          report.failed++;
          log(`[apns] ${crypto.createHash('sha256').update(token).digest('hex').slice(0, 8)} → ${r.status}${r.error ? ` ${r.error}` : ''}`);
        }
      }
      return report;
    },
  };
}
export type NativePush = ReturnType<typeof createNativePush>;

/** المسارات: تسجيل توكن الجهاز وإلغاؤه للمستخدم الداخل. */
export function registerNativePushRoutes(app: Express, deps: { requireUser: RequestHandler; store: () => NativePushTokenStore | null }) {
  const uidOf = (req: any) => String(req.mizanIdentity?.uid || '');
  app.post('/api/push/subscribe-native', deps.requireUser, (req, res) => {
    const store = deps.store();
    if (!store) return res.status(503).json({ code: 'NATIVE_PUSH_NOT_CONFIGURED' });
    const token = String(req.body?.token || '').trim();
    if (!APNS_TOKEN_PATTERN.test(token)) return res.status(400).json({ code: 'NATIVE_PUSH_TOKEN_INVALID' });
    const uid = uidOf(req);
    if (!uid) return res.status(401).json({ code: 'IDENTITY_REQUIRED' });
    store.register(uid, token);
    return res.json({ ok: true });
  });
  app.post('/api/push/unsubscribe-native', deps.requireUser, (req, res) => {
    const store = deps.store();
    if (!store) return res.status(503).json({ code: 'NATIVE_PUSH_NOT_CONFIGURED' });
    const token = String(req.body?.token || '').trim();
    if (!APNS_TOKEN_PATTERN.test(token)) return res.status(400).json({ code: 'NATIVE_PUSH_TOKEN_INVALID' });
    return res.json({ ok: true, removed: store.unregister(uidOf(req), token) });
  });
}
