/*
 * لوحة الجهات للمالك.
 *
 * إدارة الجهات كانت طلبات على واجهة محمية بمفتاح المؤسسات — وهو سرّ خادمي لا يجوز
 * أن يسكن متصفحًا. فتتحدث هذه الشاشة مع مسارات /api/owner/* المحمية بهوية المالك
 * نفسها، ويُتحقق من الدور في الخادم لا هنا: إخفاء زر ليس منعًا.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Building2, Globe2, Plus, RefreshCw, ShieldCheck, XCircle, Sparkles } from 'lucide-react';
import { useAppStore } from '../../lib/store';
import { auth } from '../../lib/firebase';
import { Button } from '../design-system/Button';
import { Badge } from '../design-system/Badge';
import { TenantBrandStudio } from './TenantBrandStudio';
import type { OrganizationBrand } from '../../types';

interface TenantRow {
  orgId: string;
  displayNameArabic?: string;
  displayName?: string;
  logoUrl?: string;
  slogan?: string;
  sloganArabic?: string;
  websiteUrl?: string;
  phoneNumber?: string;
  supportEmail?: string;
  address?: string;
  addressArabic?: string;
  displayPlacements?: any;
  subdomain?: string;
  customDomains?: string[];
  note?: string;
  status?: 'active' | 'suspended';
}

/* رموز الرفض كما تأتي من الخادم — تُقال بالعربية لا كرموز، وإلا رأى المالك شفرة. */
const REJECTION_AR: Record<string, string> = {
  ORG_ID_REQUIRED: 'معرّف الجهة مطلوب.',
  ORG_ID_INVALID: 'معرّف الجهة يقبل الحروف اللاتينية والأرقام والشرطة فقط.',
  ORG_ID_TAKEN: 'هذا المعرّف مستعمل لجهة أخرى.',
  ORG_NOT_FOUND: 'لا توجد جهة بهذا المعرّف.',
  SUBDOMAIN_INVALID: 'النطاق الفرعي يقبل الحروف والأرقام والشرطة، بلا نقاط ولا مسافات.',
  SUBDOMAIN_RESERVED: 'هذا النطاق الفرعي محجوز للنظام.',
  SUBDOMAIN_TAKEN: 'النطاق الفرعي مأخوذ لجهة أخرى.',
  CUSTOM_DOMAIN_DUPLICATE: 'النطاق الخاص مكرَّر في الطلب نفسه.',
  HOST_REQUIRED: 'لا بد من نطاق فرعي أو نطاق خاص، وإلا لم يكن للجهة عنوان.',
  STATUS_INVALID: 'حالة غير معروفة.',
  TENANTS_PINNED_TO_ENV: 'السجل مثبَّت في بيئة النشر (MIZAN_TENANTS)، فلا يُحرَّر من هنا.',
  TENANT_STORE_NOT_CONFIGURED: 'سجل الجهات غير مهيَّأ في هذا النشر (MIZAN_TENANTS_FILE).',
  IDENTITY_REQUIRED: 'تلزم هوية مالك مسجَّلة الدخول.',
  FORBIDDEN_ROLE: 'هذا الإجراء لمالك المنصة وحده.',
};

const sayError = (code: string) => {
  if (REJECTION_AR[code]) return REJECTION_AR[code];
  if (code.startsWith('CUSTOM_DOMAIN_INVALID:')) return `نطاق خاص غير صالح: ${code.split(':')[1]}`;
  if (code.startsWith('CUSTOM_DOMAIN_TAKEN:')) return `النطاق الخاص مأخوذ لجهة أخرى: ${code.split(':')[1]}`;
  return code;
};

