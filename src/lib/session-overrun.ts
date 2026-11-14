/*
 * جلسةٌ طالت أكثر من المعتاد — تنبيهٌ لغرفة العمليات لا حكمٌ على اللجنة.
 *
 * طابور القاعة كلّه يقف خلف جلسةٍ واحدة. وكان مركز العمليات يعرض ما وقع (حادث، مراجعة،
 * جهاز) ولا يعرض ما **لم ينتهِ**: لجنةٌ علقت مع متسابقٍ ثلث ساعة لا يظهر أمرها في أي بطاقة
 * حتى يسأل أحدٌ من الواقفين. وقتُ بدء الجلسة محفوظٌ أصلًا في `statusHistory` لكل متسابق،
 * فلا حاجة إلى حقلٍ جديد ولا إلى كتابةٍ في المخزن.
 *
 * هذه **وحدة نقيّة**: تأخذ القائمة والوقت الحاضر وتعيد ما تجاوز العتبة. لا ساعةَ داخلها —
 * الوقتُ يُمرَّر، فتُختبر بلا انتظار.
 */

import type { Committee, Participant } from '../types';

/** العتبة الافتراضية بالدقائق. اللجان تتفاوت، فهي قابلة للتجاوز عند الاستدعاء. */
export const DEFAULT_SESSION_OVERRUN_MINUTES = 15;

export interface SessionOverrun {
  participantId: string;
  participantCode: string;
  committeeId?: string;
  committeeCode?: string;
  /** لحظة بدء الجلسة (ISO) كما سُجّلت في تاريخ الحالة. */
  startedAt: string;
  /** المدة المنقضية بالدقائق الكاملة. */
  minutes: number;
}

/** آخر مرة دخل فيها المتسابق حالة «في الجلسة»، أو `undefined` إن لم يُسجَّل ذلك. */
export function sessionStartedAt(participant: Pick<Participant, 'status' | 'statusHistory'>): string | undefined {
  if (participant.status !== 'in_session') return undefined;
  for (let i = (participant.statusHistory || []).length - 1; i >= 0; i--) {
    const entry = participant.statusHistory[i];
    if (entry.status === 'in_session' && Number.isFinite(Date.parse(entry.timestamp))) return entry.timestamp;
  }
  return undefined;
}

/**
 * الجلسات الجارية التي تجاوزت العتبة، الأطول أولًا.
 *
 * من لا وقتَ بدءٍ مسجَّلًا له لا يُحكم عليه (لا تخمين)، ومن بدأ في المستقبل (ساعةُ جهازٍ
 * منحرفة) لا يُعدّ متأخرًا.
 */
export function overrunningSessions(args: {
  participants: Participant[];
  committees: Committee[];
  now: number;
  thresholdMinutes?: number;
}): SessionOverrun[] {
  const threshold = Math.max(1, args.thresholdMinutes ?? DEFAULT_SESSION_OVERRUN_MINUTES);
  const out: SessionOverrun[] = [];
  for (const p of args.participants) {
    const startedAt = sessionStartedAt(p);
    if (!startedAt) continue;
    const minutes = Math.floor((args.now - Date.parse(startedAt)) / 60_000);
    if (minutes < threshold) continue;
    const committee = args.committees.find(c => c.id === p.assignedCommitteeId);
    out.push({
      participantId: p.id,
      participantCode: p.code,
      committeeId: committee?.id,
      committeeCode: committee?.code,
      startedAt,
      minutes,
    });
  }
  return out.sort((a, b) => b.minutes - a.minutes || a.participantCode.localeCompare(b.participantCode));
}
