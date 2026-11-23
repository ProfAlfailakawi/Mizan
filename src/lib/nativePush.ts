/**
 * تنبيهات النظام (APNs) داخل تطبيق iOS. الصفحة تُحمَّل من الموقع داخل WKWebView حيث لا
 * Service Worker، فنكلّم إضافة @capacitor/push-notifications المسجّلة في التطبيق عبر الجسر.
 * خارج التطبيق تعيد الدوال "unsupported" ولا تفعل شيئًا.
 */
export type NativePushPermission = 'granted' | 'denied' | 'default' | 'unsupported';

type Handle = { remove: () => Promise<void> };
type PushPlugin = {
  checkPermissions: () => Promise<{ receive: string }>;
  requestPermissions: () => Promise<{ receive: string }>;
  register: () => Promise<void>;
  addListener: (event: string, cb: (payload: any) => void) => Promise<Handle>;
};

const getPlugin = (): PushPlugin | null => {
  try {
    const cap = (globalThis as any).window?.Capacitor;
    if (!cap?.isNativePlatform?.() || cap.getPlatform?.() !== 'ios') return null;
    return (cap.Plugins?.PushNotifications as PushPlugin) || null;
  } catch {
    return null;
  }
};

export const isNativePushAvailable = (): boolean => !!getPlugin();

const mapPermission = (value: string | undefined): NativePushPermission => value === 'granted' ? 'granted' : value === 'denied' ? 'denied' : 'default';

export async function readNativePushPermission(): Promise<NativePushPermission> {
  const plugin = getPlugin();
  if (!plugin) return 'unsupported';
  try { return mapPermission((await plugin.checkPermissions()).receive); } catch { return 'unsupported'; }
}

/** نافذة الإذن الأصلية في iOS إن لم يُحسم بعد. لا تسأل مرتين. */
export async function requestNativePushPermission(): Promise<NativePushPermission> {
  const plugin = getPlugin();
  if (!plugin) return 'unsupported';
  try {
    const current = await readNativePushPermission();
    if (current !== 'default') return current;
    return mapPermission((await plugin.requestPermissions()).receive);
  } catch {
    return 'unsupported';
  }
}

/** يسجّل الجهاز لدى APNs ويعيد توكنه (hex)، أو "" عند الفشل أو انتهاء المهلة. */
export async function registerNativePushToken(timeoutMs = 15000): Promise<string> {
  const plugin = getPlugin();
  if (!plugin) return '';
  const handles: Handle[] = [];
  try {
    return await new Promise<string>(resolve => {
      const timer = setTimeout(() => resolve(''), timeoutMs);
      const done = (value: string) => { clearTimeout(timer); resolve(value); };
      void (async () => {
        try {
          handles.push(await plugin.addListener('registration', (t: any) => done(String(t?.value || ''))));
          handles.push(await plugin.addListener('registrationError', () => done('')));
          await plugin.register();
        } catch { done(''); }
      })();
    });
  } finally {
    await Promise.all(handles.map(h => h.remove().catch(() => undefined)));
  }
}

const TOKEN_KEY = 'mizan.nativePushToken';
export const rememberedNativeToken = (): string => { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; } };
export const rememberNativeToken = (token: string) => { try { if (token) localStorage.setItem(TOKEN_KEY, token); else localStorage.removeItem(TOKEN_KEY); } catch { /* اختياري */ } };

/**
 * الرابط الذي يحمله التنبيه يُفتح داخل التطبيق: "#..." يغيّر المسار، و"/..." مسار من الموقع نفسه.
 * لا يُتبع أي رابط خارجي.
 */
export function navigateToPushUrl(url: unknown, loc: { hash: string; assign: (u: string) => void } = window.location): boolean {
  const href = typeof url === 'string' ? url.trim() : '';
  if (href.startsWith('#')) { loc.hash = href.slice(1); return true; }
  if (href.startsWith('/') && !href.startsWith('//')) { loc.assign(href); return true; }
  return false;
}

let installed = false;
/** عند لمس التنبيه (والتطبيق مغلق أو في الخلفية) يُفتح رابطه. يُستدعى مرة عند الإقلاع. */
export function installNativePushNavigation(): void {
  const plugin = getPlugin();
  if (!plugin || installed) return;
  installed = true;
  void plugin.addListener('pushNotificationActionPerformed', (event: any) => {
    const data = event?.notification?.data || {};
    navigateToPushUrl(data.url);
  }).catch(() => { installed = false; });
}
