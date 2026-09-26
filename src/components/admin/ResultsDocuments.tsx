import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Award, Download, FileText, Link2, Printer } from 'lucide-react';
import type { Certificate, Competition, Organization, ResultRecord } from '../../types';
import { buildCategoryResultsReport, buildParticipantResultsReport, categoryResultsCsv, participantResultsCsv, resultsFileName, REPORTABLE_RESULT_STATUSES } from '../../lib/results-report';
import { createQrMatrix } from '../design-system/RealQRCode';
import { Modal } from '../design-system/Modal';
import { Button } from '../design-system/Button';
import { localizedCountry, uiToken } from '../../lib/ui-language';

/*
 * وثائق النتائج: الكشوف المطبوعة والشهادة.
 *
 * كانت «كشف المتسابقين» و«كشف الفئات» تنزّل ملفًّا صامتًا (ويُبطَل رابطه قبل أن يبدأ التنزيل
 * في بعض المتصفّحات)، و«طباعة» تطبع صفحة الإدارة كما هي بأزرارها وفلاترها، وأيقونة الشهادة
 * تُصدرها في الخلفية ولا تُري شيئًا. فمن ضغط في العرض لم يرَ أثرًا لضغطته.
 *
 * صارت كل وثيقةٍ تُعرض أولًا كما ستُطبع، ثم تُطبع أو تُنزَّل. والوثيقة نفسها مكوّنٌ واحد
 * بأنماطٍ مضمّنة: ما يُرى في المعاينة هو حرفيًّا ما يُطبع، لأن نافذة الطباعة لا تحمل أنماط
 * التطبيق.
 */

const INK = '#17221e', GREEN = '#214C40', GOLD = '#a8834a', PAPER = '#fffdf7', MUTED = '#5f6661', LINE = '#e3ddcf';
const FONT = "'Noto Naskh Arabic','Amiri','Tajawal','Segoe UI',Tahoma,serif";

/** يفتح نافذة الطباعة على وثيقةٍ مستقلة (إطارٌ خفيّ) — فتُطبع الوثيقة وحدها، لا الصفحة. */
export function printDocument(html: string): void {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  Object.assign(frame.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' });
  document.body.appendChild(frame);
  const doc = frame.contentWindow?.document;
  if (!doc) { frame.remove(); return; }
  doc.open(); doc.write(html); doc.close();
  const go = () => { try { frame.contentWindow?.focus(); frame.contentWindow?.print(); } finally { setTimeout(() => frame.remove(), 60_000); } };
  /* الخطوط تُحمَّل قبل الطباعة وإلا خرجت الوثيقة بخطّ النظام. */
  const fonts = (doc as Document & { fonts?: { ready: Promise<unknown> } }).fonts;
  setTimeout(() => { if (fonts?.ready) void fonts.ready.then(go, go); else go(); }, 350);
}

/** تنزيلٌ يعمل في كل متصفّح: الرابط يُضاف إلى الصفحة، ولا يُبطَل قبل أن يبدأ التنزيل. */
export function downloadFile(name: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.rel = 'noopener'; a.style.display = 'none';
  document.body.appendChild(a); a.click();
  setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 4000);
}

export function documentShell(title: string, body: string, ar: boolean, landscape = false): string {
  return `<!doctype html><html lang="${ar ? 'ar' : 'en'}" dir="${ar ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title>`
    + `<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Noto+Naskh+Arabic:wght@400;600;700&display=swap" rel="stylesheet">`
    + `<style>@page{size:A4 ${landscape ? 'landscape' : 'portrait'};margin:${landscape ? '0' : '14mm'}}*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}body{margin:0;background:${landscape ? PAPER : '#fff'};color:${INK};font-family:${FONT}}table{page-break-inside:auto}tr{page-break-inside:avoid}thead{display:table-header-group}.mz-break{page-break-before:always}</style>`
    + `</head><body>${body}</body></html>`;
}

const escapeHtml = (v: string) => v.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

