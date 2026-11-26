/* أولًا: يُركَّب نقل معرّف الصندوق التجريبي قبل أي التقاطٍ لـ window.fetch (انظر lib/demo-transport.ts). */
import './lib/demo-transport';
import {installDuoMarkers} from './lib/duo-markers';
import {installTheme} from './lib/mihrab-theme';
import {installDockMotion} from './lib/dock-motion';
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import './components/dna/dna-theme.css';
import './mushaf-participant-polish.css';
import './beauty-pass.css';
import './elevation.css';
import './motion.css';
import './duo-pattern.css';
import './dock-motion.css';
import './visual-wave.css';
import {ArabicInterfaceGuard} from './components/design-system/ArabicInterfaceGuard';
import {AppErrorBoundary} from './components/design-system/AppErrorBoundary';
import {installStaleShellRecovery,markShellHealthy} from './lib/stale-shell-recovery';
import {installAppUpdate} from './lib/app-update';
import {installInputNormalization} from './lib/input-validation';
import { loadHostBrand } from './lib/host-brand';
import {installUpdatingWatch} from './lib/updating-notice';
/* أثناء النشر تجيب المنصّةُ /api بصفحة خطأ HTML: شريطٌ هادئ «نُحدّث البرنامج» بدل حيرةٍ في الشاشات.
   يُركَّب قبل أي طلب، ويراقب فقط ولا يغيّر جوابًا. */
installUpdatingWatch();
/* علامات iPhone Duo قبل أول رسم، فلا يومض تخطيط الهاتف ثم يتبدّل. */
installDuoMarkers();
/* «وضع المحراب» قبل أول رسم، فلا تومض السمة الفاتحة ثم تنقلب. */
installTheme();
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

/* حركة شريطي التنقّل الرئيسين (بصرية فقط): مؤشّرٌ منزلق وضغطةٌ فورية، على الهاتف والدوو.
   إعداد «حركة أقلّ» داخل ميزان يعمل كتفضيل النظام. */
const mizanReduced = () => document.documentElement.dataset.mizanMotion === 'reduced';
installDockMotion({dock:'nav.mz-el-mnav', link:'button', active:'button[aria-current="page"]', reducedWhen:mizanReduced});
installDockMotion({dock:'.mz-leaf-b > .mizan-tabs', link:'.mizan-tab', active:'.mizan-tab.is-active', reducedWhen:mizanReduced});

if ('serviceWorker' in navigator && import.meta.env.PROD) { window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{})); }

// The shell mounted and the entry chunks resolved: clear the one-shot recovery flag so the next
// deploy can heal the same way.
window.addEventListener('load',()=>markShellHealthy());

/* تشخيص ركن الودجت (iPhone Duo): يُحمَّل فقط حين يوجد `?duo-debug=1`، فلا يدخل في الحزمة الرئيسية. */
if (/[?&]duo-debug=1\b/.test(window.location.search)) void import('./lib/duo-debug').then(m => m.mountDuoDebug());