export const TenantConsole: React.FC = () => {
  const store = useAppStore();
  const ar = store.language === 'ar';
  const [rows, setRows] = useState<TenantRow[]>([]);
  const [baseDomain, setBaseDomain] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ orgId: '', displayNameArabic: '', subdomain: '', note: '' });
  const [busy, setBusy] = useState('');
  const [editingBrandOrgId, setEditingBrandOrgId] = useState<string | null>(null);

  const call = useCallback(async (path: string, init?: RequestInit) => {
    const user = auth?.currentUser;
    if (!user) throw new Error(sayError('IDENTITY_REQUIRED'));
    const token = await user.getIdToken();
    const res = await fetch(path, {
      ...init,
      headers: { ...(init?.body ? { 'content-type': 'application/json' } : {}), authorization: `Bearer ${token}` },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((body.errors || []).map(sayError).join(' · ') || sayError(body.code || `HTTP_${res.status}`));
    return body;
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const data = await call('/api/owner/tenants');
      setRows(data.tenants || []);
      setBaseDomain(data.baseDomain || '');
    } catch (err) { setError((err as Error).message); }
    setLoading(false);
  }, [call]);

  useEffect(() => { void load(); }, [load]);

  const act = async (path: string, init?: RequestInit, key = path) => {
    setBusy(key); setError('');
    try { await call(path, init); await load(); }
    catch (err) { setError((err as Error).message); }
    setBusy('');
  };

  const submit = async () => {
    await act('/api/owner/tenants', { method: 'POST', body: JSON.stringify(form) }, 'add');
    setForm({ orgId: '', displayNameArabic: '', subdomain: '', note: '' });
    setAdding(false);
  };

  const hostOf = (t: TenantRow) => (t.customDomains?.[0]) || (t.subdomain && baseDomain ? `${t.subdomain}.${baseDomain}` : t.subdomain || '—');

  return <div className="space-y-4">
    <section className="mizan-surface p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="mizan-kicker">{ar ? 'الجهات المشتركة' : 'TENANTS'}</div>
          <h2 className="font-extrabold mt-1">{ar ? 'الجهات ونطاقاتها' : 'Tenants and domains'}</h2>
          <p className="text-[11px] leading-5 text-[#656b66] mt-1 max-w-xl">
            {ar
              ? 'الجهة تعمل على نطاقها فور إضافتها، بلا إعادة نشر ولا عمل على مزوّد النطاق. وإيقافها يمنع الوصول فورًا مع بقاء بياناتها.'
              : 'A tenant works on its domain as soon as it is added — no redeploy, no DNS work. Suspending blocks access immediately while its data stays.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" icon={<RefreshCw className="w-4 h-4" />} onClick={() => void load()} disabled={loading}>{ar ? 'تحديث' : 'Refresh'}</Button>
          <Button size="sm" icon={<Plus className="w-4 h-4" />} onClick={() => setAdding(v => !v)}>{ar ? 'جهة جديدة' : 'New tenant'}</Button>
        </div>
      </div>

      {error && <div className="mt-4 rounded-2xl bg-[#F4E6E3] p-3 text-xs font-bold text-[#88473f]">{error}</div>}

      {adding && <div className="mt-4 rounded-2xl border border-[#e5e3dc] bg-[#fbfaf6] p-4 grid sm:grid-cols-2 gap-3">
        {([
          ['orgId', ar ? 'معرّف الجهة (لاتيني)' : 'Tenant id', 'alfailakawi'],
          ['displayNameArabic', ar ? 'الاسم المعروض' : 'Display name', 'الفيلكاوي'],
          ['subdomain', ar ? 'النطاق الفرعي' : 'Subdomain', 'alfailakawi'],
          ['note', ar ? 'ملاحظة إدارية (حال الاشتراك)' : 'Admin note', ar ? 'اشتراك ٢٠٢٧ مسدَّد' : 'Paid through 2027'],
        ] as const).map(([key, label, placeholder]) => <label key={key} className="block">
          <span className="block text-[10px] font-black text-[#656b66] mb-1">{label}</span>
          <input value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} placeholder={placeholder}
            className="w-full rounded-xl border border-[#e0ded7] bg-white px-3 py-2 text-xs" />
        </label>)}
        <div className="sm:col-span-2 flex items-center justify-between gap-3">
          <span className="text-[10px] text-[#656b66]">
            {baseDomain && form.subdomain ? `${form.subdomain}.${baseDomain}` : (ar ? 'العنوان يظهر هنا بعد كتابة النطاق الفرعي.' : 'The address appears once a subdomain is typed.')}
          </span>
          <Button size="sm" onClick={() => void submit()} disabled={busy === 'add' || !form.orgId.trim()}>{busy === 'add' ? '…' : (ar ? 'إضافة' : 'Add')}</Button>
        </div>
      </div>}

      <div className="mt-4 divide-y divide-[#e5e3dc]">
        {loading ? <div className="py-8 text-center text-xs text-[#656b66]">{ar ? 'جارٍ التحميل…' : 'Loading…'}</div>
          : rows.length === 0 ? <div className="py-8 text-center text-xs text-[#656b66]">{ar ? 'لا جهات بعد.' : 'No tenants yet.'}</div>
            : rows.map(t => {
              const suspended = t.status === 'suspended';
              return <div key={t.orgId} className="py-3 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-[#2F6555]" />
                    <span className="font-black text-sm truncate">{t.displayNameArabic || t.displayName || t.orgId}</span>
                    <Badge variant={suspended ? 'neutral' : 'emerald'}>{suspended ? (ar ? 'موقوفة' : 'Suspended') : (ar ? 'نشطة' : 'Active')}</Badge>
                  </div>
                  <div className="mt-1 flex items-center gap-1.5 text-[11px] text-[#656b66]">
                    <Globe2 className="w-3.5 h-3.5" />{hostOf(t)}
                  </div>
                  {t.note && <div className="mt-1 text-[10px] text-[#656b66]">{t.note}</div>}
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline"
                    icon={<Sparkles className="w-4 h-4 text-[#2F6555]" />}
                    onClick={() => setEditingBrandOrgId(curr => curr === t.orgId ? null : t.orgId)}>
                    {editingBrandOrgId === t.orgId ? (ar ? 'إغلاق الهوية' : 'Close brand') : (ar ? 'تخصيص الهوية والشعار' : 'Brand kit')}
                  </Button>
                  <Button size="sm" variant="outline"
                    icon={suspended ? <ShieldCheck className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                    disabled={busy === t.orgId}
                    onClick={() => void act(`/api/owner/tenants/${encodeURIComponent(t.orgId)}/${suspended ? 'activate' : 'suspend'}`, { method: 'POST' }, t.orgId)}>
                    {busy === t.orgId ? '…' : suspended ? (ar ? 'إعادة التفعيل' : 'Activate') : (ar ? 'إيقاف' : 'Suspend')}
                  </Button>
                </div>
                {editingBrandOrgId === t.orgId && (
                  <div className="w-full mt-3 pt-3 border-t border-[#e5e3dc]">
                    <TenantBrandStudio
                      orgId={t.orgId}
                      initialBrand={{
                        displayName: t.displayName,
                        displayNameArabic: t.displayNameArabic,
                        logoUrl: t.logoUrl,
                        slogan: t.slogan,
                        sloganArabic: t.sloganArabic,
                        websiteUrl: t.websiteUrl,
                        phoneNumber: t.phoneNumber,
                        supportEmail: t.supportEmail,
                        address: t.address,
                        addressArabic: t.addressArabic,
                        displayPlacements: t.displayPlacements,
                      }}
                      onSaved={() => void load()}
                    />
                  </div>
                )}
              </div>;
            })}
      </div>
    </section>
  </div>;
};
