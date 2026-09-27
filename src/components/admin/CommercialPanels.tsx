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
import { Button } from '../design-system/Button';
import { Badge } from '../design-system/Badge';

class ApiError extends Error { constructor(public code: string, public details?: Record<string, any>) { super(code); } }

async function api(path: string, init?: RequestInit & { idempotencyKey?: string }) {
  const user = auth.currentUser;
  if (!user || IS_DEMO_SESSION) throw new ApiError('IDENTITY_REQUIRED');
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
  <div className="rounded-2xl border border-[#e2e0d9] bg-white p-4">
    <div className="text-[11px] font-bold text-[#666c68]">{label}</div>
    <div className="mt-1 text-lg font-black text-[#171b18]" dir="auto">{value}</div>
    {hint && <div className="mt-1 text-[11px] text-[#666c68]">{hint}</div>}
  </div>
);

const Progress: React.FC<{ label: string; used: number; total: number }> = ({ label, used, total }) => {
  const pct = total ? Math.min(100, Math.round((used / total) * 100)) : used ? 100 : 0;
  const tone = pct >= 95 ? '#a2453a' : pct >= 85 ? '#b7791f' : '#1f6f4a';
  return (
    <div>
      <div className="flex items-center justify-between text-xs"><span className="font-bold">{label}</span><span dir="ltr">{used.toLocaleString()} / {total.toLocaleString()}</span></div>
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
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={ct(locale, 'currentPlan')} value={planName(data.plan) || '—'} />
        <Stat label={ct(locale, 'termStart')} value={formatDate(data.term?.startsAt, locale)} />
        <Stat label={ct(locale, 'termEnd')} value={formatDate(termLastDay(data.term?.endsAt), locale)} />
        <Stat label={ct(locale, 'status')} value={<Badge variant={data.accessState === 'active' ? 'emerald' : 'amber'}>{ct(locale, `state_${data.accessState}` as CommercialKey)}</Badge>} hint={data.accessState === 'read_only' ? ct(locale, 'stateHelp_read_only') : undefined} />
      </div>
      <div className="mizan-panel space-y-4 p-5">
        <Progress label={ct(locale, 'participantsUsed')} used={u.participantsUsed} total={u.participantAllowance} />
        <Progress label={ct(locale, 'activeCompetitions')} used={u.activeCompetitions} total={u.activeCompetitionAllowance} />
        <div className="text-xs text-[#454b47]">{ct(locale, 'remaining')}: <b dir="ltr">{u.participantsRemaining.toLocaleString()}</b></div>
        {warn && <div role="status" className="rounded-xl bg-[#fbf3e3] px-3 py-2 text-xs font-bold text-[#7a5413]">{ct(locale, warn as CommercialKey)}</div>}
      </div>
      {data.limits && Object.keys(data.limits.override || {}).length > 0 && (
        <div className="mizan-panel p-5 text-xs">
          <table className="w-full text-start"><thead><tr><th scope="col" /><th scope="col">{ct(locale, 'limitsBase')}</th><th scope="col">{ct(locale, 'limitsOverride')}</th><th scope="col">{ct(locale, 'limitsEffective')}</th></tr></thead>
            <tbody>{(['participantAllowance', 'activeCompetitionAllowance'] as const).map(k => <tr key={k}><th scope="row" className="py-1">{ct(locale, k === 'participantAllowance' ? 'participantsUsed' : 'activeCompetitions')}</th><td>{data.limits.base[k]}</td><td>{data.limits.override[k] ?? '—'}</td><td className="font-black">{data.limits.effective[k]}</td></tr>)}</tbody></table>
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
                <div className="text-xs text-[#666c68]">{p.participantAllowance.toLocaleString()} · {p.activeCompetitionAllowance} {ct(locale, 'activeCompetitions')}</div>
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
            {data.history.map((t: any) => <li key={t.id} className="flex flex-wrap justify-between gap-2 py-2">
              <span>{formatDate(t.startsAt, locale)} → {formatDate(termLastDay(t.endsAt), locale)}{t.legacy ? ' (legacy)' : ''}</span>
              <span dir="ltr">{t.participantsUsed.toLocaleString()} / {t.participantAllowance.toLocaleString()}</span>
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
  const [tab, setTab] = useState<'customers' | 'wallet' | 'pricing' | 'branding'>('customers');
  const load = useCallback(async () => { try { setData(await api('/api/saas/operator/commercial')); setError(null); } catch (e) { setError(e as ApiError); } }, []);
  useEffect(() => { void load(); }, [load]);
  if (!data) return <div className="space-y-3"><ErrorBox error={error} />{!error && <div className="text-xs">{ct(locale, 'loading')}</div>}</div>;
  const s = data.summary, cur = s.currency;
  const tabs: [typeof tab, CommercialKey][] = [['customers', 'customers'], ['wallet', 'ledger'], ['pricing', 'wholesalePrice'], ['branding', 'branding']];
  return (
    <section className="space-y-4" aria-label={ct(locale, 'operator')}>
      <ErrorBox error={error} />
      {!data.agreement && <div role="status" className="rounded-2xl bg-[#fbf3e3] px-4 py-3 text-xs font-bold text-[#7a5413]">{ct(locale, 'noAgreement')}</div>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={ct(locale, 'walletBalance')} value={formatMoney(s.balanceMinor, cur, locale)} />
        <Stat label={ct(locale, 'annualCommitment')} value={formatMoney(s.annualCommitmentMinor, cur, locale)} hint={`${ct(locale, 'spent')}: ${formatMoney(s.spentThisAgreementMinor, cur, locale)}`} />
        <Stat label={ct(locale, 'tier')} value={data.tier ? (locale === 'ar' ? data.tier.nameArabic : data.tier.name) : '—'} hint={s.discountBps !== undefined ? `${ct(locale, 'discount')}: ${s.discountBps / 100}%` : undefined} />
        <Stat label={ct(locale, 'agreementDates')} value={data.agreement ? `${formatDate(data.agreement.startsAt, locale)} → ${formatDate(termLastDay(data.agreement.endsAt), locale)}` : '—'} />
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
      <div className="mizan-panel overflow-x-auto p-4">
        <table className="w-full min-w-[720px] text-start text-xs">
          <thead><tr className="text-[#666c68]">{(['customers', 'currentPlan', 'term', 'participantsUsed', 'renewalDate', 'status', 'walletCost', 'customDomain'] as CommercialKey[]).map(k => <th key={k} scope="col" className="py-2">{ct(locale, k)}</th>)}<th scope="col" /></tr></thead>
          <tbody>{data.customers.map((c: any) => <tr key={c.organizationId} className="border-t border-[#ebe9e2]">
            <td className="py-2 font-bold">{c.officialName}</td><td>{c.planName || '—'}</td>
            <td>{c.term ? `#${c.term.termIndex}` : '—'}</td><td dir="ltr">{c.participantsUsed} / {c.participantAllowance}</td>
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
        <Field label="ISO country"><input required maxLength={2} className={inputCls} dir="ltr" value={form.country} onChange={e => setForm({ ...form, country: e.target.value.toUpperCase() })} /></Field>
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
        <table className="w-full min-w-[640px] text-start text-xs">
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
    <div className="mizan-panel overflow-x-auto p-4">
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
        <Field label="Logo URL (https)"><input className={inputCls} dir="ltr" value={form.logoUrl || ''} onChange={e => setForm({ ...form, logoUrl: e.target.value })} /></Field>
        <Field label="Favicon URL (https)"><input className={inputCls} dir="ltr" value={form.faviconUrl || ''} onChange={e => setForm({ ...form, faviconUrl: e.target.value })} /></Field>
        <Field label="Primary color"><input className={inputCls} dir="ltr" placeholder="#1f6f4a" value={form.primaryColor || ''} onChange={e => setForm({ ...form, primaryColor: e.target.value })} /></Field>
        <Field label={ct(locale, 'discover')}><input className={inputCls} value={form.directoryName || ''} onChange={e => setForm({ ...form, directoryName: e.target.value })} /></Field>
        <Field label="Support email"><input className={inputCls} dir="ltr" value={form.supportEmail || ''} onChange={e => setForm({ ...form, supportEmail: e.target.value })} /></Field>
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
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={ct(locale, 'directRecurring')} value={sums(r.directAnnualRecurring)} />
        <Stat label={ct(locale, 'wholesaleSales')} value={sums(r.operatorWholesaleSales12m)} />
        <Stat label={ct(locale, 'walletBalances')} value={sums(r.walletBalances)} />
        <Stat label={ct(locale, 'activeCustomers')} value={r.activeOrganizations} hint={`${ct(locale, 'upcomingRenewals')}: ${r.upcomingRenewals60d}`} />
      </div>
      <div className="mizan-panel overflow-x-auto p-4">
        <h3 className="mb-2 text-sm font-black">{ct(locale, 'catalog')}</h3>
        <table className="w-full min-w-[640px] text-start text-xs"><tbody>{data.plans.map((p: any) => <tr key={p.id} className="border-t border-[#ebe9e2]">
          <td className="py-2 font-bold">{p.name}</td><td>{p.custom ? 'Custom' : formatMoney(p.publicPriceMinor, p.currency, locale)}</td>
          <td>{p.participantAllowance.toLocaleString()}</td><td>{p.activeCompetitionAllowance}</td>
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
