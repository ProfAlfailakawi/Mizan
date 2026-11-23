/*
 * حذف الحساب بطلب صاحبه (App Store 5.1.1(v)) — منطق التسلسل وحده، بلا واجهة، ليُختبر بلا Firebase.
 *
 * الترتيب:
 *   ١) إن أُعطيت كلمة مرور: إعادة مصادقة أولًا (الخادم يشترط دخولًا خلال خمس دقائق).
 *   ٢) طلب الحذف من الخادم برمز محدَّث: يمحو البيانات الشخصية ويحذف حساب الدخول إن استطاع.
 *   ٣) إن لم يستطع الخادم حذف حساب الدخول (بيئة بلا اعتماد إداري) يحذفه العميل بنفسه،
 *      فإن ردّ Firebase بـ auth/requires-recent-login طُلبت كلمة المرور ثم يُعاد التسلسل.
 *   ٤) الخروج من الجلسة في كل نجاح.
 * وإعادة التسلسل آمنة: محوٌ تمّ لا يُعاد ضرره، والخادم يعدّ غياب الحساب نجاحًا.
 */

export type AccountDeletionDeps = {
  reauthWithPassword(password: string): Promise<void>;
  freshToken(): Promise<string>;
  requestServerDeletion(token: string): Promise<{ status: number; body: { code?: string; authDeleted?: boolean } }>;
  deleteAuthUserOnClient(): Promise<void>;
  signOut(): Promise<void>;
};

export type AccountDeletionOutcome =
  | { status: 'DONE' }
  | { status: 'NEEDS_PASSWORD'; wrongPassword?: boolean }
  | { status: 'ERROR'; code: string };

const codeOf = (error: unknown) => String((error as { code?: string })?.code || (error instanceof Error ? error.message : '') || 'UNKNOWN');

export async function deleteOwnAccount(deps: AccountDeletionDeps, password?: string): Promise<AccountDeletionOutcome> {
  if (password) {
    try { await deps.reauthWithPassword(password); }
    catch (error) {
      const code = codeOf(error);
      if (['auth/wrong-password', 'auth/invalid-credential', 'auth/invalid-login-credentials'].includes(code)) return { status: 'NEEDS_PASSWORD', wrongPassword: true };
      return { status: 'ERROR', code };
    }
  }
  let response: Awaited<ReturnType<AccountDeletionDeps['requestServerDeletion']>>;
  try { response = await deps.requestServerDeletion(await deps.freshToken()); }
  catch (error) { return { status: 'ERROR', code: codeOf(error) === 'UNKNOWN' ? 'NETWORK' : codeOf(error) }; }
  if (response.status === 401 && response.body?.code === 'REQUIRES_RECENT_LOGIN') return { status: 'NEEDS_PASSWORD' };
  if (response.status < 200 || response.status >= 300) return { status: 'ERROR', code: response.body?.code || `HTTP_${response.status}` };
  if (!response.body?.authDeleted) {
    try { await deps.deleteAuthUserOnClient(); }
    catch (error) {
      const code = codeOf(error);
      if (code === 'auth/requires-recent-login') return { status: 'NEEDS_PASSWORD' };
      if (code !== 'auth/user-not-found') return { status: 'ERROR', code };
    }
  }
  try { await deps.signOut(); } catch { /* الحساب حُذف؛ إعادة التحميل تُنهي ما تبقى */ }
  return { status: 'DONE' };
}

/** نصوص الأخطاء بالعربية الفصحى. */
export function accountDeletionErrorText(code: string, ar: boolean): string {
  const map: Record<string, [string, string]> = {
    LAST_ORG_ADMIN_PROTECTED: ['أنت آخر مدير فعّال لهذه الجهة. عيِّن مديرًا آخر للجهة أولًا، ثم أعد طلب الحذف.', 'You are the last active administrator of this organisation. Appoint another administrator first, then try again.'],
    PLATFORM_OWNER_SELF_DELETE_BLOCKED: ['حساب مالك المنصة لا يُحذف من هنا. تواصل مع دعم ميزان لنقل الملكية ثم الحذف.', 'The platform owner account cannot be deleted here. Contact MIZAN support to transfer ownership first.'],
    NETWORK: ['تعذّر الاتصال بالخادم. تحقّق من الاتصال ثم أعد المحاولة.', 'Could not reach the server. Check your connection and try again.'],
    NO_USER: ['لا توجد جلسة دخول. سجّل الدخول ثم أعد المحاولة.', 'No signed-in session. Sign in and try again.'],
    NO_PASSWORD_PROVIDER: ['حسابك يدخل عبر دخول الجهة الموحّد. سجّل الخروج ثم ادخل من جديد، وأعد طلب الحذف خلال خمس دقائق.', 'Your account signs in through your organisation. Sign out, sign in again, then repeat the deletion within five minutes.'],
  };
  const hit = map[code];
  if (hit) return ar ? hit[0] : hit[1];
  return ar ? `تعذّر حذف الحساب (${code}). أعد المحاولة، أو تواصل مع مدير جهتك.` : `Account deletion failed (${code}). Try again or contact your organisation's administrator.`;
}
