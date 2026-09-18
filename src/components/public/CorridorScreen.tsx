import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Sparkles, UsersRound, X } from 'lucide-react';
import { useDialogBehavior } from '../../lib/useDialogBehavior';
import { useScreenAwake } from '../../lib/use-screen-awake';
import { useAppStore } from '../../lib/store';
import { fetchDeliveryPassage } from '../../lib/kfgqpc-library';
import { locusToPage, pageToJuz, surahAyahCount } from '../../lib/mushaf-map';
import { surahNameArabic } from '../judge/OfficialMushafSurface';
import { boardAge, describeAge, venueClock, type DisplayBoard } from '../../lib/display-board';

/*
 * شاشة الممرّ.
 *
 * الممرّات وقاعة الانتظار ليست شاشة نداء: من يقف أمامها إمّا منتظرٌ دوره، أو أهلُ متسابقٍ
 * يقتلون الوقت، أو ضيفٌ يتجوّل. وشاشة نداءٍ محضة تُقرأ في ثانيتين ثم تصير جدارًا أبيض
 * ثماني ساعات.
 *
 * وثلاثة أشياء تصلح لهذا الجدار، تتناوب عليه:
 *
 *   ١) **من المصحف** — موضعٌ يُختار من الصفحات التي تلتها هذه القاعة اليوم، معروضًا
 *      بخطّ المصحف كبيرًا. ليس تلاوةً جارية ولا يُدَّعى ذلك: لا نبض «مباشر» ولا مؤشّر
 *      صوت — لوحةُ مصحفٍ تُقرأ، ترتبط بيوم القاعة ولا تكشف عن أحدٍ شيئًا.
 *   ٢) **ختمة القاعة** — ٦٠٤ صفحة تُضيء كلّما أنهى متسابقٌ جلسته، وعدّادُ ما أتمّته
 *      القاعة. المنتظر يرى أن انتظاره جزءٌ من ختمةٍ تُبنى أمامه.
 *   ٣) **دورك** — اللجان وأرقامها ومن تناديه كلٌّ منها الآن، وكم أمامك.
 *
 * وحدّ الخصوصية هو حدّ بقية شاشات القاعة بالحرف: **لا يخرج إلا الكود**. ولذلك بعينه لا
 * تُعرض هنا آيةُ متسابقٍ جالسٍ أمام لجنةٍ الآن — من ينتظر خلف الباب يرى الشاشة، وعرضُ
 * موضعِ جلسةٍ جارية كشفٌ للسؤال. والمعروض تجميعٌ على مستوى الصفحة لا يُربط بأحد، والآية
 * تُنتقى منه انتقاءً لا يدلّ على متسابقٍ بعينه.
 */

export type CorridorPanel = 'mushaf' | 'khatmah' | 'queue';
export const CORRIDOR_PANELS: CorridorPanel[] = ['mushaf', 'khatmah', 'queue'];

/** أسماء اللوحات كما يختارها مدير التشغيل من الرابط. */
export const CORRIDOR_PANEL_LABEL: Record<CorridorPanel, string> = {
  mushaf: 'من المصحف',
  khatmah: 'ختمة القاعة',
  queue: 'دورك',
};

