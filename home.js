/* Mizan home — language toggle, PWA install, service worker. */
'use strict';

/* ---- language ---- */
const btnLang = document.getElementById('btnLang');
function setLang(en){
  document.body.classList.toggle('en', en);
  document.documentElement.lang = en ? 'en' : 'ar';
  document.documentElement.dir = en ? 'ltr' : 'rtl';
  if (btnLang) btnLang.textContent = en ? 'ع' : 'EN';
  try { localStorage.setItem('mizan-lang', en ? 'en' : 'ar'); } catch {}
}
try { if (localStorage.getItem('mizan-lang') === 'en') setLang(true); } catch {}
btnLang && btnLang.addEventListener('click', () => setLang(!document.body.classList.contains('en')));

/* ---- PWA install (Android/desktop beforeinstallprompt) ---- */
let deferredPrompt = null;
const installBar = document.getElementById('installBar');
const installGo = document.getElementById('installGo');
const installNo = document.getElementById('installNo');
const btnInstall = document.getElementById('btnInstall');

function showInstall(){
  let dismissed = false;
  try { dismissed = localStorage.getItem('mizan-install-dismissed') === '1'; } catch {}
  if (btnInstall) btnInstall.hidden = false;
  if (!dismissed && installBar) installBar.classList.add('show');
}
function hideInstall(){ installBar && installBar.classList.remove('show'); if (btnInstall) btnInstall.hidden = true; }

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredPrompt = e;
  showInstall();
});

async function doInstall(){
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  try { await deferredPrompt.userChoice; } catch {}
  deferredPrompt = null;
  hideInstall();
}
installGo && installGo.addEventListener('click', doInstall);
btnInstall && btnInstall.addEventListener('click', doInstall);
installNo && installNo.addEventListener('click', () => {
  installBar.classList.remove('show');
  try { localStorage.setItem('mizan-install-dismissed', '1'); } catch {}
});
window.addEventListener('appinstalled', hideInstall);

/* ---- service worker ---- */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
