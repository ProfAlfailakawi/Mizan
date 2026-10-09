/*
 * MIZAN Passport — صفحة واحدة بوجهين:
 *  - عرض عام (#passport?id=…): ما نشره صاحبه فقط، وكل شهادة بحكم تحقّق حيّ من الخادم.
 *  - إدارة لصاحبه: الرمز السرّي محفوظ على هذا الجهاز وحده. يضيف مشاركاته برابط رحلته، ويختار
 *    الاسم واللغات والظهور، ويحذف ما يشاء، أو يمحو الجواز كله.
 */
import React, { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { useAppStore } from '../../lib/store';
import { pl, usePublicLocale } from '../../lib/public-i18n';
import { MizanPictogram } from '../design-system/MizanPictogram';
import { PublicLanguageSwitcher } from './PublicLanguageSwitcher';

type Entry = { id: string; competitionId: string; competitionName: string; competitionNameArabic?: string; organizationName?: string; year?: number; categoryName?: string; riwaya?: string; kind: 'certificate' | 'participation'; certificateNumber?: string; rank?: number; finalScore?: number; verification?: string };
type Passport = { id: string; displayName: string; languages: string[]; visibility?: 'private' | 'public'; entries: Entry[] };

const TOKEN_KEY = 'mizan.passportToken';
const readToken = () => { try { return window.localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; } };
const writeToken = (t: string) => { try { if (t) window.localStorage.setItem(TOKEN_KEY, t); else window.localStorage.removeItem(TOKEN_KEY); } catch { /* تخزين غير متاح: يبقى الرمز للجلسة فقط */ } };
const hashParams = () => new URLSearchParams((window.location.hash.split('?')[1] || ''));

async function post(path: string, body: Record<string, unknown>) {
  const r = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store' });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(String(j.code || `HTTP_${r.status}`));
  return j;
}

const ERR: Record<string, [string, string]> = {
  PASSPORT_ENTRY_CLAIMED_ELSEWHERE: ['هذه المشاركة مضافة إلى جواز آخر.', 'This participation is already in another passport.'],
  PASSPORT_PARTICIPATION_NOT_ELIGIBLE: ['لا يمكن إضافة مشاركة منسحبة أو مرفوضة.', 'A withdrawn or rejected participation cannot be added.'],
  PASSPORT_CERTIFICATE_REVOKED: ['الشهادة المرتبطة مُبطلة، فلا تُضاف.', 'The linked certificate is revoked and cannot be added.'],
  PASSPORT_CERTIFICATE_INVALID_PROOF: ['تعذّر إثبات الشهادة المرتبطة.', 'The linked certificate could not be proven.'],
  PASSPORT_DISPLAY_NAME_REQUIRED: ['اكتب اسمًا يظهر قبل نشر الجواز.', 'Add a display name before publishing.'],
  JOURNEY_TOKEN_INVALID: ['رابط الرحلة غير صحيح.', 'The journey link is not valid.'],
  JOURNEY_NOT_FOUND: ['رابط الرحلة غير صحيح.', 'The journey link is not valid.'],
  PASSPORT_NOT_FOUND: ['لم يُعثر على الجواز.', 'Passport not found.'],
};
const errText = (code: string, _ar: boolean) => pl(...(ERR[code] || ['تعذّرت العملية. حاول مرة أخرى.', 'Something went wrong. Try again.']));
const VERDICT: Record<string, [string, string, string]> = {
  AUTHENTIC: ['شهادة موثّقة', 'Verified certificate', 'text-[#1f5b3c] bg-[#e8f3ec]'],
  REVOKED: ['شهادة مُبطلة', 'Revoked certificate', 'text-[#874b43] bg-[#f7ece9]'],
  INVALID_PROOF: ['تعذّر إثبات الشهادة', 'Certificate proof failed', 'text-[#874b43] bg-[#f7ece9]'],
  NOT_FOUND: ['الشهادة غير موجودة', 'Certificate not found', 'text-[#874b43] bg-[#f7ece9]'],
  participation_confirmed: ['مشاركة مؤكّدة', 'Confirmed participation', 'text-[#214C40] bg-[#E7EEE9]'],
};

const EntryCard: React.FC<{ e: Entry; ar: boolean; onRemove?: () => void }> = ({ e, ar, onRemove }) => {
  const v = VERDICT[e.verification || (e.kind === 'certificate' ? 'AUTHENTIC' : 'participation_confirmed')] || VERDICT.participation_confirmed;
  return <li className="mizan-surface p-4">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div><div className="text-base font-black">{ar ? e.competitionNameArabic || e.competitionName : e.competitionName || e.competitionNameArabic}</div>
        <div className="mt-1 text-xs text-[#646965]">{[e.organizationName, e.year, e.categoryName, e.riwaya].filter(Boolean).join(' · ')}</div></div>
      <span className={`rounded-full px-3 py-1 text-[11px] font-black ${v[2]}`}>{pl(v[0], v[1])}</span>
    </div>
    {(e.rank || e.finalScore !== undefined) && <div className="mt-2 text-sm font-bold">{e.rank ? `${pl('الترتيب', 'Rank')} #${e.rank}` : ''}{e.finalScore !== undefined ? ` · ${pl('الدرجة', 'Score')} ${e.finalScore}` : ''}</div>}
    <div className="mt-2 flex flex-wrap gap-3 text-xs">
      {e.certificateNumber && <a className="font-bold text-[#214C40] underline" href={`#verify?cert=${encodeURIComponent(e.certificateNumber)}`}>{pl('تحقّق من الشهادة', 'Verify certificate')} <span dir="ltr">{e.certificateNumber}</span></a>}
      {onRemove && <button type="button" className="font-bold text-[#A34D43]" onClick={onRemove}>{pl('إزالة من الجواز', 'Remove')}</button>}
    </div>
  </li>;
};

export const PassportView: React.FC = () => {
  const { language } = useAppStore(); const { arabicData: ar } = usePublicLocale(language);
  const params = hashParams();
  const publicId = params.get('id') || '';
  const [passport, setPassport] = useState<Passport | null>(null);
  const [token, setToken] = useState(readToken);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [journeyLink, setJourneyLink] = useState(() => { const c = params.get('comp'), k = params.get('key'); return c && k ? `#journey?comp=${c}&key=${k}` : ''; });
  const [form, setForm] = useState({ displayName: '', languages: '' });
  const [qr, setQr] = useState('');
  const publicUrl = passport ? `${window.location.origin}/#passport?id=${encodeURIComponent(passport.id)}` : '';

  const loadOwner = useCallback(async (t: string) => {
    try { const r = await post('/api/public/passports/me', { token: t }); setPassport(r.passport); setForm({ displayName: r.passport.displayName, languages: r.passport.languages.join(', ') }); setError(''); }
    catch (e) { const code = (e as Error).message; if (code === 'PASSPORT_NOT_FOUND' || code === 'PASSPORT_TOKEN_INVALID') { writeToken(''); setToken(''); } setError(code); }
  }, []);

  useEffect(() => {
    if (publicId) {
      void (async () => { try { const r = await fetch(`/api/public/passports/${encodeURIComponent(publicId)}`, { cache: 'no-store' }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(String(j.code || 'PASSPORT_NOT_FOUND')); setPassport(j.passport); } catch (e) { setError((e as Error).message); } })();
    } else if (token) void loadOwner(token);
  }, [publicId, token, loadOwner]);

  useEffect(() => { if (publicUrl && passport?.visibility === 'public') void QRCode.toDataURL(publicUrl, { margin: 1, width: 220 }).then(setQr).catch(() => setQr('')); else setQr(''); }, [publicUrl, passport?.visibility]);

  const run = async (fn: () => Promise<void>) => { setBusy(true); setError(''); try { await fn(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } };
  const create = () => run(async () => { const r = await post('/api/public/passports', { displayName: form.displayName }); writeToken(r.token); setToken(r.token); setPassport(r.passport); });
  const addEntry = () => run(async () => {
    const q = new URLSearchParams(journeyLink.split('?')[1] || '');
    const competitionId = q.get('comp') || '', journeyKey = q.get('key') || '';
    if (!competitionId || !journeyKey) throw new Error('JOURNEY_TOKEN_INVALID');
    const r = await post('/api/public/passports/me/entries', { token, competitionId, journeyKey });
    setPassport(r.passport); setJourneyLink('');
  });
  const save = (visibility?: 'private' | 'public') => run(async () => { const r = await post('/api/public/passports/me/update', { token, displayName: form.displayName, languages: form.languages.split(',').map(x => x.trim()).filter(Boolean), ...(visibility ? { visibility } : {}) }); setPassport(r.passport); });
  const remove = (entryId: string) => run(async () => { const r = await post('/api/public/passports/me/entries/remove', { token, entryId }); setPassport(r.passport); });
  const [confirmErase, setConfirmErase] = useState(false);
  const erase = () => run(async () => { await post('/api/public/passports/me/erase', { token }); writeToken(''); setToken(''); setPassport(null); setConfirmErase(false); });

  const header = <div className="mb-6 flex items-start justify-between gap-3"><div>{!ar && <div className="mizan-kicker">MIZAN PASSPORT</div>}<h1 className="font-display mt-1 text-2xl sm:text-3xl font-black">{pl('جواز ميزان', 'MIZAN Passport')}</h1></div><PublicLanguageSwitcher /></div>;

  if (publicId) return <main className="mx-auto max-w-2xl px-4 py-8">{header}
    {error && <p role="alert" className="rounded-xl bg-[#F4E6E3] p-3 text-xs font-bold text-[#87483f]">{errText(error, ar)}</p>}
    {passport && <><div className="mizan-surface p-5"><div className="text-2xl font-black">{passport.displayName}</div>{!!passport.languages.length && <div className="mt-1 text-xs text-[#646965]" dir="ltr">{passport.languages.join(' · ')}</div>}
      <p className="mt-2 text-[11px] text-[#646965]">{pl('كل شهادة هنا يُعاد التحقق منها من سجل الشهادات العام لحظة العرض.', 'Every certificate here is re-verified against the public certificate registry as you view it.')}</p></div>
      <ul className="mt-4 space-y-3">{passport.entries.map(e => <EntryCard key={e.id} e={e} ar={ar} />)}</ul></>}
  </main>;

  return <main className="mx-auto max-w-2xl px-4 py-8">{header}
    <p className="mb-4 text-sm leading-7 text-[#646965]">{pl('سجلّ اختياري لمشاركاتك وشهاداتك الموثّقة. خاصّ بك حتى تختار نشره، ويُحفظ مفتاحه على هذا الجهاز فقط — احتفظ برابط هذه الصفحة.', 'An optional record of your verified participations and certificates. Private until you publish it; its key is kept on this device only.')}</p>
    {error && <p role="alert" className="mb-4 rounded-xl bg-[#F4E6E3] p-3 text-xs font-bold text-[#87483f]">{errText(error, ar)}</p>}
    {!passport && <div className="mizan-surface space-y-4 p-5 sm:p-6">
      <div className="flex items-center gap-4"><MizanPictogram kind="pass" size="lg" tone="emerald" />
        <ol className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-bold text-[var(--muted)]">{[pl('أنشئ جوازك', 'Create it'), pl('أضف مشاركاتك', 'Add your entries'), pl('انشره إن شئت', 'Publish if you wish')].map((t, i) => <li key={t} className="inline-flex items-center gap-1.5"><span className="grid h-5 w-5 place-items-center rounded-full bg-[var(--emerald-soft)] text-[10px] text-[var(--emerald)]">{i + 1}</span>{t}</li>)}</ol></div>
      <label className="block text-xs font-bold">{pl('الاسم الظاهر (اختياري الآن)', 'Display name (optional for now)')}<input className="mizan-input mt-1" value={form.displayName} onChange={e => setForm({ ...form, displayName: e.target.value })} /></label>
      <button type="button" disabled={busy} onClick={() => void create()} className="min-h-11 rounded-full bg-[#214C40] px-5 text-sm font-bold text-white">{pl('أنشئ جوازي', 'Create my passport')}</button>
    </div>}
    {passport && <div className="space-y-4">
      <section className="mizan-surface space-y-3 p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-xs font-bold">{pl('الاسم الظاهر', 'Display name')}<input className="mizan-input mt-1" value={form.displayName} onChange={e => setForm({ ...form, displayName: e.target.value })} /></label>
          <label className="block text-xs font-bold">{pl('اللغات (رموز مثل ar, en)', 'Languages (codes like ar, en)')}<input className="mizan-input mt-1" dir="ltr" value={form.languages} onChange={e => setForm({ ...form, languages: e.target.value })} /></label>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" disabled={busy} onClick={() => void save()} className="min-h-11 rounded-full border border-[#214C40] px-5 text-sm font-bold text-[#214C40]">{pl('حفظ', 'Save')}</button>
          {passport.visibility === 'public'
            ? <button type="button" disabled={busy} onClick={() => void save('private')} className="min-h-11 rounded-full border px-5 text-sm font-bold">{pl('إخفاء (جعله خاصًا)', 'Make private')}</button>
            : <button type="button" disabled={busy} onClick={() => void save('public')} className="min-h-11 rounded-full bg-[#214C40] px-5 text-sm font-bold text-white">{pl('نشر الجواز', 'Publish')}</button>}
          <span className="text-xs font-bold">{passport.visibility === 'public' ? (pl('منشور', 'Public')) : (pl('خاص', 'Private'))}</span>
        </div>
        {passport.visibility === 'public' && <div className="flex flex-wrap items-center gap-4 rounded-xl bg-[#F5F2EB] p-3">
          {qr && <img src={qr} alt={pl('رمز الاستجابة السريعة لصفحة الجواز العامة', 'QR code for the public passport page')} className="h-28 w-28" />}
          <a className="break-all text-xs font-bold text-[#214C40] underline" dir="ltr" href={publicUrl}>{publicUrl}</a>
        </div>}
      </section>
      <section className="mizan-surface space-y-2 p-5">
        <h2 className="text-sm font-black">{pl('أضف مشاركة', 'Add a participation')}</h2>
        <p className="text-xs text-[#646965]">{pl('ألصق رابط رحلتك الخاص الذي وصلك عند التسجيل. تُضاف الشهادة تلقائيًا إن صدرت وثبتت.', 'Paste the private journey link you received at registration. The certificate is added automatically if issued and verified.')}</p>
        <input aria-label={pl('رابط الرحلة', 'Journey link')} className="mizan-input" dir="ltr" value={journeyLink} onChange={e => setJourneyLink(e.target.value)} />
        <button type="button" disabled={busy || !journeyLink} onClick={() => void addEntry()} className="min-h-11 rounded-full bg-[#214C40] px-5 text-sm font-bold text-white">{pl('إضافة', 'Add')}</button>
      </section>
      <ul className="space-y-3">{passport.entries.map(e => <EntryCard key={e.id} e={e} ar={ar} onRemove={() => void remove(e.id)} />)}</ul>
      <section className="rounded-2xl border border-[#e5c9c4] p-4 text-xs">
        {!confirmErase ? <button type="button" className="font-bold text-[#A34D43]" onClick={() => setConfirmErase(true)}>{pl('محو الجواز نهائيًا', 'Erase passport permanently')}</button>
          : <span className="flex flex-wrap items-center gap-2"><b>{pl('سيُمحى الجواز وكل ما فيه ولا يمكن استرجاعه.', 'The passport and everything in it will be erased.')}</b>
            <button type="button" disabled={busy} className="rounded-full bg-[#A34D43] px-4 py-2 font-bold text-white" onClick={() => void erase()}>{pl('تأكيد المحو', 'Confirm')}</button>
            <button type="button" className="font-bold" onClick={() => setConfirmErase(false)}>{pl('تراجع', 'Cancel')}</button></span>}
      </section>
    </div>}
  </main>;
};

export default PassportView;
