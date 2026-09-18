import React, { useMemo } from 'react';
import { Gauge, Scale, ShieldCheck } from 'lucide-react';

/*
 * بطاقة التلاوة — الوجه الذي يخرج من ميزان إلى الناس.
 *
 * ما يُعرض على شاشة القاعة أثناء التلاوة لا يجوز أن يحمل درجةً ولا وفاق لجنة: من ينتظر
 * خلف الباب يرى الشاشة، والتحكيم سرٌّ حتى الختم. وما يُشارك **بعد** الإعلان هو العكس
 * تمامًا: الدرجة معلنة، ووفاق اللجنة يقول إن الحكم لم يكن رأيَ واحد، وختمُ السلسلة
 * يقول إن الرقم لا يُعدَّل بعد ختمه — وهذه أقوى ثلاث كلماتٍ تملكها المنظومة، وكانت
 * تُعرض رقمين باهتين في صندوق رمادي.
 *
 * فهذه البطاقة للحظة الثانية وحدها: لا تُفتح قبل أن تصير النتيجة مرئيةً بسياسة المسابقة،
 * ولا تحمل رقمًا لم يصدر. وكل ما فيها من سجلّ المتسابق نفسه: درجته، وعدد محكّميه المستقلّين
 * ومدى تقاربهم، وحالة ختمها.
 *
 * ووفاق اللجنة ليس زينةً محسوبة على الهواء: هو تقارب أحكام محكّميه على المسطرة نفسها
 * (فارق أعلى حكمٍ وأدناه منسوبًا إلى مدى الدرجة). ومحكّمٌ واحد لا يُنتج وفاقًا، فلا يُعرض
 * — لأن «١٠٠٪ وفاق» من حكمٍ واحد كذبةٌ مصقولة.
 */

export interface RecitationResultCardProps {
  ar: boolean;
  participantName: string;
  participantCode: string;
  /** روايته كما سُجّلت. */
  riwaya?: string;
  categoryName?: string;
  finalScore: number;
  /** الدرجة العظمى التي قيس عليها. */
  maxScore?: number;
  /** أحكام محكّميه المستقلّين على هذه الجلسة. */
  judgeScores: number[];
  /** هل خُتمت النتيجة بسلسلة البصمات. */
  sealed: boolean;
}

