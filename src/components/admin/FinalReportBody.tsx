import React from 'react';
import type { FinalReport } from '../../lib/final-report';

/*
 * جسم التقرير الختامي المطبوع — أرقامٌ فقط، بلا نصٍّ حسّاس من اعتراضٍ أو حادث.
 *
 * في ملفٍّ مستقلّ عن `ResultsDocuments` عمدًا: ذاك يجرّ سلسلة المخزن وFirebase عند الاستيراد،
 * فلا يمكن رسمُه في اختبارٍ. وهذا لا يستورد إلا React والنوع، فيُرسم ويُفحص بلا متصفّح.
 * الأنماطُ مضمّنة لأن نافذة الطباعة لا تحمل أنماط التطبيق.
 */

const INK = '#17221e', GREEN = '#214C40', GOLD = '#a8834a', MUTED = '#5f6661', LINE = '#e3ddcf';
const th: React.CSSProperties = { background: GREEN, color: '#fff', fontWeight: 700, fontSize: 11, padding: '8px 10px', textAlign: 'start', whiteSpace: 'nowrap' };
const td: React.CSSProperties = { borderBottom: `1px solid ${LINE}`, fontSize: 11.5, padding: '7px 10px', verticalAlign: 'middle' };
const medal = (rank: number) => rank === 1 ? '#c9a24f' : rank === 2 ? '#9aa3a8' : rank === 3 ? '#b07a4f' : '';

export const FinalReportBody: React.FC<{ ar: boolean; report?: FinalReport }> = ({ ar, report: r }) => {
  if (!r) return <p style={{ fontSize: 12, color: MUTED }}>{ar ? 'لا بيانات لبناء التقرير.' : 'No data to build the report.'}</p>;
  const dash = (v: number | null) => (v === null ? '—' : String(v));
  const Section: React.FC<{ title: string; tiles: [string, string][] }> = ({ title, tiles }) => <section className="mz-break" style={{ marginTop: 18 }}>
    <h2 style={{ fontSize: 15, color: GREEN, margin: '0 0 8px', borderInlineStart: `4px solid ${GOLD}`, paddingInlineStart: 8 }}>{title}</h2>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(96px,1fr))', gap: 8 }}>
      {tiles.map(([v, l]) => <div key={l} style={{ border: `1px solid ${LINE}`, borderRadius: 12, padding: '10px 8px', textAlign: 'center', background: '#fbf9f3' }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: GREEN }}>{v}</div><div style={{ fontSize: 10, color: MUTED }}>{l}</div></div>)}
    </div>
  </section>;
  return <>
    <Section title={ar ? 'الحضور' : 'Attendance'} tiles={[
      [String(r.funnel.registered), ar ? 'مسجَّلون' : 'registered'], [String(r.funnel.approved), ar ? 'مقبولون' : 'approved'],
      [String(r.funnel.arrived), ar ? 'وصلوا' : 'arrived'], [String(r.funnel.noShow), ar ? 'لم يحضروا' : 'no-show'],
      [String(r.funnel.tested), ar ? 'اختُبروا' : 'tested'], [String(r.funnel.certified), ar ? 'شهادات' : 'certified']]} />
    <Section title={ar ? 'النتائج' : 'Results'} tiles={[
      [String(r.results.reportable), ar ? 'نتيجة معتمدة' : 'approved results'], [dash(r.results.average), ar ? 'المتوسط' : 'average'],
      [dash(r.results.highest), ar ? 'الأعلى' : 'highest'], [dash(r.results.lowest), ar ? 'الأدنى' : 'lowest'],
      [String(r.results.pendingExcluded), ar ? 'قيد الاعتماد (مستبعدة)' : 'pending (excluded)']]} />
    <Section title={ar ? 'ما وقع في اليوم' : 'What happened on the day'} tiles={[
      [String(r.appeals.total), ar ? 'اعتراضات' : 'appeals'], [String(r.appeals.accepted), ar ? 'مقبولة' : 'accepted'],
      [String(r.appeals.rejected), ar ? 'مرفوضة' : 'rejected'], [String(r.appeals.open), ar ? 'مفتوحة' : 'open'],
      [String(r.incidents.total), ar ? 'حوادث' : 'incidents'], [String(r.incidents.unresolved), ar ? 'غير محلولة' : 'unresolved']]} />
    {r.categories.length > 0 && <section className="mz-break" style={{ marginTop: 18 }}><h2 style={{ fontSize: 15, color: GREEN, margin: '0 0 8px', borderInlineStart: `4px solid ${GOLD}`, paddingInlineStart: 8 }}>{ar ? 'الفئات' : 'Categories'}</h2><table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr>{(ar ? ['الفئة', 'المتسابقون', 'أعلى', 'المتوسط', 'أدنى', 'المركز الأول'] : ['Category', 'Participants', 'High', 'Average', 'Low', 'First place']).map(h => <th key={h} style={th}>{h}</th>)}</tr></thead><tbody>{r.categories.map(c => <tr key={c.categoryName}><td style={{ ...td, fontWeight: 700 }}>{c.categoryName}</td><td style={td}>{c.participants}</td><td style={td}>{c.highestScore.toFixed(2)}</td><td style={td}>{c.averageScore.toFixed(2)}</td><td style={td}>{c.lowestScore.toFixed(2)}</td><td style={td}>{c.firstPlace}</td></tr>)}</tbody></table></section>}
    {r.podium.length > 0 && <section className="mz-break" style={{ marginTop: 18 }}>
      <h2 style={{ fontSize: 15, color: GREEN, margin: '0 0 8px', borderInlineStart: `4px solid ${GOLD}`, paddingInlineStart: 8 }}>{ar ? 'المنصّة' : 'Podium'}</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr>{[ar ? 'المركز' : 'Rank', ar ? 'الفئة' : 'Category', ar ? 'المتسابق' : 'Participant', ar ? 'الدرجة' : 'Score'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
        <tbody>{r.podium.map(p => <tr key={`${p.categoryName}-${p.rank}-${p.code}`}><td style={{ ...td, fontWeight: 700, color: medal(p.rank) || INK }}>{p.rank}</td><td style={td}>{p.categoryName}</td><td style={td}>{p.code} — {p.name}</td><td style={td}>{p.score}</td></tr>)}</tbody></table>
    </section>}
    {r.committees.length > 0 && <section className="mz-break" style={{ marginTop: 18 }}>
      <h2 style={{ fontSize: 15, color: GREEN, margin: '0 0 8px', borderInlineStart: `4px solid ${GOLD}`, paddingInlineStart: 8 }}>{ar ? 'اللجان' : 'Committees'}</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr>{[ar ? 'اللجنة' : 'Committee', ar ? 'أنجزت' : 'Completed', ar ? 'متوسط الجلسة (دقيقة)' : 'Avg session (min)'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
        <tbody>{r.committees.map(c => <tr key={c.code}><td style={td}>{c.code} — {c.name}</td><td style={td}>{c.completed}</td><td style={td}>{dash(c.averageMinutes)}</td></tr>)}</tbody></table>
    </section>}
  </>;
};

