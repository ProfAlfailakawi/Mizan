import React from 'react';
import { ShieldCheck } from 'lucide-react';

/*
 * بطاقة التلاوة — الوجه الذي يخرج من ميزان إلى الناس.
 *
 * ما يُعرض على شاشة القاعة أثناء التلاوة لا يجوز أن يحمل درجة: من ينتظر خلف الباب يرى
 * الشاشة، والتحكيم سرٌّ حتى الختم. وما يُشارك **بعد** الإعلان هو العكس تمامًا: الدرجة
 * معلنة، وختمُ السلسلة يقول إن الرقم لا يُعدَّل بعد ختمه.
 *
 * فهذه البطاقة للحظة الثانية وحدها: لا تُفتح قبل أن تصير النتيجة مرئيةً بسياسة المسابقة،
 * ولا تحمل رقمًا لم يصدر. وكل ما فيها من سجلّ المتسابق نفسه: درجته وحالة ختمها.
 *
 * ولا لوحةَ تحتها. كانت تحمل «وفاق اللجنة» و«من الدرجة الكاملة»، فحُذفتا بقرار المالك:
 * الثانيةُ الرقمُ نفسُه بصيغةٍ أخرى، والأولى تكشف تفرّقَ المحكّمين لمن لا يملك تأويله.
 */

export interface RecitationResultCardProps {
  ar: boolean;
  participantName: string;
  participantCode: string;
  /** روايته كما سُجّلت. */
  riwaya?: string;
  categoryName?: string;
  finalScore: number;
  /** هل خُتمت النتيجة بسلسلة البصمات. */
  sealed: boolean;
}

export const RecitationResultCard: React.FC<RecitationResultCardProps> = ({
  ar, participantName, participantCode, riwaya, categoryName, finalScore, sealed,
}) => {
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

      {/*
        * بطاقةُ النتيجة رقمٌ واحد.
        *
        * كانت تحت الدرجة لوحتان: «وفاق اللجنة» و«من الدرجة الكاملة». وحُذفتا بقرار المالك.
        * والنسبةُ من الدرجة الكاملة تكرارٌ للرقم نفسه بصيغةٍ أخرى، ووفاقُ اللجنة يكشف
        * تفرّقَ المحكّمين لمن لا يملك تأويله — والحكمُ معتمَدٌ مختوم، فلا يُزاد عليه ما
        * يُشكِّك فيه من يقرؤه.
        */}

      <p className="mt-5 text-center text-[10px] leading-5 text-white/35">
        {ar
          ? 'الحكم للمحكّمين البشريين وحدهم. لا يظهر في هذه البطاقة ما لم يُعلَن، ولا تحمل بيانات متسابقٍ آخر.'
          : 'Scoring is human. Nothing unpublished appears here, and no other participant’s data is included.'}
      </p>
    </section>
  );
};

export default RecitationResultCard;
