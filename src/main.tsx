import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import {ArabicInterfaceGuard} from './components/design-system/ArabicInterfaceGuard';
import {installStaleShellRecovery,markShellHealthy} from './lib/stale-shell-recovery';
import {installAppUpdate} from './lib/app-update';
import {installInputNormalization} from './lib/input-validation';

// Must run before the first lazy route resolves, so a chunk minted by a previous deploy can
// recover instead of leaving a venue screen blank.
installStaleShellRecovery();
installInputNormalization();

// التحديث الذاتي الصامت: منارة الإصدار، ثم التحديث، ثم التصعيد إلى مسح كامل عند اللزوم.
// تعافي الحزم المفقودة يبقى في وحدته أعلاه، فلا يُركَّب مرتين.
installAppUpdate({chunkRecovery:false});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ArabicInterfaceGuard/>
    <App />
  </StrictMode>,
);

if ('serviceWorker' in navigator && import.meta.env.PROD) { window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{})); }

// The shell mounted and the entry chunks resolved: clear the one-shot recovery flag so the next
// deploy can heal the same way.
window.addEventListener('load',()=>markShellHealthy());
