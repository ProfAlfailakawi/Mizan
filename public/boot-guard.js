/* حارس الإقلاع — ملفٌّ خارجي لا سطرٌ داخل الصفحة: سياسة CSP (script-src 'self') تمنع كل سكربتٍ مضمَّن،
   فكان الحارس القديم يُحجَب بصمت في الإنتاج ولا يعمل يوم يلزم. */
setTimeout(function () {
  if (window.__MIZAN_BOOTED) return;
  var K = 'mizan-boot-recovered';
  try { if (sessionStorage.getItem(K)) return; } catch (e) { return; }
  var done = function () { location.reload(); };
  var wipe = function () {
    try { sessionStorage.setItem(K, '1'); } catch (e) { return; }
    try {
      Promise.all([
        'serviceWorker' in navigator ? navigator.serviceWorker.getRegistrations().then(function (rs) { return Promise.all(rs.map(function (r) { return r.unregister(); })); }) : null,
        'caches' in window ? caches.keys().then(function (ks) { return Promise.all(ks.map(function (k) { return caches.delete(k); })); }) : null,
      ]).then(done, done);
    } catch (e) { done(); }
  };
  /* أثناء النشر لا تصل الحزمةُ لأن الخادم يتبدّل، لا لأن الغلاف قديم. المسحُ حينها يُسقط
     العاملَ الذي يحمل صفحةَ «نُحدّث البرنامج» ويستهلك المحاولةَ الوحيدة؛ فيُسأل الخادمُ
     أولًا (/api/health)، وإن لم يُجب انتظرناه ثم أعدنا التحميل بلا مسح. */
  var serverUp = function (answer) {
    if (!window.fetch) { answer(true); return; }
    fetch('/api/health', { cache: 'no-store', credentials: 'same-origin' }).then(function (r) { answer(r.ok); }, function () { answer(false); });
  };
  var tries = 0;
  var awaitServer = function () {
    setTimeout(function () {
      if (window.__MIZAN_BOOTED) return;
      serverUp(function (up) { if (up) done(); else { tries++; awaitServer(); } });
    }, Math.min(15000, Math.round(3000 * Math.pow(1.3, Math.max(0, tries - 5)))));
  };
  serverUp(function (up) { if (up) wipe(); else awaitServer(); });
}, 8000);
