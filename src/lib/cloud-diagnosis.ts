/*
 * تشخيص الوضع السحابي.
 *
 * «الوضع بالسحابة ما يشتغل» ليست عطلًا واحدًا: بينك وبين أول كتابة ناجحة ستّ حلقات، وكلُّ
 * واحدة منها تفشل بطريقةٍ تُخرج الرسالة نفسها — «تعذّرت المزامنة». فيقف المشغّل أمام جملةٍ
 * لا تقول له أيّ حلقة انقطعت ولا مَن يصلحها، ويجرّب بالتخمين.
 *
 * والحلقات بترتيبها، فكلٌّ منها تفترض ما قبلها:
 *   ١) هل بُني التطبيق بمفاتيح Firebase أصلًا؟ (VITE_FIREBASE_*)
 *   ٢) هل الجهاز متصل، أم أُدخل وضع الانقطاع عمدًا؟
 *   ٣) هل صاحب الشاشة مسجَّل دخولًا فعلًا؟
 *   ٤) هل يحمل رمزه مطالبات القواعد (role, org_id, competition_id)؟ — هذه أكثرها وقوعًا:
 *      حسابٌ مخوَّل في سجلّ ميزان ورمزُه خالٍ من المطالبات، فترفضه قواعد Firestore وهو
 *      «مخوَّل» في كل شاشة يراها.
 *   ٥) هل يستطيع الخادم كتابة المطالبات أصلًا؟ (FIREBASE_PROJECT_ID + اعتماد افتراضي)
 *      فإن لم يستطع، لن يُصلح زرُّ الإصلاح شيئًا مهما ضُغط، والعلّة في النشر لا في الحساب.
 *   ٦) هل تسمح المطالبة الحاضرة بالكتابة على هذه المسابقة بعينها؟
 *
 * الوحدة نقيّة عمدًا: لا Firestore ولا متصفّح ولا حالة عامّة. تأخذ ما رُصد وتقول أين
 * انقطع الخيط وبأي لغة يُقال لصاحبه — فتُختبر بتشغيلها لا بقراءتها.
 */

export type CloudCheckId =
  | 'client_config' | 'connectivity' | 'signed_in' | 'token_claims'
  | 'server_claims_writable' | 'competition_scope' | 'last_write';

export type CloudCheckState = 'ok' | 'blocked' | 'warning' | 'unknown';

export interface CloudCheck {
  id: CloudCheckId;
  state: CloudCheckState;
  titleAr: string;
  titleEn: string;
  detailAr: string;
  detailEn: string;
  /** من يصلحها: صاحب الشاشة، أو مدير الجهة، أو من ينشر الخادم. */
  ownerAr: string;
  ownerEn: string;
  /** هل يُصلحها زرّ «أعد كتابة مطالباتي» في هذه الشاشة؟ */
  repairable?: boolean;
}

export interface CloudDiagnosisInput {
  /**
   * هل بُني التطبيق بمفتاح Firebase **ومعرّف المشروع** معًا؟
   *
   * المفتاح وحده لا يكفي ولا يُوقِف الإقلاع: `firebase.ts` يرفض غياب المفتاح وحده، فبناءٌ
   * فيه المفتاح بلا معرّف مشروع يُقلع سليمًا ظاهريًا بينما لا عنوان لفايرستور يُكتب إليه.
   * وهذه بالضبط حالة البناء الناقص التي وُجد هذا الفحص ليكشفها، فلا يجوز أن يُمرّرها.
   */
  clientConfigured: boolean;
  /** معرّف المشروع كما بُني به، إن وُجد. غيابه وحده يكفي لإسقاط الفحص الأول. */
  clientProjectId?: string;
  /** وضع الانقطاع مُفعَّل يدويًا في «الاستمرارية». */
  offlineMode: boolean;
  /** اتصال المتصفح بالشبكة، إن أمكن قراءته. */
  browserOnline?: boolean;
  signedIn: boolean;
  /** مطالبات الرمز كما وصلت — لا كما يفترضها ميزان. */
  tokenClaims?: { role?: string; org_id?: string; competition_id?: string; competition_ids?: string[] };
  /** من `/api/health`: هل الخادم مهيَّأ لكتابة المطالبات؟ غياب القيمة = لم يُسأل بعد. */
  serverClaimsWritable?: boolean;
  serverReachable?: boolean;
  /** المسابقة والجهة اللتان يحاول هذا الجهاز الكتابة عليهما. */
  organizationId?: string;
  competitionId?: string;
  /** آخر عطل مزامنة سُجِّل، إن وُجد. */
  lastError?: { code: string; message: string; at?: string };
}

