/*
 * تذكير المتسابق بموعده وحضوره — من الجدول المعتمد وحده.
 *
 *  - «موعدك»: يُرسل حين يُعتمد للمتسابق موعد، ويُرسل مرة أخرى فقط إن تغيّر موعده أو لجنته.
 *  - «تذكير بالحضور»: يُرسل مرة واحدة في اليوم السابق لموعده، بتوقيت المسابقة لا توقيت الخادم.
 *
 * لا يُراسَل منسحبٌ أو مرفوض أو مستبعد، ولا يُذكَّر بموعدٍ مضى. وتكرار الدورة آمن: مفتاح
 * الموضوع يحمل الموعد نفسه، وصندوق الصادر يرفض المفتاح المكرّر.
 */
import type { Recipient, Trigger } from './communications';
import { isPlausibleEmail } from '../shared/email-shape';

export interface ReminderSlot { participantId: string; committeeId: string; hallId: string; date: string; start: string }
export interface ReminderPlan { id: string; status: string; slots: ReminderSlot[]; halls: { id: string; name: string }[] }
export interface ReminderParticipant { id: string; status: string; email?: string; phone?: string; fullName?: string; fullNameArabic?: string; preferredLanguage?: string; communicationOptOut?: boolean }
export interface ReminderCompetition { id: string; organizationId: string; name: string; nameArabic?: string; timezone?: string; venueName?: string; status?: string }
export interface PlannedReminder { trigger: Trigger; subjectKey: string; participantId: string; recipients: Recipient[]; vars: Record<string, string> }

const EXCLUDED = new Set(['withdrawn', 'rejected', 'disqualified', 'cancelled', 'draft']);

/** التاريخ والوقت المحليان «الآن» في منطقة المسابقة: ['2026-10-01', '14:05']. */
export function localNow(at: number, timeZone: string): [string, string] {
  let tz = timeZone || 'Asia/Kuwait';
  try { new Intl.DateTimeFormat('en-CA', { timeZone: tz }); } catch { tz = 'Asia/Kuwait'; }
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(at)).map(p => [p.type, p.value]));
  return [`${parts.year}-${parts.month}-${parts.day}`, `${parts.hour}:${parts.minute}`];
}

const nextDay = (date: string) => { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };

export function recipientsFor(p: ReminderParticipant, organizationId: string, channels: { sms?: boolean; whatsapp?: boolean } = {}): Recipient[] {
  if (p.communicationOptOut) return [];
  const locale: 'ar' | 'en' = p.preferredLanguage === 'en' ? 'en' : 'ar';
  const out: Recipient[] = [];
  const email = String(p.email || '').trim().toLowerCase();
  if (email && isPlausibleEmail(email)) out.push({ channel: 'email', address: email, locale, organizationId });
  const phone = String(p.phone || '').replace(/[\s-]/g, '');
  if (/^\+?\d{7,15}$/.test(phone)) {
    if (channels.whatsapp) out.push({ channel: 'whatsapp', address: phone, locale, organizationId });
    else if (channels.sms) out.push({ channel: 'sms', address: phone, locale, organizationId });
  }
  return out;
}

export function planParticipantReminders(input: { competition: ReminderCompetition; plan: ReminderPlan; participants: Map<string, ReminderParticipant>; at: number; channels?: { sms?: boolean; whatsapp?: boolean } }): PlannedReminder[] {
  const { competition, plan } = input;
  if (plan.status !== 'published') return [];
  if (['completed', 'archived', 'cancelled'].includes(String(competition.status || ''))) return [];
  const [today, nowTime] = localNow(input.at, competition.timezone || 'Asia/Kuwait');
  const tomorrow = nextDay(today);
  const hall = new Map(plan.halls.map(h => [h.id, h.name]));
  const out: PlannedReminder[] = [];
  for (const slot of plan.slots) {
    const p = input.participants.get(slot.participantId);
    if (!p || EXCLUDED.has(p.status)) continue;
    /* موعد مضى لا يُذكَّر به. */
    if (slot.date < today || (slot.date === today && slot.start <= nowTime)) continue;
    const recipients = recipientsFor(p, competition.organizationId, input.channels);
    if (!recipients.length) continue;
    const locale = recipients[0].locale;
    const vars = {
      competition: locale === 'ar' ? competition.nameArabic || competition.name : competition.name || competition.nameArabic || '',
      name: locale === 'ar' ? p.fullNameArabic || p.fullName || '' : p.fullName || p.fullNameArabic || '',
      date: slot.date, time: slot.start,
      place: [competition.venueName, hall.get(slot.hallId)].filter(Boolean).join(' — '),
    };
    const slotKey = `${competition.id}:${slot.participantId}:${slot.date}T${slot.start}:${slot.committeeId}`;
    out.push({ trigger: 'schedule_assigned', subjectKey: slotKey, participantId: p.id, recipients, vars });
    if (slot.date === tomorrow) out.push({ trigger: 'checkin_reminder', subjectKey: slotKey, participantId: p.id, recipients, vars });
  }
  return out;
}

/** مصدر البيانات للدورة — Firestore في التشغيل، وذاكرة في الاختبار. */
export interface ReminderSource {
  competitions(): Promise<ReminderCompetition[]>;
  publishedPlan(competition: ReminderCompetition): Promise<ReminderPlan | null>;
  participant(competition: ReminderCompetition, participantId: string): Promise<ReminderParticipant | null>;
}

export async function runParticipantReminders(source: ReminderSource, enqueue: (r: PlannedReminder) => void, at: number, channels?: { sms?: boolean; whatsapp?: boolean }) {
  let queued = 0;
  for (const competition of await source.competitions()) {
    try {
      const plan = await source.publishedPlan(competition);
      if (!plan) continue;
      const participants = new Map<string, ReminderParticipant>();
      for (const slot of plan.slots) {
        if (participants.has(slot.participantId)) continue;
        const p = await source.participant(competition, slot.participantId);
        if (p) participants.set(slot.participantId, p);
      }
      for (const r of planParticipantReminders({ competition, plan, participants, at, channels })) { enqueue(r); queued++; }
    } catch (err) {
      console.warn('[participant-reminders] competition skipped:', competition.id, err instanceof Error ? err.message : err);
    }
  }
  return { queued };
}