/* ── الكشوف ─────────────────────────────────────────────────────────────── */

export type SheetKind = 'participants' | 'categories' | 'official';

interface SheetInput { competition: Competition; organization: Organization; results: ResultRecord[]; ar: boolean; generatedBy: string }

const th: React.CSSProperties = { background: GREEN, color: '#fff', fontWeight: 700, fontSize: 11, padding: '8px 10px', textAlign: 'start', whiteSpace: 'nowrap' };
const td: React.CSSProperties = { borderBottom: `1px solid ${LINE}`, fontSize: 11.5, padding: '7px 10px', verticalAlign: 'middle' };
const medal = (rank: number) => rank === 1 ? '#c9a24f' : rank === 2 ? '#9aa3a8' : rank === 3 ? '#b07a4f' : '';

const SheetHeader: React.FC<{ input: SheetInput; title: string; subtitle: string }> = ({ input, title, subtitle }) => {
  const { competition, organization, ar } = input;
  return <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, borderBottom: `3px double ${GOLD}`, paddingBottom: 14, marginBottom: 16 }}>
    <div>
      <div style={{ fontSize: 10, letterSpacing: '.18em', color: GOLD, fontWeight: 700 }}>{ar ? (organization.nameArabic || organization.name) : (organization.name || organization.nameArabic)}</div>
      <h1 style={{ margin: '6px 0 0', fontSize: 22, fontWeight: 700, color: GREEN }}>{title}</h1>
      <div style={{ marginTop: 4, fontSize: 12, color: MUTED }}>{ar ? (competition.nameArabic || competition.name) : (competition.name || competition.nameArabic)}{competition.edition ? ` · ${competition.edition}` : ''}</div>
      <div style={{ marginTop: 2, fontSize: 11, color: MUTED }}>{subtitle}</div>
    </div>
    <div style={{ textAlign: 'center', minWidth: 86 }}>
      <SealMark size={70} />
      <div style={{ fontSize: 9, color: MUTED, marginTop: 4 }}>{new Date().toLocaleString(ar ? 'ar-EG' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</div>
    </div>
  </header>;
};

const SheetFooter: React.FC<{ input: SheetInput; excluded: number }> = ({ input, excluded }) => {
  const { ar, generatedBy } = input;
  return <footer style={{ marginTop: 22, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 18, fontSize: 10.5, color: MUTED }}>
    {[ar ? 'رئيس لجنة التحكيم' : 'Head of judging', ar ? 'مدير المسابقة' : 'Competition director', ar ? 'الختم الرسمي' : 'Official seal'].map(label =>
      <div key={label} style={{ borderTop: `1px solid ${INK}`, paddingTop: 6, textAlign: 'center' }}>{label}</div>)}
    <div style={{ gridColumn: '1 / -1', fontSize: 9.5, lineHeight: 1.7 }}>
      {ar
        ? `لا تضمّ هذه الورقة إلا النتائج المعتمدة أو المختومة أو المنشورة${excluded ? ` — استُبعدت ${excluded} نتيجة لم تُعتمد بعد` : ''}. أُعدّت من منصة ميزان بواسطة ${generatedBy}.`
        : `Only approved, sealed or published results are listed${excluded ? ` — ${excluded} not-yet-approved result(s) excluded` : ''}. Generated by MIZAN for ${generatedBy}.`}
    </div>
  </footer>;
};

const ParticipantsTable: React.FC<{ input: SheetInput; categoryId?: string }> = ({ input, categoryId }) => {
  const { ar } = input;
  const rows = buildParticipantResultsReport({ competition: input.competition, results: input.results }, { arabic: ar, categoryId });
  const results = new Map<string, ResultRecord>(input.results.map(r => [r.participantCode, r]));
  return <table style={{ width: '100%', borderCollapse: 'collapse' }}>
    <thead><tr>{(ar ? ['المركز', 'الكود', 'المتسابق', 'الفئة', 'الدولة', 'الدرجة', 'الحالة'] : ['Rank', 'Code', 'Participant', 'Category', 'Country', 'Score', 'Status']).map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
    <tbody>{rows.map((r, i) => {
      const m = medal(r.rank);
      const award = results.get(r.participantCode);
      return <tr key={`${r.participantCode}-${i}`} style={{ background: i % 2 ? '#faf8f2' : '#fff' }}>
        <td style={{ ...td, fontWeight: 700, width: 54 }}>{m ? <span style={{ display: 'inline-grid', placeItems: 'center', width: 24, height: 24, borderRadius: 999, background: m, color: '#fff', fontSize: 11 }}>{r.rank}</span> : r.rank || '—'}</td>
        <td style={{ ...td, fontFamily: 'ui-monospace,monospace', direction: 'ltr', textAlign: ar ? 'right' : 'left' }}>{r.participantCode}</td>
        <td style={{ ...td, fontWeight: 700 }}>{r.participantName}{award?.awardTitleArabic && ar ? <span style={{ color: GOLD, fontWeight: 400 }}> · {award.awardTitleArabic}</span> : null}</td>
        <td style={td}>{r.categoryName}</td>
        <td style={td}>{localizedCountry(r.country, ar)}</td>
        <td style={{ ...td, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{r.finalScore.toFixed(2)}</td>
        <td style={{ ...td, color: r.status === 'approved' ? MUTED : GREEN }}>{uiToken(r.status, ar)}</td>
      </tr>;
    })}
    {!rows.length && <tr><td colSpan={7} style={{ ...td, textAlign: 'center', color: MUTED, padding: 24 }}>{ar ? 'لا توجد نتيجة معتمدة بعد.' : 'No approved results yet.'}</td></tr>}
    </tbody>
  </table>;
};

const CategoriesTable: React.FC<{ input: SheetInput }> = ({ input }) => {
  const { ar } = input;
  const rows = buildCategoryResultsReport({ competition: input.competition, results: input.results, categories: input.competition.categories }, { arabic: ar });
  const max = Math.max(1, ...rows.map(r => r.participants));
  return <table style={{ width: '100%', borderCollapse: 'collapse' }}>
    <thead><tr>{(ar ? ['الفئة', 'المتسابقون', 'أعلى', 'المتوسط', 'أدنى', 'المركز الأول', 'مختومة', 'منشورة'] : ['Category', 'Participants', 'High', 'Average', 'Low', 'First place', 'Sealed', 'Published']).map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
    <tbody>{rows.map((r, i) => <tr key={r.categoryName} style={{ background: i % 2 ? '#faf8f2' : '#fff' }}>
      <td style={{ ...td, fontWeight: 700 }}>{r.categoryName}</td>
      <td style={td}><div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ fontWeight: 700, minWidth: 22 }}>{r.participants}</span><span style={{ height: 6, borderRadius: 9, background: GREEN, opacity: .75, width: `${Math.round((r.participants / max) * 70)}px` }} /></div></td>
      <td style={{ ...td, fontWeight: 700 }}>{r.highestScore.toFixed(2)}</td>
      <td style={td}>{r.averageScore.toFixed(2)}</td>
      <td style={td}>{r.lowestScore.toFixed(2)}</td>
      <td style={td}>{r.firstPlace}</td>
      <td style={td}>{r.sealed}</td>
      <td style={td}>{r.published}</td>
    </tr>)}
    {!rows.length && <tr><td colSpan={8} style={{ ...td, textAlign: 'center', color: MUTED, padding: 24 }}>{ar ? 'لا توجد نتيجة معتمدة بعد.' : 'No approved results yet.'}</td></tr>}
    </tbody>
  </table>;
};

const Kpis: React.FC<{ input: SheetInput }> = ({ input }) => {
  const { ar } = input;
  const reportable = input.results.filter(r => REPORTABLE_RESULT_STATUSES.includes(r.status));
  const scores = reportable.map(r => r.finalScore);
  const tiles: [string, string][] = [
    [String(reportable.length), ar ? 'نتيجة معتمدة' : 'approved results'],
    [String(new Set(reportable.map(r => r.categoryId)).size), ar ? 'فئة' : 'categories'],
    [String(new Set(reportable.map(r => r.country)).size), ar ? 'دولة' : 'countries'],
    [scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2) : '—', ar ? 'متوسط الدرجات' : 'average score'],
    [String(reportable.filter(r => r.status === 'sealed' || r.status === 'published').length), ar ? 'مختومة' : 'sealed'],
  ];
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 8, marginBottom: 16 }}>
    {tiles.map(([v, l]) => <div key={l} style={{ border: `1px solid ${LINE}`, borderRadius: 12, padding: '10px 8px', textAlign: 'center', background: '#fbf9f3' }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: GREEN }}>{v}</div><div style={{ fontSize: 10, color: MUTED }}>{l}</div></div>)}
  </div>;
};

