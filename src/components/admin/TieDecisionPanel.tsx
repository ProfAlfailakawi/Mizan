import React, { useMemo, useState } from 'react';
import { Scale } from 'lucide-react';

import { useAppStore } from '../../lib/store';
import { TIE_DECISION_ROLES, TIE_REASON_MIN_LENGTH, describeTie } from '../../lib/tie-resolution';

/*
 * المركز الموقوف على تعادل — وهذه هي اليد التي تفصل فيه.
 *
 * التعادل الذي يتجاوز المقاعد لا يُحلّ في الشيفرة: النظام يرصده ويحجب المركز، ثم ينتظر
 * قرارًا من الإدارة بسببٍ مكتوب. وبلا هذه الشاشة يبقى الرصد بابًا لا يُفتح: مركزٌ موقوف
 * إلى الأبد لا يجد أحدٌ أين يفصل فيه — وهو عطلٌ أسوأ من الحكم الصامت الذي أُزيل.
 *
 * وما يُعرض هنا ليس زرَّ «اختر الفائز»: يُقال أوّلًا إن قواعد كسر التعادل المعلنة طُبِّقت
 * ولم تفصل، ثم يُطلب أحد أمرين — تشريكُ المركز بين المتعادلين، أو ترتيبٌ معلن تكتبه
 * الإدارة. ولا يُقبل أيٌّ منهما بلا سبب: قرارٌ بلا سبب لا يُراجَع ولا يُقاس عليه في
 * الدورة القادمة.
 *
 * واللجنة لا تظهر هنا. هي قيّمت وانتهت إلى تساوٍ — وهو حكمُها لا نقصٌ فيه. والفصل بعده
 * قرارٌ إداريّ بلائحةٍ إدارية، فيُنسب إلى من يملكه ويُسأل عنه.
 */

