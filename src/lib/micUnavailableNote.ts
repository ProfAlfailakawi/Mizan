import { isAppleNativeShell } from './appleNativeShell';

/** رسالة تعذّر الميكروفون: داخل تطبيق iOS تُوجَّه إلى الإعدادات، وفي المتصفّح تبقى كما هي. */
export function micUnavailableNote(ar: boolean, native: boolean = isAppleNativeShell()): string {
  if (native) {
    return ar
      ? 'الميكروفون غير متاح لتطبيق ميزان. فعّله من الإعدادات ‹ ميزان ‹ الميكروفون ثم أعد المحاولة.'
      : 'The microphone is unavailable to Mizan. Enable it in Settings > Mizan > Microphone and try again.';
  }
  return ar
    ? 'الميكروفون غير متاح في هذا المتصفّح أو في اتصال غير آمن. افتح البطاقة عبر HTTPS في Safari أو Chrome ثم أعد المحاولة.'
    : 'Microphone access is unavailable in this browser or insecure context. Open the journey over HTTPS in Safari or Chrome and try again.';
}
