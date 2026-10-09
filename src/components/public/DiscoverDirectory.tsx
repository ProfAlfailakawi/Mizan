/*
 * MIZAN Discover — دليل المسابقات المنشورة، بعلامة المضيف.
 *
 * الخادم يحدّد النطاق من اسم المضيف (دليل ميزان العالمي، أو دليل مشغّل، أو دليل جهة) ويصفّي
 * كل صفّ بعلم نشره. والصفحة تعرض اسم الدليل وعلامته كما أعادها الخادم: تحت علامة بيضاء
 * كاملة لا يظهر اسم ميزان إلا إن اختار المشغّل إظهار «يعمل بميزان».
 */
import React, { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, CalendarDays, MapPin, Search, WifiOff } from 'lucide-react';
import { useAppStore, IS_DEMO_SESSION } from '../../lib/store';
import { ct } from '../../lib/commercial-i18n';

interface Listing { publicSlug: string; title: string; titleArabic?: string; summary?: string; summaryArabic?: string; institutionName: string; registrationOpen: boolean; registrationUrl?: string; startsOn?: string; endsOn?: string; country?: string; city?: string; mode: 'online' | 'in_person' | 'hybrid'; riwayat: string[]; ageRanges: string[] }

/* يومٌ تقويميٌّ محلي (2026-09-25) لا لحظةٌ بتوقيت UTC، بتنسيق اللغة: لا تاريخ ISO خامًا أمام القارئ. */
const dayText = (iso: string | undefined, locale: string): string => {
  const m = iso ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null;
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
  if (!d || Number.isNaN(d.getTime())) return iso || '';
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-KW-u-nu-latn' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).format(d);
};

