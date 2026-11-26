import React from 'react';
import { RealQRCode } from '../design-system/RealQRCode';
import { pl } from '../../lib/public-i18n';

/*
 * «دفتر الأختام» — كل مشاركةٍ في الجواز ختمٌ دائريّ يُضغط على صفحته.
 *
 * يقرأ مدخلات الجواز كما وصلت من الخادم فقط: اسم الجهة وسنتها واسم المسابقة وحكم التحقق.
 * علامة الجهة في وسط الختم هي حروفها الأولى (لا يحمل الجواز شعارًا). ورمز التحقق يفتح
 * صفحة التحقق العامة الموجودة برقم الشهادة إن وُجدت؛ والمشاركة بلا شهادة تُختم بلا رمز.
 * الشهادة المبطلة أو غير المثبتة يُختم ختمها باهتًا ومائلًا، فلا تُقرأ كأنها موثّقة.
 */

type Entry = { id: string; competitionName: string; competitionNameArabic?: string; organizationName?: string; year?: number; kind: 'certificate' | 'participation'; certificateNumber?: string; verification?: string };

const initials = (name?: string) => {
  const words = String(name || '').replace(/^(ال)/, '').split(/\s+/).filter(Boolean);
  return (words.slice(0, 2).map(w => w.replace(/^ال/, '')[0] || '').join('') || 'م').toUpperCase();
};

const Stamp: React.FC<{ e: Entry; ar: boolean; i: number }> = ({ e, ar, i }) => {
  const uid = React.useId().replace(/[:]/g, '');
  const bad = e.verification && !['AUTHENTIC', 'participation_confirmed'].includes(e.verification);
  const title = ar ? e.competitionNameArabic || e.competitionName : e.competitionName || e.competitionNameArabic || '';
  const ring = `${e.organizationName || title} · ${e.year || ''}`.trim();
  const url = e.certificateNumber ? `${window.location.origin}/#verify?cert=${encodeURIComponent(e.certificateNumber)}` : '';
  return (
    <li className={`mz-vw-stamp${bad ? ' is-void' : ''}`} style={{ '--mz-vw-i': i, '--mz-vw-tilt': `${((i * 37) % 13) - 6}deg` } as React.CSSProperties}>
      <svg viewBox="0 0 120 120" className="mz-vw-stamp__seal" role="img" aria-label={`${title}${e.year ? ` · ${e.year}` : ''}`}>
        <defs><path id={`r${uid}`} d="M60 60m-44 0a44 44 0 1 1 88 0a44 44 0 1 1-88 0" /></defs>
        <circle cx="60" cy="60" r="56" className="mz-vw-stamp__rim" />
        <circle cx="60" cy="60" r="35" className="mz-vw-stamp__rim is-inner" />
        <text className="mz-vw-stamp__ring"><textPath href={`#r${uid}`} startOffset="50%" textAnchor="middle">{ring.slice(0, 42)}</textPath></text>
        <text x="60" y="66" textAnchor="middle" className="mz-vw-stamp__mark">{initials(e.organizationName || title)}</text>
        {e.year ? <text x="60" y="84" textAnchor="middle" className="mz-vw-stamp__year">{e.year}</text> : null}
      </svg>
      <div className="mt-2 text-center text-[11px] font-black leading-4 line-clamp-2">{title}</div>
      {url && !bad && <a href={`#verify?cert=${encodeURIComponent(e.certificateNumber!)}`} className="mt-2 inline-block rounded-lg bg-[#fffefb] p-1" aria-label={pl('تحقّق من الشهادة', 'Verify certificate')}>
        <RealQRCode value={url} size={64} label={pl('رمز التحقق من الشهادة', 'Certificate verification code')} />
      </a>}
    </li>
  );
};

export const PassportStampBook: React.FC<{ entries: Entry[]; ar: boolean }> = ({ entries, ar }) => {
  if (!entries.length) return null;
  return (
    <section className="mz-vw-stampbook mizan-surface mt-4 p-4 sm:p-5" aria-label={pl('دفتر الأختام', 'Stamp book')}>
      <h2 className="text-sm font-black">{pl('دفتر الأختام', 'Stamp book')}</h2>
      <ul className="mt-3 grid grid-cols-2 gap-4 min-[480px]:grid-cols-3">
        {entries.map((e, i) => <Stamp key={e.id} e={e} ar={ar} i={i} />)}
      </ul>
    </section>
  );
};
