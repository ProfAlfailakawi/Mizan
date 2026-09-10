import React, { useCallback, useRef, useState } from 'react';
import { AlertTriangle, ShieldCheck } from 'lucide-react';
import { Modal } from './Modal';
import { Button } from './Button';

/*
 * تأكيدٌ بلغة المستخدم.
 *
 * كانت الإجراءات التي لا رجعة فيها — حذف متسابق، حذف لجنة، استعادة نسخة احتياطية تمحو
 * الحالة الحاضرة — تمرّ عبر `window.confirm`. ونصّها عربي، لكن الصندوق الذي يرسمه المتصفح
 * ليس لنا: زرّاه `OK` و`Cancel` بالإنجليزية، واتجاهه من اليسار، وشكله غريب عن كل شاشة في
 * ميزان. فآخر ما يراه المستخدم قبل فعلٍ لا يُستردّ كان بلغةٍ لا يقرؤها.
 *
 * وأسوأ من الشكل أن `window.confirm` يوقف خيط الواجهة كله، ولا يقبل تمييز الفعل المدمّر عن
 * السؤال العادي، ولا يُختبر.
 *
 * هذه بديله: نافذة ميزان نفسها — تُغلق بـ Escape، وتحبس التنقّل بـ Tab داخلها، وتُعيد
 * التركيز إلى الزر الذي فتحها — وتُعيد وعدًا يُحسم بنعم أو لا، فيبقى نداؤها في مكان
 * `window.confirm` تمامًا.
 */

export interface ConfirmRequest {
  title: string;
  /** الجملة التي تقول ما سيقع فعلًا. تُكتب صريحةً لا مطمئنة. */
  body?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** `destructive` للفعل الذي لا يُستردّ: يتلوّن الزر ويتغيّر الرمز. */
  tone?: 'neutral' | 'destructive';
}

type Pending = ConfirmRequest & { resolve: (value: boolean) => void };

/**
 * يُستعمل هكذا:
 *
 *     const { confirm, confirmDialog } = useConfirm(ar);
 *     const remove = async () => { if (!(await confirm({ title: '…', tone: 'destructive' }))) return; … };
 *     return <>{confirmDialog}…</>;
 */
export function useConfirm(ar: boolean) {
  const [pending, setPending] = useState<Pending | null>(null);
  /* نداءٌ ثانٍ قبل حسم الأول يترك الأول معلّقًا إلى الأبد؛ يُحسم بالرفض قبل استبداله. */
  const pendingRef = useRef<Pending | null>(null);

  const settle = useCallback((value: boolean) => {
    const current = pendingRef.current;
    pendingRef.current = null;
    setPending(null);
    current?.resolve(value);
  }, []);

  const confirm = useCallback((request: ConfirmRequest) => new Promise<boolean>((resolve) => {
    pendingRef.current?.resolve(false);
    const next: Pending = { ...request, resolve };
    pendingRef.current = next;
    setPending(next);
  }), []);

  const destructive = pending?.tone === 'destructive';
  const confirmDialog = (
    <Modal
      isOpen={!!pending}
      /* الإغلاق بالمفتاح أو بالخلفية إلغاءٌ لا موافقة: الصمت لا يُقرأ نعم. */
      onClose={() => settle(false)}
      title={pending?.title || ''}
      maxWidth="md"
    >
      <div className="flex gap-4">
        <span className={`shrink-0 w-11 h-11 rounded-2xl grid place-items-center ${destructive ? 'bg-[#F6E7E7] text-[#7A2E2E]' : 'bg-[#EEF2EF] text-[#214C40]'}`}>
          {destructive ? <AlertTriangle className="w-5 h-5" /> : <ShieldCheck className="w-5 h-5" />}
        </span>
        <div className="min-w-0 flex-1">
          {pending?.body && <div className="text-sm leading-7 text-[#4a534d]">{pending.body}</div>}
          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={() => settle(false)}>
              {pending?.cancelLabel || (ar ? 'إلغاء' : 'Cancel')}
            </Button>
            <Button
              autoFocus
              variant={destructive ? 'danger' : 'primary'}
              onClick={() => settle(true)}
            >
              {pending?.confirmLabel || (ar ? 'تأكيد' : 'Confirm')}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );

  return { confirm, confirmDialog };
}
