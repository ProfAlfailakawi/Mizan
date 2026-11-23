# حذف الحساب — ملاحظة المراجعة (Guideline 5.1.1(v))

**Note for App Review (EN):** Mizan does not offer open account sign-up. Sign-in accounts for
judges, organisers and staff are provisioned by the organisation that runs a competition: an
administrator issues a single-use, email-bound activation invitation (QR/link), and the invited
person only chooses a password for that invitation. There is no "Create account" screen, and the
app cannot create an account without an invitation. Accounts are therefore managed by the
organisation (Apple permits this for organisation-provisioned accounts), and access is removed by
the organisation's administrator in Identity Governance (the account's access is revoked; the
audit history is kept as required for competition integrity). In addition, every signed-in user can
delete their own account inside the app (see the updated decision below).

**Sign-in methods (EN):** (1) an administrator-issued invitation, (2) email and password, (3) the
organisation's own single sign-on (SAML/OIDC) for staff of organisations that enabled it. Mizan has no
consumer social login (no Google, Facebook, Apple or similar buttons). The organisational SSO is for
business/enterprise accounts, which Guideline 4.8 exempts, so no extra "Sign in with Apple" option is needed.

## ما تم التحقق منه في الشيفرة

- `src/components/auth/AuthPortal.tsx`: لا يوجد مسار تسجيل ذاتي. `createUserWithEmailAndPassword`
  لا يُستدعى إلا في `createInvitedAccount` وبعد قراءة دعوة صالحة (`/api/identity/invitation/preview`)،
  وبالبريد المربوط بالدعوة نفسها، ثم يُفعَّل عبر `/api/identity/activate`.
- لا توجد في التطبيق أي شاشة أخرى لإنشاء حساب دخول.
- `src/components/auth/AccountDeletion.tsx`: حذف الحساب بطلب صاحبه (انظر القرار أدناه).
- `src/components/admin/IdentityGovernance.tsx` + `server/identity-governance.ts`: مدير الجهة يوقف الحساب
  أو يحذف وصوله (DELETE `/api/identity/accounts/:id`) مع إبقاء أثره في سجل التدقيق.
- تسجيل المتسابق في مسابقة (`RegistrationFlow`) ينشئ سجل مشاركة لا حساب دخول، ولا يحتاج المتسابق إلى
  حساب لاستخدامه؛ وجواز ميزان (Passport) يتيح لحامله محو كل ما فيه (انظر MIZAN_COMMERCIAL_IMPLEMENTATION_REPORT.md).

## القرار (محدَّث): حذف الحساب داخل التطبيق متاح

**Note for App Review (EN):** In-app account deletion is available to every signed-in user, in the browser
and in the iOS app alike: tap the person icon ("My account / حسابي") in the top bar, then "Delete my account /
حذف حسابي". A confirmation screen explains what is deleted and what is kept anonymised. If the sign-in is older
than five minutes the app asks for the password again, then the server erases the personal data, deletes the
Firebase sign-in account, and the user is signed out.

- **المسار:** زر «حسابي» (أيقونة الشخص) في الترويسة بجانب زر الخروج — وفي شريط شاشة البث كذلك — ثم «حذف حسابي». نقرتان.
- **التأكيد:** شاشة بالعربية الفصحى تبيّن ما يُحذف وما يُحفظ مجهّلًا وأن الحذف لا رجعة فيه، ثم زر «نعم، احذف حسابي نهائيًا».
- **إعادة المصادقة:** الخادم يرفض الطلب برمز `REQUIRES_RECENT_LOGIN` إن كان الدخول أقدم من خمس دقائق، وكذلك
  `auth/requires-recent-login` من Firebase؛ في الحالتين تُطلب كلمة المرور (`reauthenticateWithCredential`) ثم يُعاد الطلب.
  حساب الدخول الموحّد للجهة (بلا كلمة مرور) يُطلب منه الخروج والدخول ثم إعادة الطلب.
- **الخادم:** `POST /api/identity/me/delete` (`server.ts`) ← `IdentityGovernanceRepository.selfDelete`
  و`NotificationCenterRepository.purgeUser` و`deleteFirebaseAuthUser` (حزمة الإدارة). إن لم يتوفر اعتماد الإدارة
  حذف العميل حساب الدخول بنفسه (`deleteUser`).
- **ما يُحذف:** حساب الدخول في Firebase Authentication، والبريد والاسم في سجل الهويات، وأسماء الأجهزة، وطلبات
  تغيير كلمة المرور، والدعوات المرتبطة بالبريد (ورموز تفعيلها)، والإشعارات الشخصية وحالات قراءتها. وتُسحب كل
  التخويلات والجلسات فورًا.
- **ما يُحفظ مجهّلًا:** سجل التدقيق المتسلسل وسجلات المسابقة في Firestore (التحكيم، النتائج، الاعتراضات،
  الشهادات) أدلة نزاهة تملكها الجهة المنظِّمة، فتبقى بمعرّف مبهم بلا اسم ولا بريد. ويُسجَّل الحذف نفسه في
  التدقيق بالحدث `IDENTITY_ACCOUNT_SELF_DELETED`.
- **ما يُمنع:** آخر مدير فعّال لجهة (`LAST_ORG_ADMIN_PROTECTED`) يُطلب منه تعيين مدير آخر أولًا، وحساب مالك
  المنصة لا يُحذف من الواجهة؛ وتظهر الرسالة بوضوح.
- **الاختبارات:** `tests/account-self-deletion.test.ts` (مجلدات مؤقتة وبدائل وهمية، بلا Firebase حقيقي).
- البيئة التجريبية لا تحمل حسابًا حقيقيًا، فتعرض بدل الزر شرحًا أن الخروج يمحوها.
