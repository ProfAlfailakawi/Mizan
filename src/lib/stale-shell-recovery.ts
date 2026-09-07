/*
 * تعافي الغلاف القديم بعد النشر.
 *
 * MIZAN مقسّم إلى حزم مُجزّأة باسم مبصوم (Name-a1B2c3D4.js)، وكل نشر يولّد بصمات جديدة. الجهاز
 * الذي بقي مفتوحًا — لوحة القاعة مثلًا — يحمل غلافًا قديمًا يطلب حزمة لم تعد موجودة، فيفشل
 * الاستيراد الديناميكي وتظهر شاشة بيضاء بلا رسالة ولا مخرج. وهذا أسوأ ما يقع في يوم المسابقة.
 *
 * الخادم صار يردّ 404 على الأصل المفقود بدل صفحة HTML (وهو ما كان يخفي العطل خلف خطأ MIME).
 * وهنا نكمل الدائرة: عند فشل تحميل حزمة، نُفرغ مخابئ العامل ونعيد التحميل مرة واحدة فقط.
 *
 * القيد على «مرة واحدة» مقصود: لو كان الخلل من الشبكة أو من الخادم نفسه، فإعادة التحميل المتكررة
 * تصنع دوّامة تُفقد المستخدم أي فرصة لرؤية الخطأ. نضع علامة في sessionStorage، فإن عاد الفشل بعد
 * محاولة واحدة تركنا الخطأ ظاهرًا ليُعالَج بوصفه عطلًا حقيقيًا لا نسخة قديمة.
 */

const FLAG = 'mizan-shell-reloaded';

function looksLikeStaleChunk(message: string) {
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unexpected token '<'|MIME type/i.test(message);
}

async function recover() {
  try {
    if (sessionStorage.getItem(FLAG)) return; // حاولنا مرة؛ لا ندخل في دوّامة
    sessionStorage.setItem(FLAG, '1');
  } catch { /* التخزين قد يكون محجوبًا — نكمل بحذر */ }

  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
  } catch { /* التنظيف أفضل جهد؛ إعادة التحميل تبقى مفيدة على أي حال */ }

  window.location.reload();
}

/** يُنظَّف العلم بعد إقلاع ناجح، حتى يبقى التعافي متاحًا للنشر القادم. */
export function markShellHealthy() {
  try { sessionStorage.removeItem(FLAG); } catch { /* لا شيء */ }
}

export function installStaleShellRecovery() {
  if (typeof window === 'undefined') return;

  // Vite تُطلق هذا الحدث حين يفشل تحميل حزمة مُسبقة التحميل — أوضح إشارة إلى غلاف قديم.
  window.addEventListener('vite:preloadError' as keyof WindowEventMap, ((e: Event) => {
    e.preventDefault();
    void recover();
  }) as EventListener);

  window.addEventListener('error', (e) => {
    const target = e.target as HTMLElement | null;
    /* فشل الوسم دليل غلاف قديم فقط حين يكون الأصل أصلَنا (نطاقنا وتحت ‎/assets/).
       الوسطاء يحقنون سكربتات قد تحجبها سياسة الأمان، وسكربت غريب محجوب يفشل عند كل
       إقلاع — فلو أعدنا التحميل له صنعنا دوّامة لا يوقفها العلم لأنه يُمسح عند كل
       إقلاع ناجح. */
    if (target && (target.tagName === 'SCRIPT' || target.tagName === 'LINK')) {
      const url = (target as HTMLScriptElement).src || (target as HTMLLinkElement).href || '';
      try {
        const parsed = new URL(url, window.location.href);
        if (parsed.origin === window.location.origin && parsed.pathname.startsWith('/assets/')) void recover();
      } catch { /* عنوان غير قابل للتحليل — ليس أصلنا */ }
      return;
    }
    if (e.message && looksLikeStaleChunk(e.message)) void recover();
  }, true);

  window.addEventListener('unhandledrejection', (e) => {
    const reason = (e as PromiseRejectionEvent).reason;
    const message = typeof reason === 'string' ? reason : reason?.message || '';
    if (looksLikeStaleChunk(String(message))) void recover();
  });
}