export const RecitationResultCard: React.FC<RecitationResultCardProps> = ({
  ar, participantName, participantCode, riwaya, categoryName, finalScore, maxScore = 100, judgeScores, sealed,
}) => {
  /* الوفاق من حكمين فأكثر فقط، ومن نفس مدى الدرجة لا من رقمٍ مطلق. */
  const agreement = useMemo(() => {
    const scores = judgeScores.filter(n => Number.isFinite(n));
    if (scores.length < 2) return null;
    const spread = Math.max(...scores) - Math.min(...scores);
    const range = Math.max(1, maxScore);
    return { percent: Math.max(0, Math.round((1 - spread / range) * 100)), judges: scores.length, spread };
  }, [judgeScores, maxScore]);

  return (
    <section
      dir={ar ? 'rtl' : 'ltr'}
      className="overflow-hidden rounded-[28px] border border-white/10 bg-gradient-to-b from-[#16302a] to-[#0f1b17] p-6 text-white shadow-[0_24px_60px_-24px_rgba(12,26,21,.75)] sm:p-8"
    >
      <header className="flex flex-wrap items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 text-[11px] font-black tracking-[.14em] text-[#c6b58a]">
          <span className="h-2 w-2 rounded-full bg-[#c49a5d]" aria-hidden="true" />
          {ar ? 'نتيجة معلنة · ميزان' : 'PUBLISHED RESULT · MIZAN'}
        </span>
        <span dir="ltr" className="rounded-full bg-white/10 px-3 py-1.5 text-[11px] font-black tabular-nums text-white/80 whitespace-nowrap">{participantCode}</span>
      </header>

      <div className="mt-6">
        <h2 className="text-2xl font-black leading-tight sm:text-[28px]">{participantName}</h2>
        <p className="mt-1.5 text-[11px] font-bold text-white/45">
          {[categoryName, riwaya].filter(Boolean).join(' · ') || (ar ? 'مسابقة ميزان' : 'MIZAN competition')}
        </p>
      </div>

      {/* الدرجة: الرقم وحده كبيرًا، لأن هذا هو ما يُشارك. */}
      <div className="mt-7 rounded-[22px] border border-white/10 bg-white/[.04] p-6 text-center">
        <div className="text-[11px] font-black tracking-[.14em] text-[#c6b58a]">{ar ? 'الدرجة المعتمدة' : 'FINAL SCORE'}</div>
        <div className="mt-2 text-[64px] font-black leading-none tabular-nums text-white" dir="ltr">{finalScore.toFixed(2)}</div>
        <div className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-bold text-white/55">
          <ShieldCheck className="h-3.5 w-3.5 text-[#8fbfa9]" />
          {sealed ? (ar ? 'مختومة بسلسلة بصمات — لا تُعدَّل بعد ختمها' : 'Sealed to the hash chain — immutable') : (ar ? 'معتمدة وبانتظار الختم' : 'Approved, pending seal')}
        </div>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {agreement ? (
          <div className="rounded-[18px] border border-white/10 bg-white/[.035] p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-black text-white/70"><Scale className="h-3.5 w-3.5 text-[#8fbfa9]" />{ar ? 'وفاق اللجنة' : 'Panel agreement'}</span>
              <span className="text-sm font-black tabular-nums text-[#8fbfa9]" dir="ltr">{agreement.percent}%</span>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
              <span className="block h-full rounded-full bg-gradient-to-r from-[#2f6555] to-[#8fbfa9]" style={{ width: `${Math.max(3, agreement.percent)}%` }} />
            </div>
            <p className="mt-2.5 text-[10px] leading-5 text-white/45">
              {ar
                ? `${agreement.judges} محكّمين مستقلّين، وأوسع فارق بينهم ${agreement.spread.toFixed(2)} درجة.`
                : `${agreement.judges} independent judges; widest gap ${agreement.spread.toFixed(2)}.`}
            </p>
          </div>
        ) : (
          <div className="rounded-[18px] border border-white/10 bg-white/[.035] p-4">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-black text-white/70"><Scale className="h-3.5 w-3.5 text-[#8fbfa9]" />{ar ? 'وفاق اللجنة' : 'Panel agreement'}</span>
            <p className="mt-3 text-[10px] leading-5 text-white/45">
              {ar ? 'يُقاس الوفاق من حكمين مستقلّين فأكثر، ولا يُعرض من حكمٍ واحد.' : 'Agreement needs two independent scores; it is not shown for one.'}
            </p>
          </div>
        )}

        <div className="rounded-[18px] border border-white/10 bg-white/[.035] p-4">
          <div className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-black text-white/70"><Gauge className="h-3.5 w-3.5 text-[#c49a5d]" />{ar ? 'من الدرجة الكاملة' : 'Of full marks'}</span>
            <span className="text-sm font-black tabular-nums text-[#e0c894]" dir="ltr">{Math.round((finalScore / Math.max(1, maxScore)) * 100)}%</span>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
            <span className="block h-full rounded-full bg-gradient-to-r from-[#8a6a2f] to-[#e0c894]" style={{ width: `${Math.max(3, Math.min(100, (finalScore / Math.max(1, maxScore)) * 100))}%` }} />
          </div>
          <p className="mt-2.5 text-[10px] leading-5 text-white/45" dir="ltr">{finalScore.toFixed(2)} / {maxScore}</p>
        </div>
      </div>

      <p className="mt-5 text-center text-[10px] leading-5 text-white/35">
        {ar
          ? 'الحكم للمحكّمين البشريين وحدهم. لا يظهر في هذه البطاقة ما لم يُعلَن، ولا تحمل بيانات متسابقٍ آخر.'
          : 'Scoring is human. Nothing unpublished appears here, and no other participant’s data is included.'}
      </p>
    </section>
  );
};

export default RecitationResultCard;
