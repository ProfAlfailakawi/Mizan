import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { useAppStore } from '../../lib/store';

/*
 * شريط عطل الحفظ.
 *
 * كان النظام يرصد فشل الحفظ في حالته ولا يعرضه في أي شاشة، وفشل المزامنة السحابية يُبتلع في
 * سجلّ الطرفية. فيتوقّف الحفظ في منتصف مسابقة ولا يعلم أحد حتى تُفقد درجة.
 *
 * الشريط ثابت أعلى الشاشة ولا يُغلق: عطلٌ يمسّ حفظ الدرجات ليس إشعارًا يُصرف، بل حالةٌ تبقى
 * ظاهرة حتى تُعالَج. نصّه يقول ما الذي لم يُحفظ وما العمل، لا رمز خطأ خامًا.
 */

const GUIDANCE: Record<string, { ar: string; en: string }> = {
  QUOTA_EXCEEDED: { ar: 'مساحة التخزين المحلية ممتلئة. صدّر نسخة من المسابقة ثم أفرغ بيانات المتصفّح القديمة.', en: 'Local storage is full. Export a competition snapshot, then clear old browser data.' },
  WRITE_FAILED: { ar: 'تعذّر الحفظ المحلي على هذا الجهاز. لا تُكمل التحكيم عليه قبل المعالجة.', en: 'Local saving failed on this device. Do not continue judging on it until this is resolved.' },
  CLOUD_PERMISSION_DENIED: { ar: 'صلاحية هذا الحساب لا تسمح بحفظ هذا السجل. راجع دور الحساب مع مدير المسابقة.', en: 'This account is not permitted to save this record. Check its role with the competition administrator.' },
  CLOUD_PAYLOAD_TOO_LARGE: { ar: 'سجلّ أكبر من الحدّ المسموح لم يُرفع. أبلغ الدعم الفني قبل متابعة اليوم.', en: 'A record exceeded the allowed size and was not uploaded. Notify technical support before continuing.' },
  CLOUD_WRITE_FAILED: { ar: 'المزامنة مع الخادم متوقّفة. العمل محفوظ محليًا وسيُرفع عند عودة الاتصال.', en: 'Server sync is interrupted. Work is saved locally and will upload when the connection returns.' },
};

export const PersistenceAlert: React.FC = () => {
  const { persistenceError, language } = useAppStore();
  if (!persistenceError) return null;
  const ar = language === 'ar';
  const guidance = GUIDANCE[persistenceError.code] || GUIDANCE.CLOUD_WRITE_FAILED;
  // انقطاع الشبكة مؤقّت ومتوقّع؛ أما الصلاحية والحجم والحفظ المحلي فأعطال تحتاج تدخّلًا.
  const severe = persistenceError.code !== 'CLOUD_WRITE_FAILED';
  return (
    <div role="alert" aria-live="assertive"
      className={`sticky top-0 z-50 w-full px-4 py-2.5 flex items-start gap-2.5 text-[11px] font-bold ${severe ? 'bg-[#7d2f26] text-white' : 'bg-[#F2EADC] text-[#6b5230]'}`}>
      <AlertTriangle className="w-4 h-4 shrink-0 mt-px" aria-hidden />
      <span className="min-w-0">
        {ar ? 'تنبيه حفظ: ' : 'Saving alert: '}{ar ? guidance.ar : guidance.en}
        <span className={`block font-normal mt-0.5 ${severe ? 'text-white/70' : 'text-[#7a6444]'}`}>{persistenceError.message}</span>
      </span>
    </div>
  );
};
