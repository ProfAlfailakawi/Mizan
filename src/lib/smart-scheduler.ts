/*
 * الجدولة الذكية — محرّك حتمي قابل للتفسير والتعديل اليدوي، لا صندوقٌ أسود.
 *
 * المدخلات: أيام المسابقة ونوافذها، مدة الجلسة لكل فئة، الاستراحات وأوقات الصلاة، القاعات
 * وسعتها، اللجان وفئاتها ومحكّموها، توفّر المحكّمين، حالات تضارب المصالح، وتثبيتاتٌ يدوية.
 *
 * المخرجات: جدول زمني بفتحاتٍ لكل متسابق (لجنة، قاعة، يوم، بداية، نهاية)، وقائمةٌ بما تعذّر
 * جدولته مع السبب، وإحصاءات الاستخدام، وسجلٌّ مقروء لكل قرار («لماذا هذه اللجنة؟»).
 *
 * الخوارزمية جشعة حتمية: التثبيتات اليدوية أولًا (وتُتحقَّق)، ثم المتسابقون مرتّبين بالفئة ثم
 * بالمعرّف، ولكلٍّ اللجنةُ المؤهّلة ذات أبكر فتحةٍ متاحة (والتعادل بأقل حمل ثم بالمعرّف).
 * فالمدخلات نفسها تعطي الجدول نفسه دائمًا، ويمكن لأي مسؤول إعادة حسابه والتحقق منه.
 */
import { eligibleCommittees, judgeMayScore, type ConflictCase } from './conflict-of-interest';

export interface TimeWindow { start: string; end: string; label?: string }
export interface ScheduleDay { date: string; start: string; end: string }
export interface SchedulerCommittee { id: string; hallId: string; assignedCategories: string[]; judgeIds: string[] }
export interface SchedulerHall { id: string; name: string; capacity?: number }
export interface SchedulerParticipant { id: string; categoryId: string; institution?: string; notBefore?: string }
export interface JudgeAvailability { judgeId: string; date: string; start: string; end: string }
export interface ManualPin { participantId: string; committeeId: string; date: string; start: string }

export interface SchedulerInput {
  days: ScheduleDay[];
  sessionMinutes: Record<string, number>;
  defaultSessionMinutes: number;
  transitionMinutes: number;
  breaks: TimeWindow[];
  prayerBreaks: TimeWindow[];
  halls: SchedulerHall[];
  committees: SchedulerCommittee[];
  participants: SchedulerParticipant[];
  /** Absent judge → available all day. Present → available only inside listed windows that day. */
  judgeAvailability: JudgeAvailability[];
  conflicts: ConflictCase[];
  pins: ManualPin[];
  /** judgeId → Firebase uid, used to verify judge-declared conflict cases. */
  judgeUids?: Record<string, string | undefined>;
}

export interface ScheduledSlot { participantId: string; committeeId: string; hallId: string; date: string; start: string; end: string; pinned: boolean; reason: string }
export interface UnscheduledItem { participantId: string; reason: 'NO_COMMITTEE_FOR_CATEGORY' | 'ALL_COMMITTEES_CONFLICTED' | 'NO_CAPACITY' | 'PIN_INVALID'; detail?: string }
export interface SchedulePlan {
  slots: ScheduledSlot[];
  unscheduled: UnscheduledItem[];
  warnings: string[];
  utilization: { committeeId: string; sessions: number; busyMinutes: number; availableMinutes: number }[];
  inputHash: string;
}

export const toMin = (hhmm: string) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm)); if (!m) throw new Error('SCHEDULE_TIME_INVALID'); const v = Number(m[1]) * 60 + Number(m[2]); if (v > 24 * 60) throw new Error('SCHEDULE_TIME_INVALID'); return v; };
export const toHHMM = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

const overlaps = (a0: number, a1: number, b0: number, b1: number) => a0 < b1 && b0 < a1;

function stableHash(value: unknown) {
  const s = JSON.stringify(value);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function validateSchedulerInput(input: SchedulerInput): string[] {
  const problems: string[] = [];
  if (!input.days.length) problems.push('SCHEDULE_DAYS_REQUIRED');
  for (const d of input.days) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date)) problems.push(`SCHEDULE_DAY_INVALID:${d.date}`);
    try { if (toMin(d.end) <= toMin(d.start)) problems.push(`SCHEDULE_DAY_WINDOW_INVALID:${d.date}`); } catch { problems.push(`SCHEDULE_TIME_INVALID:${d.date}`); }
  }
  const halls = new Set(input.halls.map(h => h.id));
  for (const c of input.committees) if (!halls.has(c.hallId)) problems.push(`COMMITTEE_HALL_UNKNOWN:${c.id}`);
  const minutes = Object.values(input.sessionMinutes);
  if (input.defaultSessionMinutes <= 0 || minutes.some(m => !(m > 0))) problems.push('SESSION_MINUTES_INVALID');
  return problems;
}

