/*
 * الاتصالات الآلية: صندوق صادر واحد لكل القنوات (داخل المنصّة، بريد، رسائل قصيرة، واتساب)،
 * بقوالب عربية/إنجليزية، ومحوّلات مزوّدين، وحالة تسليم لكل رسالة، وإعادة محاولة بتراجع أسّي.
 *
 * الصدق في الحالة أولًا: قناةٌ لا مزوّد مهيّأ لها تُسجَّل رسائلها `provider_not_configured`،
 * لا «أُرسلت». والمزوّد الخارجي يُضبط بمتغيرات البيئة (نقطة HTTP ورمز)، ولا يُدّعى أنه مفعّل
 * قبل ذلك. قناة «داخل المنصّة» حقيقية وتعمل دائمًا عبر مركز الإشعارات القائم.
 *
 * ولا تُكرّر رسالة: لكل رسالة مفتاح تكرار (المشغّل + الموضوع + القناة + المستلم)، فإعادة
 * تشغيل دورة التذكير لا ترسل التذكير نفسه مرتين.
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { isPlausibleEmail } from '../shared/email-shape';

export type Channel = 'in_app' | 'email' | 'sms' | 'whatsapp';
export type Trigger =
  | 'registration_confirmation' | 'incomplete_registration' | 'competition_reminder' | 'schedule_assigned' | 'judge_invitation'
  | 'checkin_reminder' | 'results_published' | 'certificate_issued' | 'renewal_approaching' | 'payment_failed';

export interface Recipient { channel: Channel; address: string; locale: 'ar' | 'en'; organizationId?: string }
export interface OutboxMessage {
  id: string;
  trigger: Trigger;
  channel: Channel;
  to: string;
  organizationId?: string;
  locale: 'ar' | 'en';
  subject: string;
  body: string;
  dedupeKey: string;
  status: 'queued' | 'sent' | 'failed' | 'provider_not_configured' | 'dead';
  attempts: number;
  nextAttemptAt: string;
  provider?: string;
  providerMessageId?: string;
  lastError?: string;
  createdAt: string;
  sentAt?: string;
}

export interface Provider {
  channel: Channel;
  name: string;
  configured: boolean;
  send(message: OutboxMessage): Promise<{ ok: boolean; providerMessageId?: string; error?: string }>;
}

/* ——— templates ——— */
const TEMPLATES: Record<Trigger, { ar: [string, string]; en: [string, string] }> = {
  registration_confirmation: { ar: ['تم استلام تسجيلك في {{competition}}', 'السلام عليكم {{name}}، استلمنا تسجيلك برقم {{code}}. تابع رحلتك من رابطك الخاص.'], en: ['Your registration for {{competition}} was received', 'Peace be upon you {{name}}. Your registration code is {{code}}. Follow your journey from your private link.'] },
  incomplete_registration: { ar: ['أكمل تسجيلك في {{competition}}', 'لم يكتمل تسجيلك بعد. يمكنك إكماله قبل {{deadline}}.'], en: ['Complete your registration for {{competition}}', 'Your registration is not complete. You can finish it before {{deadline}}.'] },
  competition_reminder: { ar: ['تذكير: {{competition}}', 'تبدأ {{competition}} في {{date}}.'], en: ['Reminder: {{competition}}', '{{competition}} starts on {{date}}.'] },
  schedule_assigned: { ar: ['موعدك في {{competition}}', 'موعدك يوم {{date}} الساعة {{time}} في {{place}}.'], en: ['Your slot in {{competition}}', 'Your slot is on {{date}} at {{time}} in {{place}}.'] },
  judge_invitation: { ar: ['دعوة للتحكيم في {{competition}}', 'دُعيت محكّمًا في {{competition}}. فعّل حسابك من الرابط المرسل.'], en: ['Invitation to judge {{competition}}', 'You are invited to judge {{competition}}. Activate your account from the link sent.'] },
  checkin_reminder: { ar: ['تذكير بالحضور', 'موعد حضورك إلى {{competition}} غدًا. احمل رمز رحلتك.'], en: ['Check-in reminder', 'Your check-in for {{competition}} is tomorrow. Bring your journey code.'] },
  results_published: { ar: ['نُشرت نتائج {{competition}}', 'نُشرت النتائج الرسمية المختومة لـ{{competition}}.'], en: ['{{competition}} results are published', 'The official sealed results of {{competition}} are published.'] },
  certificate_issued: { ar: ['صدرت شهادتك', 'صدرت شهادتك في {{competition}} ويمكن التحقق منها برمزها.'], en: ['Your certificate is issued', 'Your certificate for {{competition}} is issued and verifiable by its code.'] },
  renewal_approaching: { ar: ['يقترب موعد تجديد الاشتراك', 'تنتهي دورة اشتراك {{organization}} في {{date}} (بعد {{days}} يومًا). التجديد يحفظ الاستمرار ولا يمسّ البيانات.'], en: ['Subscription renewal approaching', '{{organization}}’s subscription term ends on {{date}} ({{days}} days). Renewal keeps operations running and never touches data.'] },
  payment_failed: { ar: ['تعذّر سداد فاتورة الاشتراك', 'الفاتورة {{invoice}} لم تُسدَّد في موعدها. البيانات محفوظة، وقد تنتقل الجهة إلى وضع القراءة فقط حتى السداد.'], en: ['Subscription payment overdue', 'Invoice {{invoice}} is overdue. Data is preserved; the organization may move to read-only until payment.'] },
};