export const ResultsSheet: React.FC<{ kind: SheetKind; input: SheetInput }> = ({ kind, input }) => {
  const { ar } = input;
  const excluded = input.results.filter(r => !REPORTABLE_RESULT_STATUSES.includes(r.status)).length;
  const title = kind === 'participants' ? (ar ? 'كشف نتائج المتسابقين' : 'Participant results sheet')
    : kind === 'categories' ? (ar ? 'كشف نتائج الفئات' : 'Category results sheet') : (ar ? 'النتائج الرسمية' : 'Official results');
  const subtitle = kind === 'participants' ? (ar ? 'مرتّبًا بالمركز داخل كل فئة' : 'Ranked within each category')
    : kind === 'categories' ? (ar ? 'ملخّص كل فئة: عددها وأعلى درجاتها ومتوسّطها وصاحب مركزها الأول' : 'Per-category summary')
    : (ar ? 'ملخّص الفئات ثم نتائج كل فئة على حدة' : 'Category summary, then each category in full');
  const categories = input.competition.categories.filter(c => input.results.some(r => r.categoryId === c.id && REPORTABLE_RESULT_STATUSES.includes(r.status)));
  return <div style={{ fontFamily: FONT, color: INK, background: '#fff', padding: 4 }} dir={ar ? 'rtl' : 'ltr'}>
    <SheetHeader input={input} title={title} subtitle={subtitle} />
    {kind !== 'participants' && <Kpis input={input} />}
    {kind === 'participants' && <ParticipantsTable input={input} />}
    {kind === 'categories' && <CategoriesTable input={input} />}
    {kind === 'official' && <>
      <CategoriesTable input={input} />
      {categories.map(c => <section key={c.id} className="mz-break" style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 16, color: GREEN, margin: '0 0 8px', borderInlineStart: `4px solid ${GOLD}`, paddingInlineStart: 8 }}>{ar ? c.nameArabic : c.name}</h2>
        <ParticipantsTable input={input} categoryId={c.id} />
      </section>)}
    </>}
    <SheetFooter input={input} excluded={excluded} />
  </div>;
};

