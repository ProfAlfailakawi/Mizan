import { getRedirectResult, signInWithPopup, signInWithRedirect, type AuthProvider, type UserCredential } from 'firebase/auth';
import { auth } from './firebase';
import { shouldFallbackToRedirect } from './sso-fallback';

/*
 * الدخول الموحّد: نافذةٌ منبثقة أولًا، وتحويلُ الصفحة حين لا تصلح النافذة.
 *
 * على iPhone وفي المتصفحات المضمَّنة تُحجب النوافذ أو يتعذّر التخزين، فيفشل signInWithPopup
 * برمزٍ من الرموز أدناه. التحويل الكامل (redirect) لا يحتاج نافذة، وتُستأنف نتيجته عند الإقلاع
 * بـ getRedirectResult — ثم يتولى onAuthStateChanged في useMizanAuth بقية المسار
 * (بما فيه تفعيل الدعوة من الـQR).
 */
/** يعيد بيانات الدخول إن اكتمل في النافذة، أو null إن انتقلت الصفحة إلى التحويل. */
export async function signInWithProvider(provider: AuthProvider): Promise<UserCredential | null> {
  try {
    return await signInWithPopup(auth, provider);
  } catch (e) {
    if (!shouldFallbackToRedirect(e)) throw e;
    await signInWithRedirect(auth, provider);
    return null;
  }
}

/** عند الإقلاع: يُنهي دخولًا بدأ بتحويل. لا يرمي — غيابُ نتيجةٍ حالٌ عادية. */
export async function completeRedirectSignIn(): Promise<UserCredential | null> {
  try { return await getRedirectResult(auth); } catch { return null; }
}