export function renderTemplate(trigger: Trigger, locale: 'ar' | 'en', vars: Record<string, string | number | undefined>) {
  const [subject, body] = TEMPLATES[trigger][locale];
  const fill = (t: string) => t.replace(/\{\{(\w+)\}\}/g, (_, k) => String(vars[k] ?? '').replace(/[<>]/g, ''));
  return { subject: fill(subject), body: fill(body) };
}

/* ——— providers ——— */

/** Generic JSON-over-HTTPS adapter (e.g. an email/SMS gateway). Configured only when both env values exist. */
export class HttpJsonProvider implements Provider {
  configured: boolean;
  constructor(public channel: Channel, public name: string, private endpoint: string | undefined, private token: string | undefined, private sender?: string, private http: typeof fetch = fetch) {
    this.configured = !!endpoint && /^https:\/\//.test(endpoint) && !!token;
  }
  async send(m: OutboxMessage) {
    if (!this.configured) return { ok: false, error: 'PROVIDER_NOT_CONFIGURED' };
    try {
      const r = await this.http(this.endpoint!, { method: 'POST', headers: { authorization: `Bearer ${this.token}`, 'content-type': 'application/json', 'idempotency-key': m.dedupeKey }, body: JSON.stringify({ channel: m.channel, to: m.to, from: this.sender, subject: m.subject, body: m.body, locale: m.locale }), signal: AbortSignal.timeout(10_000) });
      const body = await r.json().catch(() => ({}));
      return r.ok ? { ok: true, providerMessageId: String((body as { id?: string }).id || '') || undefined } : { ok: false, error: `HTTP_${r.status}` };
    } catch (err) { return { ok: false, error: err instanceof Error ? err.name : 'PROVIDER_ERROR' }; }
  }
}

/** In-app delivery through the existing notification center. Always available. */
export class InAppProvider implements Provider {
  channel: Channel = 'in_app'; name = 'mizan-notification-center'; configured = true;
  constructor(private publish: (input: { organizationId: string; title: string; body: string }) => void) {}
  async send(m: OutboxMessage) {
    if (!m.organizationId) return { ok: false, error: 'IN_APP_REQUIRES_ORGANIZATION' };
    this.publish({ organizationId: m.organizationId, title: m.subject, body: m.body });
    return { ok: true };
  }
}

export function providersFromEnv(env: Record<string, string | undefined>, inApp?: InAppProvider): Provider[] {
  const list: Provider[] = [
    new HttpJsonProvider('email', 'http-email', env.MIZAN_EMAIL_HTTP_ENDPOINT, env.MIZAN_EMAIL_HTTP_TOKEN, env.MIZAN_EMAIL_FROM),
    new HttpJsonProvider('sms', 'http-sms', env.MIZAN_SMS_HTTP_ENDPOINT, env.MIZAN_SMS_HTTP_TOKEN, env.MIZAN_SMS_FROM),
    new HttpJsonProvider('whatsapp', 'http-whatsapp', env.MIZAN_WHATSAPP_HTTP_ENDPOINT, env.MIZAN_WHATSAPP_HTTP_TOKEN, env.MIZAN_WHATSAPP_FROM),
  ];
  if (inApp) list.push(inApp);
  return list;
}

