import React, { useMemo } from 'react';
import { BadgeCheck, CircleAlert, Flame, Scale, Settings2, TriangleAlert } from 'lucide-react';

/*
 * ما يحتاج تدخّلك — لوحةٌ تُقرأ بلمحة، لا قائمةُ عناوينَ متساوية.
 *
 * كانت خمسةَ أسطرٍ متطابقة الشكل: «مراجعة A-1200»، «مراجعة C-1182»، «انقطاع صوت في القاعة
 * — ٣ مرات». وهي كلُّها بنفس الوزن البصري وإن اختلفت خطورتُها ونوعُها وعمرُها — فيقرؤها
 * المشغّل من أعلى إلى أسفل ويقرّر بنفسه أيَّها أوّلًا، وهو ما يُفترض باللوحة أن تفعله عنه.
 *
 * وما تضيفه هذه اللوحة ليس زخرفًا بل ثلاث معلوماتٍ كانت موجودةً في البيانات ومحذوفةً من
 * العرض:
 *
 *   • **التركيب.** شريطٌ واحد يقول: أكثرُ ما عندك مراجعات، لا أعطال. وهو أوّل ما يُغيّر
 *     خطّة النصف ساعة القادمة — ولم يكن يُقرأ إلا بعدّ الأسطر.
 *   • **الخطورة.** حالةٌ حرجة وحالةٌ هيّنة كانتا سطرين متطابقين. صارتا لونين ووزنين،
 *     والحرجُ يتصدّر لأنه يُعالَج أوّلًا لا لأنه وقع أوّلًا.
 *   • **التكرار والعمر.** «٣ مرات» كان نصًّا داخل العنوان، و«منذ متى» لم يكن يُعرض أصلًا.
 *     وعطلٌ تكرّر ثلاثًا منذ ساعةٍ ليس كعطلٍ وقع مرّةً قبل دقيقة.
 *
 * ولا رقم في هذه اللوحة إلا وله سجلٌّ خلفه: لا تقدير ولا تجميل. والفراغ حالةٌ صريحة
 * تُعرض بثقة — «لا شيء مفتوح» جوابٌ نافع، لا شاشةٌ بيضاء.
 */

export type AttentionKind = 'setup' | 'review' | 'incident';
export type AttentionTone = 'critical' | 'warning' | 'info';

export interface AttentionItem {
  id: string;
  title: string;
  kind: AttentionKind;
  tone?: AttentionTone;
  /** كم مرّة تكرّر هذا البند نفسه. الواحدة لا تُعرض. */
  count?: number;
  /** آخر وقوعٍ، بصيغة ISO. غيابه يعني أن لا زمن معروفًا — فلا يُخترع. */
  at?: string;
}

const KIND = {
  setup:    { icon: Settings2,     ar: 'إعداد',   en: 'Setup',     bar: '#9aa8a0' },
  review:   { icon: Scale,         ar: 'مراجعة',  en: 'Review',    bar: '#c49a5d' },
  incident: { icon: TriangleAlert, ar: 'عطل',     en: 'Incident',  bar: '#a5544b' },
} as const;

const TONE = {
  critical: { dot: '#a5544b', chip: 'bg-[#f6e7e4] text-[#8a453c]', ar: 'حرج',  en: 'Critical' },
  warning:  { dot: '#9B7542', chip: 'bg-[#f5ecdd] text-[#7a5c2c]', ar: 'تنبيه', en: 'Warning' },
  info:     { dot: '#5d7d70', chip: 'bg-[#e9eeea] text-[#3f584d]', ar: 'مفتوح', en: 'Open' },
} as const;

const RANK: Record<AttentionTone, number> = { critical: 0, warning: 1, info: 2 };