export const TieDecisionPanel: React.FC<{ ar: boolean }> = ({ ar }) => {
  const store = useAppStore();
  const ties = useMemo(() => store.contestedTies(), [store.results, store.tieDecisions, store.competition.id]);
  const open = ties.filter(t => !t.decision);
  const settled = ties.filter(t => t.decision);

  const mayDecide = (TIE_DECISION_ROLES as readonly string[]).includes(store.currentUser.role);

  const [activeKey, setActiveKey] = useState('');
  const [mode, setMode] = useState<'shared' | 'ordered'>('shared');
  const [order, setOrder] = useState<string[]>([]);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');

  if (!ties.length) return null;

  const start = (key: string, participantIds: string[]) => {
    setActiveKey(key); setMode('shared'); setOrder(participantIds); setReason(''); setNote('');
  };

  /* تحريك اسمٍ في الترتيب. الترتيب يشمل الجميع دائمًا، فلا يُقرأ غيابُ اسمٍ سقوطًا ولا نسيانًا. */
  const move = (index: number, delta: number) => {
    const next = [...order];
    const to = index + delta;
    if (to < 0 || to >= next.length) return;
    [next[index], next[to]] = [next[to], next[index]];
    setOrder(next);
  };

  const submit = (key: string) => {
    const out = store.decideTie({ key, outcome: mode, orderedParticipantIds: order, reason });
    if (out.ok === true) { setActiveKey(''); setNote(''); return; }
    setNote(ar ? out.messageArabic : out.messageEnglish);
  };

  return <section className="mizan-surface p-5 sm:p-6">
    <div className="flex items-start gap-2.5">
      <Scale className="mt-0.5 h-5 w-5 shrink-0 text-[#9B7542]" />
      <div className="min-w-0">
        <div className="mizan-kicker">{ar ? 'قرار الإدارة' : 'ADMINISTRATIVE DECISION'}</div>
        <h2 className="mt-1 font-extrabold">{ar ? 'مراكز موقوفة على تعادل' : 'Places on hold for a tie'}</h2>
        <p className="mt-1 text-[11px] leading-6 text-[#666c68]">
          {ar
            ? 'اللجنة قيّمت وانتهت إلى تساوٍ، وقواعد كسر التعادل المعلنة لم تفصل. الفصل بعد ذلك قرار إداري بسبب مكتوب — ولا يُعلن المركز قبله.'
            : 'The committee scored and arrived at a tie, and the published tie-break rules did not separate them. Breaking it is an administrative decision with a written reason — and the place is not announced before it.'}
        </p>
      </div>
    </div>

    {!mayDecide && <div role="status" className="mt-4 rounded-xl bg-[#F2EADC] px-3.5 py-3 text-[11px] font-bold leading-6 text-[#725630]">
      {ar
        ? 'هذه القرارات للإدارة (مدير المسابقة أو مدير الجهة). ما تراه هنا للعلم لا للفصل.'
        : 'These decisions belong to the administration (competition or organization admin). This view is informational.'}
    </div>}

    <ul className="mt-4 space-y-3">
      {open.map(tie => <li key={tie.group.key} className="rounded-2xl border border-[#e4e2da] bg-white p-3.5">
        <div className="text-[12px] font-black text-[#3E4A43]">{tie.categoryName} · {ar ? tie.place.titleArabic : tie.place.titleEnglish}</div>
        <p className="mt-1 text-[11px] leading-6 text-[#7a6a4f]">{describeTie(tie.group, null, ar)}</p>
        <ul className="mt-2 flex flex-wrap gap-2">
          {tie.group.participants.map(p => <li key={p.participantId} className="rounded-lg bg-[#F3F1EB] px-2.5 py-1 text-[11px] font-bold text-[#4f5752]">{p.participantCode}</li>)}
        </ul>

        {mayDecide && activeKey !== tie.group.key && <div className="mt-3 flex justify-end">
          <button type="button" onClick={() => start(tie.group.key, tie.group.participants.map(p => p.participantId))}
            className="rounded-lg bg-[#214C40] px-3 py-2 text-[11px] font-black text-white">
            {ar ? 'تسجيل قرار الإدارة' : 'Record the decision'}
          </button>
        </div>}

        {mayDecide && activeKey === tie.group.key && <div className="mt-3 space-y-3 border-t border-[#ece9e1] pt-3">
          <div className="flex flex-wrap gap-2" role="group" aria-label={ar ? 'نوع القرار' : 'Decision type'}>
            <button type="button" aria-pressed={mode === 'shared'} onClick={() => setMode('shared')}
              className={`rounded-lg px-3 py-2 text-[11px] font-black ${mode === 'shared' ? 'bg-[#214C40] text-white' : 'bg-[#F3F1EB] text-[#4f5752]'}`}>
              {ar ? 'يُشرَّك المركز بينهم' : 'Share the place'}
            </button>
            <button type="button" aria-pressed={mode === 'ordered'} onClick={() => setMode('ordered')}
              className={`rounded-lg px-3 py-2 text-[11px] font-black ${mode === 'ordered' ? 'bg-[#214C40] text-white' : 'bg-[#F3F1EB] text-[#4f5752]'}`}>
              {ar ? 'ترتيب معلن تكتبه الإدارة' : 'An ordering the administration writes'}
            </button>
          </div>

          {mode === 'ordered' && <ol className="space-y-1.5">
            {order.map((id, index) => {
              const person = tie.group.participants.find(p => p.participantId === id);
              return <li key={id} className="flex items-center gap-2 rounded-lg bg-[#F8F7F3] px-2.5 py-1.5">
                <span className="text-[11px] font-black tabular-nums text-[#7a6a4f]">{index + 1}</span>
                <span className="min-w-0 flex-1 truncate text-[11px] font-bold">{person?.participantCode || id}</span>
                <button type="button" onClick={() => move(index, -1)} disabled={index === 0}
                  aria-label={ar ? `رفع ${person?.participantCode || id}` : `Move ${person?.participantCode || id} up`}
                  className="h-11 w-11 rounded-lg bg-white text-[#4f5752] disabled:opacity-40">↑</button>
                <button type="button" onClick={() => move(index, 1)} disabled={index === order.length - 1}
                  aria-label={ar ? `خفض ${person?.participantCode || id}` : `Move ${person?.participantCode || id} down`}
                  className="h-11 w-11 rounded-lg bg-white text-[#4f5752] disabled:opacity-40">↓</button>
              </li>;
            })}
            <li className="text-[10px] leading-5 text-[#6b675d]">
              {ar
                ? `يأخذ المركز أوّلُ ${tie.group.seatsRemaining}، ومن بعدهم ينافس على ما دونه من المراكز ولا يُحذف.`
                : `The first ${tie.group.seatsRemaining} take the place; the rest compete for the places below rather than being dropped.`}
            </li>
          </ol>}

          <label className="block">
            <span className="mizan-field-label">{ar ? 'سبب القرار (يُحفظ في السجل ويُقرأ في المراجعة)' : 'Reason (recorded in the log and read on review)'}</span>
            <textarea value={reason} onChange={e => setReason(e.target.value)} className="mizan-textarea min-h-20 text-sm resize-none"
              placeholder={ar ? 'المادة من لائحة الدورة التي استند إليها القرار.' : 'The clause of the competition regulations the decision rests on.'} />
          </label>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <span className="me-auto text-[10px] font-bold text-[#6b675d]">
              {ar ? `${TIE_REASON_MIN_LENGTH} حرفًا فأكثر` : `${TIE_REASON_MIN_LENGTH} characters or more`}
            </span>
            <button type="button" onClick={() => setActiveKey('')} className="rounded-lg bg-[#F3F1EB] px-3 py-2 text-[11px] font-black text-[#4f5752]">
              {ar ? 'إلغاء' : 'Cancel'}
            </button>
            <button type="button" onClick={() => submit(tie.group.key)} className="rounded-lg bg-[#214C40] px-3 py-2 text-[11px] font-black text-white">
              {ar ? 'تسجيل القرار' : 'Record decision'}
            </button>
          </div>

          {/* الرفض يُقال بنصّه، ولا يبتلعه الزر. */}
          {note && <div role="alert" className="rounded-xl bg-[#F6E7E7] px-3.5 py-3 text-[11px] font-bold leading-6 text-[#7A2E2E]">{note}</div>}
        </div>}
      </li>)}

      {settled.map(tie => <li key={tie.group.key} className="rounded-2xl border border-[#e4e2da] bg-[#F8FAF8] p-3.5">
        <div className="text-[12px] font-black text-[#3E4A43]">{tie.categoryName} · {ar ? tie.place.titleArabic : tie.place.titleEnglish}</div>
        <p className="mt-1 text-[11px] leading-6 text-[#31584c]">{describeTie(tie.group, tie.decision, ar)}</p>
        {/* القرار يبقى منسوبًا بعد الإعلان: من فصل، ومتى. */}
        <p className="mt-1 text-[10px] font-bold text-[#6b675d]">{tie.decision?.decidedBy.userId} · {tie.decision?.decidedAt}</p>
      </li>)}
    </ul>
  </section>;
};
