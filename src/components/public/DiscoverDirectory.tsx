/*
 * MIZAN Discover — دليل المسابقات المنشورة، بعلامة المضيف.
 *
 * الخادم يحدّد النطاق من اسم المضيف (دليل ميزان العالمي، أو دليل مشغّل، أو دليل جهة) ويصفّي
 * كل صفّ بعلم نشره. والصفحة تعرض اسم الدليل وعلامته كما أعادها الخادم: تحت علامة بيضاء
 * كاملة لا يظهر اسم ميزان إلا إن اختار المشغّل إظهار «يعمل بميزان».
 */
import React, { useEffect, useState } from 'react';
import { useAppStore } from '../../lib/store';
import { ct } from '../../lib/commercial-i18n';

interface Listing { publicSlug: string; title: string; titleArabic?: string; summary?: string; summaryArabic?: string; institutionName: string; registrationOpen: boolean; registrationUrl?: string; startsOn?: string; endsOn?: string; country?: string; city?: string; mode: 'online' | 'in_person' | 'hybrid'; riwayat: string[]; ageRanges: string[] }

export const DiscoverDirectory: React.FC = () => {
  const { language } = useAppStore();
  const locale = language === 'ar' ? 'ar' : 'en';
  const [q, setQ] = useState('');
  const [openOnly, setOpenOnly] = useState(false);
  const [data, setData] = useState<{ brand: any; listings: Listing[] } | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const ctl = new AbortController();
    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    if (openOnly) params.set('registrationOpen', 'true');
    const t = window.setTimeout(() => {
      fetch(`/api/public/discover?${params}`, { signal: ctl.signal }).then(r => r.ok ? r.json() : Promise.reject(r.status))
        .then(d => { setData(d); setFailed(false); }).catch(() => { if (!ctl.signal.aborted) setFailed(true); });
    }, 250);
    return () => { ctl.abort(); window.clearTimeout(t); };
  }, [q, openOnly]);
  const brand = data?.brand;
  useEffect(() => {
    if (!brand) return;
    document.title = (locale === 'ar' ? brand.directoryNameArabic : undefined) || brand.directoryName;
    if (brand.faviconUrl) { const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]'); if (link) link.href = brand.faviconUrl; }
  }, [brand, locale]);
  const accent = brand?.primaryColor || '#1f6f4a';
  return (
    <main className="mx-auto max-w-5xl px-4 py-8" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      <header className="mb-6 flex flex-wrap items-center gap-3">
        {brand?.logoUrl && <img src={brand.logoUrl} alt="" className="h-10 w-auto" />}
        <h1 className="text-2xl font-black" style={{ color: accent }}>{brand ? ((locale === 'ar' && brand.directoryNameArabic) || brand.directoryName) : ct(locale, 'discoverTitle')}</h1>
      </header>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <label className="flex-1 min-w-[16rem]"><span className="sr-only">{ct(locale, 'search')}</span>
          <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder={ct(locale, 'search')} className="w-full rounded-xl border border-[#d8d6ce] bg-white px-3 py-2 text-sm focus:outline-none focus-visible:ring-2" /></label>
        <label className="flex items-center gap-2 text-xs font-bold"><input type="checkbox" checked={openOnly} onChange={e => setOpenOnly(e.target.checked)} />{ct(locale, 'registrationOpen')}</label>
      </div>
      {failed && <p role="alert" className="text-sm text-[#874b43]">{ct(locale, 'discoverEmpty')}</p>}
      <ul className="grid gap-4 sm:grid-cols-2" aria-live="polite">
        {data?.listings.map(l => <li key={l.publicSlug} className="rounded-3xl border border-[#e2e0d9] bg-white p-5">
          <h2 className="text-base font-black">{(locale === 'ar' && l.titleArabic) || l.title}</h2>
          <p className="text-xs text-[#666c68]">{l.institutionName}{l.city ? ` · ${l.city}` : ''}{l.country ? ` · ${l.country}` : ''} · {ct(locale, l.mode)}</p>
          {((locale === 'ar' && l.summaryArabic) || l.summary) && <p className="mt-2 text-sm">{(locale === 'ar' && l.summaryArabic) || l.summary}</p>}
          <p className="mt-2 text-xs">{l.startsOn || ''}{l.endsOn ? ` → ${l.endsOn}` : ''}{l.riwayat.length ? ` · ${l.riwayat.join('، ')}` : ''}</p>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-xs font-bold" style={{ color: l.registrationOpen ? accent : '#666c68' }}>{ct(locale, l.registrationOpen ? 'registrationOpen' : 'registrationClosed')}</span>
            {l.registrationOpen && l.registrationUrl && <a href={l.registrationUrl} className="rounded-full px-4 py-2 text-xs font-bold text-white" style={{ background: accent }}>{ct(locale, 'register')}</a>}
          </div>
        </li>)}
      </ul>
      {data && data.listings.length === 0 && <p className="text-sm text-[#666c68]">{ct(locale, 'discoverEmpty')}</p>}
      {brand?.showPoweredByMizan && <footer className="mt-10 text-center text-[11px] text-[#666c68]">{ct(locale, 'poweredByMizan')}</footer>}
    </main>
  );
};