export const ResultsSheetModal: React.FC<{ kind: SheetKind | null; input: SheetInput; onClose: () => void }> = ({ kind, input, onClose }) => {
  const { ar } = input;
  if (!kind) return null;
  const title = kind === 'participants' ? (ar ? 'كشف المتسابقين' : 'Participant sheet') : kind === 'categories' ? (ar ? 'كشف الفئات' : 'Category sheet') : (ar ? 'طباعة النتائج الرسمية' : 'Print official results');
  const print = () => printDocument(documentShell(title, renderToStaticMarkup(<ResultsSheet kind={kind} input={input} />), ar));
  const csv = () => {
    const data = { competition: input.competition, results: input.results, categories: input.competition.categories };
    const k = kind === 'categories' ? 'categories' : 'participants';
    downloadFile(resultsFileName(input.competition, k, ar), k === 'participants' ? participantResultsCsv(data, { arabic: ar }) : categoryResultsCsv(data, { arabic: ar }), 'text/csv;charset=utf-8');
  };
  return <Modal isOpen onClose={onClose} title={title} subtitle={ar ? 'معاينة كما ستُطبع. اطبعها أو احفظها PDF من نافذة الطباعة، أو نزّلها جدولًا.' : 'Preview as printed. Print, save as PDF, or download the spreadsheet.'} maxWidth="3xl">
    <div className="flex flex-wrap gap-2 mb-3">
      <Button onClick={print} icon={<Printer className="w-4 h-4" />}>{ar ? 'طباعة / PDF' : 'Print / PDF'}</Button>
      <Button variant="outline" onClick={csv} icon={<FileText className="w-4 h-4" />}>{ar ? 'تنزيل جدول (CSV)' : 'Download CSV'}</Button>
      <Button variant="outline" onClick={() => downloadFile(`${title}.html`, documentShell(title, renderToStaticMarkup(<ResultsSheet kind={kind} input={input} />), ar), 'text/html;charset=utf-8')} icon={<Download className="w-4 h-4" />}>{ar ? 'تنزيل الوثيقة' : 'Download document'}</Button>
    </div>
    <div className="max-h-[62vh] overflow-auto rounded-2xl border border-[#e3ddcf] bg-white p-4 shadow-inner"><ResultsSheet kind={kind} input={input} /></div>
  </Modal>;
};

