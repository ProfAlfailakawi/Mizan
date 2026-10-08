/*
 * الواجهات التجارية: اشتراك الجهة واستخدامها، لوحة المشغّل (الرصيد والعملاء والأسعار والعلامة)،
 * لوحة المنصّة (الكتالوج والاتفاقيات والتقارير)، ومعالج «إنشاء نسخة جديدة».
 *
 * كل رقمٍ هنا يأتي من الخادم؛ الواجهة لا تحسب استحقاقًا ولا سعرًا. والمال يُعرض من أعدادٍ صحيحة.
 * والنصوص من نطاق `commercial-i18n` لا مكتوبةً داخل المكوّن.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { auth } from '../../lib/firebase';
import { IS_DEMO_SESSION, useAppStore } from '../../lib/store';
import { ct, commercialErrorText, formatDate, formatMoney, termLastDay, type CommercialKey } from '../../lib/commercial-i18n';
import { CLONE_PARTS, suggestNextEditionLabel, type ClonePart } from '../../lib/competition-clone';
import { Check, Gauge, Building2, UsersRound, WalletCards } from 'lucide-react';
import { DnaStat } from '../dna/DnaKit';
import { Button } from '../design-system/Button';
import { Badge } from '../design-system/Badge';

class ApiError extends Error { constructor(public code: string, public details?: Record<string, any>) { super(code); } }

async function api(path: string, init?: RequestInit & { idempotencyKey?: string }) {
  const user = auth.currentUser;
  if (!user || IS_DEMO_SESSION) {
    /* بيئة العرض: القراءة تُجاب من حمولاتٍ مصطنعة تُستورد ديناميكيًّا؛ والكتابة تُرفض كما كانت. */
    if (IS_DEMO_SESSION && !init) {
      try { const demo = (await import('../../data/demo-commercial')).demoCommercialResponse(path); if (demo !== null && demo !== undefined) return demo; } catch { /* يسقط إلى الرفض أدناه */ }
    }
    if (IS_DEMO_SESSION && init) return (await import('../../data/demo-commercial')).demoCommercialWrite(path, init);
    throw new ApiError('IDENTITY_REQUIRED');
  }
  const token = await user.getIdToken();
  const res = await fetch(path, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...(init?.idempotencyKey ? { 'idempotency-key': init.idempotencyKey } : {}),
    },
    cache: 'no-store',
  });
  if (path.includes('format=csv') && res.ok) return res.text();
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(String(body.code || `HTTP_${res.status}`), body.details);
  return body;
}