const ROLE_NEEDS_COMPETITION = new Set([
  'comp_admin', 'head_judge', 'judge', 'ops_manager', 'exception_host',
  'delegation_manager', 'participant', 'broadcast_operator', 'auditor', 'guardian',
]);

const OPERATOR = { ar: 'من ينشر الخادم', en: 'Whoever deploys the server' };
const ORG_ADMIN = { ar: 'مدير الجهة', en: 'The organization admin' };
const SELF = { ar: 'أنت من هذه الشاشة', en: 'You, from this screen' };

const check = (
  id: CloudCheckId, state: CloudCheckState,
  titleAr: string, titleEn: string, detailAr: string, detailEn: string,
  owner: { ar: string; en: string }, repairable = false,
): CloudCheck => ({ id, state, titleAr, titleEn, detailAr, detailEn, ownerAr: owner.ar, ownerEn: owner.en, repairable });

/**
 * الفحص كاملًا، بالترتيب. لا يتوقّف عند أول عطل: المشغّل يريد أن يرى الصورة كلها مرة
 * واحدة، لا أن يُصلح حلقةً ليُكشف له عن التالية.
 */
export function diagnoseCloud(input: CloudDiagnosisInput): { checks: CloudCheck[]; blocked: number; ready: boolean } {
  const checks: CloudCheck[] = [];

  // ١ — مفاتيح البناء
  /* المفتاح والمعرّف كلاهما شرط. بناءٌ بأحدهما دون الآخر يُقلع ولا يكتب، فيُسمّى ناقصًا لا سليمًا. */
  const configured = input.clientConfigured && !!input.clientProjectId;
  checks.push(configured
    ? check('client_config', 'ok', 'مفاتيح Firebase', 'Firebase keys',
        `التطبيق مبنيٌّ على المشروع ${input.clientProjectId}.`,
        `Built against project ${input.clientProjectId}.`, OPERATOR)
    : check('client_config', 'blocked', 'مفاتيح Firebase', 'Firebase keys',
        input.clientConfigured
          ? 'المفتاح موجود ومعرّف المشروع غائب، فلا عنوان لفايرستور يُكتب إليه — ويُقلع التطبيق رغم ذلك فيبدو سليمًا. اضبط VITE_FIREBASE_PROJECT_ID في بيئة البناء ثم أعد النشر؛ ضبطها بعد البناء لا ينفع.'
          : 'لم يُبنَ هذا التطبيق بمفاتيح Firebase؛ لا سحابة أصلًا. تُضبط VITE_FIREBASE_API_KEY و VITE_FIREBASE_PROJECT_ID في بيئة البناء ثم يُعاد النشر — ولا ينفع ضبطها بعد البناء.',
        input.clientConfigured
          ? 'The API key is present but the project id is missing, so there is no Firestore project to address — and the app still boots, which makes it look healthy. Set VITE_FIREBASE_PROJECT_ID in the build environment and redeploy; setting it afterwards has no effect.'
          : 'This build carries no Firebase keys, so there is no cloud to reach. Set VITE_FIREBASE_API_KEY and VITE_FIREBASE_PROJECT_ID in the build environment and redeploy; setting them after the build has no effect.', OPERATOR));

  // ٢ — الاتصال
  checks.push(input.offlineMode
    ? check('connectivity', 'warning', 'الاتصال', 'Connectivity',
        'وضع الانقطاع مُفعَّل يدويًا، فالرفع متوقّف بقرارٍ لا بعطل. عملك محفوظ على الجهاز ويُرفع فور استعادة الاتصال من «الاستمرارية».',
        'Offline mode is switched on by hand, so uploads are paused by choice, not by fault. Work is kept on the device and uploads once you reconnect from Continuity.', SELF)
    : input.browserOnline === false
      ? check('connectivity', 'blocked', 'الاتصال', 'Connectivity',
          'الجهاز بلا شبكة. ميزان يواصل العمل محليًا ويرفع ما تأخّر عند عودة الشبكة.',
          'This device has no network. Mizan keeps working locally and uploads the backlog when the network returns.', SELF)
      : check('connectivity', 'ok', 'الاتصال', 'Connectivity', 'الجهاز متصل والرفع مسموح.', 'The device is online and uploads are allowed.', SELF));

  // ٣ — تسجيل الدخول
  checks.push(input.signedIn
    ? check('signed_in', 'ok', 'جلسة الدخول', 'Sign-in', 'هناك جلسة دخول قائمة على هذا الجهاز.', 'A signed-in session exists on this device.', SELF)
    : check('signed_in', 'blocked', 'جلسة الدخول', 'Sign-in',
        'لا جلسة دخول. الكتابة إلى السحابة لا تتم من حسابٍ مجهول إطلاقًا — سجّل الدخول ليُرفع ما على الجهاز.',
        'No signed-in session. Mizan never writes to the cloud anonymously — sign in so the device backlog uploads.', SELF));

  // ٤ — مطالبات الرمز: أكثر الأعطال وقوعًا وأقلّها وضوحًا
  const claims = input.tokenClaims;
  const hasRole = !!claims?.role;
  const hasOrg = !!claims?.org_id;
  if (!input.signedIn) {
    checks.push(check('token_claims', 'unknown', 'مطالبات الصلاحية', 'Permission claims',
      'تُقرأ بعد تسجيل الدخول.', 'Read after sign-in.', SELF));
  } else if (hasRole && hasOrg) {
    const scope = claims?.competition_id || (claims?.competition_ids?.length ? claims.competition_ids.join('، ') : '');
    checks.push(check('token_claims', 'ok', 'مطالبات الصلاحية', 'Permission claims',
      `رمز الدخول يحمل الدور «${claims!.role}» والجهة «${claims!.org_id}»${scope ? ` والمسابقة «${scope}»` : ''}.`,
      `The token carries role “${claims!.role}”, organization “${claims!.org_id}”${scope ? `, competition “${scope}”` : ''}.`, SELF));
  } else {
    /*
     * الإصلاح يُعرض فقط حين يكون ممكنًا.
     *
     * حين يكون الخادم عاجزًا عن كتابة المطالبات أصلًا، يعود كلُّ ضغطٍ على زرّ الإصلاح
     * بـ IDENTITY_CLAIMS_NOT_CONFIGURED حتمًا. وزرٌّ يُعرض ليُضغط ثم يفشل دائمًا أسوأ من
     * غيابه: يُشغل المشغّل عن العلّة الحقيقية — وهي في النشر — ويوهمه أن العطل في حسابه.
     */
    const repairPossible = input.serverClaimsWritable !== false;
    checks.push(check('token_claims', 'blocked', 'مطالبات الصلاحية', 'Permission claims',
      repairPossible
        ? 'رمز دخولك لا يحمل الدور والجهة، وقواعد Firestore لا تقرأ إلا الرمز. فحسابك مخوَّل في سجلّ ميزان ومرفوضٌ عند السحابة في آنٍ واحد — وهذا سبب «تعذّرت المزامنة» في أغلب الحالات. يُصلَح بإعادة كتابة المطالبات من التخويل نفسه، دون منح أي صلاحية جديدة.'
        : 'رمز دخولك لا يحمل الدور والجهة، وقواعد Firestore لا تقرأ إلا الرمز. ولا يُصلح ذلك من هذه الشاشة ما دام الخادم عاجزًا عن كتابة المطالبات (انظر الفحص التالي): عالِج النشر أولًا ثم أعد المحاولة.',
      repairPossible
        ? 'Your token carries no role or organization, and the Firestore rules read nothing but the token. So the account is authorized in Mizan’s registry and refused by the cloud at the same time — the usual cause of “sync failed”. Rewriting the claims from that same grant fixes it, granting nothing new.'
        : 'Your token carries no role or organization, and the Firestore rules read nothing but the token. This screen cannot fix it while the server cannot write claims at all (see the next check): fix the deployment first, then try again.',
      repairPossible ? SELF : OPERATOR, repairPossible));
  }

  // ٥ — هل يستطيع الخادم كتابتها أصلًا؟
  if (input.serverReachable === false) {
    checks.push(check('server_claims_writable', 'warning', 'كتابة المطالبات على الخادم', 'Server claim writing',
      'تعذّر سؤال الخادم. لا يُحكم على هذه الحلقة من حالة الجهاز وحده.',
      'The server could not be asked, and this link is never judged from the device state alone.', OPERATOR));
  } else if (input.serverClaimsWritable === undefined) {
    checks.push(check('server_claims_writable', 'unknown', 'كتابة المطالبات على الخادم', 'Server claim writing',
      'لم يُسأل الخادم بعد.', 'The server has not been asked yet.', OPERATOR));
  } else if (input.serverClaimsWritable) {
    checks.push(check('server_claims_writable', 'ok', 'كتابة المطالبات على الخادم', 'Server claim writing',
      'الخادم مهيَّأ لكتابة مطالبات الحسابات، فزرّ الإصلاح يعمل فعلًا.',
      'The server can write account claims, so the repair button does real work.', OPERATOR));
  } else {
    checks.push(check('server_claims_writable', 'blocked', 'كتابة المطالبات على الخادم', 'Server claim writing',
      'الخادم لا يستطيع كتابة المطالبات: ينقصه FIREBASE_PROJECT_ID أو اعتمادُ التشغيل الافتراضي (Application Default Credentials) وصلاحية Firebase Authentication Admin. وما دامت هذه ناقصة فلن يُصلح زرُّ الإصلاح شيئًا مهما ضُغط، ولن يعمل الوضع السحابي لأي حساب جديد — العلّة في النشر لا في الحساب.',
      'The server cannot write claims: it is missing FIREBASE_PROJECT_ID, or Application Default Credentials with the Firebase Authentication Admin role. Until that is fixed the repair button cannot help anyone and cloud mode will fail for every new account — the fault is in the deployment, not the account.', OPERATOR));
  }

  // ٦ — هل تغطّي المطالبة هذه المسابقة بعينها؟
  const role = claims?.role || '';
  if (!input.signedIn || !hasRole) {
    checks.push(check('competition_scope', 'unknown', 'نطاق المسابقة', 'Competition scope',
      'يُقرأ بعد وصول المطالبات.', 'Read once the claims arrive.', ORG_ADMIN));
  } else if (input.organizationId && claims?.org_id && claims.org_id !== input.organizationId && role !== 'super_admin') {
    checks.push(check('competition_scope', 'blocked', 'نطاق المسابقة', 'Competition scope',
      `رمزك يخصّ الجهة «${claims.org_id}» وهذه المسابقة تتبع «${input.organizationId}». القواعد ترفض الكتابة عبر الجهات، ولا يُصلح ذلك إلا بتخويلٍ على الجهة الصحيحة.`,
      `Your token is scoped to organization “${claims.org_id}” while this competition belongs to “${input.organizationId}”. The rules refuse cross-organization writes; only a grant on the right organization fixes it.`, ORG_ADMIN));
  } else if (ROLE_NEEDS_COMPETITION.has(role) && input.competitionId && role !== 'super_admin') {
    const named = claims?.competition_id === input.competitionId || (claims?.competition_ids || []).includes(input.competitionId);
    checks.push(named
      ? check('competition_scope', 'ok', 'نطاق المسابقة', 'Competition scope',
          'رمزك يسمّي هذه المسابقة، فالكتابة عليها مسموحة.', 'Your token names this competition, so writes to it are allowed.', ORG_ADMIN)
      : check('competition_scope', 'blocked', 'نطاق المسابقة', 'Competition scope',
          `دورك «${role}» يشترط أن يسمّي رمزُك المسابقة، ورمزك لا يسمّي «${input.competitionId}». إن كان تخويلك على هذه المسابقة صحيحًا فإعادة كتابة المطالبات تكفي؛ وإلا فالتخويل نفسه على مسابقة أخرى.`,
          `Your role “${role}” requires the token to name the competition, and yours does not name “${input.competitionId}”. If your grant is on this competition, rewriting the claims is enough; otherwise the grant itself points elsewhere.`,
          input.serverClaimsWritable === false ? OPERATOR : SELF, input.serverClaimsWritable !== false));
  } else {
    checks.push(check('competition_scope', 'ok', 'نطاق المسابقة', 'Competition scope',
      'دورك لا يُقيَّد بمسابقة بعينها.', 'Your role is not restricted to a single competition.', ORG_ADMIN));
  }

  // ٧ — آخر عطل مرصود، بنصّه لا بتأويله
  if (input.lastError) {
    const size = input.lastError.code === 'CLOUD_PAYLOAD_TOO_LARGE';
    checks.push(check('last_write', 'blocked', 'آخر محاولة رفع', 'Last upload attempt',
      size
        ? `تجاوزت الحمولة حدّ المستند في Firestore (1 ميغابايت). ${input.lastError.message}`
        : input.lastError.message,
      input.lastError.message,
      size ? OPERATOR : SELF, input.lastError.code === 'CLOUD_PERMISSION_DENIED' && input.serverClaimsWritable !== false));
  } else {
    checks.push(check('last_write', 'ok', 'آخر محاولة رفع', 'Last upload attempt',
      'لا عطل مزامنة مسجَّل على هذا الجهاز.', 'No sync failure is recorded on this device.', SELF));
  }

  const blocked = checks.filter(x => x.state === 'blocked').length;
  return { checks, blocked, ready: blocked === 0 };
}

/**
 * خلاصة بسطر واحد. تُقال في أعلى الشاشة قبل التفاصيل، فمن لا يريد قراءة سبعة فحوص
 * يعرف في ثانية أين العطل ومن يصلحه.
 */
export function summariseCloud(result: ReturnType<typeof diagnoseCloud>, arabic: boolean): string {
  const first = result.checks.find(x => x.state === 'blocked');
  if (!first) return arabic ? 'الوضع السحابي سليم: كل حلقات الرفع متصلة.' : 'Cloud mode is healthy: every link in the upload chain is connected.';
  return arabic
    ? `العطل في «${first.titleAr}» — ${first.ownerAr} هو من يصلحه.`
    : `The break is at “${first.titleEn}” — ${first.ownerEn} fixes it.`;
}