/* ── الشهادة ────────────────────────────────────────────────────────────── */

/** الختم المرسوم: ميزانٌ داخل دائرتين، يُستعمل في الكشف والشهادة. */
export const SealMark: React.FC<{ size?: number }> = ({ size = 96 }) => (
  <svg width={size} height={size} viewBox="0 0 120 120" aria-hidden="true">
    <defs><radialGradient id="mzseal" cx="50%" cy="40%" r="60%"><stop offset="0" stopColor="#e2c27e" /><stop offset="1" stopColor="#a8834a" /></radialGradient></defs>
    {Array.from({ length: 24 }, (_, i) => { const a = (i / 24) * Math.PI * 2; return <circle key={i} cx={60 + Math.cos(a) * 54} cy={60 + Math.sin(a) * 54} r={5} fill="url(#mzseal)" />; })}
    <circle cx="60" cy="60" r="52" fill="url(#mzseal)" />
    <circle cx="60" cy="60" r="44" fill="none" stroke="#fff7e2" strokeWidth="1.5" strokeDasharray="2 3" />
    <g stroke="#fffaf0" strokeWidth="2.4" fill="none" strokeLinecap="round">
      <path d="M60 36v44M44 80h32M38 48h44" /><path d="M38 48l-8 16h16zM82 48l-8 16h16z" />
    </g>
    <circle cx="60" cy="34" r="3.2" fill="#fffaf0" />
  </svg>
);

const Corner: React.FC<{ style: React.CSSProperties }> = ({ style }) => (
  <svg width="92" height="92" viewBox="0 0 92 92" style={{ position: 'absolute', ...style }} aria-hidden="true">
    <path d="M4 4h56M4 4v56" stroke={GOLD} strokeWidth="3" fill="none" />
    <path d="M14 14h34M14 14v34" stroke={GOLD} strokeWidth="1.2" fill="none" />
    <path d="M14 14c12 0 20 8 20 20-12 0-20-8-20-20z" fill={GOLD} opacity=".85" />
    <circle cx="40" cy="40" r="3" fill={GOLD} />
  </svg>
);

