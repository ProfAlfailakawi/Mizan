import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Building2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Globe,
  Headphones,
  Mail,
  MapPin,
  ScanSearch,
  Settings2,
  Sparkles,
  ShieldCheck,
  FileUp,
  Camera,
  Award,
  Layers,
  FileCheck2,
  RotateCcw,
  Check,
  CircleHelp,
  Plus,
  Trash2,
  Link2,
} from 'lucide-react';
import { Button } from '../design-system/Button';
import { Badge } from '../design-system/Badge';
import { useAppStore } from '../../lib/store';
import { auth } from '../../lib/firebase';
import { uploadOrganizationLogo } from '../../lib/brand-assets';
import type { OrganizationBrand, BrandDisplayPlacements } from '../../types';
import {isArabicText,isEmail,isLatinText,isPhone,isWebsiteUrl,normalizeArabicText,normalizeEmail,normalizeLatinText,normalizePhone,normalizeWebsiteUrl,toAsciiDigits,normalizeDomain,isDomain} from '../../lib/input-validation';

const BRAND_ERR:Record<string,string>={ORG_ID_REQUIRED:'معرّف الجهة مطلوب.',ORG_ID_INVALID:'معرّف الجهة يقبل الحروف اللاتينية والأرقام والشرطة فقط.',ORG_ID_TAKEN:'هذا المعرّف مستعمل.',ORG_NOT_FOUND:'لا توجد جهة بهذا المعرّف.',SUBDOMAIN_INVALID:'النطاق الفرعي غير صالح.',SUBDOMAIN_RESERVED:'هذا النطاق محجوز.',SUBDOMAIN_TAKEN:'النطاق مستخدم.',HOST_REQUIRED:'لا بد من نطاق للجهة.',TENANTS_PINNED_TO_ENV:'سجل الجهات مثبت في بيئة النشر.',TENANT_STORE_NOT_CONFIGURED:'سجل الجهات غير مهيأ في هذا النشر.',IDENTITY_REQUIRED:'تلزم هوية المالك.',FORBIDDEN_ROLE:'هذا الإجراء لمالك المنصة وحده.',BRAND_SAVE_FAILED:'تعذّر حفظ الهوية، حاول مجددًا.'};
const arError=(raw:string):string=>raw.split(' · ').map(c=>BRAND_ERR[c.trim()]||c.trim()).join(' · ');