export const parseCorridorPanels = (raw: string | null): CorridorPanel[] => {
  const asked = String(raw || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
  const chosen = CORRIDOR_PANELS.filter(p => asked.includes(p));
  /* رابطٌ بلا اختيار يعرضها كلها: الافتراض أن يعمل الجدار، لا أن يبقى فارغًا. */
  return chosen.length ? chosen : CORRIDOR_PANELS;
};

export const CorridorScreen: React.FC<{
  board?: DisplayBoard;
  /** اختيار اللوحات كما جاء في الرابط (`panels=mushaf,queue`). يُحلَّل هنا لا في المُوجِّه:
      استيراد دالةٍ من هذا الملف في `App` يسحب الشاشة كلها إلى الحزمة الرئيسية. */
  panelsRaw?: string | null;
  panels?: CorridorPanel[];
  rotateSeconds?: number;
  reading?: string;
  onClose?: () => void;
}> = ({ board, panelsRaw, panels, rotateSeconds = 25, reading = 'hafs', onClose }) => {
  const requested = useMemo(() => panels ?? parseCorridorPanels(panelsRaw ?? null), [panels, panelsRaw]);
  const venueRef = useRef<HTMLDivElement | null>(null);
  useDialogBehavior(!!onClose, onClose || (() => {}), venueRef, { autoFocus: false });
  useScreenAwake(true);
  const { language, competition } = useAppStore();
  const ar = language !== 'en';

  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 5000); return () => clearInterval(t) }, []);

  /* اللوحة التي لا بيانات لها لا تدخل الدورة: جدارٌ يعرض خريطةً فارغة ربع دقيقة أسوأ من
     جدارٍ يعرض لوحتين تعملان. */
  const live = useMemo(() => requested.filter(panel => {
    if (panel === 'khatmah' || panel === 'mushaf') return !!board?.recitation?.totalRecitations;
    return true;
  }), [requested, board?.recitation?.totalRecitations]);
  const shown = live.length ? live : (['queue'] as CorridorPanel[]);

  const [index, setIndex] = useState(0);
  const step = Math.max(10, rotateSeconds);
  useEffect(() => {
    if (shown.length < 2) return;
    const t = setInterval(() => setIndex(i => (i + 1) % shown.length), step * 1000);
    return () => clearInterval(t);
  }, [shown.length, step]);
  const panel = shown[Math.min(index, shown.length - 1)];

  const age = boardAge(board?.generatedAt || '', now);
  const title = ar ? (board?.competitionNameArabic || competition.nameArabic) : (board?.competitionName || competition.name);

  return (
    <div ref={venueRef} className="fixed inset-0 z-50 mizan-venue-deep text-white font-arabic overflow-hidden" dir={ar ? 'rtl' : 'ltr'}>
      <div className="flex h-full flex-col p-6 sm:p-10">
        <header className="flex items-start justify-between gap-6">
          <div className="min-w-0">
            <div className="text-[11px] font-black tracking-[.2em] text-[#c6b58a]">{ar ? CORRIDOR_PANEL_LABEL[panel] : panel.toUpperCase()}</div>
            <h1 className="mt-1 truncate text-xl font-black sm:text-2xl">{title}</h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-end">
              <div className="text-2xl font-black tabular-nums sm:text-3xl" dir="ltr">{venueClock(now)}</div>
              <div className="mt-1 text-[10px] font-bold mizan-venue-muted">{describeAge(age.ageSeconds, ar)}</div>
            </div>
            {onClose && <button onClick={onClose} aria-label={ar ? 'إغلاق' : 'Close'} className="grid h-11 w-11 place-items-center rounded-xl text-white/50 hover:bg-white/10"><X className="h-5 w-5" /></button>}
          </div>
        </header>

        <main className="mt-6 flex-1 min-h-0">
          {panel === 'mushaf' && <MushafPanel ar={ar} board={board} reading={reading} rotateSeconds={step} />}
          {panel === 'khatmah' && <KhatmahPanel ar={ar} board={board} />}
          {panel === 'queue' && <QueuePanel ar={ar} board={board} />}
        </main>

        {/* نقاطٌ تقول أين نحن من الدورة، فلا يبدو تبدّل الشاشة عطلًا. */}
        {shown.length > 1 && (
          <footer className="mt-5 flex items-center justify-center gap-2" aria-hidden="true">
            {shown.map((p, i) => <span key={p} className="h-1.5 rounded-full transition-all duration-500" style={{ width: i === index ? 28 : 8, background: i === index ? '#c49a5d' : 'rgba(255,255,255,.22)' }} />)}
          </footer>
        )}
      </div>
    </div>
  );
};

/* ── من المصحف ───────────────────────────────────────────────────────────── */

/*
 * اختيار الموضع.
 *
 * الصفحات المتلوّة معروفة عددًا لا موضعًا — وهذا كل ما يخرج في الإسقاط. فتُجرَّب مواضع
 * من المصحف حتى يقع واحدٌ على صفحةٍ تلتها القاعة اليوم. وما لم يقع بعد محاولاتٍ معدودة
 * يُؤخذ أيُّ موضع: لوحةُ مصحفٍ تعمل خيرٌ من جدارٍ فارغ، والسطر أسفلها يقول أيّهما وقع.
 */
function pickLocus(pages?: number[]): { surah: number; ayah: number; fromToday: boolean } {
  const recited = pages?.some(n => n > 0) ? pages : undefined;
  for (let attempt = 0; attempt < 40; attempt++) {
    const surah = 1 + Math.floor(Math.random() * 114);
    const count = surahAyahCount(surah) || 1;
    const ayah = 1 + Math.floor(Math.random() * count);
    if (!recited) return { surah, ayah, fromToday: false };
    const page = locusToPage(surah, ayah);
    if (recited[page - 1] > 0) return { surah, ayah, fromToday: true };
  }
  const surah = 1 + Math.floor(Math.random() * 114);
  return { surah, ayah: 1 + Math.floor(Math.random() * (surahAyahCount(surah) || 1)), fromToday: false };
}