const QrSvg: React.FC<{ value: string; size: number }> = ({ value, size }) => {
  let matrix: boolean[][] = [];
  try { matrix = createQrMatrix(value); } catch { matrix = []; }
  if (!matrix.length) return <div style={{ width: size, height: size, border: `1px dashed ${GOLD}`, borderRadius: 8, display: 'grid', placeItems: 'center', fontSize: 8, color: MUTED, padding: 4, textAlign: 'center' }}>{value.slice(0, 40)}</div>;
  const q = 2, total = matrix.length + q * 2;
  const d = matrix.flatMap((row, r) => row.map((dark, c) => dark ? `M${c + q} ${r + q}h1v1h-1z` : '')).join('');
  return <svg width={size} height={size} viewBox={`0 0 ${total} ${total}`} shapeRendering="crispEdges"><rect width={total} height={total} fill="#fff" /><path d={d} fill={INK} /></svg>;
};

const ordinalAr = (rank?: number) => rank ? (['', 'الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس', 'السابع', 'الثامن', 'التاسع', 'العاشر'][rank] || `${rank}`) : '';

export const CertificateArtwork: React.FC<{ cert: Certificate; ar: boolean; title?: string; preview?: boolean; showScore?: boolean }> = ({ cert, ar, title, preview, showScore }) => {
  const org = ar ? (cert.organizationNameArabic || cert.organizationName) : (cert.organizationName || cert.organizationNameArabic);
  const comp = ar ? (cert.competitionNameArabic || cert.competitionName) : (cert.competitionName || cert.competitionNameArabic);
  const name = ar ? (cert.participantNameArabic || cert.participantName) : (cert.participantName || cert.participantNameArabic);
  const cat = ar ? (cert.categoryNameArabic || cert.categoryName) : (cert.categoryName || cert.categoryNameArabic);
  const heading = title || (cert.rank && cert.rank <= 3 ? (ar ? 'شهادة تفوّق' : 'Certificate of Excellence') : (ar ? 'شهادة تقدير' : 'Certificate of Appreciation'));
  const verify = /^https?:/.test(cert.verificationUrl) ? cert.verificationUrl : `${typeof window === 'undefined' ? '' : window.location.origin}${cert.verificationUrl || ''}`;
  const signatories = cert.signatories?.length ? cert.signatories : [{ name: ar ? 'رئيس لجنة التحكيم' : 'Head of judging', title: '' }, { name: ar ? 'مدير المسابقة' : 'Competition director', title: '' }];
  return <div dir={ar ? 'rtl' : 'ltr'} style={{ containerType: 'inline-size', position: 'relative', width: '100%', aspectRatio: '297 / 210', background: `radial-gradient(ellipse at 50% 35%, #fffef9 0%, ${PAPER} 55%, #f6efdd 100%)`, color: INK, fontFamily: FONT, overflow: 'hidden', boxSizing: 'border-box' } as React.CSSProperties}>
    <div style={{ position: 'absolute', inset: '3.2%', border: `2.5px solid ${GREEN}`, borderRadius: 6 }} />
    <div style={{ position: 'absolute', inset: '4.4%', border: `1px solid ${GOLD}`, borderRadius: 4 }} />
    <Corner style={{ top: '2.2%', left: '1.6%' }} /><Corner style={{ top: '2.2%', right: '1.6%', transform: 'scaleX(-1)' }} />
    <Corner style={{ bottom: '2.2%', left: '1.6%', transform: 'scaleY(-1)' }} /><Corner style={{ bottom: '2.2%', right: '1.6%', transform: 'scale(-1,-1)' }} />
    {preview && <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}><span style={{ transform: 'rotate(-18deg)', fontSize: '6.5cqw', fontWeight: 700, color: 'rgba(168,131,74,.16)', letterSpacing: '.1em' }}>{ar ? 'معاينة — غير مُصدرة' : 'PREVIEW — NOT ISSUED'}</span></div>}
    <div style={{ position: 'absolute', inset: '8% 10% 7%', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', containerType: 'inline-size' } as React.CSSProperties}>
      <div style={{ fontSize: '1.7cqw', letterSpacing: '.25em', color: GOLD, fontWeight: 700 }}>{org}</div>
      <div style={{ fontFamily: "'Amiri',serif", fontSize: '2.6cqw', color: GREEN, marginTop: '1.2cqw' }}>بسم الله الرحمن الرحيم</div>
      <h1 style={{ margin: '1.4cqw 0 0', fontFamily: "'Amiri',serif", fontSize: '6.2cqw', lineHeight: 1.15, color: GREEN, fontWeight: 700 }}>{heading}</h1>
      <div style={{ width: '22cqw', height: 2, background: `linear-gradient(90deg,transparent,${GOLD},transparent)`, margin: '1.2cqw 0' }} />
      <div style={{ fontSize: '1.9cqw', color: MUTED }}>{ar ? 'تشهد الجهة المنظمة بأن' : 'This certifies that'}</div>
      <div style={{ fontFamily: "'Amiri',serif", fontSize: '5.2cqw', fontWeight: 700, color: INK, marginTop: '0.6cqw', lineHeight: 1.25 }}>{name}</div>
      <div style={{ fontSize: '1.9cqw', color: INK, marginTop: '1cqw', lineHeight: 1.8, maxWidth: '70cqw' }}>
        {ar ? <>قد شارك في <b style={{ color: GREEN }}>{comp}</b> في فئة <b style={{ color: GREEN }}>{cat}</b>{cert.rank ? <> ونال <b style={{ color: GOLD }}>المركز {ordinalAr(cert.rank)}</b></> : null}{showScore && cert.score ? <> بدرجة <b>{cert.score.toFixed(2)}</b></> : null}.</>
          : <>has taken part in <b style={{ color: GREEN }}>{comp}</b> — <b style={{ color: GREEN }}>{cat}</b>{cert.rank ? <>, achieving <b style={{ color: GOLD }}>rank {cert.rank}</b></> : null}{showScore && cert.score ? <> with a score of <b>{cert.score.toFixed(2)}</b></> : null}.</>}
      </div>
      {ar && cert.awardTextArabic && <div style={{ fontSize: '1.55cqw', color: MUTED, marginTop: '0.8cqw', maxWidth: '64cqw', lineHeight: 1.8 }}>{cert.awardTextArabic}</div>}
      <div style={{ flex: 1 }} />
      <div style={{ width: '100%', display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'end', gap: '3cqw' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: "'Amiri',serif", fontSize: '2cqw', color: GREEN, minHeight: '2.6cqw' }}>{signatories[0]?.name}</div>
          <div style={{ borderTop: `1px solid ${INK}`, marginTop: '0.4cqw', paddingTop: '0.4cqw', fontSize: '1.3cqw', color: MUTED }}>{signatories[0]?.title || (ar ? 'التوقيع' : 'Signature')}</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.6cqw', justifyContent: 'center' }}>
            <div style={{ width: '10cqw' }}><SealMark size={120} /></div>
            <div style={{ background: '#fff', padding: '0.5cqw', borderRadius: 6, border: `1px solid ${LINE}`, width: '9.5cqw' }}><QrSvg value={verify} size={120} /></div>
          </div>
          <div style={{ fontFamily: 'ui-monospace,monospace', fontSize: '1.2cqw', color: INK, marginTop: '0.6cqw', direction: 'ltr' }}>{cert.certificateNumber}</div>
          <div style={{ fontSize: '1.15cqw', color: MUTED }}>{ar ? `تاريخ الإصدار ${cert.issueDate} · تحقّق بمسح الرمز` : `Issued ${cert.issueDate} · scan to verify`}</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: "'Amiri',serif", fontSize: '2cqw', color: GREEN, minHeight: '2.6cqw' }}>{signatories[1]?.name}</div>
          <div style={{ borderTop: `1px solid ${INK}`, marginTop: '0.4cqw', paddingTop: '0.4cqw', fontSize: '1.3cqw', color: MUTED }}>{signatories[1]?.title || (ar ? 'التوقيع' : 'Signature')}</div>
        </div>
      </div>
    </div>
  </div>;
};