/** One key per user intent: a retry or double click reuses it, so money moves once. */
const newIntentKey = () => (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`);

const useLocale = () => { const { language } = useAppStore(); return language === 'ar' ? 'ar' : 'en'; };

const ErrorBox: React.FC<{ error: ApiError | null }> = ({ error }) => {
  const locale = useLocale();
  if (!error) return null;
  return <div role="alert" aria-live="assertive" className="rounded-2xl bg-[#f7ece9] px-4 py-3 text-xs font-bold text-[#874b43]">{commercialErrorText(error.code, locale, error.details)}</div>;
};

const Stat: React.FC<{ label: string; value: React.ReactNode; hint?: string }> = ({ label, value, hint }) => (
  <div className="rounded-2xl border border-[#e2e0d9] bg-white p-3.5 min-[400px]:p-4">
    <div className="text-[11px] font-bold text-[#666c68]">{label}</div>
    <div className="mt-1 whitespace-nowrap text-[clamp(13px,4.2vw,18px)] font-black text-[#171b18]" dir="auto">{value}</div>
    {hint && <div className="mt-1 text-[11px] text-[#666c68] [text-wrap:balance]">{hint}</div>}
  </div>
);

const Progress: React.FC<{ label: string; used: number; total: number }> = ({ label, used, total }) => {
  const pct = total ? Math.min(100, Math.round((used / total) * 100)) : used ? 100 : 0;
  const tone = pct >= 95 ? '#a2453a' : pct >= 85 ? '#b7791f' : '#1f6f4a';
  return (
    <div>
      <div className="flex items-center justify-between text-xs"><span className="font-bold">{label}</span><span dir="ltr">{used.toLocaleString('en-US')} / {total.toLocaleString('en-US')}</span></div>
      <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={total} aria-valuenow={used} className="mt-2 h-2.5 rounded-full bg-[#ebe9e2]">
        <div className="h-2.5 rounded-full" style={{ width: `${pct}%`, background: tone }} />
      </div>
    </div>
  );
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label className="block text-xs font-bold text-[#454b47]"><span className="mb-1 block">{label}</span>{children}</label>
);
const inputCls = 'w-full rounded-xl border border-[#d8d6ce] bg-white px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1f6f4a]';

/* ═════════════════════ اشتراك الجهة ═════════════════════ */

export const OrganizationSubscriptionPanel: React.FC<{ organizationId?: string }> = ({ organizationId }) => {
  const locale = useLocale();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const qs = organizationId ? `?organizationId=${encodeURIComponent(organizationId)}` : '';
  const load = useCallback(async () => { try { setData(await api(`/api/saas/organization/billing${qs}`)); setError(null); } catch (e) { setError(e as ApiError); } }, [qs]);
  useEffect(() => { void load(); }, [load]);
  if (!data) return <div className="space-y-3"><ErrorBox error={error} />{!error && <div className="text-xs text-[#666c68]">{ct(locale, 'loading')}</div>}</div>;
  const u = data.usage;
  const warn = u.warningThresholdBps >= 10_000 ? 'warnFull' : u.warningThresholdBps >= 8_500 ? 'warnHigh' : u.warningThresholdBps >= 7_000 ? 'warn70' : null;
  const upgrade = async (planId: string) => {
    setBusy(true); setNotice('');
    try { const r = await api(`/api/saas/organization/upgrade${qs}`, { method: 'POST', body: JSON.stringify({ planId }) }); setNotice(r.applied ? '' : ct(locale, 'upgradeInvoiced')); await load(); }
    catch (e) { setError(e as ApiError); } finally { setBusy(false); }
  };
  const planName = (p: any) => locale === 'ar' ? (p?.nameArabic || p?.name) : p?.name;
  const larger = (data.catalog || []).filter((p: any) => p.participantAllowance > u.participantAllowance);
  return (
    <section className="space-y-4" aria-labelledby="subscription-heading">
      <h2 id="subscription-heading" className="text-base font-black">{ct(locale, 'subscription')}</h2>
      <ErrorBox error={error} />
      {notice && <div role="status" className="rounded-2xl bg-[#e8f3ec] px-4 py-3 text-xs font-bold text-[#1f5b3c]">{notice}</div>}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 [&>*:first-child]:col-span-2 [&>*:last-child]:col-span-2 lg:[&>*:first-child]:col-span-1 lg:[&>*:last-child]:col-span-1">
        <Stat label={ct(locale, 'currentPlan')} value={planName(data.plan) || '—'} />
        <Stat label={ct(locale, 'termStart')} value={formatDate(data.term?.startsAt, locale)} />
        <Stat label={ct(locale, 'termEnd')} value={formatDate(termLastDay(data.term?.endsAt), locale)} />
        <Stat label={ct(locale, 'status')} value={<Badge variant={data.accessState === 'active' ? 'emerald' : 'amber'}>{ct(locale, `state_${data.accessState}` as CommercialKey)}</Badge>} hint={data.accessState === 'read_only' ? ct(locale, 'stateHelp_read_only') : undefined} />
      </div>
      <div className="mizan-panel space-y-4 p-5">
        <Progress label={ct(locale, 'participantsUsed')} used={u.participantsUsed} total={u.participantAllowance} />
        <Progress label={ct(locale, 'activeCompetitions')} used={u.activeCompetitions} total={u.activeCompetitionAllowance} />
        <div className="text-xs text-[#454b47]">{ct(locale, 'remaining')}: <b dir="ltr">{u.participantsRemaining.toLocaleString('en-US')}</b></div>
        {warn && <div role="status" className="rounded-xl bg-[#fbf3e3] px-3 py-2 text-xs font-bold text-[#7a5413]">{ct(locale, warn as CommercialKey)}</div>}
      </div>
      {data.limits && Object.keys(data.limits.override || {}).length > 0 && (
        <div className="mizan-panel p-5 text-xs">
          <div className="space-y-3">{(['participantAllowance', 'activeCompetitionAllowance'] as const).map(k => (
            <div key={k} role="group" aria-label={ct(locale, k === 'participantAllowance' ? 'participantsUsed' : 'activeCompetitions')} className="rounded-2xl bg-[#f3f1eb] p-3">
              <div className="mb-2 flex items-center gap-2 text-xs font-black text-[#171b18]"><Gauge className="h-4 w-4 text-[#2F6555]" strokeWidth={1.75} />{ct(locale, k === 'participantAllowance' ? 'participantsUsed' : 'activeCompetitions')}</div>
              <dl className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-white px-1 py-2"><dt className="text-[11px] font-bold text-[#666c68]">{ct(locale, 'limitsBase')}</dt><dd className="mt-0.5 text-sm font-black" dir="ltr">{Number(data.limits.base[k]).toLocaleString('en-US')}</dd></div>
                <div className="rounded-xl bg-white px-1 py-2"><dt className="text-[11px] font-bold text-[#666c68]">{ct(locale, 'limitsOverride')}</dt><dd className="mt-0.5 text-sm font-black" dir="ltr">{data.limits.override[k] == null ? '—' : Number(data.limits.override[k]).toLocaleString('en-US')}</dd></div>
                <div className="rounded-xl bg-[#e6efe9] px-1 py-2"><dt className="text-[11px] font-bold text-[#2F6555]">{ct(locale, 'limitsEffective')}</dt><dd className="mt-0.5 text-sm font-black text-[#1f5b3c]" dir="ltr">{Number(data.limits.effective[k]).toLocaleString('en-US')}</dd></div>
              </dl>
            </div>))}</div>
        </div>
      )}
      {data.pendingPlanChange && <div className="text-xs">{ct(locale, 'pendingChange')}: <b>{data.pendingPlanChange.name}</b> — {formatDate(data.pendingPlanChange.effectiveAt, locale)}</div>}
      {data.upgradePath === 'contact_operator'
        ? <p className="text-xs text-[#454b47]">{ct(locale, 'contactOperator')}</p>
        : larger.length > 0 && (
          <div className="mizan-panel p-5">
            <h3 className="mb-3 text-sm font-black">{ct(locale, 'upgrade')}</h3>
            <div className="grid gap-3 sm:grid-cols-3">
              {larger.map((p: any) => <div key={p.id} className="rounded-2xl border border-[#e2e0d9] p-4">
                <div className="font-black">{planName(p)}</div>
                <div className="text-xs text-[#666c68]">{p.participantAllowance.toLocaleString('en-US')} · {p.activeCompetitionAllowance} {ct(locale, 'activeCompetitions')}</div>
                <div className="my-2 text-sm font-bold">{formatMoney(p.publicPriceMinor, p.currency, locale)}</div>
                <Button size="sm" loading={busy} onClick={() => void upgrade(p.id)}>{ct(locale, 'upgrade')}</Button>
              </div>)}
            </div>
          </div>
        )}
      <div className="mizan-panel p-5">
        <h3 className="mb-2 text-sm font-black">{ct(locale, 'history')}</h3>
        {data.history.length === 0 ? <p className="text-xs text-[#666c68]">{ct(locale, 'noHistory')}</p> : (
          <ul className="divide-y divide-[#ebe9e2] text-xs">
            {data.history.map((t: any) => <li key={t.id} className="flex flex-wrap justify-between gap-x-2 gap-y-1.5 py-3">
              <span>{formatDate(t.startsAt, locale)} {locale === 'ar' ? '←' : '→'} {formatDate(termLastDay(t.endsAt), locale)}{t.legacy ? ' (legacy)' : ''}</span>
              <span dir="ltr">{t.participantsUsed.toLocaleString('en-US')} / {t.participantAllowance.toLocaleString('en-US')}</span>
              {t.participantAllowance > 0 && <div className="h-1.5 w-full rounded-full bg-[#ebe9e2]"><div className="h-1.5 rounded-full bg-[#1f6f4a]" style={{ width: `${Math.min(100, Math.round((t.participantsUsed / t.participantAllowance) * 100))}%` }} /></div>}
            </li>)}
          </ul>
        )}
      </div>
    </section>
  );
};

/* ═════════════════════ لوحة المشغّل ═════════════════════ */

export const OperatorCommercialPanel: React.FC = () => {
  const locale = useLocale();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [tab, setTab] = useState<'customers' | 'wallet' | 'pricing' | 'branding' | 'payments'>('customers');
  const load = useCallback(async () => { try { setData(await api('/api/saas/operator/commercial')); setError(null); } catch (e) { setError(e as ApiError); } }, []);
  useEffect(() => { void load(); }, [load]);
  if (!data) return <div className="space-y-3"><ErrorBox error={error} />{!error && <div className="text-xs">{ct(locale, 'loading')}</div>}</div>;
  const s = data.summary, cur = s.currency;
  const tabs: [typeof tab, CommercialKey][] = [['customers', 'customers'], ['wallet', 'ledger'], ['pricing', 'wholesalePrice'], ['branding', 'branding'], ['payments', 'paymentGateway']];
  return (
    <section className="space-y-4" aria-label={ct(locale, 'operator')}>
      <ErrorBox error={error} />
      {!data.agreement && <div role="status" className="rounded-2xl bg-[#fbf3e3] px-4 py-3 text-xs font-bold text-[#7a5413]">{ct(locale, 'noAgreement')}</div>}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 [&>*:nth-child(3)]:col-span-2 [&>*:nth-child(4)]:col-span-2 lg:[&>*:nth-child(3)]:col-span-1 lg:[&>*:nth-child(4)]:col-span-1">
        <Stat label={ct(locale, 'walletBalance')} value={formatMoney(s.balanceMinor, cur, locale)} />
        <Stat label={ct(locale, 'annualCommitment')} value={formatMoney(s.annualCommitmentMinor, cur, locale)} hint={`${ct(locale, 'spent')}: ${formatMoney(s.spentThisAgreementMinor, cur, locale)}`} />
        <Stat label={ct(locale, 'tier')} value={data.tier ? (locale === 'ar' ? data.tier.nameArabic : data.tier.name) : '—'} hint={s.discountBps !== undefined ? `${ct(locale, 'discount')}: ${s.discountBps / 100}%` : undefined} />
        <Stat label={ct(locale, 'agreementDates')} value={data.agreement ? `${formatDate(data.agreement.startsAt, locale)} ${locale === 'ar' ? '←' : '→'} ${formatDate(termLastDay(data.agreement.endsAt), locale)}` : '—'} />
        <Stat label={ct(locale, 'customers')} value={s.customerOrganizations} hint={`${ct(locale, 'activeCustomers')}: ${s.activeCustomerSubscriptions}`} />
        <Stat label={ct(locale, 'upcomingRenewals')} value={s.upcomingRenewals} />
        <Stat label={ct(locale, 'pendingRenewals')} value={s.pendingRenewals} />
        <Stat label={ct(locale, 'suspendedCustomers')} value={s.suspendedCustomers} />
      </div>
      {data.legacyCreditBalance !== 0 && <p className="text-xs text-[#666c68]">{ct(locale, 'legacyCredits')}: {data.legacyCreditBalance}</p>}
      <div role="tablist" className="mizan-tabs">
        {tabs.map(([id, key]) => <button key={id} role="tab" aria-selected={tab === id} className={`mizan-tab ${tab === id ? 'is-active' : ''}`} onClick={() => setTab(id)}>{ct(locale, key)}</button>)}
      </div>
      {tab === 'customers' && <OperatorCustomers data={data} reload={load} onError={setError} />}
      {tab === 'wallet' && <OperatorWallet data={data} reload={load} onError={setError} />}
      {tab === 'pricing' && <OperatorPricing data={data} reload={load} onError={setError} />}
      {tab === 'branding' && <BrandEditor ownerType="operator" ownerId={data.agreement?.operatorId || data.wallet?.operatorId || ''} />}
      {tab === 'payments' && <PaymentGatewayPanel ownerType="operator" ownerId={data.agreement?.operatorId || data.wallet?.operatorId || ''} />}
    </section>
  );
};

const OperatorCustomers: React.FC<{ data: any; reload: () => Promise<void>; onError: (e: ApiError | null) => void }> = ({ data, reload, onError }) => {
  const locale = useLocale();
  const [form, setForm] = useState({ officialName: '', shortName: '', organizationType: 'charity', country: '', planId: '' });
  const [intent, setIntent] = useState(newIntentKey);
  const [busy, setBusy] = useState('');
  const plans = (data.pricing || []).filter((p: any) => p.wholesalePriceMinor !== undefined);
  const selected = plans.find((p: any) => p.id === form.planId);
  const activate = async (e: { preventDefault(): void }) => {
    e.preventDefault(); setBusy('activate'); onError(null);
    try { await api('/api/saas/operator/customers', { method: 'POST', body: JSON.stringify(form), idempotencyKey: intent }); setIntent(newIntentKey()); setForm({ ...form, officialName: '', shortName: '' }); await reload(); }
    catch (err) { onError(err as ApiError); } finally { setBusy(''); }
  };
  const renew = async (orgId: string) => {
    setBusy(orgId); onError(null);
    try { await api(`/api/saas/operator/customers/${encodeURIComponent(orgId)}/renew`, { method: 'POST', body: '{}', idempotencyKey: `renew-${orgId}-${data.customers.find((c: any) => c.organizationId === orgId)?.term?.id}` }); await reload(); }
    catch (err) { onError(err as ApiError); } finally { setBusy(''); }
  };
  return (
    <div className="space-y-4">
      {/* ملخص من صفوف الجدول نفسها أدناه: عرض فقط، لا حساب فوترة ولا مبالغ. */}
      <div className="grid gap-3 sm:grid-cols-2">
        <DnaStat icon={<Building2 className="h-5 w-5" aria-hidden="true" />} label={ct(locale, 'customers')} value={<span className="tabular-nums">{data.customers.length}</span>} />
        <DnaStat icon={<UsersRound className="h-5 w-5" aria-hidden="true" />} tone="sky" label={ct(locale, 'participantsUsed')} value={<span className="tabular-nums" dir="ltr">{data.customers.reduce((n: number, c: any) => n + (Number(c.participantsUsed) || 0), 0)} / {data.customers.reduce((n: number, c: any) => n + (Number(c.participantAllowance) || 0), 0)}</span>} />
      </div>
      <div className="space-y-3 sm:hidden">
        {data.customers.map((c: any) => (
          <article key={c.organizationId} className="mizan-panel p-4">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#E7EEE9] text-[#2F6555]"><Building2 className="h-5 w-5" strokeWidth={1.75} /></span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-black">{c.officialName}</div>
                <div className="mt-0.5 text-[11px] font-bold text-[#666c68]">{c.planName || '—'}{c.term ? ` · #${c.term.termIndex}` : ''}</div>
              </div>
              <span className="shrink-0 rounded-full bg-[#f0eee8] px-2.5 py-1 text-[11px] font-black">{ct(locale, `state_${c.accessState}` as CommercialKey)}</span>
            </div>
            <div className="mt-3">
              <div className="flex items-center justify-between text-[11px] font-bold text-[#666c68]"><span>{ct(locale, 'participantsUsed')}</span><span dir="ltr">{c.participantsUsed} / {c.participantAllowance}</span></div>
              {c.participantAllowance > 0 && <div className="mt-1.5 h-2 rounded-full bg-[#ebe9e2]"><div className="h-2 rounded-full bg-[#1f6f4a]" style={{ width: `${Math.min(100, Math.round((c.participantsUsed / c.participantAllowance) * 100))}%` }} /></div>}
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-xl bg-[#f3f1eb] px-3 py-2"><dt className="text-[11px] font-bold text-[#666c68]">{ct(locale, 'renewalDate')}</dt><dd className="mt-0.5 font-black">{formatDate(termLastDay(c.renewalDate), locale)}</dd></div>
              <div className="rounded-xl bg-[#f3f1eb] px-3 py-2"><dt className="text-[11px] font-bold text-[#666c68]">{ct(locale, 'walletCost')}</dt><dd className="mt-0.5 font-black">{formatMoney(c.walletCostMinor, c.currency, locale)}</dd></div>
              <div className="col-span-2 rounded-xl bg-[#f3f1eb] px-3 py-2"><dt className="text-[11px] font-bold text-[#666c68]">{ct(locale, 'customDomain')}</dt><dd className="mt-0.5 font-black" dir="ltr">{c.domain || '—'}</dd></div>
            </dl>
            <Button className="mt-3 min-h-11 w-full" size="sm" variant="secondary" loading={busy === c.organizationId} onClick={() => void renew(c.organizationId)}>{ct(locale, 'renew')}</Button>
          </article>
        ))}
      </div>
      <div className="mizan-panel hidden overflow-x-auto p-4 sm:block">
        <table className="w-full min-w-[720px] text-start text-xs [&_td]:px-2.5 [&_th]:px-2.5">
          <thead><tr className="text-[#666c68]">{(['customers', 'currentPlan', 'term', 'participantsUsed', 'renewalDate', 'status', 'walletCost', 'customDomain'] as CommercialKey[]).map(k => <th key={k} scope="col" className="py-2">{ct(locale, k)}</th>)}<th scope="col" /></tr></thead>
          <tbody>{data.customers.map((c: any) => <tr key={c.organizationId} className="border-t border-[#ebe9e2]">
            <td className="py-2 font-bold">{c.officialName}</td><td>{c.planName || '—'}</td>
            <td>{c.term ? `#${c.term.termIndex}` : '—'}</td><td dir="ltr"><div>{c.participantsUsed} / {c.participantAllowance}</div>{c.participantAllowance > 0 && <div className="mt-1 h-1.5 w-24 rounded-full bg-[#ebe9e2]"><div className="h-1.5 rounded-full bg-[#1f6f4a]" style={{ width: `${Math.min(100, Math.round((c.participantsUsed / c.participantAllowance) * 100))}%` }} /></div>}</td>
            <td>{formatDate(termLastDay(c.renewalDate), locale)}</td><td>{ct(locale, `state_${c.accessState}` as CommercialKey)}</td>
            <td>{formatMoney(c.walletCostMinor, c.currency, locale)}</td><td dir="ltr">{c.domain || '—'}</td>
            <td><Button size="sm" variant="secondary" loading={busy === c.organizationId} onClick={() => void renew(c.organizationId)}>{ct(locale, 'renew')}</Button></td>
          </tr>)}</tbody>
        </table>
      </div>
      <form onSubmit={activate} className="mizan-panel grid gap-3 p-5 sm:grid-cols-2">
        <h3 className="text-sm font-black sm:col-span-2">{ct(locale, 'activateCustomer')}</h3>
        <Field label={ct(locale, 'nameArabic')}><input required className={inputCls} value={form.officialName} onChange={e => setForm({ ...form, officialName: e.target.value })} /></Field>
        <Field label={ct(locale, 'nameEnglish')}><input required className={inputCls} value={form.shortName} onChange={e => setForm({ ...form, shortName: e.target.value })} /></Field>
        <Field label={locale === 'ar' ? 'رمز الدولة (ISO)' : 'ISO country'}><input required maxLength={2} className={inputCls} dir="ltr" value={form.country} onChange={e => setForm({ ...form, country: e.target.value.toUpperCase() })} /></Field>
        <Field label={ct(locale, 'currentPlan')}>
          <select required className={inputCls} value={form.planId} onChange={e => setForm({ ...form, planId: e.target.value })}>
            <option value="" />
            {plans.map((p: any) => <option key={p.id} value={p.id}>{p.name} — {formatMoney(p.wholesalePriceMinor, p.currency, locale)}</option>)}
          </select>
        </Field>
        {selected && <p className="text-xs sm:col-span-2">{ct(locale, 'wholesalePrice')}: <b>{formatMoney(selected.wholesalePriceMinor, selected.currency, locale)}</b> · {ct(locale, 'walletBalance')}: {formatMoney(data.summary.balanceMinor, data.summary.currency, locale)}</p>}
        <div className="sm:col-span-2"><Button type="submit" loading={busy === 'activate'} disabled={!data.agreement}>{ct(locale, 'activateCustomer')}</Button></div>
      </form>
    </div>
  );
};