const MushafPanel: React.FC<{ ar: boolean; board?: DisplayBoard; reading: string; rotateSeconds: number }> = ({ ar, board, reading, rotateSeconds }) => {
  const pages = board?.recitation?.pages;
  const [locus, setLocus] = useState(() => pickLocus(pages));
  const [text, setText] = useState<string[] | null>(null);

  /* موضعٌ جديد مع كل دورة: الجدار نفسه لا يعيد الآية نفسها كل ربع دقيقة. */
  useEffect(() => {
    const t = setInterval(() => setLocus(pickLocus(pages)), Math.max(20, rotateSeconds) * 1000);
    return () => clearInterval(t);
  }, [pages, rotateSeconds]);

  useEffect(() => {
    let live = true;
    setText(null);
    const end = Math.min(surahAyahCount(locus.surah) || locus.ayah, locus.ayah + 2);
    void fetchDeliveryPassage(reading, locus.surah, locus.ayah, end)
      .then(p => { if (live) setText(p?.ayat?.map(a => a.text) || null) })
      .catch(() => { if (live) setText(null) });
    return () => { live = false };
  }, [locus.surah, locus.ayah, reading]);

  const page = locusToPage(locus.surah, locus.ayah);
  const name = surahNameArabic(locus.surah) || String(locus.surah);

  return (
    <section className="flex h-full flex-col justify-center rounded-[32px] border border-white/10 bg-white/[.03] p-8 text-center sm:p-12">
      <div className="inline-flex items-center justify-center gap-2 text-[11px] font-black tracking-[.18em] text-[#c6b58a]">
        <BookOpen className="h-4 w-4" />{ar ? 'من المصحف' : 'FROM THE MUSHAF'}
      </div>

      <div className="mt-8 min-h-0 flex-1 overflow-hidden">
        {text?.length
          ? <p className="font-quran text-[clamp(1.6rem,3.6vw,3.2rem)] leading-[2.05] text-white/95">{text.join(' ')}</p>
          : <p className="mt-10 text-sm mizan-venue-muted">{ar ? 'جارٍ تحميل الموضع…' : 'Loading…'}</p>}
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[13px] font-bold text-white/60">
        <span className="text-[#e0c894]">{ar ? `سورة ${name} · الآية ${locus.ayah}` : `${name} ${locus.ayah}`}</span>
        <span aria-hidden="true">·</span>
        <span>{ar ? `صفحة ${page}` : `page ${page}`}</span>
        <span aria-hidden="true">·</span>
        <span>{ar ? `الجزء ${pageToJuz(page)}` : `juz ${pageToJuz(page)}`}</span>
      </div>

      {/* يُقال من أين جاءت، فلا يظنّها أحد تلاوةً جارية الآن. */}
      <p className="mt-4 text-[11px] leading-5 text-white/35">
        {locus.fromToday
          ? (ar ? 'موضع من الصفحات التي تلتها هذه القاعة اليوم. ليست تلاوة جارية، ولا تخصّ متسابقًا بعينه.' : 'A passage from pages this hall recited today — not a live session and not tied to any participant.')
          : (ar ? 'موضع من المصحف. ليست تلاوة جارية، ولا تخصّ متسابقًا بعينه.' : 'A passage from the Mushaf — not a live session and not tied to any participant.')}
      </p>
    </section>
  );
};

/* ── ختمة القاعة ─────────────────────────────────────────────────────────── */

const pageGlow = (count: number, max: number): string => {
  if (count <= 0) return 'rgba(255,255,255,.05)';
  const t = Math.min(1, count / Math.max(1, max));
  if (t > 0.85) return `rgba(213,168,99,${0.55 + t * 0.4})`;
  return `rgba(${26 + Math.round(t * 40)},${74 + Math.round(t * 96)},${58 + Math.round(t * 40)},${0.35 + t * 0.6})`;
};