/** Free intervals of one committee on one day, after breaks, prayer and judge availability. */
function freeIntervals(input: SchedulerInput, committee: SchedulerCommittee, day: ScheduleDay): [number, number][] {
  let free: [number, number][] = [[toMin(day.start), toMin(day.end)]];
  const cut = (b0: number, b1: number) => {
    free = free.flatMap(([a0, a1]) => (!overlaps(a0, a1, b0, b1) ? [[a0, a1]] : [[a0, Math.max(a0, b0)], [Math.min(a1, b1), a1]]).filter(([x, y]) => y > x) as [number, number][]);
  };
  for (const b of [...input.breaks, ...input.prayerBreaks]) cut(toMin(b.start), toMin(b.end));
  for (const judgeId of committee.judgeIds) {
    const windows = input.judgeAvailability.filter(a => a.judgeId === judgeId && a.date === day.date);
    const anyForJudge = input.judgeAvailability.some(a => a.judgeId === judgeId);
    if (!anyForJudge) continue;
    /* محكّمٌ له توفّر معلن في أيام أخرى وليس له نافذة في هذا اليوم: غير متاح طوال اليوم. */
    const allowed = windows.map(w => [toMin(w.start), toMin(w.end)] as [number, number]);
    free = free.flatMap(([a0, a1]) => allowed.map(([w0, w1]) => [Math.max(a0, w0), Math.min(a1, w1)] as [number, number]).filter(([x, y]) => y > x));
  }
  return free.sort((a, b) => a[0] - b[0]);
}

