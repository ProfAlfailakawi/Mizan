/*
 * Display-only wording for technical identifiers.
 *
 * Stored ids, timezones and auth markers never change; these helpers only decide what a
 * person reads. Anything not recognised is returned untouched so a real id is never hidden.
 */

const TIMEZONE_AR: Record<string, string> = {
  'Asia/Kuwait': 'توقيت الكويت',
  'Asia/Riyadh': 'توقيت الرياض',
  'Asia/Dubai': 'توقيت الخليج',
  'Asia/Qatar': 'توقيت قطر',
  'Asia/Bahrain': 'توقيت البحرين',
  'Asia/Muscat': 'توقيت عُمان',
  'Africa/Cairo': 'توقيت القاهرة',
  'Asia/Amman': 'توقيت عمّان',
  'Asia/Baghdad': 'توقيت بغداد',
  'Europe/London': 'توقيت لندن',
  UTC: 'التوقيت العالمي',
};

export function timezoneLabel(tz: string | undefined | null, ar: boolean): string {
  if (!tz) return '';
  return ar ? (TIMEZONE_AR[tz] ?? tz.replace(/^.*\//, '').replace(/_/g, ' ')) : tz;
}

/** «part-demo-238» → «متسابق رقم 238». Unknown shapes come back as they are. */
export function entityIdLabel(id: string | undefined | null, ar: boolean): { text: string; technical: boolean } {
  const raw = String(id ?? '');
  const m = /^part-(?:demo-)?(\d+)$/i.exec(raw);
  if (m) return { text: ar ? `متسابق رقم ${Number(m[1])}` : `Participant no. ${Number(m[1])}`, technical: false };
  return { text: raw, technical: true };
}

/** «sess-demo-…» is a demo session handle, not something to read aloud. */
export function sessionIdLabel(id: string | undefined | null, ar: boolean): string {
  const raw = String(id ?? '');
  if (/^sess-demo-/i.test(raw)) return ar ? 'جلسة تجريبية' : 'Demo session';
  return raw;
}

const AUTH_AR: Record<string, string> = {
  password: 'كلمة مرور', mfa: 'تحقق بخطوتين', sso: 'دخول موحّد', demo: 'جلسة تجريبية', unknown: 'غير محدد',
  single_factor: 'عامل واحد', federated: 'هوية موحّدة',
};
const AUTH_EN: Record<string, string> = {
  password: 'Password', mfa: '2-step verification', sso: 'Single sign-on', demo: 'Demo session', unknown: 'Unknown',
  single_factor: 'Single factor', federated: 'Federated',
};

/** Joins method + assurance without repeating the same word («demo · demo»). */
export function authenticationLabel(method: string | undefined, assurance: string | undefined, ar: boolean): string {
  const map = ar ? AUTH_AR : AUTH_EN;
  const parts = [method, assurance].filter(Boolean).map(v => map[String(v)] ?? String(v));
  return [...new Set(parts)].join(' · ');
}

/** Seconds with an Arabic unit: «45 ث» (Latin digits, per display-format policy). */
export function secondsLabel(n: number, ar: boolean): string {
  return ar ? `${n} ث` : `${n}s`;
}
