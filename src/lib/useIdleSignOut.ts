import { useEffect, useRef, useState } from 'react';
import { signOut } from 'firebase/auth';
import { auth } from './firebase';

/*
 * تسجيل خروج تلقائي عند الخمول.
 *
 * جهاز القاعة العام لا يُترك جلسةً مفتوحة: من يبتعد عنه دون خروج يترك حسابه لمن يليه.
 * فبعد مدة بلا أي نشاط، تُغلق الجلسة من نفسها — وهو أهم ما يحمي حسابًا حسّاسًا على
 * جهاز مشترك. المدة سياسة نشر عبر VITE_IDLE_TIMEOUT_MINUTES، وافتراضها خمس عشرة دقيقة.
 *
 * ثوانٍ قليلة قبل الإغلاق يظهر تنبيه: أي حركة أو لمسة تُلغيه، فلا يُقطع على عاملٍ مشغول.
 */

const env = import.meta.env as Record<string, string | undefined>;
const TIMEOUT_MS = Math.max(1, Number(env.VITE_IDLE_TIMEOUT_MINUTES || 15)) * 60_000;
const WARN_MS = 30_000; // تحذير نصف دقيقة قبل الإغلاق
const ACTIVITY = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'mousemove'] as const;

/**
 * @param active يُفعَّل فقط في الإنتاج بعد تسجيل الدخول؛ في وضع العرض لا خروج تلقائي.
 * @returns الثواني المتبقية حين يكون التحذير ظاهرًا، وإلا null.
 */
export function useIdleSignOut(active: boolean): number | null {
  const [warnSecondsLeft, setWarnSecondsLeft] = useState<number | null>(null);
  const deadline = useRef(0);

  useEffect(() => {
    if (!active) { setWarnSecondsLeft(null); return; }

    let warnTimer = 0;
    let tick = 0;

    const signOutNow = () => {
      window.clearInterval(tick);
      void signOut(auth).catch(() => {}).finally(() => window.location.reload());
    };

    const schedule = () => {
      deadline.current = Date.now() + TIMEOUT_MS;
      window.clearTimeout(warnTimer);
      warnTimer = window.setTimeout(() => setWarnSecondsLeft(Math.ceil(WARN_MS / 1000)), TIMEOUT_MS - WARN_MS);
    };

    const onActivity = () => {
      if (warnSecondsLeft !== null) setWarnSecondsLeft(null);
      schedule();
    };

    // نبضة كل ثانية: تحدّث العدّ التنازلي وتغلق عند بلوغ الموعد، فلا نتّكل على مؤقّت
    // واحد قد يتأخّر حين ينام التبويب في الخلفية.
    tick = window.setInterval(() => {
      const remaining = deadline.current - Date.now();
      if (remaining <= 0) { signOutNow(); return; }
      if (remaining <= WARN_MS) setWarnSecondsLeft(Math.ceil(remaining / 1000));
    }, 1000);

    for (const evt of ACTIVITY) window.addEventListener(evt, onActivity, { passive: true });
    schedule();

    return () => {
      window.clearTimeout(warnTimer);
      window.clearInterval(tick);
      for (const evt of ACTIVITY) window.removeEventListener(evt, onActivity);
    };
    // warnSecondsLeft عمدًا خارج التبعيات: قراءته داخل onActivity تكفي، وإدراجه يعيد
    // تركيب المستمعين كل ثانية.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return warnSecondsLeft;
}
