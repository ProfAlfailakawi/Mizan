import React, { useMemo } from 'react';
import { RecitationReplay, type ReplayMark } from './RecitationReplay';
import type { JudgeEvent } from '../../types';

/*
 * «شريط الجلسة» — مراجعةٌ بعد القفل، لا تحكيم.
 *
 * يُفعّل مكوّن `RecitationReplay` الموجود (كان مبنيًّا ولا يُعرض) تحت ورقة المحكّم بعد قفل
 * تقييمه، وفقط حين يوجد تسجيلٌ مكتمل محفوظ لهذه الجلسة — وهو الشرط نفسه الذي تعلنه
 * لوحة الأدلة («إعادة الصوت تظهر بعد حفظ تسجيل الجلسة المصرح به»).
 *
 * العلامات هي ملاحظات المحكّم نفسه غير المتراجَع عنها، ملوّنةً بمعيارها، وإزاحتها وقتُ
 * الملاحظة ناقصًا بداية التسجيل. لمسُ علامةٍ يعيد تشغيل المقطع من لحظتها. لا يكتب شيئًا،
 * ولا يُغيّر درجة، ولا يُفتح والتقييم مفتوح.
 */

export const CRITERION_STRIP_TONE: Record<string, string> = {
  memorization: '#9B3B2F',
  tajweed: '#214C40',
  waqf_ibtida: '#1D4A66',
  performance: '#9B7542',
  custom: '#59615C',
};

const CRITERION_LABEL: Record<string, [string, string]> = {
  memorization: ['حفظ', 'Memorization'],
  tajweed: ['تجويد', 'Tajweed'],
  waqf_ibtida: ['وقف وابتداء', 'Waqf & ibtida'],
  performance: ['أداء', 'Performance'],
  custom: ['خاص', 'Custom'],
};

export const SessionStrip: React.FC<{
  ar: boolean;
  recordingUrl: string;
  recordingStartedAt: string;
  events: JudgeEvent[];
  currentQuestionIndex: number;
  trail: ReplayMark[];
  ayat: { ayah: number; text: string }[];
  toneFor: (criterion: string) => string;
}> = ({ ar, recordingUrl, recordingStartedAt, events, currentQuestionIndex, trail, ayat, toneFor }) => {
  const start = Date.parse(recordingStartedAt);
  const human = useMemo<ReplayMark[]>(() => {
    if (!Number.isFinite(start)) return [];
    return events.filter(e => !e.reversed).flatMap(e => {
      const at = Date.parse(e.timestamp) - start;
      if (!Number.isFinite(at) || at < 0) return [];
      const tone = toneFor(e.criterion);
      const [la, le] = CRITERION_LABEL[tone] || CRITERION_LABEL.custom;
      /* الآية تُذكر فقط لموضع السؤال الحاضر: نصّ إعادة التشغيل هو مقطع هذا السؤال وحده. */
      const ayah = e.questionIndex === currentQuestionIndex ? e.locus?.ayah : undefined;
      return [{ offsetMs: at, ayah, wordIndex: ayah !== undefined && e.locus ? e.locus.word - 1 : undefined, kind: 'HUMAN_MARKER' as const, tone: CRITERION_STRIP_TONE[tone] || CRITERION_STRIP_TONE.custom, label: ar ? `علامة ${la}` : `${le} mark` }];
    });
  }, [events, start, currentQuestionIndex, toneFor, ar]);
  const marks = useMemo(() => [...trail, ...human], [trail, human]);
  const used = useMemo<string[]>(() => [...new Set<string>(events.filter(e => !e.reversed).map(e => toneFor(e.criterion)))], [events, toneFor]);

  return (
    <div className="mz-vw-strip mt-4 w-full max-w-2xl mx-auto text-start" data-session-strip>
      {used.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-black text-[#59615c]" aria-label={ar ? 'ألوان المعايير' : 'Criterion colours'}>
          {used.map(t => (
            <span key={t} className="inline-flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: CRITERION_STRIP_TONE[t] || CRITERION_STRIP_TONE.custom }} />{(CRITERION_LABEL[t] || CRITERION_LABEL.custom)[ar ? 0 : 1]}</span>
          ))}
        </div>
      )}
      <RecitationReplay recordingUrl={recordingUrl} ayat={ayat} trail={marks} ar={ar} playOnMark />
    </div>
  );
};