/* SVG داخل الشهادة يأخذ عرض حاويته؛ الأحجام أعلاه حدودٌ عليا فقط. */
const certificateCss = `svg{max-width:100%;height:auto}`;

export const CertificateModal: React.FC<{ cert: Certificate | null; ar: boolean; preview?: boolean; showScore?: boolean; title?: string; note?: string; onClose: () => void }> = ({ cert, ar, preview, showScore, title, note, onClose }) => {
  if (!cert) return null;
  const html = () => documentShell(`${ar ? 'شهادة' : 'Certificate'} ${cert.certificateNumber}`, `<style>${certificateCss}body{display:grid;place-items:center;min-height:100vh}.mz-page{width:297mm;max-width:100%}</style><div class="mz-page">${renderToStaticMarkup(<CertificateArtwork cert={cert} ar={ar} preview={preview} showScore={showScore} title={title} />)}</div>`, ar, true);
  const verify = /^https?:/.test(cert.verificationUrl) ? cert.verificationUrl : `${window.location.origin}${cert.verificationUrl || ''}`;
  return <Modal isOpen onClose={onClose} title={ar ? (preview ? 'معاينة الشهادة' : 'الشهادة') : (preview ? 'Certificate preview' : 'Certificate')} subtitle={`${ar ? (cert.participantNameArabic || cert.participantName) : cert.participantName} · ${cert.certificateNumber}`} maxWidth="3xl">
    <div className="[&_svg]:max-w-full [&_svg]:h-auto rounded-2xl overflow-hidden border border-[#e3ddcf] shadow-[0_18px_40px_-24px_rgba(23,34,30,.45)]"><CertificateArtwork cert={cert} ar={ar} preview={preview} showScore={showScore} title={title} /></div>
    {note && <p className="mt-3 rounded-xl bg-[#F5EDE2] px-3 py-2 text-[13px] font-bold leading-5 text-[#7a5a2f]">{note}</p>}
    <div className="mt-4 flex flex-wrap gap-2">
      <Button onClick={() => printDocument(html())} icon={<Printer className="w-4 h-4" />}>{ar ? 'طباعة / PDF' : 'Print / PDF'}</Button>
      <Button variant="outline" onClick={() => downloadFile(`certificate-${cert.certificateNumber}.html`, html(), 'text/html;charset=utf-8')} icon={<Download className="w-4 h-4" />}>{ar ? 'تنزيل الشهادة' : 'Download'}</Button>
      {!preview && <Button variant="outline" onClick={() => window.open(verify, '_blank', 'noopener')} icon={<Link2 className="w-4 h-4" />}>{ar ? 'صفحة التحقق' : 'Verification page'}</Button>}
      <span className="ms-auto inline-flex items-center gap-1.5 text-xs font-bold text-[#6a706c]"><Award className="w-3.5 h-3.5" />{ar ? 'تُطبع على A4 أفقيًّا' : 'Prints on landscape A4'}</span>
    </div>
  </Modal>;
};

/** شهادةٌ للمعاينة تُبنى من النتيجة نفسها حين لا تُصدرها السياسة بعد. */
export function previewCertificate(result: ResultRecord, competition: Competition, organization: Organization): Certificate {
  return {
    id: `preview-${result.id}`, certificateNumber: `PREVIEW-${result.participantCode}`, competitionId: competition.id,
    competitionName: competition.name, competitionNameArabic: competition.nameArabic,
    organizationName: organization.name, organizationNameArabic: organization.nameArabic || organization.name,
    participantId: result.participantId, participantName: result.participantName, participantNameArabic: result.participantNameArabic,
    categoryName: result.categoryName, categoryNameArabic: result.categoryNameArabic || result.categoryName,
    score: result.finalScore, rank: result.rank || undefined, awardTextArabic: competition.policy?.certificates?.awardTextArabic || '',
    issueDate: new Date().toISOString().slice(0, 10), signatories: competition.policy?.certificates?.signatories || [],
    verificationToken: '', verificationUrl: '/verify', isAuthentic: false, qrPayload: '',
  };
}
