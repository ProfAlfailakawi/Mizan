/*
 * تذكير من بدأ التسجيل ولم يُكمله — باختياره الصريح فقط.
 *
 * المسودة تبقى على جهاز المتسابق. لا يعرف الخادم عنها شيئًا إلا إن طلب المتسابق التذكير
 * بنفسه، وحينها يُحفظ أقل ما يلزم: البريد والمسابقة ولغة الرسالة. لا اسم ولا هاتف ولا إجابات.
 *
 *  - تذكير واحد فقط لكل (بريد، مسابقة)، بعد مهلة (24 ساعة افتراضًا)، وقبل إغلاق التسجيل.
 *  - إتمام التسجيل بالبريد نفسه يلغي التذكير فورًا.
 *  - رابط إلغاء في الرسالة، ويُحذف السجل بعد الإرسال أو الإلغاء أو انقضاء المهلة.
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { isPlausibleEmail } from '../shared/email-shape';

export interface RegistrationReminderRecord {
  id: string;
  competitionId: string;
  email: string;
  emailHash: string;
  locale: 'ar' | 'en';
  /** رمز الإلغاء نفسه يُحفظ لأنه يُضمَّن في رسالة التذكير؛ لا يمنح إلا إلغاء هذا التذكير. */
  cancelToken: string;
  remindAt: string;
  createdAt: string;
}

export const REMINDER_DELAY_MS = 24 * 3_600_000;
export const REMINDER_RETENTION_MS = 21 * 86_400_000;
const hash = (v: string) => crypto.createHash('sha256').update(v).digest('hex');
export const emailKey = (email: string) => hash(String(email || '').trim().toLowerCase());

export class RegistrationReminderStore {
  constructor(private file: string, private clock: () => number = () => Date.now(), private delayMs = REMINDER_DELAY_MS) {
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  }
  private read(): RegistrationReminderRecord[] { try { return JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch { return []; } }
  private write(rows: RegistrationReminderRecord[]) { const tmp = `${this.file}.${process.pid}.tmp`; fs.writeFileSync(tmp, JSON.stringify(rows), { mode: 0o600 }); fs.renameSync(tmp, this.file); }

  /** يطلب المتسابق التذكير. طلبٌ مكرّر للبريد والمسابقة نفسيهما لا يُنشئ سجلًا ثانيًا ولا يؤخّر الأول. */
  request(input: { competitionId: string; email: string; locale?: string }) {
    const competitionId = String(input.competitionId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 120);
    const email = String(input.email || '').trim().toLowerCase().slice(0, 254);
    if (!competitionId) throw new Error('COMPETITION_ID_REQUIRED');
    if (!isPlausibleEmail(email)) throw new Error('REGISTRATION_EMAIL_INVALID');
    const rows = this.read(), key = emailKey(email);
    if (rows.some(r => r.competitionId === competitionId && r.emailHash === key)) return { created: false as const };
    const token = `mz_remind_${crypto.randomBytes(24).toString('base64url')}`;
    const at = this.clock();
    rows.push({ id: `rr_${crypto.randomUUID()}`, competitionId, email, emailHash: key, locale: input.locale === 'en' ? 'en' : 'ar', cancelToken: token, remindAt: new Date(at + this.delayMs).toISOString(), createdAt: new Date(at).toISOString() });
    this.write(rows.slice(-50_000));
    return { created: true as const, cancelToken: token };
  }

  /** إتمام التسجيل يلغي التذكير. */
  completed(competitionId: string, email: string) {
    const key = emailKey(email);
    const rows = this.read();
    const kept = rows.filter(r => !(r.competitionId === competitionId && r.emailHash === key));
    if (kept.length !== rows.length) this.write(kept);
    return rows.length - kept.length;
  }

  cancel(token: string) {
    const t = String(token || '');
    if (!/^mz_remind_[A-Za-z0-9_-]{32}$/.test(t)) return false;
    const rows = this.read();
    const kept = rows.filter(r => !r.cancelToken || r.cancelToken.length !== t.length || !crypto.timingSafeEqual(Buffer.from(r.cancelToken), Buffer.from(t)));
    if (kept.length === rows.length) return false;
    this.write(kept);
    return true;
  }

  due(limit = 200) {
    const at = this.clock();
    return this.read().filter(r => Date.parse(r.remindAt) <= at).slice(0, limit);
  }

  /** بعد الإرسال (أو تقرير عدم الحاجة إليه) يُحذف السجل: لا يُحتفظ ببريدٍ بلا غرض. */
  remove(ids: string[]) {
    if (!ids.length) return;
    const set = new Set(ids);
    this.write(this.read().filter(r => !set.has(r.id)));
  }

  purgeExpired() {
    const at = this.clock(), rows = this.read();
    const kept = rows.filter(r => at - Date.parse(r.createdAt) <= REMINDER_RETENTION_MS);
    if (kept.length !== rows.length) this.write(kept);
    return rows.length - kept.length;
  }
}

export interface ReminderCompetitionInfo { id: string; name: string; nameArabic?: string; status: string; registrationEndDate?: string }

/**
 * دورة التذكير: كل سجلٍّ مستحق يُرسل مرة واحدة إن كان التسجيل ما يزال مفتوحًا، ثم يُحذف
 * في الحالتين. والتحقق من «هل سُجّل فعلًا» يتمّ عند التسجيل نفسه (completed).
 */
export async function runRegistrationReminders(store: RegistrationReminderStore, competition: (id: string) => Promise<ReminderCompetitionInfo | null>, send: (r: RegistrationReminderRecord, c: ReminderCompetitionInfo) => void, at: number) {
  const done: string[] = [];
  let sent = 0;
  for (const r of store.due()) {
    let c: ReminderCompetitionInfo | null = null;
    try { c = await competition(r.competitionId); } catch { continue; /* تعذّر القراءة: يُعاد في الدورة التالية */ }
    const ends = c?.registrationEndDate ? Date.parse(c.registrationEndDate) : NaN;
    const open = !!c && c.status === 'registration_open' && (!Number.isFinite(ends) || ends > at);
    if (open) { send(r, c!); sent++; }
    done.push(r.id);
  }
  store.remove(done);
  store.purgeExpired();
  return { sent, closed: done.length - sent };
}
