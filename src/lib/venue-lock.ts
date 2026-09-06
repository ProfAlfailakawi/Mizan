/*
 * قفل جهاز القاعة.
 *
 * شاشات القاعة — بوابة الحضور، لوحة الانتظار، خريطة القاعة، البث، الحفل — تُترك على أجهزة
 * في أماكن عامة. وكان الخروج منها زرًّا ظاهرًا يضغطه أي مارّ فيصل إلى النظام كاملًا.
 *
 * القفل هنا يُلغي مخرج الشاشة أصلًا: حين تُقفَل لا تُمرَّر `onClose` فلا يبقى زر ولا Escape.
 * والعودة تحتاج شيئين معًا: **إيماءة لا يعرفها المارّ** (ضغط مطوّل على الشعار) ثم **رمز**.
 * الإيماءة وحدها لا تفتح، والرمز وحده لا يُطلَب إلا بعدها — فلا يظهر للفضولي حقلُ إدخال يجرّبه.
 *
 * الرمز لا يُخزَّن نصًّا: يُحفَظ ملحُه وبصمته فقط. والمحاولات الخاطئة تُبطئ التالية تصاعديًا،
 * فتجربة الأرقام بالتخمين تصير غير عملية على جهاز في قاعة.
 */

export interface VenueLock {
  /** ملح عشوائي لكل قفل، فبصمتان لنفس الرمز على جهازين لا تتطابقان. */
  salt: string;
  pinHash: string;
  lockedAt: string;
  /** اسم الشاشة المقفولة، ليعرف المشرف ما الذي يفتحه. */
  surface: string;
}

export const VENUE_LOCK_STORAGE_KEY = 'mizan_venue_lock_v1';
/** طول الإيماءة الخفية: قصيرة تُكتشف بالصدفة، وطويلة تُتعب المشرف. */
export const UNLOCK_GESTURE_MS = 3000;
export const MIN_PIN_LENGTH = 4;
export const MAX_PIN_LENGTH = 8;

/** رمز صالح: أرقام فقط بطول معقول — لوحة أرقام تُستعمل بإصبع واحد على جهاز لوحي. */
export function isValidPin(pin: string): boolean {
  return new RegExp(`^[0-9]{${MIN_PIN_LENGTH},${MAX_PIN_LENGTH}}$`).test(pin);
}

/** رمز يسهل تخمينه على جهاز عام: متكرّر أو متسلسل. */
export function isWeakPin(pin: string): boolean {
  if (!isValidPin(pin)) return true;
  if (new Set(pin).size === 1) return true;
  const up = pin.split('').every((c, i, a) => i === 0 || Number(c) === Number(a[i - 1]) + 1);
  const down = pin.split('').every((c, i, a) => i === 0 || Number(c) === Number(a[i - 1]) - 1);
  return up || down;
}

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** بصمة الرمز مع ملحه. تعتمد Web Crypto؛ غيابه يمنع القفل بدل أن يخزّن رمزًا ضعيف الحماية. */
export async function hashPin(pin: string, salt: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('VENUE_LOCK_CRYPTO_UNAVAILABLE');
  const bytes = new TextEncoder().encode(`mizan-venue-lock:${salt}:${pin}`);
  return toHex(await subtle.digest('SHA-256', bytes));
}

export function newSalt(): string {
  const a = new Uint8Array(16);
  globalThis.crypto.getRandomValues(a);
  return toHex(a.buffer);
}

export async function createVenueLock(pin: string, surface: string): Promise<VenueLock> {
  if (!isValidPin(pin)) throw new Error('VENUE_LOCK_PIN_INVALID');
  const salt = newSalt();
  return { salt, pinHash: await hashPin(pin, salt), lockedAt: new Date().toISOString(), surface };
}

export async function verifyVenuePin(lock: VenueLock, pin: string): Promise<boolean> {
  if (!isValidPin(pin)) return false;
  return (await hashPin(pin, lock.salt)) === lock.pinHash;
}

/*
 * تباطؤ تصاعدي بعد المحاولات الخاطئة. أول محاولتين بلا انتظار حتى لا يُعاقَب خطأ إصبع،
 * ثم يتضاعف الانتظار إلى سقف دقيقتين — كافٍ لإبطال التخمين، وغير مُعطِّل لمشرف يعرف رمزه.
 */
export function unlockDelayMs(failedAttempts: number): number {
  if (failedAttempts <= 2) return 0;
  return Math.min(120000, 5000 * 2 ** (failedAttempts - 3));
}

export function readVenueLock(storage: Pick<Storage, 'getItem'>): VenueLock | null {
  try {
    const raw = storage.getItem(VENUE_LOCK_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as VenueLock;
    return parsed && typeof parsed.pinHash === 'string' && typeof parsed.salt === 'string' ? parsed : null;
  } catch { return null }
}
export function writeVenueLock(storage: Pick<Storage, 'setItem'>, lock: VenueLock): void {
  try { storage.setItem(VENUE_LOCK_STORAGE_KEY, JSON.stringify(lock)) } catch { /* private mode */ }
}
export function clearVenueLock(storage: Pick<Storage, 'removeItem'>): void {
  try { storage.removeItem(VENUE_LOCK_STORAGE_KEY) } catch { /* private mode */ }
}
