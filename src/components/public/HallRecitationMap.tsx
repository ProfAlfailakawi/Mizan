import React, { useEffect, useMemo, useState } from 'react';
import { BookOpen, Sparkles, X, Radio } from 'lucide-react';
import { useAppStore } from '../../lib/store';
import { buildHallRecitation } from '../../lib/hall-recitation';
import { pageToJuz } from '../../lib/mushaf-map';

// Live Hall Recitation Map — "today this hall recited the whole Quran."
// A privacy-safe, meters-readable visualization of every Mushaf page the hall has touched,
// plus a khatmah counter. No participant identity is ever shown — only page-level tallies.

const JUZ_LABELS_AR = ['الأول','الثاني','الثالث','الرابع','الخامس','السادس','السابع','الثامن','التاسع','العاشر','الحادي عشر','الثاني عشر','الثالث عشر','الرابع عشر','الخامس عشر','السادس عشر','السابع عشر','الثامن عشر','التاسع عشر','العشرون','الحادي والعشرون','الثاني والعشرون','الثالث والعشرون','الرابع والعشرون','الخامس والعشرون','السادس والعشرون','السابع والعشرون','الثامن والعشرون','التاسع والعشرون','الثلاثون'];

/** Map a page tally to a warm emerald→gold glow on the dark hall canvas. */
function pageColor(count: number, max: number): string {
  if (count <= 0) return 'rgba(255,255,255,.045)';
  const t = Math.min(1, count / Math.max(1, max));
  if (t > 0.85) return `rgba(213,168,99,${0.55 + t * 0.4})`;      // hottest → gold
  const g = 74 + Math.round(t * 96);
  const r = 26 + Math.round(t * 40);
  const b = 58 + Math.round(t * 40);
  return `rgba(${r},${g},${b},${0.35 + t * 0.6})`;
}