/* ——— outbox ——— */
const MAX_ATTEMPTS = 6;
const backoff = (attempt: number) => Math.min(6 * 3_600_000, 60_000 * 2 ** Math.max(0, attempt - 1));

export class CommunicationsService {
  constructor(private file: string, private providers: Provider[], private clock: () => number = () => Date.now()) {
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    if (!fs.existsSync(file)) this.write([]);
  }
  private read(): OutboxMessage[] { try { return JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch { return []; } }
  private write(rows: OutboxMessage[]) { const tmp = `${this.file}.${process.pid}.tmp`; fs.writeFileSync(tmp, JSON.stringify(rows.slice(-20_000)), { mode: 0o600 }); fs.renameSync(tmp, this.file); }
  private provider(channel: Channel) { return this.providers.find(p => p.channel === channel); }

  status() {
    return (['in_app', 'email', 'sms', 'whatsapp'] as Channel[]).map(channel => { const p = this.provider(channel); return { channel, provider: p?.name, configured: !!p?.configured }; });
  }

  /** Queue one message per recipient; duplicates (same dedupe key) are ignored. */
  enqueue(trigger: Trigger, subjectKey: string, recipients: Recipient[], vars: Record<string, string | number | undefined>) {
    const rows = this.read();
    const now = new Date(this.clock()).toISOString();
    const created: OutboxMessage[] = [];
    for (const r of recipients) {
      if (!r.address) continue;
      if (r.channel === 'email' && !isPlausibleEmail(r.address)) continue;
      const dedupeKey = crypto.createHash('sha256').update(`${trigger}|${subjectKey}|${r.channel}|${r.address}`).digest('hex').slice(0, 32);
      if (rows.some(x => x.dedupeKey === dedupeKey)) continue;
      const { subject, body } = renderTemplate(trigger, r.locale, vars);
      const p = this.provider(r.channel);
      const m: OutboxMessage = {
        id: `msg_${crypto.randomUUID()}`, trigger, channel: r.channel, to: r.address, organizationId: r.organizationId, locale: r.locale, subject, body, dedupeKey,
        status: p?.configured ? 'queued' : 'provider_not_configured', attempts: 0, nextAttemptAt: now, provider: p?.name, createdAt: now,
      };
      rows.push(m); created.push(m);
    }
    this.write(rows);
    return created;
  }

  /** Deliver due messages; network I/O happens between reads and the final write. */
  async dispatch(limit = 50) {
    const at = this.clock();
    const due = this.read().filter(m => (m.status === 'queued' || m.status === 'failed') && Date.parse(m.nextAttemptAt) <= at).slice(0, limit);
    const outcomes = new Map<string, { ok: boolean; providerMessageId?: string; error?: string }>();
    for (const m of due) {
      const p = this.provider(m.channel);
      outcomes.set(m.id, p?.configured ? await p.send(m) : { ok: false, error: 'PROVIDER_NOT_CONFIGURED' });
    }
    const rows = this.read();
    for (const m of rows) {
      const o = outcomes.get(m.id);
      if (!o) continue;
      m.attempts++;
      if (o.ok) { m.status = 'sent'; m.sentAt = new Date(at).toISOString(); m.providerMessageId = o.providerMessageId; m.lastError = undefined; continue; }
      m.lastError = o.error;
      if (o.error === 'PROVIDER_NOT_CONFIGURED') { m.status = 'provider_not_configured'; continue; }
      m.status = m.attempts >= MAX_ATTEMPTS ? 'dead' : 'failed';
      m.nextAttemptAt = new Date(at + backoff(m.attempts)).toISOString();
    }
    this.write(rows);
    return { attempted: due.length, sent: [...outcomes.values()].filter(o => o.ok).length };
  }

  list(filter: { organizationId?: string; limit?: number } = {}) {
    return this.read().filter(m => !filter.organizationId || m.organizationId === filter.organizationId).slice(-(filter.limit || 200)).reverse()
      .map(m => ({ ...m, to: m.channel === 'in_app' ? m.to : m.to.replace(/^(.{2}).*(@.*)?$/, (_, a, b) => `${a}***${b || ''}`) }));
  }
}
