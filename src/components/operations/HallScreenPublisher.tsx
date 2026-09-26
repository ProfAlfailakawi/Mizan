import React, { useState } from 'react';
import { MonitorDot, Copy, Check, Play, BookOpen, Sparkles, UsersRound } from 'lucide-react';
import { IS_DEMO_SESSION, useAppStore } from '../../lib/store';
import { useBoardPublisherStatus } from '../../lib/use-board-publisher';
import { describePublisherRole } from '../../lib/board-lease';
import { Badge } from '../design-system/Badge';

/*
 * شاشات القاعة: من ينشرها، وكيف تُفتح.
 *
 * أمران كانا مفقودين معًا.
 *
 * الأول: **الروابط تُكتب باليد.** لا شيء في المنصّة يولّد `#board?comp=…&panel=C7` — فيُملى
 * على المشرف حرفًا حرفًا أمام عشر شاشات، وخطأٌ في كودٍ واحد يعطي شاشةً بيضاء لا تقول شيئًا.
 *
 * والثاني: **النشر بلا وجه.** كان معلّقًا بتبويبٍ واحد، فإغلاقه يوقف كل الشاشات، ولا أحد
 * في غرفة العمليات يعرف أن السبب عنده. صار التناوب تلقائيًّا بين أجهزة الإدارة الحاضرة،
 * ويبقى أن يُقال لمن يقف أمام الجهاز أين موقعه منه.
 */