const OperatorWallet: React.FC<{ data: any; reload: () => Promise<void>; onError: (e: ApiError | null) => void }> = ({ data, reload, onError }) => {
  const locale = useLocale();
  const [amount, setAmount] = useState('');
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState(false);
  const rows = data.ledger.filter((e: any) => !filter || e.type === filter);
  const request = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    const minor = Math.round(Number(amount) * 100);
    if (!Number.isSafeInteger(minor) || minor <= 0) return;
    setBusy(true); onError(null);
    try { await api('/api/saas/operator/wallet/top-up-request', { method: 'POST', body: JSON.stringify({ amountMinor: minor }) }); setAmount(''); await reload(); }
    catch (err) { onError(err as ApiError); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-4">
      <form onSubmit={request} className="mizan-panel flex flex-wrap items-end gap-3 p-5">
        <Field label={`${ct(locale, 'topUp')} (${data.summary.currency})`}><input inputMode="decimal" className={inputCls} dir="ltr" value={amount} onChange={e => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} /></Field>
        <Button type="submit" loading={busy}>{ct(locale, 'topUp')}</Button>
      </form>
      <div className="mizan-panel overflow-x-auto p-4">
        <label className="mb-3 block text-xs font-bold">{ct(locale, 'status')}
          <select className={`${inputCls} mt-1 max-w-xs`} value={filter} onChange={e => setFilter(e.target.value)}>
            <option value="" />
            {['commitment', 'top_up', 'license_activation', 'license_renewal', 'plan_upgrade', 'refund', 'admin_adjustment', 'expiration'].map(t => <option key={t} value={t}>{ct(locale, `entry_${t}` as CommercialKey)}</option>)}
          </select>
        </label>
        <ul className="divide-y divide-[#ebe9e2] sm:hidden">
          {rows.map((e: any) => (
            <li key={e.id} className="flex items-center gap-3 py-3">
              <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${e.amountMinor < 0 ? 'bg-[#f6e7e3] text-[#874b43]' : 'bg-[#E7EEE9] text-[#2F6555]'}`}><WalletCards className="h-[18px] w-[18px]" strokeWidth={1.75} /></span>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-black">{ct(locale, `entry_${e.type}` as CommercialKey)}</div>
                <div className="mt-0.5 text-[11px] text-[#666c68]">{formatDate(e.createdAt, locale)}{e.reason ? ` · ${e.reason}` : ''}</div>
              </div>
              <div className="shrink-0 text-end">
                <div dir="ltr" className={`text-xs font-black ${e.amountMinor < 0 ? 'text-[#874b43]' : 'text-[#1f5b3c]'}`}>{formatMoney(e.amountMinor, e.currency, locale)}</div>
                <div dir="ltr" className="mt-0.5 text-[11px] text-[#666c68]">{formatMoney(e.balanceAfterMinor, e.currency, locale)}</div>
              </div>
            </li>
          ))}
        </ul>
        <table className="hidden w-full min-w-[640px] text-start text-xs sm:table">
          <tbody>{rows.map((e: any) => <tr key={e.id} className="border-t border-[#ebe9e2]">
            <td className="py-2">{formatDate(e.createdAt, locale)}</td><td>{ct(locale, `entry_${e.type}` as CommercialKey)}</td>
            <td dir="ltr" className={e.amountMinor < 0 ? 'text-[#874b43]' : 'text-[#1f5b3c]'}>{formatMoney(e.amountMinor, e.currency, locale)}</td>
            <td dir="ltr">{formatMoney(e.balanceAfterMinor, e.currency, locale)}</td><td>{e.reason || ''}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </div>
  );
};

const OperatorPricing: React.FC<{ data: any; reload: () => Promise<void>; onError: (e: ApiError | null) => void }> = ({ data, reload, onError }) => {
  const locale = useLocale();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const save = async (p: any) => {
    const raw = draft[p.id];
    const resalePriceMinor = raw === '' ? null : Math.round(Number(raw) * 100);
    try { await api('/api/saas/operator/resale-prices', { method: 'PUT', body: JSON.stringify({ planId: p.id, currency: p.currency, resalePriceMinor }) }); await reload(); onError(null); }
    catch (err) { onError(err as ApiError); }
  };
  return (
    <>
    <div className="space-y-3 sm:hidden">
      {data.pricing.map((p: any) => (
        <article key={p.id} className="mizan-panel p-4">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#E7EEE9] text-[#2F6555]"><WalletCards className="h-5 w-5" strokeWidth={1.75} /></span>
            <div className="min-w-0 flex-1 text-sm font-black">{p.name}</div>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-xl bg-[#f3f1eb] px-3 py-2"><dt className="text-[11px] font-bold text-[#666c68]">{ct(locale, 'publicPrice')}</dt><dd className="mt-0.5 font-black">{p.custom ? '—' : formatMoney(p.publicPriceMinor, p.currency, locale)}</dd></div>
            <div className="rounded-xl bg-[#e6efe9] px-3 py-2"><dt className="text-[11px] font-bold text-[#2F6555]">{ct(locale, 'wholesalePrice')}</dt><dd className="mt-0.5 font-black">{formatMoney(p.wholesalePriceMinor, p.currency, locale)}</dd></div>
          </dl>
          <div className="mt-3 flex items-end gap-2">
            <label className="min-w-0 flex-1 text-[11px] font-bold text-[#666c68]">{ct(locale, 'resalePrice')}<input aria-label={`${ct(locale, 'resalePrice')} ${p.name}`} className={`${inputCls} mt-1 min-h-11`} dir="ltr" placeholder={p.resalePriceMinor !== undefined ? String(p.resalePriceMinor / 100) : ''} value={draft[p.id] ?? ''} onChange={e => setDraft({ ...draft, [p.id]: e.target.value.replace(/[^0-9.]/g, '') })} /></label>
            <Button className="min-h-11" size="sm" variant="secondary" disabled={draft[p.id] === undefined} onClick={() => void save(p)}>{ct(locale, 'save')}</Button>
          </div>
        </article>
      ))}
    </div>
    <div className="mizan-panel hidden overflow-x-auto p-4 sm:block">
      <table className="w-full min-w-[640px] text-start text-xs">
        <thead><tr>{(['currentPlan', 'publicPrice', 'wholesalePrice', 'resalePrice'] as CommercialKey[]).map(k => <th key={k} scope="col" className="py-2">{ct(locale, k)}</th>)}<th /></tr></thead>
        <tbody>{data.pricing.map((p: any) => <tr key={p.id} className="border-t border-[#ebe9e2]">
          <td className="py-2 font-bold">{p.name}</td><td>{p.custom ? '—' : formatMoney(p.publicPriceMinor, p.currency, locale)}</td>
          <td className="font-black">{formatMoney(p.wholesalePriceMinor, p.currency, locale)}</td>
          <td><input aria-label={`${ct(locale, 'resalePrice')} ${p.name}`} className={`${inputCls} max-w-[9rem]`} dir="ltr" placeholder={p.resalePriceMinor !== undefined ? String(p.resalePriceMinor / 100) : ''} value={draft[p.id] ?? ''} onChange={e => setDraft({ ...draft, [p.id]: e.target.value.replace(/[^0-9.]/g, '') })} /></td>
          <td><Button size="sm" variant="secondary" disabled={draft[p.id] === undefined} onClick={() => void save(p)}>{ct(locale, 'save')}</Button></td>
        </tr>)}</tbody>
      </table>
    </div>
    </>
  );
};

/* ═════════════════════ العلامة والنطاق ═════════════════════ */

export const BrandEditor: React.FC<{ ownerType: 'operator' | 'organization'; ownerId: string }> = ({ ownerType, ownerId }) => {
  const locale = useLocale();
  const [data, setData] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [host, setHost] = useState('');
  const [error, setError] = useState<ApiError | null>(null);
  const base = `/api/saas/brand/${ownerType}/${encodeURIComponent(ownerId || 'self')}`;
  const load = useCallback(async () => { try { const d = await api(base); setData(d); setForm(d.profile || { brandingMode: 'mizan', showPoweredByMizan: true }); setError(null); } catch (e) { setError(e as ApiError); } }, [base]);
  useEffect(() => { void load(); }, [load]);
  if (!data) return <ErrorBox error={error} />;
  const modes = ['mizan', 'co_branded', 'full_white_label'].filter(m => m === 'mizan' || (m === 'co_branded' && data.rights.maxMode !== 'mizan') || (m === 'full_white_label' && data.rights.maxMode === 'full_white_label'));
  const save = async (e: { preventDefault(): void }) => { e.preventDefault(); try { await api(base, { method: 'PUT', body: JSON.stringify(form) }); await load(); } catch (err) { setError(err as ApiError); } };
  const addDomain = async () => { try { await api(`${base}/domains`, { method: 'POST', body: JSON.stringify({ hostname: host }) }); setHost(''); await load(); } catch (err) { setError(err as ApiError); } };
  const verify = async (id: string) => { try { await api(`/api/saas/domains/${id}/verify`, { method: 'POST', body: '{}' }); await load(); } catch (err) { setError(err as ApiError); } };
  return (
    <div className="space-y-4">
      <ErrorBox error={error} />
      <form onSubmit={save} className="mizan-panel grid gap-3 p-5 sm:grid-cols-2">
        <Field label={ct(locale, 'brandingMode')}>
          <select className={inputCls} value={form.brandingMode} onChange={e => setForm({ ...form, brandingMode: e.target.value })}>
            {modes.map(m => <option key={m} value={m}>{ct(locale, `mode_${m}` as CommercialKey)}</option>)}
          </select>
        </Field>
        <Field label={ct(locale, 'productName')}><input className={inputCls} value={form.productName || ''} onChange={e => setForm({ ...form, productName: e.target.value })} /></Field>
        <Field label={locale === 'ar' ? 'رابط الشعار (HTTPS)' : 'Logo URL (https)'}><input className={inputCls} dir="ltr" value={form.logoUrl || ''} onChange={e => setForm({ ...form, logoUrl: e.target.value })} /></Field>
        <Field label={locale === 'ar' ? 'رابط أيقونة التبويب (HTTPS)' : 'Favicon URL (https)'}><input className={inputCls} dir="ltr" value={form.faviconUrl || ''} onChange={e => setForm({ ...form, faviconUrl: e.target.value })} /></Field>
        <Field label={locale === 'ar' ? 'اللون الأساسي' : 'Primary color'}><input className={inputCls} dir="ltr" placeholder="#1f6f4a" value={form.primaryColor || ''} onChange={e => setForm({ ...form, primaryColor: e.target.value })} /></Field>
        <Field label={ct(locale, 'discover')}><input className={inputCls} value={form.directoryName || ''} onChange={e => setForm({ ...form, directoryName: e.target.value })} /></Field>
        <Field label={locale === 'ar' ? 'بريد الدعم' : 'Support email'}><input className={inputCls} dir="ltr" value={form.supportEmail || ''} onChange={e => setForm({ ...form, supportEmail: e.target.value })} /></Field>
        {data.rights.hideMizanBrand && form.brandingMode === 'full_white_label' && (
          <label className="flex items-center gap-2 text-xs font-bold"><input type="checkbox" checked={form.showPoweredByMizan !== false} onChange={e => setForm({ ...form, showPoweredByMizan: e.target.checked })} />{ct(locale, 'poweredBy')}</label>
        )}
        <div className="sm:col-span-2"><Button type="submit">{ct(locale, 'save')}</Button></div>
      </form>
      {data.rights.customDomain && (
        <div className="mizan-panel space-y-3 p-5">
          <h3 className="text-sm font-black">{ct(locale, 'customDomain')}</h3>
          <div className="flex flex-wrap gap-2"><input aria-label={ct(locale, 'customDomain')} className={`${inputCls} max-w-sm`} dir="ltr" placeholder="discover.example.org" value={host} onChange={e => setHost(e.target.value)} /><Button variant="secondary" onClick={() => void addDomain()}>{ct(locale, 'save')}</Button></div>
          <p className="text-[11px] text-[#666c68]">{ct(locale, 'dnsInstruction')} {ct(locale, 'sslNote')}</p>
          <ul className="space-y-2 text-xs">{data.domains.map((d: any) => <li key={d.id} className="rounded-xl border border-[#e2e0d9] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2"><b dir="ltr">{d.hostname}</b><Badge variant={d.status === 'active' ? 'emerald' : 'amber'}>{d.status}</Badge></div>
            {d.status !== 'active' && <div className="mt-2 break-all font-mono text-[11px]" dir="ltr">TXT {d.verificationRecord} = {d.verificationToken}</div>}
            {d.status !== 'active' && <Button size="sm" className="mt-2" onClick={() => void verify(d.id)}>{ct(locale, 'verifyDomain')}</Button>}
          </li>)}</ul>
        </div>
      )}
    </div>
  );
};

/* ═════════════════════ لوحة المنصّة ═════════════════════ */

export const PlatformCommercialPanel: React.FC = () => {
  const locale = useLocale();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [agreement, setAgreement] = useState({ operatorId: '', tierId: 'authorized', discountBps: '' });
  const [price, setPrice] = useState<{ planId: string; amount: string; effectiveFrom: string }>({ planId: '', amount: '', effectiveFrom: '' });
  const [funding, setFunding] = useState<Record<string, string>>({});
  const load = useCallback(async () => { try { setData(await api('/api/saas/owner/commercial')); setError(null); } catch (e) { setError(e as ApiError); } }, []);
  useEffect(() => { void load(); }, [load]);
  const run = async (fn: () => Promise<unknown>) => { try { await fn(); await load(); } catch (e) { setError(e as ApiError); } };
  const exportCsv = () => run(async () => {
    const csv = await api('/api/saas/owner/wallet/ledger?format=csv') as string;
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = 'mizan-wallet-ledger.csv'; a.click(); URL.revokeObjectURL(url);
  });
  if (!data) return <ErrorBox error={error} />;
  const r = data.report;
  const sums = (rows: any[]) => rows.length ? rows.map(x => formatMoney(x.amountMinor, x.currency, locale)).join(' · ') : '—';
  return (
    <section className="space-y-4">
      <ErrorBox error={error} />
      <h2 className="text-base font-black">{ct(locale, 'reports')}</h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 [&>*:last-child:nth-child(odd)]:col-span-2 lg:[&>*:last-child:nth-child(odd)]:col-span-1">
        <Stat label={ct(locale, 'directRecurring')} value={sums(r.directAnnualRecurring)} />
        <Stat label={ct(locale, 'wholesaleSales')} value={sums(r.operatorWholesaleSales12m)} />
        <Stat label={ct(locale, 'walletBalances')} value={sums(r.walletBalances)} />
        <Stat label={ct(locale, 'activeCustomers')} value={r.activeOrganizations} hint={`${ct(locale, 'upcomingRenewals')}: ${r.upcomingRenewals60d}`} />
      </div>
      <div className="mizan-panel overflow-x-auto p-4">
        <h3 className="mb-2 text-sm font-black">{ct(locale, 'catalog')}</h3>
        <table className="w-full min-w-[640px] text-start text-xs"><tbody>{data.plans.map((p: any) => <tr key={p.id} className="border-t border-[#ebe9e2]">
          <td className="py-2 font-bold">{p.name}</td><td>{p.custom ? 'Custom' : formatMoney(p.publicPriceMinor, p.currency, locale)}</td>
          <td>{p.participantAllowance.toLocaleString('en-US')}</td><td>{p.activeCompetitionAllowance}</td>
          <td>{p.upcomingVersion ? `→ ${formatMoney(p.upcomingVersion.publicPriceMinor, p.currency, locale)} (${formatDate(p.upcomingVersion.effectiveFrom, locale)})` : ''}</td>
        </tr>)}</tbody></table>
        <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={e => { e.preventDefault(); void run(() => api(`/api/saas/owner/plans/${encodeURIComponent(price.planId)}/versions`, { method: 'POST', body: JSON.stringify({ publicPriceMinor: Math.round(Number(price.amount) * 100), effectiveFrom: price.effectiveFrom ? new Date(price.effectiveFrom).toISOString() : undefined }) })); }}>
          <Field label={ct(locale, 'currentPlan')}><select className={inputCls} value={price.planId} onChange={e => setPrice({ ...price, planId: e.target.value })}><option value="" />{data.plans.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
          <Field label={ct(locale, 'publicPrice')}><input className={inputCls} dir="ltr" value={price.amount} onChange={e => setPrice({ ...price, amount: e.target.value.replace(/[^0-9.]/g, '') })} /></Field>
          <Field label={ct(locale, 'effectiveFrom')}><input type="date" className={inputCls} value={price.effectiveFrom} onChange={e => setPrice({ ...price, effectiveFrom: e.target.value })} /></Field>
          <Button type="submit" disabled={!price.planId || !price.amount}>{ct(locale, 'scheduleNewPrice')}</Button>
        </form>
      </div>
      <div className="mizan-panel space-y-3 p-4">
        <h3 className="text-sm font-black">{ct(locale, 'agreements')}</h3>
        <form className="flex flex-wrap items-end gap-2" onSubmit={e => { e.preventDefault(); void run(() => api('/api/saas/owner/agreements', { method: 'POST', body: JSON.stringify({ operatorId: agreement.operatorId, tierId: agreement.tierId, ...(agreement.discountBps ? { discountBps: Number(agreement.discountBps) } : {}) }) })); }}>
          <Field label={ct(locale, 'operator')}><select className={inputCls} value={agreement.operatorId} onChange={e => setAgreement({ ...agreement, operatorId: e.target.value })}><option value="" />{r.operators.map((o: any) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></Field>
          <Field label={ct(locale, 'tier')}><select className={inputCls} value={agreement.tierId} onChange={e => setAgreement({ ...agreement, tierId: e.target.value })}>{data.tiers.map((t: any) => <option key={t.id} value={t.slug}>{locale === 'ar' ? t.nameArabic : t.name} — {t.discountBps / 100}%</option>)}</select></Field>
          <Field label={`${ct(locale, 'discount')} (bps)`}><input className={inputCls} dir="ltr" value={agreement.discountBps} onChange={e => setAgreement({ ...agreement, discountBps: e.target.value.replace(/\D/g, '') })} /></Field>
          <Button type="submit" disabled={!agreement.operatorId}>{ct(locale, 'createAgreement')}</Button>
        </form>
        <ul className="space-y-2 text-xs">{r.agreements.map((a: any) => <li key={a.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-[#e2e0d9] p-3">
          <b>{r.operators.find((o: any) => o.id === a.operatorId)?.name || a.operatorId}</b>
          <Badge variant={a.status === 'active' ? 'emerald' : 'neutral'}>{a.status}</Badge>
          <span>{a.discountBps / 100}% · {formatMoney(a.minimumAnnualCommitmentMinor, a.currency, locale)} · {formatDate(a.startsAt, locale)} → {formatDate(termLastDay(a.endsAt), locale)}</span>
          {a.status === 'draft' && <Button size="sm" onClick={() => void run(() => api(`/api/saas/owner/agreements/${a.id}/approve`, { method: 'POST', body: '{}' }))}>{ct(locale, 'approve')}</Button>}
          {a.status === 'active' && <span className="flex items-center gap-1"><input aria-label={ct(locale, 'reference')} placeholder={ct(locale, 'reference')} className={`${inputCls} max-w-[10rem]`} value={funding[a.id] || ''} onChange={e => setFunding({ ...funding, [a.id]: e.target.value })} /><Button size="sm" variant="secondary" disabled={!funding[a.id]} onClick={() => void run(() => api(`/api/saas/owner/agreements/${a.id}/commitment`, { method: 'POST', body: JSON.stringify({ reference: funding[a.id] }) }))}>{ct(locale, 'fundCommitment')}</Button></span>}
        </li>)}</ul>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => void exportCsv()}>{ct(locale, 'exportCsv')}</Button>
      </div>
      {r.migrationReports?.length > 0 && <details className="mizan-panel p-4 text-xs"><summary className="cursor-pointer font-black">{ct(locale, 'migration')}</summary><pre className="mt-2 overflow-x-auto" dir="ltr">{JSON.stringify(r.migrationReports.at(-1), null, 2)}</pre></details>}
    </section>
  );
};

/* ═════════════════════ معالج «إنشاء نسخة جديدة» ═════════════════════ */

export const NewEditionWizard: React.FC<{ open: boolean; sourceId?: string; onClose: () => void }> = ({ open, sourceId, onClose }) => {
  const store = useAppStore();
  const locale = useLocale();
  const candidates = useMemo(() => store.competitions.filter(c => c.id !== 'comp-pending-setup' && (store.currentUser.role === 'super_admin' || c.organizationId === store.organization.id)), [store.competitions, store.currentUser.role, store.organization.id]);
  const [step, setStep] = useState(1);
  const [src, setSrc] = useState(sourceId || '');
  const source = candidates.find(c => c.id === src);
  const [label, setLabel] = useState('');
  const [nameAr, setNameAr] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [parts, setParts] = useState<ClonePart[]>([...CLONE_PARTS]);
  useEffect(() => { if (open) { setStep(1); setSrc(sourceId || candidates[0]?.id || ''); setParts([...CLONE_PARTS]); } }, [open, sourceId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (source) { const next = suggestNextEditionLabel(source); setLabel(next); setNameAr(source.nameArabic.replace(/\d{4}/, next)); setNameEn(source.name.replace(/\d{4}/, next)); } }, [src]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!open) return; const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', esc); return () => window.removeEventListener('keydown', esc); }, [open, onClose]);
  if (!open) return null;
  const create = () => {
    const created = store.cloneCompetition(nameAr, nameEn, { sourceId: src, editionLabel: label, parts });
    if (created) { onClose(); window.location.hash = ''; }
  };
  return (
    <div className="fixed inset-0 z-[190] overflow-y-auto bg-[#16241f]/45 p-3 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="edition-title">
      <div className="mx-auto max-w-2xl rounded-3xl bg-white p-6 shadow-xl">
        <h2 id="edition-title" className="text-lg font-black">{ct(locale, 'newEdition')}</h2>
        <p className="mt-1 text-xs text-[#666c68]" aria-live="polite">{step} / 4</p>
        {step === 1 && <div className="mt-4 space-y-3"><Field label={ct(locale, 'cloneFrom')}><select autoFocus className={inputCls} value={src} onChange={e => setSrc(e.target.value)}>{candidates.map(c => <option key={c.id} value={c.id}>{locale === 'ar' ? c.nameArabic : c.name || c.nameArabic}{c.editionLabel || c.edition ? ` — ${c.editionLabel || c.edition}` : ''}</option>)}</select></Field></div>}
        {step === 2 && <div className="mt-4 grid gap-3">
          <Field label={ct(locale, 'editionLabel')}><input autoFocus className={inputCls} value={label} onChange={e => setLabel(e.target.value)} /></Field>
          <Field label={ct(locale, 'nameArabic')}><input className={inputCls} value={nameAr} onChange={e => setNameAr(e.target.value)} /></Field>
          <Field label={ct(locale, 'nameEnglish')}><input className={inputCls} dir="ltr" value={nameEn} onChange={e => setNameEn(e.target.value)} /></Field>
        </div>}
        {step === 3 && <fieldset className="mt-4 space-y-2"><legend className="text-sm font-black">{ct(locale, 'whatToCopy')}</legend>
          {CLONE_PARTS.map(p => <label key={p} className="flex items-center gap-2 text-xs"><input type="checkbox" checked={parts.includes(p)} onChange={e => setParts(e.target.checked ? [...parts, p] : parts.filter(x => x !== p))} />{ct(locale, `part_${p}` as CommercialKey)}</label>)}
          <p className="rounded-xl bg-[#f4f2ec] p-3 text-[11px] text-[#454b47]">{ct(locale, 'neverCopied')}</p>
        </fieldset>}
        {step === 4 && <div className="mt-4 space-y-2 text-xs">
          <h3 className="text-sm font-black">{ct(locale, 'summary')}</h3>
          <div>{ct(locale, 'cloneFrom')}: <b>{source?.nameArabic}</b></div>
          <div>{ct(locale, 'editionLabel')}: <b>{label}</b></div>
          <div>{nameAr} · <span dir="ltr">{nameEn}</span></div>
          <ul className="list-disc ps-5">{parts.map(p => <li key={p}>{ct(locale, `part_${p}` as CommercialKey)}</li>)}</ul>
          <p className="rounded-xl bg-[#e8f3ec] p-3 font-bold text-[#1f5b3c]">{ct(locale, 'startsAsDraft')}</p>
        </div>}
        <div className="mt-6 flex flex-wrap justify-between gap-2">
          <Button variant="secondary" onClick={step === 1 ? onClose : () => setStep(step - 1)}>{step === 1 ? ct(locale, 'cancel') : ct(locale, 'back')}</Button>
          {step < 4 ? <Button disabled={!source || (step === 2 && !nameAr.trim())} onClick={() => setStep(step + 1)}>{ct(locale, 'next')}</Button> : <Button onClick={create}>{ct(locale, 'createDraft')}</Button>}
        </div>
      </div>
    </div>
  );
};

/* ═════════════════════ النشر في Discover ═════════════════════ */

/*
 * نشر هذه المسابقة في دليل الاكتشاف: تُملأ الحقول العامة من إعداد المسابقة، ويختار المنظّم
 * أين تظهر. خيارات الظهور تُعرض بحسب حقوق الجهة كما يعيدها الخادم، والخادم يتحقّق منها
 * مرّة أخرى. لا يُرسل من إعداد المسابقة إلا الحقول العامة المسمّاة.
 */
export const DiscoverPublishPanel: React.FC = () => {
  const locale = useLocale();
  const store = useAppStore();
  const c = store.competition;
  const [rights, setRights] = useState<any>(null);
  const [listing, setListing] = useState<any>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState(() => ({
    title: c.name || c.nameArabic, titleArabic: c.nameArabic, summary: '', summaryArabic: '', city: '', mode: 'in_person' as 'online' | 'in_person' | 'hybrid',
    ageRanges: '', languages: 'ar', memorizationLevels: '',
    visibility: { organizationDirectory: true, operatorDirectory: false, globalSyndication: false },
  }));
  const load = useCallback(async () => {
    try {
      const [b, l] = await Promise.all([api('/api/saas/brand/organization/self'), api('/api/saas/organization/discover')]);
      setRights(b.rights);
      const mine = (l.listings || []).find((x: any) => x.competitionId === c.id);
      if (mine) { setListing(mine); setForm(f => ({ ...f, title: mine.title, titleArabic: mine.titleArabic || '', summary: mine.summary || '', summaryArabic: mine.summaryArabic || '', city: mine.city || '', mode: mine.mode, ageRanges: mine.ageRanges.join(', '), languages: mine.languages.join(', '), memorizationLevels: mine.memorizationLevels.join(', '), visibility: mine.visibility })); }
      setError(null);
    } catch (e) { setError(e as ApiError); }
  }, [c.id]);
  useEffect(() => { void load(); }, [load]);
  const list = (v: string) => v.split(',').map(x => x.trim()).filter(Boolean);
  const publish = async () => {
    setSaved(false);
    try {
      const body = {
        competitionId: c.id, title: form.title, titleArabic: form.titleArabic, summary: form.summary, summaryArabic: form.summaryArabic,
        registrationOpen: c.status === 'registration_open', registrationUrl: `/#register?comp=${encodeURIComponent(c.id)}`,
        startsOn: c.startDate?.slice(0, 10) || undefined, endsOn: c.endDate?.slice(0, 10) || undefined, registrationClosesOn: c.registrationEndDate?.slice(0, 10) || undefined,
        country: /^[A-Za-z]{2}$/.test(c.country || '') ? c.country : undefined, city: form.city, mode: form.mode,
        publicCategories: c.categories.map(x => locale === 'ar' ? x.nameArabic : x.name), riwayat: [...new Set(c.categories.flatMap(x => [x.riwaya, ...(x.allowedRiwayat || [])]).filter(Boolean))],
        ageRanges: list(form.ageRanges), languages: list(form.languages), memorizationLevels: list(form.memorizationLevels), visibility: form.visibility,
      };
      const r = await api('/api/saas/organization/discover', { method: 'POST', body: JSON.stringify(body) });
      setListing(r.listing); setSaved(true); setError(null);
    } catch (e) { setError(e as ApiError); }
  };
  const unpublish = async () => { try { const r = await api(`/api/saas/organization/discover/${listing.id}/unpublish`, { method: 'POST', body: '{}' }); setListing(r.listing); } catch (e) { setError(e as ApiError); } };
  const toggle = (k: 'organizationDirectory' | 'operatorDirectory' | 'globalSyndication', allowed: boolean, label: CommercialKey) => allowed && (
    <label className="flex items-center gap-2 text-xs font-bold"><input type="checkbox" checked={form.visibility[k]} onChange={e => setForm({ ...form, visibility: { ...form.visibility, [k]: e.target.checked } })} />{ct(locale, label)}</label>
  );
  return <section className="space-y-4" aria-label={ct(locale, 'discover')}>
    <h2 className="text-base font-black">{ct(locale, 'discover')}</h2>
    <ErrorBox error={error} />
    {saved && <div role="status" className="rounded-xl bg-[#e8f3ec] px-3 py-2 text-xs font-bold text-[#1f5b3c]">{locale === 'ar' ? 'نُشرت بطاقة المسابقة.' : 'The listing was published.'}</div>}
    {listing && <p className="text-xs text-[#454b47]">{listing.status === 'published' ? (locale === 'ar' ? 'منشورة' : 'Published') : (locale === 'ar' ? 'غير منشورة' : 'Unpublished')} · <span dir="ltr">{listing.publicSlug}</span></p>}
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label={ct(locale, 'nameArabic')}><input className={inputCls} value={form.titleArabic} onChange={e => setForm({ ...form, titleArabic: e.target.value })} /></Field>
      <Field label={ct(locale, 'nameEnglish')}><input className={inputCls} dir="ltr" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></Field>
      <Field label={locale === 'ar' ? 'نبذة بالعربية' : 'Arabic summary'}><textarea className={`${inputCls} min-h-20`} value={form.summaryArabic} onChange={e => setForm({ ...form, summaryArabic: e.target.value })} /></Field>
      <Field label={locale === 'ar' ? 'نبذة بالإنجليزية' : 'English summary'}><textarea className={`${inputCls} min-h-20`} dir="ltr" value={form.summary} onChange={e => setForm({ ...form, summary: e.target.value })} /></Field>
      <Field label={locale === 'ar' ? 'المدينة' : 'City'}><input className={inputCls} value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} /></Field>
      <Field label={locale === 'ar' ? 'نوع المشاركة' : 'Mode'}><select className={inputCls} value={form.mode} onChange={e => setForm({ ...form, mode: e.target.value as typeof form.mode })}>{(['in_person', 'online', 'hybrid'] as const).map(m => <option key={m} value={m}>{ct(locale, m)}</option>)}</select></Field>
      <Field label={locale === 'ar' ? 'الفئات العمرية (مفصولة بفواصل)' : 'Age ranges (comma separated)'}><input className={inputCls} value={form.ageRanges} onChange={e => setForm({ ...form, ageRanges: e.target.value })} /></Field>
      <Field label={locale === 'ar' ? 'مستويات الحفظ' : 'Memorization levels'}><input className={inputCls} value={form.memorizationLevels} onChange={e => setForm({ ...form, memorizationLevels: e.target.value })} /></Field>
    </div>
    <fieldset className="space-y-2 rounded-xl border border-[#e5e3dc] p-3"><legend className="px-1 text-xs font-black">{locale === 'ar' ? 'أين تظهر المسابقة؟' : 'Where does it appear?'}</legend>
      {toggle('organizationDirectory', true, 'organizationDirectory')}
      {toggle('operatorDirectory', !!rights?.operatorDirectory, 'operatorDirectory')}
      {toggle('globalSyndication', !!rights?.globalSyndication, 'globalSyndication')}
      <p className="text-[11px] text-[#6a706c]">{locale === 'ar' ? 'لا يُنشر شيء في شبكة ميزان العالمية إلا باختيارٍ صريح هنا.' : 'Nothing reaches the global MIZAN network unless chosen here.'}</p>
    </fieldset>
    <div className="flex flex-wrap gap-2"><Button onClick={() => void publish()}>{locale === 'ar' ? 'نشر / تحديث البطاقة' : 'Publish / update listing'}</Button>{listing?.status === 'published' && <Button variant="secondary" onClick={() => void unpublish()}>{locale === 'ar' ? 'إلغاء النشر' : 'Unpublish'}</Button>}</div>
  </section>;
};

