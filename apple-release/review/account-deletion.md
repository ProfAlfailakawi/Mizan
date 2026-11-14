# حذف الحساب — ملاحظة المراجعة (Guideline 5.1.1(v))

**Note for App Review (EN):** Mizan does not offer open account sign-up. Sign-in accounts for
judges, organisers and staff are provisioned by the organisation that runs a competition: an
administrator issues a single-use, email-bound activation invitation (QR/link), and the invited
person only chooses a password for that invitation. There is no "Create account" screen, and the
app cannot create an account without an invitation. Accounts are therefore managed by the
organisation (Apple permits this for organisation-provisioned accounts), and access is removed by
the organisation's administrator in Identity Governance (the account's access is revoked; the
audit history is kept as required for competition integrity).

**Sign-in methods (EN):** (1) an administrator-issued invitation, (2) email and password, (3) the
organisation's own single sign-on (SAML/OIDC) for staff of organisations that enabled it. Mizan has no
consumer social login (no Google, Facebook, Apple or similar buttons). The organisational SSO is for
business/enterprise accounts, which Guideline 4.8 exempts, so no extra "Sign in with Apple" option is needed.

## ما تم التحقق منه في الشيفرة

- `src/components/auth/AuthPortal.tsx`: لا يوجد مسار تسجيل ذاتي. `createUserWithEmailAndPassword`
  لا يُستدعى إلا في `createInvitedAccount` وبعد قراءة دعوة صالحة (`/api/identity/invitation/preview`)،
  وبالبريد المربوط بالدعوة نفسها، ثم يُفعَّل عبر `/api/identity/activate`.
- لا توجد في التطبيق أي شاشة أخرى لإنشاء حساب دخول.
- `src/components/admin/IdentityGovernance.tsx` + `server/identity-governance.ts`: مدير الجهة يوقف الحساب
  أو يحذف وصوله (DELETE `/api/identity/accounts/:id`) مع إبقاء أثره في سجل التدقيق.
- تسجيل المتسابق في مسابقة (`RegistrationFlow`) ينشئ سجل مشاركة لا حساب دخول، ولا يحتاج المتسابق إلى
  حساب لاستخدامه؛ وجواز ميزان (Passport) يتيح لحامله محو كل ما فيه (انظر MIZAN_COMMERCIAL_IMPLEMENTATION_REPORT.md).

## القرار

لم يُضف زر «حذف حسابي» داخل التطبيق لأن الحسابات تُنشأ بدعوة من الجهة المنظِّمة فقط. إن غيّر المالك
ذلك لاحقًا وفتح تسجيلًا ذاتيًا، يجب إضافة حذف الحساب داخل التطبيق قبل تقديم النسخة.

## سؤال مفتوح للمالك

إذا طلب المراجع حذفًا ذاتيًا رغم ما سبق، فأصغر مسار هو طلب حذف يسجَّل في حوكمة الهويات ويُنفَّذ بالتدقيق
المعتاد. لم يُبنَ لأنه خارج ما اعتُمد.