export const HallScreenPublisher: React.FC = () => {
  const s = useAppStore();
  const ar = s.language === 'ar';
  const status = useBoardPublisherStatus();
  const [copied, setCopied] = useState('');
  const [corridorPanels, setCorridorPanels] = useState<string[]>(['mushaf', 'khatmah', 'queue']);
  const [corridorRotate, setCorridorRotate] = useState(25);
  /* الحقل يُكتب فيه بحرية ويُثبَّت عند الخروج منه. كان يُقصّ مع كل ضغطة مفتاح إلى ١٠–١٢٠،
     فمن أراد «40» كتب «4» فصارت «10» ثم «104» فصارت «120» — ولا يصل إلى رقمه أبدًا. */
  const [rotateDraft, setRotateDraft] = useState('25');
  const commitRotate = (raw: string) => { const n = Math.round(Number(raw)); const v = Number.isFinite(n) && n > 0 ? Math.max(10, Math.min(120, n)) : 25; setCorridorRotate(v); setRotateDraft(String(v)); };
  const togglePanel = (id: string) => setCorridorPanels(prev => {
    const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
    /* لوحةٌ واحدة على الأقل: جدارٌ بلا لوحةٍ شاشةٌ سوداء. */
    return next.length ? next : prev;
  });

  /*
   * بيئة العرض ترى البطاقة، وإن لم يكن فيها نشر.
   *
   * النشر معلّق بهوية موثّقة، ولا هوية في صندوق العرض — فكان `INELIGIBLE` يُخفي البطاقة
   * كلها، ومعها روابط شاشات القاعة والممرّ واللجان. فلا يستطيع من يعرض المنتج أن يفتح
   * شاشةً واحدة من شاشات القاعة، وهي من أظهر ما فيه.
   *
   * فتُعرض البطاقة، ويُقال صراحةً إن الجهاز لا ينشر هنا وإن الشاشة ستقرأ بيانات هذا
   * الجهاز نفسه — لا يُدَّعى نشرٌ لا يقع، ولا يُحجب ما يمكن عرضه بصدق.
   */
  if (status.role === 'INELIGIBLE' && !IS_DEMO_SESSION) return null;
  const demoOnly = IS_DEMO_SESSION && status.role === 'INELIGIBLE';

  const committees = s.committees.filter(c => c.competitionId === s.competition.id);
  const base = `${window.location.origin}${window.location.pathname}`;
  /* رابطٌ نُسخ من بيئة العرض يحمل رايتها: التبويب الجديد لا يرث تخزين هذا التبويب، فكانت
     الشاشة تُفتح هناك على «لم تُنشر شاشة هذه المسابقة بعد». */
  const demoTag = IS_DEMO_SESSION ? '&demo=1' : '';
  const hallLink = `${base}#board?comp=${encodeURIComponent(s.competition.id)}&view=hall${demoTag}`;
  const panelLink = (code: string) => `${base}#board?comp=${encodeURIComponent(s.competition.id)}&panel=${encodeURIComponent(code)}${demoTag}`;
  /*
   * شاشة الممرّ: جدارٌ يتناوب، ولوحاته يختارها المشرف قبل أن ينسخ الرابط.
   *
   * ولا تُعرض عليه أسماء معاملات: يضغط ما يريد عرضه، ويخرج الرابط بها. ورابطٌ بلا اختيار
   * يعرضها كلها، فلا يقف جدارٌ فارغًا لأن أحدًا نسي معاملًا.
   */
  const corridorLink = `${base}#board?comp=${encodeURIComponent(s.competition.id)}&view=corridor&panels=${corridorPanels.join(',')}&rotate=${corridorRotate}${demoTag}`;
  /* ما ستعرضه كل لوحة الآن — فيرى المشرف أن الجدار سيمتلئ قبل أن يفتحه. */
  const recited = s.recitationLedger.filter(x => x.competitionId === s.competition.id);
  const waiting = s.participants.filter(p => p.competitionId === s.competition.id && p.status === 'in_queue').length;
  const panelFacts: Record<string, string> = {
    mushaf: ar ? `${new Set(recited.map(x => x.surah)).size} سورة تُليت منها اليوم` : `${new Set(recited.map(x => x.surah)).size} surahs recited today`,
    khatmah: ar ? `${recited.length} موضعًا تُلي` : `${recited.length} passages recited`,
    queue: ar ? `${waiting} في الانتظار · ${committees.filter(c => c.status !== 'offline').length} لجنة` : `${waiting} waiting · ${committees.filter(c => c.status !== 'offline').length} panels`,
  };

  /* الحافظة الحديثة تُرفض في إطارٍ مضمَّن أو صفحةٍ غير آمنة — وهناك كان الزرّ لا يفعل شيئًا.
     فيُجرَّب النسخ القديم بعدها، ويُعلن النجاح في الحالتين. */
  const copy = async (key: string, url: string) => {
    let ok = false;
    try { await navigator.clipboard.writeText(url); ok = true } catch { ok = false }
    if (!ok) {
      try {
        const area = document.createElement('textarea');
        area.value = url; area.setAttribute('readonly', ''); area.style.position = 'fixed'; area.style.opacity = '0';
        document.body.appendChild(area); area.select(); ok = document.execCommand('copy'); area.remove();
      } catch { ok = false }
    }
    setCopied(ok ? key : `${key}:failed`); setTimeout(() => setCopied(''), 2500);
  };
  /* يفتح الشاشة في تبويبٍ جديد؛ وإن منعه المتصفّح فُتحت في هذا التبويب. */
  const open = (url: string) => { const w = window.open(url, '_blank'); if (!w) window.location.href = url; };

  const leading = status.role === 'LEADER';

  return <section className="mizan-surface p-5 sm:p-6">
    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        <span className="w-11 h-11 rounded-xl bg-[#E7EEE9] text-[#214C40] grid place-items-center"><MonitorDot className="w-5 h-5" /></span>
        <div>
          <div className="mizan-kicker">{ar ? 'شاشات القاعة' : 'HALL SCREENS'}</div>
          <h2 className="font-black mt-1">{ar ? 'افتح الشاشات، واعرف من ينشرها' : 'Open the screens, and see who publishes them'}</h2>
          <p className="text-[13px] text-[#646965] mt-2 max-w-2xl leading-5">
            {ar
              ? 'الشاشة تفتح رابطها ولا تسجّل دخولًا ولا تقرأ سجلّ المتسابقين: تعرض إسقاطًا بالأكواد وحدها ينشره جهاز إدارة. وأجهزة الإدارة تتناوب النشر تلقائيًّا، فإغلاق أحدها لا يُطفئ القاعة.'
              : 'A screen opens its link with no sign-in and no access to the roster: it shows a codes-only projection published by an admin device. Admin devices hand the publishing over automatically, so closing one does not darken the hall.'}
          </p>
        </div>
      </div>
      <Badge variant={leading ? 'emerald' : 'neutral'}>{demoOnly ? (ar ? 'بيئة عرض' : 'Demo') : leading ? (ar ? 'ينشر من هنا' : 'Publishing here') : (ar ? 'احتياط جاهز' : 'Standby')}</Badge>
    </div>

    {/* المحاسبة: من يقف أمام هذا الجهاز يستحقّ أن يعرف أن عشر شاشاتٍ معلّقة به. */}
    <div className={`mt-4 rounded-2xl px-4 py-3 text-[13px] font-bold leading-5 ${leading ? 'bg-[#E7EEE9] text-[#214C40]' : 'bg-[#f1efe9] text-[#4a4f4b]'}`}>
      {demoOnly
        ? (ar
          ? 'بيئة عرض: لا نشر من هذا الجهاز. تُفتح الشاشات بروابطها وتقرأ بيانات هذا الجهاز نفسه، فتعمل كما تعمل في القاعة.'
          : 'Demo environment: nothing is published from here. The screens open by their links and read this device’s own data.')
        : describePublisherRole(status, ar)}
    </div>

    <div className="mt-4 space-y-2">
      <LinkRow
        label={ar ? 'شاشة القاعة العامة — كل اللجان' : 'Public hall screen — every panel'}
        url={hallLink} ar={ar} copied={copied === 'hall'} failed={copied === 'hall:failed'} onCopy={() => void copy('hall', hallLink)} onOpen={() => open(hallLink)} />
      {committees.map(c => <LinkRow
        key={c.id}
        label={ar ? `شاشة اللجنة ${c.code}` : `Panel screen ${c.code}`}
        url={panelLink(c.code)} ar={ar} copied={copied === c.id} failed={copied === `${c.id}:failed`} onCopy={() => void copy(c.id, panelLink(c.code))} onOpen={() => open(panelLink(c.code))} />)}
      {!committees.length && <div className="rounded-xl bg-[#f1efe9] px-4 py-3 text-[13px] text-[#646965]">
        {ar ? 'لا لجان بعد — شاشة القاعة وحدها متاحة.' : 'No panels yet — only the hall screen is available.'}
      </div>}
    </div>

    {/* شاشة الممرّ — تُركَّب قبل أن تُنسخ، لأنها الوحيدة التي يختار المشرف محتواها. */}
    <div className="mt-4 rounded-2xl border border-[#dfddd6] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-black">{ar ? 'شاشة الممرّ وقاعة الانتظار' : 'Corridor & waiting screen'}</div>
          <p className="mt-1 text-xs leading-5 text-[#646965]">
            {ar
              ? 'جدارٌ يتناوب بين لوحاته. لا يعرض موضع جلسةٍ جارية ولا يخرج منه إلا الكود، كبقية شاشات القاعة.'
              : 'A rotating wall. It never shows a live session’s passage, and like every hall screen it carries codes only.'}
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs font-black text-[#59615c]">
          {ar ? 'كل' : 'every'}
          <input type="number" inputMode="numeric" min={10} max={120} step={5} value={rotateDraft}
            onChange={e => { setRotateDraft(e.target.value); const n = Number(e.target.value); if (n >= 10 && n <= 120) setCorridorRotate(Math.round(n)); }}
            onBlur={e => commitRotate(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') commitRotate((e.target as HTMLInputElement).value); }}
            className="mizan-input !w-20 text-xs" aria-label={ar ? 'ثواني التناوب' : 'Rotation seconds'} />
          {ar ? 'ثانية' : 'sec'}
        </label>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {([['mushaf', 'من المصحف', 'From the Mushaf', BookOpen], ['khatmah', 'ختمة القاعة', 'Hall khatmah', Sparkles], ['queue', 'دورك والطابور', 'Queue', UsersRound]] as const).map(([id, arLabel, enLabel, Icon]) => {
          const on = corridorPanels.includes(id);
          const last = on && corridorPanels.length === 1;
          return <button key={id} type="button" onClick={() => togglePanel(id)} aria-pressed={on} aria-label={ar ? arLabel : enLabel} title={last ? (ar ? 'لوحةٌ واحدة على الأقل' : 'At least one panel') : undefined}
            className={`min-h-12 rounded-xl border px-3 py-1.5 text-start transition ${on ? 'border-[#214C40] bg-[#E7EEE9] text-[#214C40]' : 'border-[#dedbd2] bg-white text-[#636965] opacity-80'}`}>
            <span className="flex items-center gap-1.5 text-[13px] font-black">{on ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}{ar ? arLabel : enLabel}</span>
            <span className="mt-0.5 block text-[11px] font-bold opacity-75">{panelFacts[id]}</span>
          </button>;
        })}
      </div>
      <div className="mt-3">
        <LinkRow
          label={ar ? 'رابط شاشة الممرّ' : 'Corridor screen link'}
          url={corridorLink} ar={ar} copied={copied === 'corridor'} failed={copied === 'corridor:failed'} onCopy={() => void copy('corridor', corridorLink)} onOpen={() => open(corridorLink)} />
        <div className="mt-2 text-xs font-bold text-[#59615c]">
          {ar ? `يعرض ${corridorPanels.length} ${corridorPanels.length === 1 ? 'لوحة ثابتة' : `لوحات تتبدّل كل ${corridorRotate} ثانية`}` : `${corridorPanels.length} panel(s), rotating every ${corridorRotate}s`}
        </div>
      </div>
      <p className="mt-2 text-xs leading-5 text-[#696f6b]">
        {ar
          ? '«من المصحف» و«ختمة القاعة» تعملان بعد أن تُنهي القاعة أول جلساتها، فمنها يُبنى ما يُعرض. وقبل ذلك يبقى «دورك» وحده.'
          : '“From the Mushaf” and “Hall khatmah” start once the hall completes its first sessions; until then the queue panel runs alone.'}
      </p>
    </div>

    {/* الشاشة تُقفل بالإيماءة والرمز من داخلها؛ يُقال هنا لئلّا يُبحث عنه في الممرّ. */}
    <p className="text-xs text-[#646965] mt-3 leading-5">
      {ar
        ? 'افتح الرابط على الشاشة ثم اقفلها من زرّ القفل داخلها، فلا يخرج منها مارّ. والشاشة تعلن عمر ما تعرضه من نفسها إن تأخّر.'
        : 'Open the link on the screen, then lock it from the lock button inside it so no passer-by can exit. Each screen reports the age of what it shows if it falls behind.'}
    </p>
  </section>;
};

const LinkRow: React.FC<{ label: string; url: string; ar: boolean; copied: boolean; failed?: boolean; onCopy: () => void; onOpen?: () => void }> = ({ label, url, ar, copied, failed, onCopy, onOpen }) => (
  <div className="rounded-2xl border border-[#dfddd6] px-4 py-3 flex flex-wrap items-center justify-between gap-3">
    <span className="min-w-0">
      <span className="block text-xs font-black">{label}</span>
      <span className="block mizan-proof-code text-xs text-[#646965] mt-0.5 truncate" dir="ltr">{url}</span>
    </span>
    <button
      type="button"
      onClick={onCopy}
      className="shrink-0 inline-flex items-center gap-1.5 rounded-xl bg-[#f1efe9] hover:bg-[#e7e4dc] px-3 py-2 text-[13px] font-black text-[#171b18]"
    >
      {copied ? <Check className="w-3.5 h-3.5" aria-hidden /> : <Copy className="w-3.5 h-3.5" aria-hidden />}
      {copied ? (ar ? 'نُسخ' : 'Copied') : failed ? (ar ? 'انسخه يدويًّا' : 'Copy manually') : (ar ? 'انسخ الرابط' : 'Copy link')}
    </button>
    {onOpen && <button type="button" onClick={onOpen}
      className="shrink-0 inline-flex items-center gap-1.5 rounded-xl bg-[#214C40] hover:bg-[#1a3d33] px-3 py-2 text-[13px] font-black text-white">
      <Play className="w-3.5 h-3.5" aria-hidden />{ar ? 'افتح الشاشة' : 'Open screen'}
    </button>}
  </div>
);