const KhatmahPanel: React.FC<{ ar: boolean; board?: DisplayBoard }> = ({ ar, board }) => {
  const agg = board?.recitation;
  const pages = agg?.pages || [];
  const max = Math.max(1, ...pages);
  const covered = agg?.coveredPages || 0;
  const percent = Math.round((covered / Math.max(1, pages.length || 604)) * 100);
  /* نحو الختمة التالية: كم صفحة بلغت العتبة التالية — لا نسبة التغطية نفسها. */
  const next = (agg?.khatmatCompleted || 0) + 1;
  const toward = pages.length ? Math.round((pages.filter(n => n >= next).length / pages.length) * 100) : 0;

  return (
    <section className="grid h-full gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.7fr)]">
      <div className="flex flex-col justify-between rounded-[28px] border border-white/10 bg-gradient-to-b from-[#17362b] to-[#122019] p-7">
        <div className="inline-flex items-center gap-2 text-[11px] font-black tracking-[.18em] text-[#c6b58a]"><Sparkles className="h-4 w-4" />{ar ? 'ختمة القاعة' : 'HALL KHATMĀT'}</div>
        <div>
          <div className="text-[clamp(3.5rem,7vw,5.5rem)] font-black leading-none tabular-nums">{agg?.khatmatCompleted || 0}</div>
          <p className="mt-3 text-sm text-white/55">{ar ? 'ختمة كاملة أتمّتها هذه القاعة اليوم' : 'complete recitations of the whole Quran today'}</p>
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between text-[11px] text-white/50"><span>{ar ? 'نحو الختمة التالية' : 'Toward next'}</span><span className="font-black text-[#d9c193]" dir="ltr">{toward}%</span></div>
          <div className="h-2.5 overflow-hidden rounded-full bg-white/10"><span className="block h-full rounded-full bg-gradient-to-r from-[#2f6555] to-[#c49a5d]" style={{ width: `${Math.max(2, toward)}%` }} /></div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Tile value={`${percent}%`} label={ar ? 'من المصحف' : 'of the Mushaf'} />
            <Tile value={String(agg?.totalRecitations || 0)} label={ar ? 'تلاوة موضع' : 'passages'} />
          </div>
        </div>
      </div>

      <div className="rounded-[28px] border border-white/10 bg-white/[.035] p-6">
        <div className="mb-3 flex items-center justify-between text-[11px] font-black tracking-[.15em] mizan-venue-muted">
          <span>{ar ? '٦٠٤ صفحة' : '604 PAGES'}</span>
          <span>{ar ? `${covered} صفحة تُليت اليوم` : `${covered} pages today`}</span>
        </div>
        <div dir="ltr" role="img" aria-label={ar ? `تغطية ${percent} بالمئة من صفحات المصحف` : `${percent}% Mushaf coverage`}
          className="grid gap-[3px] [grid-template-columns:repeat(26,minmax(0,1fr))] lg:[grid-template-columns:repeat(34,minmax(0,1fr))]">
          {(pages.length ? pages : new Array(604).fill(0)).map((count, i) => (
            <span key={i} className="aspect-square rounded-[2.5px] transition-colors duration-700" style={{ background: pageGlow(count, max) }} />
          ))}
        </div>
        <p className="mt-3 text-[10px] leading-5 text-white/35">
          {ar ? 'تجميع على مستوى الصفحة لما تُلي اليوم. لا يُربط بمتسابق ولا يقول من قرأ ماذا.' : 'Page-level aggregate of today’s recitation. Never linked to a participant.'}
        </p>
      </div>
    </section>
  );
};

const Tile: React.FC<{ value: string; label: string }> = ({ value, label }) => (
  <div className="rounded-2xl bg-white/[.06] p-3 text-center">
    <div className="text-xl font-black tabular-nums" dir="ltr">{value}</div>
    <div className="mt-1 text-[10px] text-white/45">{label}</div>
  </div>
);

/* ── دورك ────────────────────────────────────────────────────────────────── */

const QueuePanel: React.FC<{ ar: boolean; board?: DisplayBoard }> = ({ ar, board }) => {
  const panels = (board?.committees || []).filter(c => c.status !== 'offline');
  return (
    <section className="flex h-full flex-col">
      <div className="grid grid-cols-3 gap-4">
        <Tile value={String(board?.totalWaiting ?? 0)} label={ar ? 'في الانتظار' : 'waiting'} />
        <Tile value={String(board?.activePanels ?? panels.length)} label={ar ? 'لجنة تعمل' : 'active panels'} />
        <Tile value={String(board?.totalCompleted ?? 0)} label={ar ? 'أنهوا اليوم' : 'completed today'} />
      </div>

      <div className="mt-5 grid min-h-0 flex-1 auto-rows-fr gap-3 overflow-hidden sm:grid-cols-2 xl:grid-cols-3">
        {panels.slice(0, 12).map(slice => (
          <article key={slice.committeeId} className="flex items-center gap-4 rounded-[22px] border border-white/10 bg-white/[.035] px-5 py-4">
            <span className="grid h-12 min-w-12 shrink-0 place-items-center rounded-2xl bg-white/10 px-2 text-sm font-black tabular-nums">{slice.code}</span>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-bold mizan-venue-muted">{ar ? 'الآن' : 'NOW'}</div>
              <div className="truncate text-2xl font-black tabular-nums text-[#e0c894]" dir="ltr">{slice.nowCalling?.code || '—'}</div>
            </div>
            <div className="shrink-0 text-end">
              <div className="text-[10px] font-bold mizan-venue-muted">{ar ? 'التالي' : 'NEXT'}</div>
              <div className="text-sm font-black tabular-nums text-white/75" dir="ltr">{slice.next[0]?.code || '—'}</div>
              <div className="mt-1 inline-flex items-center gap-1 text-[10px] text-white/45"><UsersRound className="h-3 w-3" />{slice.waitingCount}</div>
            </div>
          </article>
        ))}
      </div>
      {!panels.length && <p className="mt-10 text-center text-sm mizan-venue-muted">{ar ? 'لم تبدأ اللجان بعد.' : 'No panel has started yet.'}</p>}
    </section>
  );
};

export default CorridorScreen;