export const TenantDomainCard: React.FC<{ orgId?: string }> = ({ orgId }) => {
  const store = useAppStore();
  const ar = store.language === 'ar';
  const [subdomain, setSubdomain] = useState('');
  const [customDomains, setCustomDomains] = useState<string[]>([]);
  const [newDomain, setNewDomain] = useState('');
  const [baseDomain, setBaseDomain] = useState('');
  const [saving, setSaving] = useState(false);
  const [ok, setOk] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    const user = auth?.currentUser; if (!user) return; let live = true;
    void user.getIdToken().then(token => fetch(`/api/tenant/brand${orgId ? `?orgId=${encodeURIComponent(orgId)}` : ''}`, { headers: { authorization: `Bearer ${token}` } }))
      .then(async res => ({ ok: res.ok, body: await res.json().catch(() => ({})) }))
      .then(({ ok, body }) => { if (!live || !ok) return; const t = body?.tenant || {}; setSubdomain(t.subdomain || ''); setCustomDomains(Array.isArray(t.customDomains) ? t.customDomains : []); setBaseDomain(body?.baseDomain || ''); })
      .catch(() => {});
    return () => { live = false };
  }, [orgId]);

  const addDomain = () => {
    const d = normalizeDomain(newDomain);
    if (!d) return;
    if (!isDomain(d)) { setErr(ar ? 'أدخل نطاقًا صحيحًا مثل: a.example.com' : 'Enter a valid domain, e.g. a.example.com'); return; }
    if (customDomains.includes(d)) { setErr(ar ? 'هذا النطاق مضاف مسبقًا.' : 'Domain already added.'); return; }
    setCustomDomains([...customDomains, d]); setNewDomain(''); setErr('');
  };
  const removeDomain = (d: string) => setCustomDomains(customDomains.filter(x => x !== d));

  const save = async () => {
    setSaving(true); setOk(false); setErr('');
    try {
      const user = auth?.currentUser; if (!user) throw new Error(ar ? 'تلزم هوية موثقة.' : 'Authentication required.');
      const token = await user.getIdToken();
      const res = await fetch('/api/tenant/brand', { method: 'PATCH', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ orgId: orgId || store.organization?.id, subdomain: normalizeDomain(subdomain), customDomains }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(String((body.errors || []).join(' · ') || body.code || 'DOMAIN_SAVE_FAILED'));
      const t = body.tenant || {}; setSubdomain(t.subdomain || ''); setCustomDomains(Array.isArray(t.customDomains) ? t.customDomains : []);
      setOk(true); setTimeout(() => setOk(false), 4000);
    } catch (e) { setErr(arError((e as Error).message)); } finally { setSaving(false); }
  };

  const suffix = baseDomain ? `.${baseDomain}` : '';
  return (
    <section className="rounded-2xl border border-[#DFDED7] bg-white p-5 sm:p-6 shadow-sm space-y-5">
      <div className="flex items-center gap-2">
        <span className="inline-flex p-2 rounded-xl bg-[#EBF2EE] text-[#214C40]"><Globe className="w-5 h-5" /></span>
        <div>
          <div className="mizan-kicker">{ar ? 'النطاق والوصول' : 'DOMAIN & ACCESS'}</div>
          <h3 className="text-base font-extrabold text-[#171b18]">{ar ? 'نطاق الجهة على ميزان' : 'Tenant domain'}</h3>
        </div>
      </div>
      <p className="text-xs leading-relaxed text-[#636864] max-w-2xl">
        {ar ? 'اختر نطاقًا فرعيًا سهلًا يصل منه الجميع إلى بوابتك، أو اربط نطاقك الخاص باحترافية. يكفي إدخال العنوان هنا؛ نتكفّل بالباقي.' : 'Pick a friendly subdomain or connect your own custom domain. Enter the address here and we handle the rest.'}
      </p>

      {/* النطاق الفرعي */}
      <label className="block">
        <span className="mizan-field-label">{ar ? 'النطاق الفرعي' : 'Subdomain'}</span>
        <div className="flex items-stretch mt-1 rounded-xl border border-[#DAD8D0] overflow-hidden focus-within:border-[#2F6555]">
          <input dir="ltr" lang="en" className="flex-1 px-3 py-2.5 text-sm outline-none bg-white" value={subdomain} onChange={e => setSubdomain(normalizeDomain(e.target.value))} placeholder="a" />
          {suffix && <span dir="ltr" className="grid place-items-center px-3 bg-[#F3F1EB] text-[11px] font-bold text-[#656b66] border-s border-[#E4E2DB]">{suffix}</span>}
        </div>
        <span className="mt-1 block text-[10px] text-[#8d7a52]">{ar ? 'حروف لاتينية وأرقام وشرطة فقط.' : 'Lowercase letters, digits and hyphen only.'}</span>
      </label>

      {/* النطاقات الخاصة */}
      <div>
        <span className="mizan-field-label">{ar ? 'نطاق خاص (اختياري)' : 'Custom domain (optional)'}</span>
        <div className="flex gap-2 mt-1">
          <input dir="ltr" lang="en" className="mizan-input flex-1" value={newDomain} onChange={e => setNewDomain(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addDomain(); } }} placeholder="a.example.com" />
          <Button type="button" variant="outline" size="sm" icon={<Plus className="w-4 h-4" />} onClick={addDomain} disabled={!newDomain.trim()}>{ar ? 'إضافة' : 'Add'}</Button>
        </div>
        {customDomains.length > 0 && (
          <div className="mt-3 space-y-2">
            {customDomains.map(d => (
              <div key={d} className="flex items-center justify-between gap-2 rounded-xl border border-[#E4E2DB] bg-[#FAFAF7] px-3 py-2">
                <span dir="ltr" className="flex items-center gap-2 text-xs font-bold text-[#2b312d] break-all [overflow-wrap:anywhere]"><Link2 className="w-3.5 h-3.5 text-[#2F6555] shrink-0" />{d}</span>
                <button type="button" aria-label={ar ? `حذف ${d}` : `Remove ${d}`} onClick={() => removeDomain(d)} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-[#ead9d5] text-[#94564d] hover:bg-[#f7ece9]"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
          </div>
        )}
        <div className="mt-3 rounded-xl bg-[#F3F1EB] p-3 text-[11px] leading-6 text-[#666c68]">
          <ShieldCheck className="mb-1 h-4 w-4 text-[#2F6555]" />
          {ar ? 'لتفعيل نطاقك الخاص: أضِف سجل CNAME عند مزوّد نطاقك يشير إلى عنوان ميزان' : 'To activate your custom domain: add a CNAME record at your DNS provider pointing to the MIZAN host'}
          {baseDomain ? <> <span dir="ltr" className="font-black">{baseDomain}</span></> : ''}
          {ar ? '. تسري الشهادة الآمنة تلقائيًا بعد التحقق.' : '. A secure certificate is issued automatically after verification.'}
        </div>
      </div>

      {ok && <div className="rounded-xl bg-[#EAF5EF] border border-[#BDE0CB] p-3 flex items-center gap-2.5 text-xs font-bold text-[#1F5E39]"><CheckCircle2 className="w-4 h-4 shrink-0" />{ar ? 'تم حفظ النطاق بنجاح.' : 'Domain saved successfully.'}</div>}
      {err && <div className="rounded-xl bg-[#FDF2F0] border border-[#F1C4BD] p-3 flex items-center gap-2.5 text-xs font-bold text-[#A34D43]"><XCircle className="w-4 h-4 shrink-0" />{err}</div>}

      <div className="flex justify-end">
        <Button icon={saving ? undefined : <Check className="w-4 h-4" />} onClick={() => void save()} disabled={saving}>{saving ? (ar ? 'جارٍ الحفظ…' : 'Saving…') : (ar ? 'حفظ النطاق' : 'Save domain')}</Button>
      </div>
    </section>
  );
};

interface TenantBrandStudioProps {
  initialBrand?: OrganizationBrand;
  orgId?: string;
  onSaved?: (updated: OrganizationBrand) => void;
  compact?: boolean;
}

interface ImageProbeResult {
  status: 'idle' | 'probing' | 'valid' | 'broken';
  width: number;
  height: number;
  aspectRatio: number;
  isSvg: boolean;
  clarityTier: 'ultra' | 'high' | 'acceptable' | 'low';
  message: string;
}

export const TenantBrandStudio: React.FC<TenantBrandStudioProps> = ({
  initialBrand,
  orgId,
  onSaved,
}) => {
  const store = useAppStore();
  const ar = store.language === 'ar';
  const effectiveBrand = initialBrand || store.organization?.brand;

  // حالة النموذج
  const [nameArabic, setNameArabic] = useState(effectiveBrand?.displayNameArabic || effectiveBrand?.nameArabic || '');
  const [nameEnglish, setNameEnglish] = useState(effectiveBrand?.displayName || effectiveBrand?.name || '');
  const [sloganArabic, setSloganArabic] = useState(effectiveBrand?.sloganArabic || '');
  const [sloganEnglish, setSloganEnglish] = useState(effectiveBrand?.slogan || '');
  const [logoUrl, setLogoUrl] = useState(effectiveBrand?.logoUrl || '');
  const [websiteUrl, setWebsiteUrl] = useState(effectiveBrand?.websiteUrl || '');
  const [phoneNumber, setPhoneNumber] = useState(effectiveBrand?.phoneNumber || '');
  const [supportEmail, setSupportEmail] = useState(effectiveBrand?.supportEmail || '');
  const [addressArabic, setAddressArabic] = useState(effectiveBrand?.addressArabic || '');
  const [addressEnglish, setAddressEnglish] = useState(effectiveBrand?.address || '');
  const [certificateTheme, setCertificateTheme] = useState<'quiet_authority' | 'institutional' | 'ceremonial'>(
    effectiveBrand?.certificateTheme || 'quiet_authority'
  );

  // مصفوفة مواضع الظهور
  const initialPlacements = effectiveBrand?.displayPlacements || {};
  const [placements, setPlacements] = useState<Required<BrandDisplayPlacements>>({
    showHeaderLogo: initialPlacements.showHeaderLogo !== false,
    showHeaderSlogan: Boolean(initialPlacements.showHeaderSlogan),
    showHeaderContact: Boolean(initialPlacements.showHeaderContact),
    showFooterContact: initialPlacements.showFooterContact !== false,
    showFooterAddress: initialPlacements.showFooterAddress !== false,
    showFooterWebsite: initialPlacements.showFooterWebsite !== false,
    showOnCertificates: initialPlacements.showOnCertificates !== false,
    showOnVenueScreens: initialPlacements.showOnVenueScreens !== false,
    showOnPublicPortal: initialPlacements.showOnPublicPortal !== false,
  });

  // فحص الشعار وحالته
  const [probe, setProbe] = useState<ImageProbeResult>({
    status: 'idle',
    width: 0,
    height: 0,
    aspectRatio: 1,
    isSvg: false,
    clarityTier: 'acceptable',
    message: '',
  });

  // وضع معاينة الخلفية للشعار
  const [previewBg, setPreviewBg] = useState<'light' | 'dark' | 'parchment' | 'checker'>('light');
  // تبويب محاكي الأسطح
  const [previewSurface, setPreviewSurface] = useState<'header' | 'footer' | 'certificate' | 'public'>('header');

  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [serverError, setServerError] = useState('');

  // Production always hydrates from the server record, even on admin.dr-* where host-based branding cannot identify the tenant.
  useEffect(() => {
    const user=auth?.currentUser;if(!user)return;let live=true;
    void user.getIdToken().then(token=>fetch(`/api/tenant/brand${orgId?`?orgId=${encodeURIComponent(orgId)}`:''}`,{headers:{authorization:`Bearer ${token}`}})).then(async res=>({ok:res.ok,body:await res.json().catch(()=>({}))})).then(({ok,body})=>{
      if(!live||!ok||!body?.tenant)return;const b=body.tenant;
      setNameArabic(b.displayNameArabic||'');setNameEnglish(b.displayName||'');setSloganArabic(b.sloganArabic||'');setSloganEnglish(b.slogan||'');setLogoUrl(b.logoUrl||'');setWebsiteUrl(b.websiteUrl||'');setPhoneNumber(b.phoneNumber||'');setSupportEmail(b.supportEmail||'');setAddressArabic(b.addressArabic||'');setAddressEnglish(b.address||'');setCertificateTheme(b.certificateTheme||'quiet_authority');
      const p=b.displayPlacements||{};setPlacements({showHeaderLogo:p.showHeaderLogo!==false,showHeaderSlogan:Boolean(p.showHeaderSlogan),showHeaderContact:Boolean(p.showHeaderContact),showFooterContact:p.showFooterContact!==false,showFooterAddress:p.showFooterAddress!==false,showFooterWebsite:p.showFooterWebsite!==false,showOnCertificates:p.showOnCertificates!==false,showOnVenueScreens:p.showOnVenueScreens!==false,showOnPublicPortal:p.showOnPublicPortal!==false});
    }).catch(()=>{});return()=>{live=false};
  }, [orgId]);

  // فحص استباقي ذكي لصلاحية الصورة وأبعادها
  const testLogo = useCallback((url: string) => {
    const trimmed = url.trim();
    if (!trimmed) {
      setProbe({
        status: 'idle',
        width: 0,
        height: 0,
        aspectRatio: 1,
        isSvg: false,
        clarityTier: 'acceptable',
        message: ar ? 'لم يُحدد رابط شعار بعد.' : 'No logo URL specified.',
      });
      return;
    }

    const isSvg = trimmed.includes('data:image/svg+xml') || /\.svg($|\?)/i.test(trimmed);
    const isHttps = /^https:\/\//i.test(trimmed);
    const isManagedAsset = /^\/api\/public\/brand-assets\//i.test(trimmed);

    if (!isHttps && !isManagedAsset) {
      setProbe({
        status: 'broken',
        width: 0,
        height: 0,
        aspectRatio: 1,
        isSvg: false,
        clarityTier: 'low',
        message: ar
          ? 'تنبيه أمان: استخدم رابط https:// أو شعارًا مرفوعًا إلى تخزين ميزان.'
          : 'Security warning: use an https:// URL or a logo uploaded to MIZAN storage.',
      });
      return;
    }

    setProbe(prev => ({ ...prev, status: 'probing', message: ar ? 'جارٍ فحص الشعار وتحليل نقائه…' : 'Probing logo clarity…' }));

    const img = new Image();
    img.crossOrigin = 'anonymous';

    const timer = setTimeout(() => {
      setProbe({
        status: 'broken',
        width: 0,
        height: 0,
        aspectRatio: 1,
        isSvg,
        clarityTier: 'low',
        message: ar
          ? 'استغرق تحميل الشعار وقتًا طويلاً، تأكد من استجابة الخادم وتوفر الرابط للعامة.'
          : 'Image load timed out. Ensure the server is responsive and public.',
      });
    }, 6000);

    img.onload = () => {
      clearTimeout(timer);
      const w = img.naturalWidth || 100;
      const h = img.naturalHeight || 100;
      const ratio = w / (h || 1);

      let clarity: ImageProbeResult['clarityTier'] = 'acceptable';
      let msg = '';

      if (isSvg) {
        clarity = 'ultra';
        msg = ar
          ? 'شعار متجهي فائق النقاء (SVG): دقة متناهية لا تتأثر بالتكبير على الشاشات والشهادات.'
          : 'Ultra-clarity Vector (SVG): Infinite resolution for large displays and print.';
      } else if (w >= 256 || h >= 256) {
        clarity = 'high';
        msg = ar
          ? `دقة عالية ممتازة (${w}×${h} بكسل): مثالية للطباعة والشاشات الكبيرة.`
          : `High resolution (${w}x${h}px): Pristine for print and hall displays.`;
      } else if (w >= 96 && h >= 96) {
        clarity = 'acceptable';
        msg = ar
          ? `دقة مقبولة (${w}×${h} بكسل): مناسبة للترويسة الرقمية.`
          : `Acceptable resolution (${w}x${h}px): Suitable for web headers.`;
      } else {
        clarity = 'low';
        msg = ar
          ? `تنبيه: دقة الشعار صغيرة (${w}×${h} بكسل). قد يظهر مشوشًا عند الطباعة.`
          : `Warning: Small resolution (${w}x${h}px). May appear blurry when printed.`;
      }

      if (ratio > 4.5 || ratio < 0.25) {
        msg += ar
          ? ' (تنبيه أبعاد: الشعار مستطيل جدًا، يُفضل نسبة بين 1:1 و 3:1)'
          : ' (Aspect warning: highly elongated, 1:1 to 3:1 recommended)';
      }

      setProbe({
        status: 'valid',
        width: w,
        height: h,
        aspectRatio: ratio,
        isSvg,
        clarityTier: clarity,
        message: msg,
      });
    };

    img.onerror = () => {
      clearTimeout(timer);
      setProbe({
        status: 'broken',
        width: 0,
        height: 0,
        aspectRatio: 1,
        isSvg,
        clarityTier: 'low',
        message: ar
          ? 'الرابط لا يفتح صورة صالحة أو الوصول إليه محجوب (خطأ 404 أو قيود CORS).'
          : 'Image failed to load or is blocked (404 or CORS issue).',
      });
    };

    img.src = trimmed;
  }, [ar]);

  // فحص أولي عند الإقلاع أو تغيير الرابط
  useEffect(() => {
    testLogo(logoUrl);
  }, [logoUrl, testLogo]);

  // رفع ملف الشعار إلى التخزين الفعلي؛ لا تدخل bytes الشعار في سجل الجهة.
  const [uploadingLogo,setUploadingLogo]=useState(false);
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file=e.target.files?.[0];e.currentTarget.value='';if(!file||uploadingLogo)return;
    const targetOrgId=orgId||store.organization?.id;if(!targetOrgId){setServerError(ar?'تعذر تحديد الجهة.':'Organization scope is unavailable.');return}
    setUploadingLogo(true);setServerError('');
    try{setLogoUrl(await uploadOrganizationLogo(targetOrgId,file))}
    catch(err){const code=err instanceof Error?err.message:'';setServerError(code==='LOGO_TOO_LARGE'?(ar?'حجم الشعار يجب ألا يتجاوز 2MB.':'Logo must be 2MB or smaller.'):(ar?'اختر PNG أو JPG/JPEG أو WebP أو SVG صالحًا.':'Choose a valid PNG, JPG/JPEG, WebP or SVG.'))}
    finally{setUploadingLogo(false)}
  };

  // قياس مؤشر جاهزية وجودة الهوية المؤسسية (0 - 100)
  const healthScore = useMemo(() => {
    let score = 0;
    // شعار مفحوص وسليم
    if (probe.status === 'valid') {
      if (probe.clarityTier === 'ultra' || probe.clarityTier === 'high') score += 40;
      else if (probe.clarityTier === 'acceptable') score += 30;
      else score += 20;
    }
    // أسماء وسلوجن
    if (nameArabic.trim().length >= 3) score += 15;
    if (sloganArabic.trim().length >= 4) score += 10;
    // بيانات تواصل صالحة
    if (websiteUrl.trim() && /^https?:\/\//i.test(websiteUrl.trim())) score += 15;
    if (phoneNumber.trim()) score += 10;
    if (supportEmail.trim() && supportEmail.includes('@')) score += 10;

    return Math.min(score, 100);
  }, [probe, nameArabic, sloganArabic, websiteUrl, phoneNumber, supportEmail]);

  // التحقق من صحة المدخلات
  const validationErrors = useMemo(() => {
    const errs:string[]=[];
    if(logoUrl.trim()&&probe.status==='broken')errs.push(ar?'الشعار مكسور أو لا يمكن فتحه':'Logo is broken or inaccessible');
    if(nameArabic.trim()&&!isArabicText(nameArabic))errs.push(ar?'الاسم العربي يجب أن يكتب بالعربية':'Arabic name must use Arabic letters');
    if(nameEnglish.trim()&&!isLatinText(nameEnglish))errs.push(ar?'الاسم الإنجليزي يجب أن يكتب بالإنجليزية':'English name must use Latin letters');
    if(sloganArabic.trim()&&!isArabicText(sloganArabic))errs.push(ar?'السلوجن العربي يجب أن يكتب بالعربية':'Arabic slogan must use Arabic letters');
    if(sloganEnglish.trim()&&!isLatinText(sloganEnglish))errs.push(ar?'السلوجن الإنجليزي يجب أن يكتب بالإنجليزية':'English slogan must use Latin letters');
    if(websiteUrl.trim()&&!isWebsiteUrl(websiteUrl))errs.push(ar?'اكتب موقعًا صحيحًا مثل dr-alfailakawi.com':'Enter a valid website');
    if(supportEmail.trim()&&!isEmail(supportEmail))errs.push(ar?'صيغة البريد الإلكتروني غير صحيحة':'Invalid email format');
    if(phoneNumber.trim()&&!isPhone(phoneNumber))errs.push(ar?'رقم الهاتف غير صالح':'Invalid phone number');
    if(addressArabic.trim()&&!isArabicText(addressArabic))errs.push(ar?'العنوان العربي يجب أن يكتب بالعربية':'Arabic address must use Arabic letters');
    if(addressEnglish.trim()&&!isLatinText(addressEnglish))errs.push(ar?'العنوان الإنجليزي يجب أن يكتب بالإنجليزية':'English address must use Latin letters');
    return errs;
  }, [logoUrl,probe.status,nameArabic,nameEnglish,sloganArabic,sloganEnglish,websiteUrl,supportEmail,phoneNumber,addressArabic,addressEnglish,ar]);

  const canSave = validationErrors.length === 0 && !saving;

  // حفظ الهوية
  const handleSave = async () => {
    if(!canSave)return;setSaving(true);setServerError('');setSaveSuccess(false);
    const normalizedWebsite=websiteUrl.trim()?normalizeWebsiteUrl(websiteUrl):'';
    const updatedBrand:OrganizationBrand={...(effectiveBrand||{name:'',nameArabic:'',primaryColor:'#0d1e18',accentColor:'#10b981'}),name:normalizeLatinText(nameEnglish).trim()||effectiveBrand?.name||'',nameArabic:normalizeArabicText(nameArabic).trim()||effectiveBrand?.nameArabic||'',displayName:normalizeLatinText(nameEnglish).trim()||undefined,displayNameArabic:normalizeArabicText(nameArabic).trim()||undefined,logoUrl:logoUrl.trim()||undefined,slogan:normalizeLatinText(sloganEnglish).trim()||undefined,sloganArabic:normalizeArabicText(sloganArabic).trim()||undefined,websiteUrl:normalizedWebsite||undefined,phoneNumber:phoneNumber.trim()?normalizePhone(phoneNumber):undefined,supportEmail:supportEmail.trim()?normalizeEmail(supportEmail):undefined,address:normalizeLatinText(addressEnglish).trim()||undefined,addressArabic:normalizeArabicText(addressArabic).trim()||undefined,certificateTheme,displayPlacements:placements};
    try{
      const user=auth?.currentUser;
      if(user){const token=await user.getIdToken();const res=await fetch('/api/tenant/brand',{method:'PATCH',headers:{'content-type':'application/json',authorization:`Bearer ${token}`},body:JSON.stringify({orgId:orgId||store.organization?.id,displayName:updatedBrand.displayName,displayNameArabic:updatedBrand.displayNameArabic,logoUrl:updatedBrand.logoUrl,slogan:updatedBrand.slogan,sloganArabic:updatedBrand.sloganArabic,websiteUrl:updatedBrand.websiteUrl,phoneNumber:updatedBrand.phoneNumber,supportEmail:updatedBrand.supportEmail,address:updatedBrand.address,addressArabic:updatedBrand.addressArabic,certificateTheme:updatedBrand.certificateTheme,displayPlacements:updatedBrand.displayPlacements})});const body=await res.json().catch(()=>({}));if(!res.ok)throw new Error(String((body.errors||[]).join(' · ')||body.code||'BRAND_SAVE_FAILED'));const b=body.tenant||{};const authoritative:OrganizationBrand={...updatedBrand,displayName:b.displayName,displayNameArabic:b.displayNameArabic,logoUrl:b.logoUrl,slogan:b.slogan,sloganArabic:b.sloganArabic,websiteUrl:b.websiteUrl,phoneNumber:b.phoneNumber,supportEmail:b.supportEmail,address:b.address,addressArabic:b.addressArabic,certificateTheme:b.certificateTheme||certificateTheme,displayPlacements:b.displayPlacements||placements};if(!orgId||orgId===store.organization?.id)store.updateOrganizationBrand(authoritative);onSaved?.(authoritative);setWebsiteUrl(authoritative.websiteUrl||'');setPhoneNumber(authoritative.phoneNumber||'');setSupportEmail(authoritative.supportEmail||'');}
      else{store.updateOrganizationBrand(updatedBrand);onSaved?.(updatedBrand)}
      setSaveSuccess(true);setTimeout(()=>setSaveSuccess(false),4000);
    }catch(err){const raw=(err as Error).message;setServerError(ar?`لم يُحفظ شيء: ${arError(raw)}`:raw)}finally{setSaving(false)}
  };

  return (
    <div className="space-y-6">
      {/* الترويسة وبطاقة النقاء */}
      <div className="rounded-2xl border border-[#DFDED7] bg-white p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex p-2 rounded-xl bg-[#EBF2EE] text-[#214C40]">
                <Sparkles className="w-5 h-5" />
              </span>
              <div>
                <div className="mizan-kicker">{ar ? 'الهوية البيضاء وضبط العلامة' : 'WHITE-LABEL BRAND KIT'}</div>
                <h2 className="text-base sm:text-lg font-extrabold text-[#171b18]">
                  {ar ? 'تخصيص هوية الجهة وشعارها وأماكن الظهور' : 'Tenant Branding & Display Placement Engine'}
                </h2>
              </div>
            </div>
            <p className="mt-1.5 text-xs text-[#636864] leading-relaxed max-w-2xl">
              {ar
                ? 'خصص شعار الجهة واسمها وسلوجنها وبيانات التواصل، وتحكم بدقة في أي واجهات تظهر فيها، مع فحص ذكي يضمن نقاء الشعار ويمنع رفع الروابط المكسورة.'
                : 'Configure your logo, name, slogan and contacts, precisely control where each appears across the system, backed by an intelligent validator preventing broken assets.'}
            </p>
          </div>

          {/* عداد جودة الهوية */}
          <div className="rounded-2xl bg-[#F7F5EF] border border-[#E0DED7] p-3 text-center sm:min-w-[170px] shrink-0">
            <div className="text-[10px] font-bold text-[#656b66] uppercase tracking-wider">
              {ar ? 'مؤشر اكتمال الهوية' : 'Brand Health Score'}
            </div>
            <div className="mt-1 flex items-center justify-center gap-2">
              <span className="text-2xl font-black text-[#214C40]">{healthScore}%</span>
              <Badge variant={healthScore >= 80 ? 'emerald' : healthScore >= 50 ? 'amber' : 'neutral'} dot={false}>
                {healthScore >= 80 ? (ar ? 'ممتاز' : 'Optimal') : healthScore >= 50 ? (ar ? 'جيد' : 'Good') : (ar ? 'بحاجة إكمال' : 'Incomplete')}
              </Badge>
            </div>
          </div>
        </div>

        {/* رسائل التنبيه أو النجاح */}
        {saveSuccess && (
          <div className="mt-4 rounded-xl bg-[#EAF5EF] border border-[#BDE0CB] p-3 flex items-center gap-2.5 text-xs font-bold text-[#1F5E39]">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{ar ? 'تم حفظ الهوية المؤسسية ومصفوفة مواضع الظهور بنجاح، وسرَت التغييرات على كافة الشاشات.' : 'Brand identity and display matrix saved successfully.'}</span>
          </div>
        )}
        {serverError && (
          <div className="mt-4 rounded-xl bg-[#FDF2F0] border border-[#F1C4BD] p-3 flex items-center gap-2.5 text-xs font-bold text-[#A34D43]">
            <XCircle className="w-4 h-4 shrink-0" />
            <span>{serverError}</span>
          </div>
        )}
      </div>

      {/* بطاقة النطاق والوصول */}
      <TenantDomainCard orgId={orgId} />

      {/* القسم الرئيسي: الإعدادات على اليمين والمعاينة الحية على اليسار */}
      <div className="grid lg:grid-cols-12 gap-6">
        {/* عمود إعدادات الشعار والبيانات ومواضع الظهور */}
        <div className="lg:col-span-7 space-y-5">
          {/* 1. مختبر الشعار وفحص النقاء */}
          <section className="rounded-2xl border border-[#DFDED7] bg-white p-5 space-y-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Camera className="w-4 h-4 text-[#2F6555]" />
                <h3 className="font-extrabold text-sm">{ar ? 'شعار الجهة واختبار النقاء' : 'Logo & Clarity Inspector'}</h3>
              </div>
              <Badge
                variant={probe.status === 'valid' ? 'emerald' : probe.status === 'broken' ? 'rose' : 'neutral'}
              >
                {probe.status === 'valid' ? (ar ? 'شعار صالح ومفحوص' : 'Verified') : probe.status === 'broken' ? (ar ? 'شعار غير صالح' : 'Broken') : (ar ? 'بانتظار الفحص' : 'Pending')}
              </Badge>
            </div>

            {/* إدخال الرابط أو الرفع المباشر */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-[#4a504c]">
                {ar ? 'رابط الشعار المباشر (HTTPS)' : 'Direct Logo URL (HTTPS)'}
              </label>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={logoUrl}
                  onChange={e => setLogoUrl(e.target.value)}
                  placeholder="https://example.org/brand/logo.svg"
                  className="flex-1 rounded-xl border border-[#DFDED7] bg-[#FAF9F5] px-3 py-2 text-xs font-mono text-[#171b18] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#214C40]/20"
                />
                <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#DFDED7] bg-white hover:bg-[#FAF9F5] text-xs font-bold text-[#4a504c] shrink-0 transition">
                  <FileUp className="w-3.5 h-3.5 text-[#2F6555]" />
                  <span>{ar ? 'رفع ملف' : 'Upload'}</span>
                  <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
                </label>
              </div>

              {/* بطاقة تقييم حالة الشعار الفورية */}
              <div className={`rounded-xl p-3 text-xs leading-5 border ${
                probe.status === 'valid'
                  ? probe.clarityTier === 'low'
                    ? 'bg-[#FDF9F0] border-[#F2E0BA] text-[#8F6517]'
                    : 'bg-[#F2F8F4] border-[#CCE5D6] text-[#1E5D38]'
                  : probe.status === 'broken'
                  ? 'bg-[#FDF2F0] border-[#F1C4BD] text-[#A34D43]'
                  : 'bg-[#FAF9F5] border-[#E8E6DF] text-[#656b66]'
              }`}>
                <div className="flex items-start gap-2">
                  {probe.status === 'valid' ? (
                    <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                  ) : probe.status === 'broken' ? (
                    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  ) : (
                    <CircleHelp className="w-4 h-4 mt-0.5 shrink-0" />
                  )}
                  <div>
                    <span className="font-bold">{probe.message || (ar ? 'أدخل رابط شعار لفحصه آليًا.' : 'Enter a logo URL to probe.')}</span>
                    {probe.status === 'valid' && (
                      <div className="mt-1 text-[11px] opacity-90">
                        {ar ? 'الأبعاد المقروءة: ' : 'Detected size: '}
                        <span className="font-mono font-bold" dir="ltr">{probe.width} × {probe.height} px</span>
                        {' · '}
                        {ar ? 'نسبة العرض للارتفاع: ' : 'Ratio: '}
                        <span className="font-mono font-bold" dir="ltr">{probe.aspectRatio.toFixed(2)}:1</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* معاينة تباين الشعار وخلفياته */}
            <div className="pt-2 border-t border-[#EAE8E1]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold text-[#656b66]">{ar ? 'فحص الشفافية والتباين على أسطح النظام:' : 'Contrast & transparency test:'}</span>
                <div className="flex gap-1 text-[10px] font-bold">
                  {([
                    ['light', ar ? 'فاتح' : 'Light'],
                    ['dark', ar ? 'داكن' : 'Dark'],
                    ['parchment', ar ? 'شهادة' : 'Parchment'],
                    ['checker', ar ? 'شفاف' : 'Grid'],
                  ] as const).map(([mode, label]) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setPreviewBg(mode)}
                      className={`px-2 py-0.5 rounded-lg border transition ${
                        previewBg === mode
                          ? 'border-[#214C40] bg-[#214C40] text-white'
                          : 'border-[#DFDED7] bg-white text-[#656b66] hover:bg-[#FAF9F5]'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* صندوق عرض الشعار وفق الخلفية المختارة */}
              <div
                className={`h-24 rounded-xl border border-[#DFDED7] grid place-items-center transition-all p-3 ${
                  previewBg === 'light'
                    ? 'bg-[#F7F5EF]'
                    : previewBg === 'dark'
                    ? 'bg-[#0D1E18]'
                    : previewBg === 'parchment'
                    ? 'bg-[#FFFDF8]'
                    : 'bg-[radial-gradient(#ddd_1px,transparent_1px)] [background-size:12px_12px] bg-white'
                }`}
              >
                {logoUrl && probe.status !== 'broken' ? (
                  <img
                    src={logoUrl}
                    alt={nameArabic || 'Logo'}
                    className="max-h-16 max-w-full object-contain drop-shadow-sm"
                  />
                ) : (
                  <span className={`text-xs font-bold ${previewBg === 'dark' ? 'text-[#d6ded9]' : 'text-[#656b66]'}`}>
                    {ar ? 'يظهر الشعار المفحوص هنا' : 'Verified logo appears here'}
                  </span>
                )}
              </div>
            </div>
          </section>

          {/* 2. بيانات الاسم والسلوجن ومعلومات الاتصال */}
          <section className="rounded-2xl border border-[#DFDED7] bg-white p-5 space-y-4 shadow-sm">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-[#2F6555]" />
              <h3 className="font-extrabold text-sm">{ar ? 'المعلومات المؤسسية والتواصل' : 'Organization Details & Contact'}</h3>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <label className="block">
                <span className="block text-[11px] font-bold text-[#656b66] mb-1">{ar ? 'اسم الجهة بالعربية' : 'Arabic Name'}</span>
                <input
                  type="text"
                  lang="ar" data-mizan-kind="arabic"
                  value={nameArabic}
                  onChange={e => setNameArabic(normalizeArabicText(e.target.value))}
                  placeholder={ar ? 'وزارة الأوقاف والشؤون الإسلامية' : 'Awqaf Authority'}
                  className="w-full rounded-xl border border-[#DFDED7] bg-[#FAF9F5] px-3 py-2 text-xs font-medium text-[#171b18] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#214C40]/20"
                />
              </label>

              <label className="block">
                <span className="block text-[11px] font-bold text-[#656b66] mb-1">{ar ? 'الاسم بالإنجليزية (اللاتيني)' : 'English / Latin Name'}</span>
                <input
                  type="text"
                  lang="en" data-mizan-kind="latin"
                  value={nameEnglish}
                  onChange={e => setNameEnglish(normalizeLatinText(e.target.value))}
                  placeholder="Ministry of Awqaf & Islamic Affairs"
                  className="w-full rounded-xl border border-[#DFDED7] bg-[#FAF9F5] px-3 py-2 text-xs font-medium text-[#171b18] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#214C40]/20"
                />
              </label>

              <label className="block">
                <span className="block text-[11px] font-bold text-[#656b66] mb-1">{ar ? 'الشعار اللفظي (السلوجن بالعربية)' : 'Arabic Slogan / Tagline'}</span>
                <input
                  type="text"
                  lang="ar" data-mizan-kind="arabic"
                  value={sloganArabic}
                  onChange={e => setSloganArabic(normalizeArabicText(e.target.value))}
                  placeholder={ar ? 'خيركم من تعلم القرآن وعلمه' : 'Striving for Quranic Excellence'}
                  className="w-full rounded-xl border border-[#DFDED7] bg-[#FAF9F5] px-3 py-2 text-xs font-medium text-[#171b18] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#214C40]/20"
                />
              </label>

              <label className="block">
                <span className="block text-[11px] font-bold text-[#656b66] mb-1">{ar ? 'السلوجن بالإنجليزية' : 'English Slogan'}</span>
                <input
                  type="text"
                  lang="en" data-mizan-kind="latin"
                  value={sloganEnglish}
                  onChange={e => setSloganEnglish(normalizeLatinText(e.target.value))}
                  placeholder="Excellence in Quranic Adjudication"
                  className="w-full rounded-xl border border-[#DFDED7] bg-[#FAF9F5] px-3 py-2 text-xs font-medium text-[#171b18] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#214C40]/20"
                />
              </label>

              <label className="block">
                <span className="block text-[11px] font-bold text-[#656b66] mb-1">{ar ? 'الموقع الإلكتروني الرسمي' : 'Official Website URL'}</span>
                <div className="relative">
                  <Globe className="w-3.5 h-3.5 absolute start-3 top-3 text-[#9B7542]" />
                  <input
                    type="url"
                    dir="ltr"
                    value={websiteUrl}
                    onChange={e => setWebsiteUrl(toAsciiDigits(e.target.value))}
                    placeholder="https://quran.gov.kw"
                    className="w-full ps-8 pe-3 py-2 rounded-xl border border-[#DFDED7] bg-[#FAF9F5] text-xs font-medium text-[#171b18] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#214C40]/20"
                  />
                </div>
              </label>

              <label className="block">
                <span className="block text-[11px] font-bold text-[#656b66] mb-1">{ar ? 'أرقام التواصل / الهاتف' : 'Official Phone / WhatsApp'}</span>
                <div className="relative">
                  <Headphones className="w-3.5 h-3.5 absolute start-3 top-3 text-[#2F6555]" />
                  <input
                    type="tel"
                    value={phoneNumber}
                    onChange={e => setPhoneNumber(normalizePhone(e.target.value))}
                    placeholder="+965 22000000"
                    dir="ltr"
                    className="w-full ps-8 pe-3 py-2 rounded-xl border border-[#DFDED7] bg-[#FAF9F5] text-xs font-medium text-[#171b18] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#214C40]/20"
                  />
                </div>
              </label>

              <label className="block">
                <span className="block text-[11px] font-bold text-[#656b66] mb-1">{ar ? 'البريد الإلكتروني الرسمي للاستفسارات' : 'Support / Inquiries Email'}</span>
                <div className="relative">
                  <Mail className="w-3.5 h-3.5 absolute start-3 top-3 text-[#2F6555]" />
                  <input
                    type="email"
                    dir="ltr"
                    value={supportEmail}
                    onChange={e => setSupportEmail(normalizeEmail(e.target.value))}
                    placeholder="support@quran.gov.kw"
                    className="w-full ps-8 pe-3 py-2 rounded-xl border border-[#DFDED7] bg-[#FAF9F5] text-xs font-medium text-[#171b18] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#214C40]/20"
                  />
                </div>
              </label>

              <label className="block">
                <span className="block text-[11px] font-bold text-[#656b66] mb-1">{ar ? 'العنوان الجغرافي / المقر' : 'Official Headquarters / Location'}</span>
                <div className="relative">
                  <MapPin className="w-3.5 h-3.5 absolute start-3 top-3 text-[#9B7542]" />
                  <input
                    type="text"
                    lang="ar" data-mizan-kind="arabic"
                    value={addressArabic}
                    onChange={e => setAddressArabic(normalizeArabicText(e.target.value))}
                    placeholder={ar ? 'دولة الكويت - العاصمة - برج الأوقاف' : 'Kuwait City, State of Kuwait'}
                    className="w-full ps-8 pe-3 py-2 rounded-xl border border-[#DFDED7] bg-[#FAF9F5] text-xs font-medium text-[#171b18] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#214C40]/20"
                  />
                </div>
              </label>
            </div>
          </section>

          {/* 3. مصفوفة التحكم بأماكن ظهور كل عنصر (الميزة المحورية التي طلبها العميل) */}
          <section className="rounded-2xl border border-[#DFDED7] bg-white p-5 space-y-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Settings2 className="w-4 h-4 text-[#2F6555]" />
                <h3 className="font-extrabold text-sm">{ar ? 'مصفوفة خيارات ومواضع العرض' : 'Display Placements Matrix'}</h3>
              </div>
              <span className="text-[11px] text-[#656b66]">
                {ar ? 'أين يظهر كل عنصر في واجهات النظام؟' : 'Control visibility per surface'}
              </span>
            </div>

            <p className="text-xs text-[#636864] leading-relaxed">
              {ar
                ? 'حدد بدقة الأماكن التي ترغب بظهور الشعار والسلوجن والعنوان ورقم الهاتف والموقع فيها:'
                : 'Configure toggle visibility across headers, footers, certificates, and hall screens:'}
            </p>

            <div className="grid sm:grid-cols-2 gap-3">
              {/* مجموعة الترويسة */}
              <div className="p-3.5 rounded-xl border border-[#E8E6DF] bg-[#FAF9F5] space-y-2.5">
                <div className="text-xs font-extrabold text-[#214C40] flex items-center gap-1.5">
                  <ScanSearch className="w-3.5 h-3.5" />
                  <span>{ar ? 'الترويسة العلوية (Top Header)' : 'Top Header'}</span>
                </div>
                <label className="flex items-center justify-between gap-3 text-xs cursor-pointer">
                  <span className="text-[#4a504c]">{ar ? 'إظهار الشعار الرسمي' : 'Show Brand Logo'}</span>
                  <input
                    type="checkbox"
                    checked={placements.showHeaderLogo}
                    onChange={e => setPlacements(p => ({ ...p, showHeaderLogo: e.target.checked }))}
                    className="w-4 h-4 accent-[#214C40] rounded"
                  />
                </label>
                <label className="flex items-center justify-between gap-3 text-xs cursor-pointer">
                  <span className="text-[#4a504c]">{ar ? 'إظهار الشعار اللفظي (السلوجن)' : 'Show Slogan / Tagline'}</span>
                  <input
                    type="checkbox"
                    checked={placements.showHeaderSlogan}
                    onChange={e => setPlacements(p => ({ ...p, showHeaderSlogan: e.target.checked }))}
                    className="w-4 h-4 accent-[#214C40] rounded"
                  />
                </label>
                <label className="flex items-center justify-between gap-3 text-xs cursor-pointer">
                  <span className="text-[#4a504c]">{ar ? 'إظهار وسيلة تواصل سريعة (الهاتف)' : 'Show Quick Contact Pill'}</span>
                  <input
                    type="checkbox"
                    checked={placements.showHeaderContact}
                    onChange={e => setPlacements(p => ({ ...p, showHeaderContact: e.target.checked }))}
                    className="w-4 h-4 accent-[#214C40] rounded"
                  />
                </label>
              </div>

              {/* مجموعة التذييل */}
              <div className="p-3.5 rounded-xl border border-[#E8E6DF] bg-[#FAF9F5] space-y-2.5">
                <div className="text-xs font-extrabold text-[#214C40] flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5" />
                  <span>{ar ? 'تذييل الصفحات العام (Global Footer)' : 'Global Footer'}</span>
                </div>
                <label className="flex items-center justify-between gap-3 text-xs cursor-pointer">
                  <span className="text-[#4a504c]">{ar ? 'إظهار أرقام التواصل والدعم' : 'Show Phone & Support Email'}</span>
                  <input
                    type="checkbox"
                    checked={placements.showFooterContact}
                    onChange={e => setPlacements(p => ({ ...p, showFooterContact: e.target.checked }))}
                    className="w-4 h-4 accent-[#214C40] rounded"
                  />
                </label>
                <label className="flex items-center justify-between gap-3 text-xs cursor-pointer">
                  <span className="text-[#4a504c]">{ar ? 'إظهار العنوان والمقر الجغرافي' : 'Show Address / HQ Location'}</span>
                  <input
                    type="checkbox"
                    checked={placements.showFooterAddress}
                    onChange={e => setPlacements(p => ({ ...p, showFooterAddress: e.target.checked }))}
                    className="w-4 h-4 accent-[#214C40] rounded"
                  />
                </label>
                <label className="flex items-center justify-between gap-3 text-xs cursor-pointer">
                  <span className="text-[#4a504c]">{ar ? 'إظهار رابط الموقع الإلكتروني' : 'Show Official Website Link'}</span>
                  <input
                    type="checkbox"
                    checked={placements.showFooterWebsite}
                    onChange={e => setPlacements(p => ({ ...p, showFooterWebsite: e.target.checked }))}
                    className="w-4 h-4 accent-[#214C40] rounded"
                  />
                </label>
              </div>

              {/* الشهادات وشاشات القاعات */}
              <div className="sm:col-span-2 p-3.5 rounded-xl border border-[#E8E6DF] bg-[#FAF9F5] grid sm:grid-cols-3 gap-3">
                <label className="flex items-center justify-between gap-3 text-xs cursor-pointer">
                  <span className="text-[#4a504c]">{ar ? 'الشهادات والوثائق المعتمدة' : 'Certificates & Exports'}</span>
                  <input
                    type="checkbox"
                    checked={placements.showOnCertificates}
                    onChange={e => setPlacements(p => ({ ...p, showOnCertificates: e.target.checked }))}
                    className="w-4 h-4 accent-[#214C40] rounded"
                  />
                </label>
                <label className="flex items-center justify-between gap-3 text-xs cursor-pointer">
                  <span className="text-[#4a504c]">{ar ? 'شاشات القاعة والمسرح' : 'Venue & Hall Screens'}</span>
                  <input
                    type="checkbox"
                    checked={placements.showOnVenueScreens}
                    onChange={e => setPlacements(p => ({ ...p, showOnVenueScreens: e.target.checked }))}
                    className="w-4 h-4 accent-[#214C40] rounded"
                  />
                </label>
                <label className="flex items-center justify-between gap-3 text-xs cursor-pointer">
                  <span className="text-[#4a504c]">{ar ? 'بوابة التسجيل والصفحات العامة' : 'Registration & Public Portal'}</span>
                  <input
                    type="checkbox"
                    checked={placements.showOnPublicPortal}
                    onChange={e => setPlacements(p => ({ ...p, showOnPublicPortal: e.target.checked }))}
                    className="w-4 h-4 accent-[#214C40] rounded"
                  />
                </label>
              </div>
            </div>
          </section>

          {/* أزرار الحفظ والإجراءات */}
          <div className="flex items-center justify-between gap-4 pt-2">
            <div className="text-xs text-[#A34D43] font-bold">
              {validationErrors.length > 0 && validationErrors.join(' · ')}
            </div>
            <Button
              onClick={handleSave}
              disabled={!canSave}
              icon={saving ? undefined : saveSuccess ? <Check className="w-4 h-4" /> : <FileCheck2 className="w-4 h-4" />}
            >
              {saving ? (ar ? 'جارٍ الحفظ…' : 'Saving…') : saveSuccess ? (ar ? 'تم الحفظ بنجاح' : 'Saved') : (ar ? 'حفظ إعدادات الهوية ومواضع العرض' : 'Save Brand Settings')}
            </Button>
          </div>
        </div>

        {/* عمود المحاكي والمعاينة الحية التفاعلية */}
        <div className="lg:col-span-5 space-y-4">
          <div className="sticky top-20 rounded-2xl border border-[#DFDED7] bg-white p-5 space-y-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ScanSearch className="w-4 h-4 text-[#2F6555]" />
                <h3 className="font-extrabold text-sm">{ar ? 'المعاينة الحية الفورية' : 'Live Multi-Surface Simulator'}</h3>
              </div>
              <Badge variant="neutral" dot={false}>
                {ar ? 'تحديث فوري' : 'Reactive'}
              </Badge>
            </div>

            {/* أزرار اختيار السطح المطلوب معاينته */}
            <div className="grid grid-cols-4 gap-1 p-1 bg-[#F7F5EF] rounded-xl text-[11px] font-bold">
              {([
                ['header', ar ? 'الترويسة' : 'Header'],
                ['footer', ar ? 'التذييل' : 'Footer'],
                ['certificate', ar ? 'الشهادة' : 'Certificate'],
                ['public', ar ? 'التسجيل' : 'Portal'],
              ] as const).map(([surface, label]) => (
                <button
                  key={surface}
                  type="button"
                  onClick={() => setPreviewSurface(surface)}
                  className={`py-1.5 px-2 rounded-lg transition text-center ${
                    previewSurface === surface
                      ? 'bg-white text-[#214C40] shadow-sm font-extrabold'
                      : 'text-[#656b66] hover:text-[#171b18]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* صندوق المحاكاة الفعلي */}
            <div className="rounded-xl border border-[#DFDED7] overflow-hidden bg-[#FAF9F5] min-h-[300px] flex flex-col justify-center">
              {/* 1. معاينة الترويسة */}
              {previewSurface === 'header' && (
                <div className="p-4 space-y-3">
                  <div className="text-[10px] font-bold text-[#656b66] uppercase tracking-wider text-center">
                    {ar ? 'محاكاة الترويسة العلوية للنظام' : 'Header Simulation'}
                  </div>
                  <div className="border border-[#DFDED7] bg-[#F7F5EF] rounded-xl px-4 py-3 flex items-center justify-between gap-3 shadow-xs">
                    <div className="flex items-center gap-2.5 min-w-0">
                      {placements.showHeaderLogo && logoUrl && probe.status !== 'broken' ? (
                        <img src={logoUrl} alt="Logo" className="w-8 h-8 object-contain" />
                      ) : (
                        <div className="w-8 h-8 rounded-lg bg-[#214C40] text-white font-bold grid place-items-center text-xs">
                          م
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="font-extrabold text-xs text-[#171b18] truncate">
                          {nameArabic || nameEnglish || (ar ? 'اسم الجهة' : 'Organization Name')}
                        </div>
                        {placements.showHeaderSlogan && sloganArabic && (
                          <div className="text-[10px] text-[#2F6555] font-medium truncate">
                            {sloganArabic}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {placements.showHeaderContact && (phoneNumber || supportEmail) && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#EBF2EE] text-[#214C40] flex items-center gap-1" dir="ltr">
                          <Headphones className="w-2.5 h-2.5" />
                          <span>{phoneNumber || supportEmail}</span>
                        </span>
                      )}
                      <div className="w-5 h-5 rounded-full bg-[#DFDED7]" />
                    </div>
                  </div>
                  <p className="text-[10px] text-[#656b66] text-center">
                    {ar ? 'تظهر الترويسة بهذا التنسيق لجميع المحكمين والمسؤولين والزوّار.' : 'This layout appears for all staff and attendees.'}
                  </p>
                </div>
              )}

              {/* 2. معاينة التذييل */}
              {previewSurface === 'footer' && (
                <div className="p-4 space-y-3">
                  <div className="text-[10px] font-bold text-[#656b66] uppercase tracking-wider text-center">
                    {ar ? 'محاكاة تذييل الصفحات العام' : 'Footer Simulation'}
                  </div>
                  <div className="border border-[#DFDED7] bg-white rounded-xl p-4 space-y-3 shadow-xs text-[11px]">
                    <div className="flex items-center gap-2 border-b border-[#EAE8E1] pb-2">
                      {logoUrl && probe.status !== 'broken' && (
                        <img src={logoUrl} alt="Logo" className="w-6 h-6 object-contain" />
                      )}
                      <span className="font-black text-xs text-[#171b18]">{nameArabic || nameEnglish}</span>
                    </div>

                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[#4a504c] text-[10px]">
                      {placements.showFooterWebsite && websiteUrl && (
                        <div className="flex items-center gap-1 text-[#214C40]">
                          <Globe className="w-3 h-3" />
                          <span>{websiteUrl.replace(/^https?:\/\//i, '')}</span>
                        </div>
                      )}
                      {placements.showFooterContact && phoneNumber && (
                        <div className="flex items-center gap-1">
                          <Headphones className="w-3 h-3 text-[#2F6555]" />
                          <span dir="ltr">{phoneNumber}</span>
                        </div>
                      )}
                      {placements.showFooterAddress && addressArabic && (
                        <div className="flex items-center gap-1 text-[#656b66]">
                          <MapPin className="w-3 h-3 text-[#9B7542]" />
                          <span>{addressArabic}</span>
                        </div>
                      )}
                    </div>

                    <div className="text-[9px] text-[#656b66] pt-1">
                      © {new Date().getFullYear()} {nameArabic || nameEnglish}. {ar ? 'جميع الحقوق محفوظة.' : 'All rights reserved.'}
                    </div>
                  </div>
                </div>
              )}

              {/* 3. معاينة الشهادة الرسمية */}
              {previewSurface === 'certificate' && (
                <div className="p-4 space-y-3">
                  <div className="text-[10px] font-bold text-[#656b66] uppercase tracking-wider text-center">
                    {ar ? 'محاكاة الشهادة والوثائق المطبوعة' : 'Certificate Stamp Preview'}
                  </div>
                  <div className="border border-[#D4C5B0] bg-[#FFFDF8] rounded-xl p-4 text-center space-y-2.5 shadow-xs relative">
                    <div className="w-12 h-12 mx-auto rounded-full border border-[#D4C5B0] p-1 grid place-items-center bg-white shadow-xs">
                      {logoUrl && probe.status !== 'broken' ? (
                        <img src={logoUrl} alt="Logo" className="w-full h-full object-contain" />
                      ) : (
                        <Award className="w-6 h-6 text-[#9B7542]" />
                      )}
                    </div>
                    <div>
                      <div className="text-[10px] font-bold text-[#9B7542] uppercase tracking-widest">
                        {ar ? 'شهادة إتقان قرآنية معتمدة' : 'Official Certificate'}
                      </div>
                      <div className="text-xs font-black text-[#171b18] mt-0.5">
                        {nameArabic || nameEnglish || 'الجهة المانحة للشهادة'}
                      </div>
                      {sloganArabic && (
                        <div className="text-[9px] text-[#6b726d] italic mt-0.5">
                          «{sloganArabic}»
                        </div>
                      )}
                    </div>

                    {placements.showOnCertificates && (
                      <div className="pt-2 border-t border-[#EAE4D7] flex items-center justify-between text-[9px] text-[#656b66]">
                        <span>{websiteUrl ? websiteUrl.replace(/^https?:\/\//i, '') : 'quran-verify.org'}</span>
                        <span className="inline-flex items-center gap-1 font-bold text-[#214C40]"><ShieldCheck className="w-3 h-3"/>{ar?'قابلة للتحقق':'Verifiable'}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 4. معاينة البوابة العامة والتسجيل */}
              {previewSurface === 'public' && (
                <div className="p-4 space-y-3">
                  <div className="text-[10px] font-bold text-[#656b66] uppercase tracking-wider text-center">
                    {ar ? 'محاكاة بوابة التسجيل والجمهور' : 'Public Registration Card'}
                  </div>
                  <div className="border border-[#DFDED7] bg-white rounded-xl p-4 space-y-2.5 shadow-xs">
                    <div className="flex items-center gap-3">
                      {logoUrl && probe.status !== 'broken' ? (
                        <img src={logoUrl} alt="Logo" className="w-10 h-10 object-contain rounded-lg border border-[#E8E6DF] p-1" />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-[#214C40] text-white font-bold grid place-items-center text-sm">
                          م
                        </div>
                      )}
                      <div>
                        <div className="font-black text-xs text-[#171b18]">{nameArabic || nameEnglish}</div>
                        <div className="text-[10px] text-[#656b66]">{sloganArabic || (ar ? 'البوابة الرسمية للمتسابقين والجمهور' : 'Official Public Portal')}</div>
                      </div>
                    </div>

                    {placements.showOnPublicPortal && (
                      <div className="p-2 rounded-lg bg-[#F7F5EF] text-[10px] text-[#4a504c] space-y-1">
                        {websiteUrl && <div className="truncate"><span className="text-[#656b66]">{ar ? 'الموقع: ' : 'Web: '}</span>{websiteUrl}</div>}
                        {phoneNumber && <div><span className="text-[#656b66]">{ar ? 'الهاتف: ' : 'Phone: '}</span><span dir="ltr">{phoneNumber}</span></div>}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* شروط وضوابط النقاء لضمان عدم رفع ملف مكسور */}
            <div className="rounded-xl border border-[#DFDED7] bg-[#FAF9F5] p-3 space-y-1.5 text-[11px] text-[#656b66]">
              <div className="flex items-center gap-1.5 font-bold text-[#214C40]">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>{ar ? 'شروط اعتماد الشعار للنظام:' : 'Brand Asset Quality Criteria:'}</span>
              </div>
              <ul className="list-disc list-inside space-y-1 text-[10px] leading-relaxed">
                <li>{ar ? 'صيغة متجهة (SVG) أو صورة مفرغة (PNG) بخلفية شفافة.' : 'Vector (SVG) or transparent PNG is highly recommended.'}</li>
                <li>{ar ? 'دقة موصى بها لا تقل عن 200×200 بكسل لضمان وضوح الطباعة.' : 'Minimum 200x200px recommended for print clarity.'}</li>
                <li>{ar ? 'رابط آمن يبدأ بـ HTTPS لتفادي تحذيرات الأمان في المتصفحات.' : 'Secure HTTPS protocol required to prevent browser mixed-content.'}</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