export function buildSchedule(input: SchedulerInput): SchedulePlan {
  const problems = validateSchedulerInput(input);
  if (problems.length) throw new Error(problems[0]);
  const days = [...input.days].sort((a, b) => a.date.localeCompare(b.date));
  const booked = new Map<string, [number, number][]>(); // `${committeeId}|${date}` -> busy intervals
  const hallBooked = new Map<string, [number, number][]>(); // hall capacity accounting
  const slots: ScheduledSlot[] = [];
  const unscheduled: UnscheduledItem[] = [];
  const warnings: string[] = [];
  const duration = (p: SchedulerParticipant) => input.sessionMinutes[p.categoryId] ?? input.defaultSessionMinutes;
  const hallCapacity = (hallId: string) => input.halls.find(h => h.id === hallId)?.capacity ?? Infinity;
  const committeesInHall = (hallId: string) => input.committees.filter(c => c.hallId === hallId).length;

  const fits = (c: SchedulerCommittee, day: ScheduleDay, start: number, len: number) => {
    const end = start + len;
    if (!freeIntervals(input, c, day).some(([a, b]) => start >= a && end <= b)) return false;
    const busy = booked.get(`${c.id}|${day.date}`) || [];
    if (busy.some(([a, b]) => overlaps(start, end + input.transitionMinutes, a, b + input.transitionMinutes))) return false;
    /* سعة القاعة: عدد الجلسات المتزامنة في القاعة لا يتجاوز سعتها (بعدد اللجان التي تتسع لها). */
    const cap = hallCapacity(c.hallId);
    if (Number.isFinite(cap) && cap < committeesInHall(c.hallId)) {
      const concurrent = (hallBooked.get(`${c.hallId}|${day.date}`) || []).filter(([a, b]) => overlaps(start, end, a, b)).length;
      if (concurrent >= cap) return false;
    }
    return true;
  };
  const book = (c: SchedulerCommittee, day: ScheduleDay, start: number, len: number) => {
    const k = `${c.id}|${day.date}`, h = `${c.hallId}|${day.date}`;
    booked.set(k, [...(booked.get(k) || []), [start, start + len]]);
    hallBooked.set(h, [...(hallBooked.get(h) || []), [start, start + len]]);
  };
  const earliest = (c: SchedulerCommittee, len: number, notBefore?: string) => {
    for (const day of days) {
      if (notBefore && day.date < notBefore) continue;
      for (const [a, b] of freeIntervals(input, c, day)) {
        for (let t = a; t + len <= b; t += 5) if (fits(c, day, t, len)) return { day, start: t };
      }
    }
    return undefined;
  };

  const pinned = new Set<string>();
  for (const pin of [...input.pins].sort((a, b) => a.participantId.localeCompare(b.participantId))) {
    const p = input.participants.find(x => x.id === pin.participantId);
    const c = input.committees.find(x => x.id === pin.committeeId);
    const day = days.find(d => d.date === pin.date);
    if (!p || !c || !day) { unscheduled.push({ participantId: pin.participantId, reason: 'PIN_INVALID', detail: 'unknown participant, committee or day' }); pinned.add(pin.participantId); continue; }
    const len = duration(p);
    let start: number;
    try { start = toMin(pin.start); } catch { unscheduled.push({ participantId: p.id, reason: 'PIN_INVALID', detail: 'time' }); pinned.add(p.id); continue; }
    if (!c.judgeIds.every(j => judgeMayScore(input.conflicts, j, p, input.judgeUids).allowed)) { unscheduled.push({ participantId: p.id, reason: 'PIN_INVALID', detail: 'conflict of interest' }); pinned.add(p.id); continue; }
    if (!fits(c, day, start, len)) { unscheduled.push({ participantId: p.id, reason: 'PIN_INVALID', detail: 'slot unavailable or overlapping' }); pinned.add(p.id); continue; }
    if (!c.assignedCategories.includes(p.categoryId)) warnings.push(`PIN_OUTSIDE_COMMITTEE_CATEGORY:${p.id}`);
    book(c, day, start, len);
    slots.push({ participantId: p.id, committeeId: c.id, hallId: c.hallId, date: day.date, start: toHHMM(start), end: toHHMM(start + len), pinned: true, reason: 'manual override' });
    pinned.add(p.id);
  }

  const queue = input.participants.filter(p => !pinned.has(p.id)).sort((a, b) => a.categoryId.localeCompare(b.categoryId) || a.id.localeCompare(b.id));
  for (const p of queue) {
    const forCategory = input.committees.filter(c => c.assignedCategories.includes(p.categoryId));
    if (!forCategory.length) { unscheduled.push({ participantId: p.id, reason: 'NO_COMMITTEE_FOR_CATEGORY' }); continue; }
    const eligible = eligibleCommittees(forCategory, input.conflicts, p, input.judgeUids);
    if (!eligible.length) { unscheduled.push({ participantId: p.id, reason: 'ALL_COMMITTEES_CONFLICTED' }); continue; }
    const len = duration(p);
    let best: { c: SchedulerCommittee; day: ScheduleDay; start: number } | undefined;
    for (const c of [...eligible].sort((a, b) => a.id.localeCompare(b.id))) {
      const e = earliest(c, len, p.notBefore);
      if (!e) continue;
      const load = (booked.get(`${c.id}|${e.day.date}`) || []).length;
      const bestLoad = best ? (booked.get(`${best.c.id}|${best.day.date}`) || []).length : Infinity;
      if (!best || e.day.date < best.day.date || (e.day.date === best.day.date && (e.start < best.start || (e.start === best.start && load < bestLoad)))) best = { c, ...e };
    }
    if (!best) { unscheduled.push({ participantId: p.id, reason: 'NO_CAPACITY' }); continue; }
    book(best.c, best.day, best.start, len);
    const skipped = forCategory.length - eligible.length;
    slots.push({ participantId: p.id, committeeId: best.c.id, hallId: best.c.hallId, date: best.day.date, start: toHHMM(best.start), end: toHHMM(best.start + len), pinned: false, reason: `earliest free slot among ${eligible.length} eligible committee(s)${skipped ? `; ${skipped} excluded for conflict of interest` : ''}` });
  }

  const utilization = input.committees.map(c => {
    const mine = slots.filter(s => s.committeeId === c.id);
    return {
      committeeId: c.id, sessions: mine.length,
      busyMinutes: mine.reduce((n, s) => n + toMin(s.end) - toMin(s.start), 0),
      availableMinutes: days.reduce((n, d) => n + freeIntervals(input, c, d).reduce((m, [a, b]) => m + b - a, 0), 0),
    };
  });
  slots.sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start) || a.committeeId.localeCompare(b.committeeId));
  return { slots, unscheduled, warnings, utilization, inputHash: stableHash(input) };
}

/** Manual override: pin (or move) one participant and recompute everything else around it. */
export function withManualPin(input: SchedulerInput, pin: ManualPin): SchedulerInput {
  return { ...input, pins: [...input.pins.filter(p => p.participantId !== pin.participantId), pin] };
}
export function withoutPin(input: SchedulerInput, participantId: string): SchedulerInput {
  return { ...input, pins: input.pins.filter(p => p.participantId !== participantId) };
}
