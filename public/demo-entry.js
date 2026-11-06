/* الرابط المباشر للنسخة التجريبية: /demo
   يطلب صندوقًا معزولًا من الخادم، يحفظ معرّفه في sessionStorage لهذا اللسان، يرفع راية العرض ثم يدخل
   التطبيق. الثوابت مطابقة لـ src/lib/demo-transport.ts (يفحص تطابقها scripts/verify-demo-entry.mjs).
   سكربتٌ خارجي لأن سياسة CSP تسمح بـ script-src 'self' فقط. */
(function () {
  var ID_KEY = 'mizan_demo_server_id_v1';
  var FLAG_KEY = 'mizan_demo_active_v1';
  var STATE_KEY = 'mizan_os_store_v1__demo_v1';
  var PATTERN = /^demo_[0-9a-f]{64}$/;
  var msg = document.getElementById('m');
  function say(t) { if (msg) msg.textContent = t; }
  fetch('/api/demo/enter', { method: 'POST' })
    .then(function (r) {
      if (r.status === 404) { say('النسخة التجريبية غير متاحة في هذا النشر.'); return null; }
      if (r.status === 429 || r.status === 503) { say('النسخة التجريبية مشغولة الآن. أعد المحاولة بعد دقيقة.'); return null; }
      if (!r.ok) throw new Error('enter');
      return r.json();
    })
    .then(function (b) {
      if (!b) return;
      if (!b.sessionId || !PATTERN.test(b.sessionId)) throw new Error('id');
      sessionStorage.setItem(ID_KEY, b.sessionId);
      sessionStorage.setItem(FLAG_KEY, 'true'); /* بناءٌ أُطفئ فيه العرض: store.ts يتجاهل الراية، وdemo-transport يمحو المعرّف اليتيم عند الإقلاع. */
      sessionStorage.removeItem(STATE_KEY);
      window.location.replace('/');
    })
    .catch(function () { say('تعذّر تجهيز النسخة التجريبية. تحقق من الاتصال وأعد المحاولة.'); });
})();
