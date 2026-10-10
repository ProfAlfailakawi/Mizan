import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import './components/dna/dna-theme.css';
import './mushaf-participant-polish.css';
import './beauty-pass.css';
import {ArabicInterfaceGuard} from './components/design-system/ArabicInterfaceGuard';
import {AppErrorBoundary} from './components/design-system/AppErrorBoundary';
import {installStaleShellRecovery,markShellHealthy} from './lib/stale-shell-recovery';
import {installAppUpdate} from './lib/app-update';
import {installInputNormalization} from './lib/input-validation';
import { loadHostBrand } from './lib/host-brand';
/* علامة المضيف تُجلب قبل أول رسم، فلا تومض «ميزان» على نطاق مشغّلٍ بعلامة بيضاء. */
loadHostBrand();

// Must run before the first lazy route resolves, so a chunk minted by a previous deploy can
// recover instead of leaving a venue screen blank.
// إعلان الإقلاع لحارس index.html: وصلت الحزمة وعملت، فلا حاجة لتعافي الغلاف.
(window as unknown as { __MIZAN_BOOTED?: boolean }).__MIZAN_BOOTED = true;
installStaleShellRecovery();
installInputNormalization();

// التحديث الذاتي الصامت: منارة الإصدار، ثم التحديث، ثم التصعيد إلى مسح كامل عند اللزوم.
// تعافي الحزم المفقودة يبقى في وحدته أعلاه، فلا يُركَّب مرتين.
installAppUpdate({chunkRecovery:false});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ArabicInterfaceGuard/>
    {/* الحارس يلفّ التطبيق كله: استثناء في أي شاشة كان يُسقط الشجرة إلى فراغ أبيض صامت. */}
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>,
);

if ('serviceWorker' in navigator && import.meta.env.PROD) { window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{})); }

// The shell mounted and the entry chunks resolved: clear the one-shot recovery flag so the next
// deploy can heal the same way.
window.addEventListener('load',()=>markShellHealthy());