/* ═════════════════════ الدخول الموحّد (SSO) ═════════════════════ */

const SSO_ROLES = ['org_admin', 'comp_admin', 'head_judge', 'judge', 'ops_manager', 'auditor', 'exception_host', 'delegation_manager', 'support_agent'];

export const SsoSettingsPanel: React.FC = () => {
  const locale = useLocale(); const ar = locale === 'ar';
  const [form, setForm] = useState<any>({ protocol: 'saml', firebaseProviderId: 'saml.', displayName: '', allowedEmailDomains: '', groupsAttribute: 'groups', roleMapping: [] as { group: string; role: string }[], status: 'draft', preferSso: false });
  const [error, setError] = useState<ApiError | null>(null);
  const [saved, setSaved] = useState(false);
  const [preview, setPreview] = useState({ email: '', groups: '' });
  const [suggestion, setSuggestion] = useState<string>('');
  useEffect(() => { void (async () => { try { const r = await api('/api/saas/organization/sso'); if (r.config) setForm({ ...r.config, allowedEmailDomains: r.config.allowedEmailDomains.join(', ') }); } catch (e) { setError(e as ApiError); } })(); }, []);
  const save = async () => {
    setSaved(false);
    try { const r = await api('/api/saas/organization/sso', { method: 'PUT', body: JSON.stringify({ ...form, allowedEmailDomains: String(form.allowedEmailDomains).split(',').map((x: string) => x.trim()).filter(Boolean) }) }); setForm({ ...r.config, allowedEmailDomains: r.config.allowedEmailDomains.join(', ') }); setSaved(true); setError(null); }
    catch (e) { setError(e as ApiError); }
  };
  const test = async () => { try { const r = await api('/api/saas/organization/sso/preview', { method: 'POST', body: JSON.stringify({ email: preview.email, groups: preview.groups.split(',').map(x => x.trim()) }) }); setSuggestion(r.suggestion ? `${r.suggestion.role} (${r.suggestion.matchedGroup})` : (ar ? 'لا دور — يُرفض الدخول' : 'No role — access denied')); } catch (e) { setError(e as ApiError); } };
  return <section className="space-y-4">
    <h2 className="text-base font-black">{ar ? 'الدخول الموحّد للمؤسسة (SAML / OIDC)' : 'Enterprise single sign-on (SAML / OIDC)'}</h2>
    <p className="text-xs text-[#6a706c]">{ar ? 'يتطلّب تفعيله تسجيل مزوّد الجهة في Firebase Identity Platform (شهادة المزوّد ومعرّف الكيان). الدور المقترح من المجموعات يمرّ بحوكمة الهويات، ولا يُمنح تلقائيًا.' : 'Requires the organization provider to be registered in Firebase Identity Platform. Group-based role suggestions still pass identity governance; nothing is granted automatically.'}</p>
    {error && <div role="alert" className="rounded-2xl bg-[#f7ece9] px-4 py-3 text-xs font-bold text-[#874b43]">{error.code}</div>}
    {saved && <div role="status" className="rounded-xl bg-[#e8f3ec] px-3 py-2 text-xs font-bold text-[#1f5b3c]">{ar ? 'حُفظ الإعداد.' : 'Saved.'}</div>}
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label={ar ? 'البروتوكول' : 'Protocol'}><select className={inputCls} value={form.protocol} onChange={e => setForm({ ...form, protocol: e.target.value, firebaseProviderId: `${e.target.value}.` })}><option value="saml">SAML</option><option value="oidc">OIDC</option></select></Field>
      <Field label={ar ? 'معرّف المزوّد في Firebase' : 'Firebase provider id'}><input className={inputCls} dir="ltr" value={form.firebaseProviderId} onChange={e => setForm({ ...form, firebaseProviderId: e.target.value })} /></Field>
      <Field label={ar ? 'الاسم على زرّ الدخول' : 'Button label'}><input className={inputCls} value={form.displayName} onChange={e => setForm({ ...form, displayName: e.target.value })} /></Field>
      <Field label={ar ? 'نطاقات البريد المسموحة' : 'Allowed email domains'}><input className={inputCls} dir="ltr" placeholder="university.edu, org.sa" value={form.allowedEmailDomains} onChange={e => setForm({ ...form, allowedEmailDomains: e.target.value })} /></Field>
      <Field label={ar ? 'سمة المجموعات' : 'Groups attribute'}><input className={inputCls} dir="ltr" value={form.groupsAttribute} onChange={e => setForm({ ...form, groupsAttribute: e.target.value })} /></Field>
      <Field label={ar ? 'الحالة' : 'Status'}><select className={inputCls} value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}><option value="draft">{ar ? 'مسودة' : 'Draft'}</option><option value="active">{ar ? 'مفعّل' : 'Active'}</option><option value="disabled">{ar ? 'معطّل' : 'Disabled'}</option></select></Field>
    </div>
    <fieldset className="rounded-xl border border-[#e5e3dc] p-3"><legend className="px-1 text-xs font-black">{ar ? 'خريطة المجموعات إلى الأدوار' : 'Group → role mapping'}</legend>
      {form.roleMapping.map((m: any, i: number) => <div key={i} className="mb-2 flex flex-wrap gap-2">
        <input aria-label={ar ? 'المجموعة' : 'Group'} className={`${inputCls} max-w-xs`} dir="ltr" value={m.group} onChange={e => setForm({ ...form, roleMapping: form.roleMapping.map((x: any, j: number) => j === i ? { ...x, group: e.target.value } : x) })} />
        <select aria-label={ar ? 'الدور' : 'Role'} className={`${inputCls} max-w-[12rem]`} value={m.role} onChange={e => setForm({ ...form, roleMapping: form.roleMapping.map((x: any, j: number) => j === i ? { ...x, role: e.target.value } : x) })}>{SSO_ROLES.map(r => <option key={r} value={r}>{r}</option>)}</select>
        <button type="button" className="text-xs font-bold text-[#A34D43]" onClick={() => setForm({ ...form, roleMapping: form.roleMapping.filter((_: any, j: number) => j !== i) })}>{ar ? 'حذف' : 'Remove'}</button></div>)}
      <button type="button" className="text-xs font-bold text-[#214C40] underline" onClick={() => setForm({ ...form, roleMapping: [...form.roleMapping, { group: '', role: 'judge' }] })}>+</button>
    </fieldset>
    <Button onClick={() => void save()}>{ct(locale, 'save')}</Button>
    <div className="flex flex-wrap items-end gap-2 rounded-xl border border-[#e5e3dc] p-3">
      <Field label={ar ? 'تجربة: بريد' : 'Test: email'}><input className={inputCls} dir="ltr" value={preview.email} onChange={e => setPreview({ ...preview, email: e.target.value })} /></Field>
      <Field label={ar ? 'المجموعات' : 'Groups'}><input className={inputCls} dir="ltr" value={preview.groups} onChange={e => setPreview({ ...preview, groups: e.target.value })} /></Field>
      <Button variant="secondary" onClick={() => void test()}>{ar ? 'اقتراح الدور' : 'Suggest role'}</Button>
      {suggestion && <span role="status" className="text-xs font-bold">{suggestion}</span>}
    </div>
  </section>;
};