/** «منذ متى» بأقرب وحدةٍ صادقة. ولا يُعرض شيء حين لا يُعرف الوقت. */
function since(at: string | undefined, ar: boolean): string {
  if (!at) return '';
  const ms = Date.now() - Date.parse(at);
  if (!Number.isFinite(ms) || ms < 0) return '';
  const min = Math.floor(ms / 60000);
  if (min < 1) return ar ? 'الآن' : 'now';
  if (min < 60) return ar ? `منذ ${min} د` : `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return ar ? `منذ ${hr} س` : `${hr}h ago`;
  return ar ? `منذ ${Math.floor(hr / 24)} ي` : `${Math.floor(hr / 24)}d ago`;
}

export const AttentionBoard: React.FC<{ items: AttentionItem[]; ar: boolean; title?: string; hint?: string; max?: number }> = ({ items, ar, title, hint, max = 6 }) => {
  /* الترتيب: الأخطر أوّلًا، ثم الأكثر تكرارًا، ثم الأحدث. */
  const sorted = useMemo(() => [...items].sort((a, b) => {
    const t = RANK[a.tone || 'info'] - RANK[b.tone || 'info'];
    if (t) return t;
    const c = (b.count || 1) - (a.count || 1);
    if (c) return c;
    return Date.parse(b.at || '') - Date.parse(a.at || '') || 0;
  }), [items]);

  /* التركيب: كم من كلّ نوع. والشريط نسبةٌ من المجموع لا عدّادٌ مطلق. */
  const mix = useMemo(() => (Object.keys(KIND) as AttentionKind[])
    .map((kind) => ({ kind, n: items.filter((x) => x.kind === kind).length }))
    .filter((x) => x.n > 0), [items]);

  const critical = items.filter((x) => (x.tone || 'info') === 'critical').length;

  if (!items.length) {
    return <section className="mizan-surface p-5 sm:p-6">
      <Head ar={ar} title={title} hint={hint} />
      <div className="mt-5 rounded-2xl border border-[#dfe7e1] bg-[#f2f6f3] py-9 text-center">
        <BadgeCheck className="mx-auto h-7 w-7 text-[#2F6555]" aria-hidden />
        <div className="mt-2.5 text-sm font-black text-[#214C40]">{ar ? 'لا شيء مفتوح' : 'Nothing open'}</div>
        <p className="mx-auto mt-1.5 max-w-xs text-[10px] leading-5 text-[#5f6b64]">
          {ar ? 'لا أعطال ولا حالات مراجعة تنتظر قرارك. ما لا يظهر هنا يسير وحده.' : 'No faults or review cases are waiting on you. Anything not listed here is running on its own.'}
        </p>
      </div>
    </section>;
  }

  return <section className="mizan-surface p-5 sm:p-6">
    <Head ar={ar} title={title} hint={hint} />

    {/* العدد كبيرًا، والحرجُ بجانبه لأنه هو الذي يقرّر البدء. */}
    <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
      <div className="flex items-end gap-3">
        <div className="text-[44px] font-black leading-none tabular-nums text-[#20241f]" dir="ltr">{items.length}</div>
        <div className="pb-1 text-[11px] font-bold leading-5 text-[#666d68]">
          {ar ? 'بندًا مفتوحًا' : 'open items'}
          {critical > 0 && <div className="mt-0.5 inline-flex items-center gap-1 text-[#8a453c]">
            <Flame className="h-3 w-3" aria-hidden />{ar ? `${critical} منها حرج` : `${critical} critical`}
          </div>}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5">
        {mix.map(({ kind, n }) => <span key={kind} className="inline-flex items-center gap-1.5 text-[10px] font-black text-[#5a625c]">
          <span className="h-2 w-2 rounded-full" style={{ background: KIND[kind].bar }} aria-hidden />
          {ar ? KIND[kind].ar : KIND[kind].en} <span className="tabular-nums" dir="ltr">{n}</span>
        </span>)}
      </div>
    </div>

    {/* شريط التركيب: نظرةٌ واحدة تقول أين يقع ثقل اليوم. */}
    <div className="mt-3.5 flex h-2 overflow-hidden rounded-full bg-[#eceae4]" role="img"
      aria-label={mix.map(({ kind, n }) => `${ar ? KIND[kind].ar : KIND[kind].en}: ${n}`).join('، ')}>
      {mix.map(({ kind, n }) => <span key={kind} className="h-full first:rounded-s-full last:rounded-e-full"
        style={{ width: `${(n / items.length) * 100}%`, background: KIND[kind].bar }} />)}
    </div>

    <ol className="mt-4 space-y-1.5">
      {sorted.slice(0, max).map((item) => {
        const kind = KIND[item.kind];
        const tone = TONE[item.tone || 'info'];
        const Icon = kind.icon;
        const age = since(item.at, ar);
        return <li key={item.id} className="flex items-center gap-3 rounded-2xl border border-[#e9e7e1] bg-[#fbfaf7] px-3.5 py-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl" style={{ background: `${kind.bar}1f`, color: kind.bar }}>
            <Icon className="h-4 w-4" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-black text-[#222623]">{item.title}</span>
            <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] font-bold text-[#6b716c]">
              <span className="inline-flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: tone.dot }} aria-hidden />
                {ar ? kind.ar : kind.en}
              </span>
              {age && <span className="tabular-nums">· {age}</span>}
            </span>
          </span>
          {(item.count || 1) > 1 && <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black tabular-nums ${tone.chip}`} dir="ltr"
            title={ar ? `تكرّر ${item.count} مرات` : `${item.count} occurrences`}>×{item.count}</span>}
        </li>;
      })}
    </ol>

    {/* ما لم يتّسع له المكان يُقال عددًا، لا يُبتلع بصمت. */}
    {sorted.length > max && <div className="mt-2.5 text-center text-[10px] font-bold text-[#6b716c]">
      {ar ? `و${sorted.length - max} بندًا آخر` : `and ${sorted.length - max} more`}
    </div>}
  </section>;
};

const Head: React.FC<{ ar: boolean; title?: string; hint?: string }> = ({ ar, title, hint }) => (
  <div className="flex items-start justify-between gap-3">
    <div className="min-w-0">
      <div className="mizan-kicker">{ar ? 'ما يحتاج تدخّلك' : 'NEEDS YOU'}</div>
      <h2 className="mt-1 font-extrabold">{title || (ar ? 'ما لم يُغلق بعد' : 'Still open')}</h2>
      {hint && <p className="mt-1.5 text-[10px] leading-5 text-[#696f6b]">{hint}</p>}
    </div>
    <CircleAlert className="h-5 w-5 shrink-0 text-[#89673a]" aria-hidden />
  </div>
);

export default AttentionBoard;
