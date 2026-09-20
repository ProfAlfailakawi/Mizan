import React from 'react';
import { CheckCircle2, Ear, Mic, Timer } from 'lucide-react';

/*
 * كيف تجري التجربة — أربعُ أيقوناتٍ متتابعة، لا أربعُ فقرات.
 *
 * كانت أربعةَ صفوفٍ لكلٍّ عنوانٌ وسطرُ شرح، تملأ الشاشة قبل أن يضغط المتسابقُ زرًّا
 * واحدًا. وهو لا يقرؤها: جاء ليجرّب لا ليطالع دليلًا. فبقي التسلسلُ مرئيًّا — وهو ما
 * يُفيده حقًّا: أربعُ خطواتٍ لا أكثر، وهذا ترتيبُها.
 *
 * والشرحُ لم يُحذف بل انتقل إلى `title`/`aria-label`: من لمسَ أو استعمل قارئَ شاشةٍ
 * سمعه كاملًا. فالاختصارُ في البصر لا في المعنى.
 *
 * وخطوةُ التتبّع تبقى صادقةً في الحالين: حين لا يكون مهيّأً تُقرأ «بلا تتبّع» باهتةً
 * ولا تُعرض على أنها عاملة — فادّعاءُ استماعٍ لا يقع أسوأُ من ألّا يُذكر أصلًا.
 */

export interface TrialStepsProps {
  ar: boolean;
  /** هل التتبّع الحيّ مهيّأ في هذه المسابقة فعلًا. */
  listening: boolean;
}

export const TrialSteps: React.FC<TrialStepsProps> = ({ ar, listening }) => {
  const steps: { key: string; Icon: React.ComponentType<{ className?: string }>; label: string; hint: string; muted?: boolean }[] = [
    {
      key: 'mic', Icon: Mic,
      label: ar ? 'ميكروفون' : 'Microphone',
      hint: ar ? 'تفتح ميكروفونك مرة واحدة: نتأكد أن صوتك يصل قبل أن تبدأ، لا في منتصف الموضع.' : 'You open your microphone once, so we confirm your voice arrives before you start.',
    },
    {
      key: 'locus', Icon: Timer,
      label: ar ? 'موضع' : 'Locus',
      hint: ar ? 'يُعرض عليك موضع وتقرأ على المؤقّت. المطلع مخفيّ حتى تطلبه — كما لو أن المحكّم لقّنك.' : 'A locus appears and the clock runs; the opening stays hidden until you ask for it.',
    },
    listening
      ? {
        key: 'track', Icon: Ear,
        label: ar ? 'تتبّع' : 'Tracking',
        hint: ar ? 'يتابع النظام أين وصلت. صوتك يمرّ ولا يُحفظ، ولا يصل اللجنة منه شيء.' : 'The engine follows your position; audio passes through and is discarded.',
      }
      : {
        key: 'track', Icon: Ear, muted: true,
        label: ar ? 'بلا تتبّع' : 'No tracking',
        hint: ar ? 'التتبّع غير مهيّأ في هذه المسابقة. تبقى التجربة بمؤقّتها ومواضعها، ولا يُدَّعى استماعٌ لا يقع.' : 'Tracking is not configured here; the trial keeps its clock and loci, and no listening is claimed.',
      },
    {
      key: 'report', Icon: CheckCircle2,
      label: ar ? 'أثرك' : 'Your run',
      hint: ar ? 'ثم ترى أثرك كاملًا: أين تعثّرت وكم استغرقت — وصفًا لا درجة.' : 'Then you see the whole run: where you stumbled and how long you took.',
    },
  ];

  return (
    <ol className="flex items-stretch rounded-2xl border border-[#e4e2da] bg-white px-1.5 py-3" aria-label={ar ? 'كيف تجري التجربة' : 'How the trial runs'}>
      {steps.map((step, i) => (
        <React.Fragment key={step.key}>
          {i > 0 && <li aria-hidden="true" className="w-px self-center bg-[#e8e6de]" style={{ height: '2.25rem' }} />}
          <li
            data-step={step.key}
            data-muted={step.muted ? 'true' : undefined}
            title={step.hint}
            className="flex min-w-0 flex-1 flex-col items-center gap-1.5 px-1 text-center"
          >
            <span
              aria-hidden="true"
              className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${step.muted ? 'bg-[#f1efe9] text-[#656b66]' : 'bg-[#E7EEE9] text-[#214C40]'}`}
            >
              <step.Icon className="h-4 w-4" />
            </span>
            <span className={`text-[10px] font-black leading-4 ${step.muted ? 'text-[#656b66]' : 'text-[#39423d]'}`}>{step.label}</span>
            <span className="sr-only">{step.hint}</span>
          </li>
        </React.Fragment>
      ))}
    </ol>
  );
};
