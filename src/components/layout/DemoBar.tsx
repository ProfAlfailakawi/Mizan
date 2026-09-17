import React from 'react';
import { FlaskConical, RefreshCw, X } from 'lucide-react';
import {
  useAppStore,
  IS_DEMO_SESSION,
  exitDemoSession,
  resetDemoSession,
  setDemoRole,
  DEMO_TENANT_ROLES,
  DEMO_PLATFORM_ROLES,
} from '../../lib/store';
import type { Role } from '../../types';

/*
 * شريط البيئة التجريبية — ثابتٌ فوق كل شاشة، في كل دور.
 *
 * وموضعه خارج `Header` عن قصد: الترويسة لا تُعرض أصلًا لدور «مشغّل البثّ»، وتُخفي
 * نصف أدواتها لدور «مالك المنصة». فشريطٌ داخلها كان يترك الزائر في شاشة البثّ بلا
 * طريقٍ للعودة — يدخل دورًا فلا يخرج منه. وهذا الشريط يعيش على مستوى التطبيق، فهو
 * حاضرٌ مهما كان الدور المعروض.
 *
 * وهو أيضًا وسمٌ لا زينة: من ينظر إلى الشاشة أثناء عرضٍ على جهة يجب أن يعرف بنظرة
 * واحدة أن ولا سجلٍّ أمامه يخصّ مسابقةً حقيقية.
 */

const ROLE_LABELS: Record<Role, [string, string]> = {
  comp_admin: ['مدير المسابقة', 'Competition admin'],
  head_judge: ['رئيس اللجنة', 'Head judge'],
  judge: ['محكّم', 'Judge'],
  ops_manager: ['مدير التشغيل', 'Operations manager'],
  exception_host: ['الحالات الاستثنائية', 'Exception host'],
  delegation_manager: ['مدير الوفد', 'Delegation manager'],
  participant: ['متسابق', 'Participant'],
  guardian: ['ولي أمر', 'Guardian'],
  broadcast_operator: ['مشغّل البثّ', 'Broadcast operator'],
  auditor: ['مدقّق', 'Auditor'],
  support_agent: ['الدعم', 'Support agent'],
  org_admin: ['مدير الجهة', 'Organization admin'],
  branch_admin: ['مدير الفرع', 'Branch admin'],
  super_admin: ['مالك المنصة', 'Platform owner'],
  operator_owner: ['مالك المشغّل', 'Operator owner'],
  operator_admin: ['مدير المشغّل', 'Operator admin'],
  storage_admin: ['مدير التخزين', 'Storage admin'],
  billing_admin: ['مدير الفوترة', 'Billing admin'],
};

export const DemoBar: React.FC = () => {
  const { language, currentUser } = useAppStore();
  if (!IS_DEMO_SESSION) return null;
  const ar = language === 'ar';
  const label = (role: Role) => ROLE_LABELS[role]?.[ar ? 0 : 1] || role;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[220] flex justify-center px-3 pb-3 pointer-events-none" dir={ar ? 'rtl' : 'ltr'}>
      <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-2 rounded-2xl border border-[#d8b86a] bg-[#faf3e2]/97 px-3 py-2 shadow-[0_14px_40px_rgba(25,39,33,.18)] backdrop-blur">
        <span
          role="status"
          aria-label={ar ? 'بيئة تجريبية معزولة ببيانات مصطنعة' : 'Isolated demo environment with synthetic data'}
          className="inline-flex items-center gap-1.5 text-[10px] font-black tracking-wide text-[#8a6a1c]"
        >
          <FlaskConical className="w-3.5 h-3.5" aria-hidden="true" />
          <span>{ar ? 'بيئة تجريبية' : 'DEMO'}</span>
        </span>

        <label className="inline-flex items-center gap-1.5">
          <span className="text-[10px] font-black text-[#8a6a1c]">{ar ? 'الدور' : 'Role'}</span>
          <select
            value={currentUser.role}
            onChange={event => setDemoRole(event.target.value as Role)}
            aria-label={ar ? 'اختر الدور المعروض' : 'Choose the role on screen'}
            className="min-h-11 rounded-xl border border-[#d8b86a] bg-white px-2.5 text-[11px] font-black text-[#6b5314]"
          >
            <optgroup label={ar ? 'أدوار المسابقة والجهة' : 'Competition & organization'}>
              {DEMO_TENANT_ROLES.map(role => (
                <option key={role} value={role}>{label(role)}</option>
              ))}
            </optgroup>
            {/* لوحات هذه الطبقة تقرأ من الخادم بهوية مالك؛ في صندوقٍ بلا حساب تبقى فارغة. */}
            <optgroup label={ar ? 'المنصة والمشغّل (تحتاج خادمًا)' : 'Platform & operator (server-backed)'}>
              {DEMO_PLATFORM_ROLES.map(role => (
                <option key={role} value={role}>{label(role)}</option>
              ))}
            </optgroup>
          </select>
        </label>

        <button
          type="button"
          onClick={() => resetDemoSession()}
          title={ar ? 'إعادة تعيين البيانات التجريبية' : 'Reset demo data'}
          aria-label={ar ? 'إعادة تعيين البيانات التجريبية' : 'Reset demo data'}
          className="w-11 h-11 grid place-items-center rounded-xl text-[#8a6a1c] hover:bg-[#f2e4c6]"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => exitDemoSession()}
          title={ar ? 'الخروج من البيئة التجريبية' : 'Leave the demo'}
          aria-label={ar ? 'الخروج من البيئة التجريبية' : 'Leave the demo'}
          className="w-11 h-11 grid place-items-center rounded-xl text-[#8a6a1c] hover:bg-[#f2e4c6]"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
