/* حارس الإقلاع — ملفٌّ خارجي لا سطرٌ داخل الصفحة: سياسة CSP (script-src 'self') تمنع كل سكربتٍ مضمَّن،
   فكان الحارس القديم يُحجَب بصمت في الإنتاج ولا يعمل يوم يلزم. */
setTimeout(function () {
  if (window.__MIZAN_BOOTED) return;
  var K = 'mizan-boot-recovered';
  try { if (sessionStorage.getItem(K)) return; sessionStorage.setItem(K, '1'); } catch (e) { return; }
  var done = function () { location.reload(); };
  try {
    Promise.all([
      'serviceWorker' in navigator ? navigator.serviceWorker.getRegistrations().then(function (rs) { return Promise.all(rs.map(function (r) { return r.unregister(); })); }) : null,
      'caches' in window ? caches.keys().then(function (ks) { return Promise.all(ks.map(function (k) { return caches.delete(k); })); }) : null,
    ]).then(done, done);
  } catch (e) { done(); }
}, 8000);