/*
 * بوابة الدفع الخاصة بالجهة أو المشغّل — لتحصيل رسوم التسجيل من المتسابقين إلى حسابها مباشرة.
 * تختار الجهة قالبًا (ماي فاتورة، تاب، سترايب) أو تلصق ملف بوابة أخرى، وتضع مفاتيحها، ثم
 * تختبرها. المفاتيح تُرسل مرة واحدة إلى الخزنة المشفرة ولا تعود إلى المتصفح أبدًا.
 */
type GatewayPreset = { id: string; label: string; labelArabic: string; docsUrl: string; notes: string[]; notesArabic: string[]; profile: Record<string, unknown> };
const GATEWAY_STATUS: Record<string, [string, string]> = { pending_test: ['بانتظار الاختبار', 'Awaiting test'], active: ['مفعّلة', 'Active'], disabled: ['معطّلة', 'Disabled'] };

export const PaymentGatewayPanel: React.FC<{ ownerType: 'operator' | 'organization'; ownerId: string }> = ({ ownerType, ownerId }) => {
  const locale = useLocale(); const ar = locale === 'ar';
  const [presets, setPresets] = useState<GatewayPreset[]>([]);
  const [data, setData] = useState<{ gateways: any[]; effective: any; webhookBase: string } | null>(null);
  const [presetId, setPresetId] = useState('');
  const [profileText, setProfileText] = useState('');
  const [keys, setKeys] = useState({ apiKey: '', webhookSecret: '', displayName: '' });
  const [testCurrency, setTestCurrency] = useState('KWD');
  const [message, setMessage] = useState('');
  const [error, setError] = useState<ApiError | null>(null);
  const base = `/api/saas/payment-gateways/${ownerType}/${encodeURIComponent(ownerId)}`;
  const load = useCallback(async () => {
    if (!ownerId) return;
    try { setData(await api(base)); setError(null); } catch (e) { setError(e as ApiError); }
  }, [base, ownerId]);
  useEffect(() => { void load(); void (async () => { try { setPresets((await api('/api/saas/payment-gateways/presets')).presets); } catch { /* القوالب اختيارية: يبقى الإدخال اليدوي متاحًا */ } })(); }, [load]);
  const preset = presets.find(p => p.id === presetId);
  const choose = (id: string) => { setPresetId(id); const p = presets.find(x => x.id === id); setProfileText(p ? JSON.stringify(p.profile, null, 2) : ''); };
  const save = async () => {
    setMessage('');
    let profile: unknown;
    try { profile = JSON.parse(profileText); } catch { setError(new ApiError('PAYMENT_PROFILE_JSON_INVALID')); return; }
    try {
      const r = await api(base, { method: 'POST', body: JSON.stringify({ presetId: presetId || undefined, provider: (profile as any)?.name, displayName: keys.displayName || preset?.label, profile, apiKey: keys.apiKey, webhookSecret: keys.webhookSecret }) });
      setKeys({ apiKey: '', webhookSecret: '', displayName: '' });
      setMessage(ar ? `حُفظت البوابة. عنوان الإشعار لإعدادات البوابة: ${r.webhookUrl}` : `Saved. Notification URL for the gateway settings: ${r.webhookUrl}`);
      await load();
    } catch (e) { setError(e as ApiError); }
  };
  const test = async (id: string) => {
    setMessage('');
    try {
      const r = await api(`/api/saas/payment-gateways/by-id/${encodeURIComponent(id)}/test`, { method: 'POST', body: JSON.stringify({ currency: testCurrency }) });
      setMessage(r.ok ? (ar ? 'نجح الاختبار وفُعّلت البوابة. لم يُخصم أي مبلغ.' : 'Test passed; the gateway is active. Nothing was charged.') : r.code === 'AWAITING_SIGNED_NOTIFICATION' ? (ar ? `أُنشئت صفحة دفع تجريبية. أكمل الدفع التجريبي لتُفعَّل البوابة عند وصول إشعارها الموقَّع: ${r.paymentUrl || ''}` : `Test checkout created. Complete the test payment; the signed notification activates the gateway: ${r.paymentUrl || ''}`) : (ar ? `فشل الاختبار: ${r.code}` : `Test failed: ${r.code}`));
      await load();
    } catch (e) { setError(e as ApiError); }
  };
  const disable = async (id: string) => { try { await api(`/api/saas/payment-gateways/by-id/${encodeURIComponent(id)}/disable`, { method: 'POST' }); await load(); } catch (e) { setError(e as ApiError); } };
  if (!ownerId) return null;
  return <section className="space-y-4" aria-label={ct(locale, 'paymentGateway')}>
    <h2 className="text-base font-black">{ct(locale, 'paymentGateway')}</h2>
    <p className="text-xs text-[#6a706c]">{ownerType === 'operator'
      ? (ar ? 'بوابة المشغّل تُحصّل رسوم تسجيل جهاتك التي لم تعدّ بوابة خاصة بها. المال يذهب إلى حسابك لدى البوابة، لا إلى ميزان.' : 'Your gateway collects registration fees for your organizations that have no gateway of their own. Money goes to your gateway account, not to MIZAN.')
      : (ar ? 'تُحصّل رسوم التسجيل من المتسابقين إلى حساب جهتكم لدى البوابة مباشرة. بلا بوابة مفعّلة يبقى التحصيل يدويًا.' : 'Registration fees are paid straight into your organization\'s gateway account. Without an active gateway, collection stays manual.')}</p>
    <ErrorBox error={error} />
    {message && <div role="status" className="break-all rounded-xl bg-[#e8f3ec] px-3 py-2 text-xs font-bold text-[#1f5b3c]">{message}</div>}
    <div className="rounded-2xl border border-[#e2e0d9] bg-white p-4 text-xs">
      <b>{ar ? 'البوابة الفعّالة الآن:' : 'Gateway in use now:'}</b>{' '}
      {data?.effective ? `${data.effective.displayName} (${data.effective.ownerType === 'operator' ? (ar ? 'من المشغّل' : 'from operator') : (ar ? 'خاصة بكم' : 'your own')})` : (ar ? 'لا توجد — تحصيل يدوي' : 'None — manual collection')}
    </div>
    {!!data?.gateways.length && <ul className="divide-y divide-[#ebe9e2] rounded-2xl border border-[#e2e0d9] bg-white text-xs">
      {data.gateways.map(g => <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
        <span><b>{g.displayName}</b> · {g.provider} · <Badge variant={g.status === 'active' ? 'emerald' : 'neutral'}>{GATEWAY_STATUS[g.status]?.[ar ? 0 : 1] || g.status}</Badge>
          {g.lastTest && <span className="ms-2 text-[#666c68]">{ar ? 'آخر اختبار' : 'Last test'}: {formatDate(g.lastTest.at, locale)} · {g.lastTest.ok ? <Check className="inline h-3.5 w-3.5 align-text-bottom" aria-label={ar ? 'نجح' : 'Passed'} /> : g.lastTest.code}</span>}
          <span className="block break-all text-[11px] text-[#666c68]" dir="ltr">{data.webhookBase}{g.id}</span></span>
        {g.status !== 'disabled' && <span className="flex gap-2">
          {g.status === 'pending_test' && <Button size="sm" onClick={() => void test(g.id)}>{ar ? 'اختبار وتفعيل' : 'Test & activate'}</Button>}
          <Button size="sm" variant="outline" onClick={() => void disable(g.id)}>{ar ? 'تعطيل' : 'Disable'}</Button>
        </span>}
      </li>)}
    </ul>}
    <div className="space-y-3 rounded-2xl border border-[#e2e0d9] bg-white p-4">
      <h3 className="text-sm font-black">{ar ? 'إضافة بوابة' : 'Add a gateway'}</h3>
      <Field label={ar ? 'القالب' : 'Template'}>
        <select className={inputCls} value={presetId} onChange={e => choose(e.target.value)}>
          <option value="">{ar ? 'بوابة أخرى — ألصق ملف الإعداد' : 'Other gateway — paste a profile'}</option>
          {presets.map(p => <option key={p.id} value={p.id}>{ar ? p.labelArabic : p.label}</option>)}
        </select>
      </Field>
      {preset && <div className="rounded-xl bg-[#fbf3e3] p-3 text-[11px] text-[#7a5413]">
        <b>{ar ? 'قالب بدء، يلزم اختباره بمفاتيحكم قبل التحصيل:' : 'Starter template — test it with your keys before collecting:'}</b>
        <ul className="ms-4 list-disc">{(ar ? preset.notesArabic : preset.notes).map(n => <li key={n}>{n}</li>)}</ul>
        <a className="underline" href={preset.docsUrl} target="_blank" rel="noreferrer noopener">{ar ? 'وثائق البوابة' : 'Gateway documentation'}</a>
      </div>}
      <Field label={ar ? 'ملف البوابة (JSON)' : 'Gateway profile (JSON)'}><textarea className={`${inputCls} h-40 font-mono text-[11px]`} dir="ltr" spellCheck={false} value={profileText} onChange={e => setProfileText(e.target.value)} /></Field>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={ar ? 'الاسم الظاهر' : 'Display name'}><input className={inputCls} value={keys.displayName} onChange={e => setKeys({ ...keys, displayName: e.target.value })} /></Field>
        <Field label={ar ? 'المفتاح السرّي للواجهة البرمجية' : 'Secret API key'}><input type="password" autoComplete="off" className={inputCls} dir="ltr" value={keys.apiKey} onChange={e => setKeys({ ...keys, apiKey: e.target.value })} /></Field>
        <Field label={ar ? 'سرّ توقيع الإشعار (اختياري)' : 'Notification signing secret (optional)'}><input type="password" autoComplete="off" className={inputCls} dir="ltr" value={keys.webhookSecret} onChange={e => setKeys({ ...keys, webhookSecret: e.target.value })} /></Field>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <Button disabled={!profileText || !keys.apiKey} onClick={() => void save()}>{ct(locale, 'save')}</Button>
        <Field label={ar ? 'عملة الاختبار' : 'Test currency'}><input className={`${inputCls} w-24`} dir="ltr" maxLength={3} value={testCurrency} onChange={e => setTestCurrency(e.target.value.toUpperCase())} /></Field>
      </div>
    </div>
  </section>;
};
