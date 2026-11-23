import React, { useEffect, useState } from 'react';
import { BellRing } from 'lucide-react';
import { isNativePushAvailable, readNativePushPermission, registerNativePushToken, rememberNativeToken, rememberedNativeToken, requestNativePushPermission } from '../../lib/nativePush';

type Api = (path: string, init?: RequestInit) => Promise<any>;

/**
 * مفتاح «فعّل التنبيهات» في مركز الإشعارات، داخل تطبيق iOS وحده. لمسة واحدة تفتح نافذة إذن iOS،
 * ثم يُسجَّل توكن الجهاز لدى الخادم فتصل الإشعارات الشخصية إلى شاشة القفل.
 */
export const NativePushSwitch: React.FC<{ api: Api; ar: boolean }> = ({ api, ar }) => {
  const [visible] = useState(isNativePushAvailable);
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  useEffect(() => {
    if (!visible) return;
    let alive = true;
    void (async () => {
      const permission = await readNativePushPermission();
      const known = rememberedNativeToken();
      if (!alive) return;
      if (permission === 'granted' && known) {
        setOn(true);
        // التوكن قد يتغيّر بعد تحديث النظام؛ يُجدَّد بصمت.
        const token = await registerNativePushToken();
        if (token && token !== known) { try { await api('/api/push/subscribe-native', { method: 'POST', body: JSON.stringify({ token }) }); rememberNativeToken(token); } catch { /* المحاولة التالية عند الفتح */ } }
      }
    })();
    return () => { alive = false; };
  }, [visible, api]);
  if (!visible) return null;
  const toggle = async () => {
    setBusy(true); setNote('');
    try {
      if (on) {
        const token = rememberedNativeToken();
        if (token) await api('/api/push/unsubscribe-native', { method: 'POST', body: JSON.stringify({ token }) }).catch(() => undefined);
        rememberNativeToken(''); setOn(false); return;
      }
      const permission = await requestNativePushPermission();
      if (permission !== 'granted') { setNote(ar ? 'التنبيهات موقوفة لهذا التطبيق. يمكن تشغيلها من إعدادات الجهاز.' : 'Notifications are off for this app. You can turn them on in device Settings.'); return; }
      const token = await registerNativePushToken();
      if (!token) { setNote(ar ? 'تعذّر تسجيل الجهاز للتنبيهات. حاول مرة أخرى.' : 'Could not register this device. Please try again.'); return; }
      await api('/api/push/subscribe-native', { method: 'POST', body: JSON.stringify({ token }) });
      rememberNativeToken(token); setOn(true);
    } catch {
      setNote(ar ? 'تعذّر الاتصال بالخادم. حاول مرة أخرى.' : 'Could not reach the server. Please try again.');
    } finally { setBusy(false); }
  };
  return <div className="rounded-2xl border border-[#d8e2dc] bg-white px-4 py-3" data-testid="native-push-switch">
    <div className="flex items-center gap-3">
      <BellRing className="h-5 w-5 shrink-0 text-[color:var(--emerald-2)]" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-black">{ar ? 'فعّل التنبيهات' : 'Turn on notifications'}</div>
        <div className="mt-0.5 text-[11px] text-[#606762]">{ar ? 'تصلك الإشعارات الموجّهة إليك على هذا الجهاز.' : 'Messages addressed to you arrive on this device.'}</div>
      </div>
      <button type="button" role="switch" aria-checked={on} aria-label={ar ? 'فعّل التنبيهات' : 'Turn on notifications'} disabled={busy} onClick={() => void toggle()} className="grid h-11 w-16 shrink-0 place-items-center">
        <span aria-hidden="true" className={`relative block h-8 w-14 rounded-full transition ${on ? 'bg-[var(--emerald)]' : 'bg-[#cfd3d0]'}`}>
          <span className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all ${on ? 'start-7' : 'start-1'}`} />
        </span>
      </button>
    </div>
    {note && <p role="status" className="mt-2 text-[11px] font-bold text-[color:var(--muted)]">{note}</p>}
  </div>;
};