export const DiscoverDirectory: React.FC = () => {
  const { language } = useAppStore();
  const locale = language === 'ar' ? 'ar' : 'en';
  const [q, setQ] = useState('');
  const [openOnly, setOpenOnly] = useState(false);
  /* كل نتيجةٍ تحمل مفتاح الطلب الذي جاءت منه: قائمةٌ لطلبٍ سابق لا تُعرض نتيجةً للطلب الحالي. */
  const key = `${q.trim()}|${openOnly}`;
  const [loaded, setLoaded] = useState<{ key: string; payload: { brand: any; listings: Listing[] } } | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const data = loaded?.payload ?? null;
  const fresh = loaded?.key === key;
  const failed = failedKey === key;
  useEffect(() => {
    const ctl = new AbortController();
    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    if (openOnly) params.set('registrationOpen', 'true');
    const t = window.setTimeout(() => {
      if (IS_DEMO_SESSION) {
        void import('../../data/demo-commercial').then(m => { if (ctl.signal.aborted) return; setLoaded({ key, payload: m.demoDiscoverDirectory(q, openOnly) as any }); setFailedKey(null); });
        return;
      }
      fetch(`/api/public/discover?${params}`, { signal: ctl.signal }).then(r => r.ok ? r.json() : Promise.reject(r.status))
        .then(d => { if (ctl.signal.aborted) return; setLoaded({ key, payload: d }); setFailedKey(null); }).catch(() => { if (!ctl.signal.aborted) setFailedKey(key); });
    }, 250);
    return () => { ctl.abort(); window.clearTimeout(t); };
  }, [key]);
  const brand = data?.brand;
  useEffect(() => {
    if (!brand) return;
    document.title = (locale === 'ar' ? brand.directoryNameArabic : undefined) || brand.directoryName;
    if (brand.faviconUrl) { const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]'); if (link) link.href = brand.faviconUrl; }
  }, [brand, locale]);
  const accent = brand?.primaryColor || '#1f6f4a';
  const loading = !data && !failed;
  /* بين الطلبين تبقى القائمة السابقة باهتة (لا فراغ يومض)، وعند فشل الطلب تُسحب ويظهر الفشل. */
  const shown = failed ? [] : (data?.listings ?? []);
  const Arrow = locale === 'ar' ? ArrowLeft : ArrowRight;
  return (
    <div className="min-h-screen" style={{ background: 'var(--canvas)' }}>
    <main className="mx-auto max-w-5xl px-4 sm:px-6 py-8 sm:py-12" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      <header className="mizan-surface mz-enter mb-6 flex flex-wrap items-center gap-4 px-5 py-6 sm:px-8 sm:py-8">
        {brand?.logoUrl && <img src={brand.logoUrl} alt="" className="h-12 w-auto" />}
        <div className="min-w-0">
          <div className="mizan-kicker">{ct(locale, 'discover')}</div>
          <h1 className="font-display mt-1 text-2xl sm:text-3xl font-black leading-snug" style={{ color: accent }}>{brand ? ((locale === 'ar' && brand.directoryNameArabic) || brand.directoryName) : ct(locale, 'discoverTitle')}</h1>
        </div>
      </header>
      <div className="mizan-surface mz-enter mb-6 flex flex-wrap items-center gap-3 p-3" style={{ ['--i' as string]: 1 }}>
        <label className="relative flex-1 min-w-[14rem]"><span className="sr-only">{ct(locale, 'search')}</span>
          <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 -translate-y-1/2 start-3.5 h-4 w-4 text-[var(--muted)]" />
          <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder={ct(locale, 'search')} className="w-full rounded-2xl border border-[var(--line)] bg-[var(--surface)] ps-10 pe-3 text-sm focus:outline-none focus-visible:ring-2" /></label>
        <label className="flex min-h-11 items-center gap-2 rounded-2xl bg-[var(--surface-soft)] px-4 text-xs font-bold"><input type="checkbox" className="h-4 w-4" checked={openOnly} onChange={e => setOpenOnly(e.target.checked)} style={{ accentColor: accent }} />{ct(locale, 'registrationOpen')}</label>
      </div>
      {failed && <div role="alert" className="mizan-surface flex items-center gap-3 p-5 text-sm text-[var(--danger)]"><WifiOff aria-hidden="true" className="h-5 w-5 shrink-0" />{ct(locale, 'discoverFailed')}</div>}
      {loading && <ul className="grid gap-4 sm:grid-cols-2" aria-hidden="true">{[0, 1, 2, 3].map(i => <li key={i} className="mizan-surface p-5 space-y-3"><div className="mz-skeleton h-5 w-2/3" /><div className="mz-skeleton h-3 w-1/2" /><div className="mz-skeleton h-3 w-full" /><div className="mz-skeleton h-9 w-28" /></li>)}</ul>}
      <ul className={`grid gap-4 sm:grid-cols-2 transition-opacity ${!fresh && !failed ? 'opacity-60' : ''}`} aria-live="polite" aria-busy={!fresh && !failed}>
        {shown.map((l, i) => <li key={l.publicSlug} style={{ ['--i' as string]: i }} className="mizan-surface mz-enter flex flex-col p-5 sm:p-6">
          <h2 className="font-display text-base sm:text-lg font-black leading-snug">{(locale === 'ar' && l.titleArabic) || l.title}</h2>
          <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs text-[var(--muted)]"><MapPin aria-hidden="true" className="h-3.5 w-3.5" />{l.institutionName}{l.city ? ` · ${l.city}` : ''}{l.country ? ` · ${l.country}` : ''} · {ct(locale, l.mode)}</p>
          {((locale === 'ar' && l.summaryArabic) || l.summary) && <p className="mt-3 text-sm leading-6">{(locale === 'ar' && l.summaryArabic) || l.summary}</p>}
          <p className="mt-3 flex flex-wrap items-center gap-x-1.5 text-xs text-[var(--muted)]"><CalendarDays aria-hidden="true" className="h-3.5 w-3.5" />{dayText(l.startsOn, locale)}{l.endsOn && l.endsOn !== l.startsOn ? ` — ${dayText(l.endsOn, locale)}` : ''}{l.riwayat.length ? ` · ${l.riwayat.join('، ')}` : ''}</p>
          <div className="mt-auto flex items-center justify-between gap-3 pt-4">
            <span className="text-xs font-bold" style={{ color: l.registrationOpen ? accent : 'var(--muted)' }}>{ct(locale, l.registrationOpen ? 'registrationOpen' : 'registrationClosed')}</span>
            {l.registrationOpen && l.registrationUrl && <a href={l.registrationUrl} className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-5 text-xs font-bold text-white" style={{ background: accent }}>{ct(locale, 'register')}<Arrow aria-hidden="true" className="h-4 w-4" /></a>}
          </div>
        </li>)}
      </ul>
      {fresh && data && data.listings.length === 0 && <p className="mizan-surface p-6 text-center text-sm text-[var(--muted)]">{ct(locale, 'discoverEmpty')}</p>}
      {brand?.showPoweredByMizan && <footer className="mt-10 text-center text-[11px] text-[var(--muted)]">{ct(locale, 'poweredByMizan')}</footer>}
    </main>
    </div>
  );
};