export const HallRecitationMap: React.FC<{ variant?: 'screen' | 'panel'; onClose?: () => void }> = ({ variant = 'screen', onClose }) => {
  const store = useAppStore();
  const ar = store.language === 'ar';
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 20000); return () => clearInterval(t); }, []);

  const agg = useMemo(() => buildHallRecitation(store), [store.participants, store.activeSession, store.competition, store.questionGovernance]);
  const max = agg.hottestPage.count || 1;

  const body = (
    <div className={variant === 'screen' ? 'min-h-screen p-5 sm:p-8 lg:p-10 flex flex-col' : ''}>
      <header className="flex items-start justify-between gap-5">
        <div>
          <div className="text-[10px] font-black tracking-[.2em] text-[#c6b58a]">{ar ? 'خريطة تلاوة القاعة' : 'HALL RECITATION MAP'}</div>
          <h1 className="text-2xl sm:text-3xl font-black mt-1 flex items-center gap-3">{ar ? 'اليوم تُتلى في هذه القاعة' : 'Recited in this hall today'}</h1>
          <div className="text-xs mizan-venue-muted mt-1">{ar ? store.competition.nameArabic : store.competition.name}</div>
        </div>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#c49a5d]/30 bg-[#c49a5d]/10 px-3 py-1.5 text-[11px] font-black text-[#d9c193]"><Radio className="w-3.5 h-3.5" />{agg.projectedFullDay ? (ar ? 'يوم مسابقة تمثيلي' : 'Projected day') : (ar ? 'حي · مجمّع' : 'Live · aggregate')}</span>
          {onClose && <button onClick={onClose} className="w-10 h-10 rounded-xl hover:bg-white/10 grid place-items-center text-white/55"><X className="w-5 h-5" /></button>}
        </div>
      </header>

      <section className="mt-6 grid lg:grid-cols-[1fr_1.6fr] gap-5">
        {/* Khatmah counter */}
        <div className="rounded-[28px] border border-white/10 bg-gradient-to-b from-[#17362b] to-[#122019] p-6 sm:p-7 flex flex-col justify-between">
          <div className="flex items-center gap-2 text-[11px] font-black tracking-[.15em] text-[#c6b58a]"><Sparkles className="w-4 h-4" />{ar ? 'ختمات القاعة' : 'HALL KHATMĀT'}</div>
          <div className="my-4">
            <div className="text-[86px] leading-none font-black tracking-tight text-white tabular-nums">{agg.khatmatCompleted}</div>
            <div className="text-sm text-white/55 mt-2">{ar ? `أتمت القاعة تلاوة القرآن كاملًا ${toArabicOrdinal(agg.khatmatCompleted, ar)}` : `Complete recitations of the whole Quran`}</div>
          </div>
          <div>
            <div className="flex items-center justify-between text-[11px] text-white/50 mb-2"><span>{ar ? 'نحو الختمة التالية' : 'Toward next khatmah'}</span><span className="font-black text-[#d9c193]">{Math.round(agg.partialKhatmahPct * 100)}%</span></div>
            <div className="h-2.5 rounded-full bg-white/10 overflow-hidden"><div className="h-full rounded-full bg-gradient-to-r from-[#2f6555] to-[#c49a5d]" style={{ width: `${Math.max(2, agg.partialKhatmahPct * 100)}%` }} /></div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Stat n={`${Math.round(agg.coveragePct * 100)}%`} t={ar ? 'من المصحف' : 'of the Mushaf'} />
              <Stat n={agg.totalRecitations.toLocaleString(ar ? 'ar-EG' : 'en-US')} t={ar ? 'تلاوة موضع' : 'passage recitations'} />
            </div>
          </div>
        </div>

        {/* 604-page heat grid */}
        <div className="rounded-[28px] border border-white/10 bg-white/[.035] p-4 sm:p-6">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[11px] font-black tracking-[.15em] mizan-venue-muted">{ar ? '٦٠٤ صفحة' : '604 PAGES'}</div>
            <div className="flex items-center gap-2 text-[10px] mizan-venue-muted">
              <span>{ar ? 'أقل' : 'less'}</span>
              <span className="inline-flex gap-0.5">{[0.05, 0.3, 0.55, 0.8, 1].map((t, i) => <span key={i} className="w-3 h-3 rounded-[3px]" style={{ background: pageColor(t * max, max) }} />)}</span>
              <span>{ar ? 'أكثر' : 'more'}</span>
            </div>
          </div>
          <div className="grid gap-[3px]" style={{ gridTemplateColumns: 'repeat(34, minmax(0, 1fr))' }} dir="ltr" role="img" aria-label={ar ? `تغطية ${Math.round(agg.coveragePct * 100)} بالمئة من صفحات المصحف` : `${Math.round(agg.coveragePct * 100)}% Mushaf coverage`}>
            {agg.pages.map((count, i) => (
              <span key={i} title={`${ar ? 'صفحة' : 'p.'} ${i + 1} · ${ar ? 'الجزء' : 'juz'} ${pageToJuz(i + 1)} · ${count}`} className="aspect-square rounded-[2.5px] transition-colors duration-500" style={{ background: pageColor(count, max) }} />
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between text-[10px] mizan-venue-muted">
            <span>{ar ? `أكثر صفحة تلاوةً: ${agg.hottestPage.page}` : `Hottest page: ${agg.hottestPage.page}`}</span>
            <span>{ar ? `${agg.coveredPages} صفحة تُليت` : `${agg.coveredPages} pages recited`}</span>
          </div>
        </div>
      </section>

      {/* Per-juz ribbon */}
      <section className="mt-5 rounded-[24px] border border-white/10 bg-white/[.025] p-4 sm:p-5">
        <div className="text-[11px] font-black tracking-[.15em] mizan-venue-muted mb-3">{ar ? 'تغطية الأجزاء' : 'JUZ COVERAGE'}</div>
        <div className="grid grid-cols-6 sm:grid-cols-10 lg:grid-cols-15 gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(56px, 1fr))' }}>
          {agg.byJuz.map((j) => {
            const pct = j.coveredPages / 20.13;
            return (
              <div key={j.juz} className="rounded-xl bg-white/[.04] px-2 py-2 text-center" title={`${ar ? 'الجزء' : 'Juz'} ${j.juz}`}>
                <div className="h-1.5 rounded-full bg-white/10 overflow-hidden mb-1.5"><div className="h-full rounded-full bg-[#7fae9c]" style={{ width: `${Math.min(100, pct * 100)}%` }} /></div>
                <div className="text-[10px] font-black text-white/70 tabular-nums">{j.juz}</div>
              </div>
            );
          })}
        </div>
      </section>

      {agg.liveLoci.length > 0 && (
        <section className="mt-4 flex items-center gap-3 overflow-x-auto rounded-2xl border border-[#c49a5d]/20 bg-[#c49a5d]/[.06] px-4 py-3">
          <span className="shrink-0 inline-flex items-center gap-1.5 text-[11px] font-black text-[#d9c193]"><BookOpen className="w-4 h-4" />{ar ? 'يُتلى الآن' : 'Reciting now'}</span>
          {agg.liveLoci.map((l, i) => <span key={i} className="shrink-0 rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-white/80">{l.label} · {ar ? 'ص' : 'p.'}{l.page}</span>)}
        </section>
      )}

      <footer className={`${variant === 'screen' ? 'mt-auto pt-6' : 'mt-4'} text-[11px] mizan-venue-faint leading-6`}>
        {agg.projectedFullDay
          ? (ar
            ? `عرض تمثيلي ليوم مسابقة كامل (${agg.projectedReciters.toLocaleString('ar-EG')} تالٍ عبر اللجان) لأن بيانات المراجعة المحلية صغيرة — بيانات حتمية وليست رسمية. في التشغيل تُغذّى الخريطة من سجل التلاوة الحي، وتبقى مجمّعة على مستوى الصفحة فلا تكشف هوية أحد.`
            : `Projected full competition day (${agg.projectedReciters.toLocaleString('en-US')} reciters across committees) because the local review roster is tiny — deterministic, non-official data. In production the map is fed by the live recitation ledger, and stays a page-level aggregate that reveals no one.`)
          : (ar
            ? 'خريطة مجمّعة على مستوى الصفحة فقط — لا تكشف هوية أي متسابق. في التشغيل تُغذّى من سجل التلاوة الحي لكل اللجان؛ في هذا العرض تُشتق حتميًا من نشاط القاعة وليست سجلًّا رسميًا لموضع بعينه.'
            : 'Page-level aggregate only — it never reveals any participant. In production it is fed by the live recitation ledger across all committees; in this preview it is derived deterministically from hall activity and is not an official record of any specific locus.')}
      </footer>
    </div>
  );

  if (variant === 'panel') return <div className="rounded-[30px] mizan-venue-2 text-white font-arabic overflow-hidden">{body}</div>;
  return <div className="fixed inset-0 z-50 mizan-venue-2 text-white font-arabic overflow-auto">{body}</div>;
};

const Stat: React.FC<{ n: string | number; t: string }> = ({ n, t }) => (
  <div className="rounded-2xl bg-white/[.05] px-3 py-2.5"><div className="text-2xl font-black tabular-nums">{n}</div><div className="text-[10px] mizan-venue-muted mt-0.5">{t}</div></div>
);

function toArabicOrdinal(n: number, ar: boolean): string {
  if (!ar) return `${n}×`;
  const words = ['', 'مرة واحدة', 'مرتين', 'ثلاث مرات', 'أربع مرات', 'خمس مرات', 'ست مرات', 'سبع مرات', 'ثمان مرات', 'تسع مرات', 'عشر مرات'];
  return words[n] || `${n} مرة`;
}
