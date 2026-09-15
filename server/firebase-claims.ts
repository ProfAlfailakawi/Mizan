import type { GovernanceRole } from './identity-governance';

/*
 * جسرٌ كان مفقودًا بين سلطتين.
 *
 * لميزان سجلّ هويات خاص به على الخادم: من فُعِّل، وبأي دور، وعلى أي جهة ومسابقة. ومكالمات
 * الواجهة البرمجية تُفحص به فتنجح.
 *
 * وقواعد Firestore لا ترى ذلك السجلّ إطلاقًا. هي تقرأ مطالبات رمز Firebase وحدها:
 * `role` و`org_id` و`competition_id`. ولم يكن في المستودع كلِّه سطر واحد يكتبها — لا
 * setCustomUserClaims ولا حزمة إدارة أصلًا.
 *
 * فكل حساب يُنشأ من داخل ميزان يُولد بلا مطالبات، فتُرفض كل كتابة مباشرة منه إلى Firestore،
 * ويرى صاحبه «الصلاحية لا تسمح» وهو مخوَّل فعلًا في سجلّ ميزان. سلطتان تحكمان الشيء نفسه
 * ولا تتحدثان.
 *
 * هذه الوحدة تكتب المطالبات من السجلّ نفسه، فتصير القواعد امتدادًا لما قرّره ميزان لا
 * حكمًا موازيًا له.
 *
 * وقواعدها:
 *   - لا اعتماد جديد يُخزَّن: تُستعمل بيانات الاعتماد الافتراضية لبيئة التشغيل (Cloud Run
 *     يمنحها من نفسه)، فلا مفتاح خدمة في المستودع ولا في الأسرار.
 *   - لا تُفشل تفعيلًا: حسابٌ فُعِّل ولم تُكتب مطالباته أفضل من حسابٍ لم يُفعَّل. والإخفاق
 *     يُسجَّل ويُعاد بوضوح، لا يُبتلع.
 *   - وسحبُ الصلاحية يمسح المطالبات: بقاؤها بعد الإيقاف يعني بابًا مفتوحًا بعد إغلاقه.
 */

export interface IdentityClaims {
  role: GovernanceRole;
  org_id: string;
  competition_id?: string;
  /** كل مسابقات التخويلات الفعّالة — القواعد تقبل العضوية في القائمة كما تقبل المفرد. */
  competition_ids?: string[];
}

export type ClaimSyncOutcome =
  | { status: 'SYNCED'; claims: IdentityClaims | null }
  | { status: 'NOT_CONFIGURED' }
  | { status: 'FAILED'; reason: string };

type AdminAuth = {
  setCustomUserClaims(uid: string, claims: Record<string, unknown> | null): Promise<void>;
};

let authPromise: Promise<AdminAuth | null> | null = null;

/**
 * تهيئة كسولة ومرة واحدة. غياب الاعتماد ليس عطلًا يُصرخ به في كل نداء — بيئة التطوير
 * المحلية بلا اعتماد افتراضي عادةً — لكنه يُعاد بوضوح ليظهر في التشخيص.
 */
function adminAuth(): Promise<AdminAuth | null> {
  if (!authPromise) {
    authPromise = (async () => {
      try {
        const admin = await import('firebase-admin/app');
        const authModule = await import('firebase-admin/auth');
        const projectId = process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || '';
        if (!projectId) return null;
        const app = admin.getApps().length
          ? admin.getApps()[0]
          : admin.initializeApp({ credential: admin.applicationDefault(), projectId });
        return authModule.getAuth(app) as unknown as AdminAuth;
      } catch (err) {
        console.error('MIZAN identity claims: admin SDK unavailable:', err instanceof Error ? err.message : err);
        return null;
      }
    })();
  }
  return authPromise;
}

/*
 * للتشخيص: هل يستطيع هذا النشر كتابة المطالبات فعلًا؟
 *
 * ثلاثة أخطاءٍ تُرتكب في هذا الفحص، وكلُّها تُخرج جوابًا واثقًا كاذبًا:
 *
 * ١) أن يُكتفى ببناء كائن الإدارة. اعتمادٌ بحساب خدمةٍ بلا صلاحية يبني الكائن بلا
 *    اعتراض ثم تفشل كلُّ كتابة — فيُعلَن «يستطيع» وهو لا يستطيع.
 *
 * ٢) أن تُجرَّب صلاحيةٌ غير المطلوبة. قراءة المستخدمين وتعديلهم صلاحيتان مختلفتان في
 *    IAM: اعتمادٌ للقراءة فقط ينجح في القراءة ويفشل في الكتابة، واعتمادٌ للكتابة فقط
 *    يقع العكس — فيُمنع من تعبئةٍ هو قادر عليها. فتُجرَّب هنا **العملية نفسها**:
 *    setCustomUserClaims على معرّفٍ عشوائيٍّ يُولَّد في كل مرة. فإن كانت الصلاحية قائمة
 *    عاد الجواب «لا مستخدم بهذا المعرّف» — وهو نجاحُ الفحص؛ وإن لم تكن عاد «لا صلاحية».
 *    ولا يُمسّ حسابٌ حقيقي بحرف.
 *
 * ٣) أن يُخزَّن عطلٌ عارض بوصفه سوءَ تهيئة. انقطاع شبكةٍ أو حصّةٌ منفدة ليسا رفضَ
 *    صلاحية، وتخزينهما «لا يستطيع» خمس دقائق يُخفي زرَّ الإصلاح بعد عودة الشبكة
 *    ويتّهم نشرًا سليمًا. فلا يُخزَّن إلا الجواب القاطع، ويبقى العارض «غير معلوم».
 *
 * والنداء الواحد يُشارَك: أجهزة القاعة تفتح معًا فتستدعي نقطة الصحة في اللحظة نفسها،
 * فلو لم يُحفظ الوعد الجاري لانطلق فحصٌ مخوَّل لكل طلب — وهو عكس المقصود تمامًا.
 */
export type ClaimsWritability = 'WRITABLE' | 'DENIED' | 'NOT_CONFIGURED' | 'UNKNOWN';

const CLAIMS_PROBE_TTL_MS = 5 * 60_000;

let claimsProbe: { at: number; writability: ClaimsWritability } | null = null;
let claimsProbeInFlight: Promise<ClaimsWritability> | null = null;

/*
 * معرّف الفحص يُولَّد عشوائيًا في كل مرة، ولا يُثبَّت.
 *
 * Firebase لا يحجز معرّفًا باصطلاح تسمية: أي معرّفٍ نكتبه ثابتًا يستطيع أحدٌ أن يُنشئ
 * به حسابًا (أو يستورده)، فيصير الفحص الذي وُصف بأنه «لا يمسّ أحدًا» ماسحًا لمطالبات
 * ذلك الحساب كلّما انتهت مهلة التخزين — أي نزعَ صلاحيةِ حسابٍ حقيقي كل خمس دقائق.
 * ومعرّفٌ عشوائي بمئة وثمانية وعشرين بتًّا لا يقع عليه حسابٌ عمليًا، ولا يُثبَّت فيُستهدَف.
 */
const probeUid = () => `mizan-claims-probe-${globalThis.crypto.randomUUID()}`;

/*
 * التصنيف بالرموز المنصوصة وحدها، لا بمطابقة نصوص.
 *
 * مطابقة النصّ تُخرج جوابًا واثقًا عن عطلٍ لا تعرفه: «auth/project-not-found» يحوي
 * «not-found» فيُقرأ نجاحًا ويُخزَّن — فيمرّ نشرٌ مكسور من بوابة الصحة ويُعرض زرُّ إصلاحٍ
 * تفشل كلُّ كتابةٍ بعده. وعطلُ اعتمادٍ عارض يحمل عنوان iamcredentials.googleapis.com
 * يحوي «iam» فيُقرأ رفضَ صلاحية ويُخزَّن، فيُتَّهم نشرٌ سليم.
 *
 * فما لم يكن رمزًا منصوصًا في هذين الجدولين فهو «غير معلوم»: لا يُدَّعى فيه علم ولا
 * يُخزَّن. والجدولان يُوسَّعان عند الحاجة برمزٍ موثَّق، لا بنمطٍ يلتقط ما لم يُقصد.
 */
const WRITABLE_CODES = new Set([
  /* النداء وصل ونُفِّذ وردّ على غياب الحساب: هذا هو نجاح الفحص. */
  'auth/user-not-found',
]);
const DENIED_CODES = new Set([
  'auth/insufficient-permission',
  'auth/forbidden',
  'auth/invalid-credential',
  'auth/insufficient-permissions',
]);
const NOT_CONFIGURED_CODES = new Set([
  'auth/project-not-found',
  'auth/configuration-not-found',
]);

/** رمز الخطأ كما تُصدره حزمة الإدارة، وإلا فرمز حالة المنصّة تحته. */
function errorCode(err: unknown): string {
  const direct = (err as { code?: unknown })?.code;
  if (typeof direct === 'string' && direct) return direct;
  const info = (err as { errorInfo?: { code?: unknown } })?.errorInfo?.code;
  return typeof info === 'string' ? info : '';
}

async function probeClaimsWritability(): Promise<ClaimsWritability> {
  const auth = await adminAuth();
  if (!auth) return 'NOT_CONFIGURED';
  try {
    await auth.setCustomUserClaims(probeUid(), {});
    /* لا يُتوقّع النجاح — لا حساب بهذا المعرّف — لكنه لو وقع فالصلاحية قائمة قطعًا. */
    return 'WRITABLE';
  } catch (err) {
    const code = errorCode(err);
    if (WRITABLE_CODES.has(code)) return 'WRITABLE';
    if (DENIED_CODES.has(code)) return 'DENIED';
    if (NOT_CONFIGURED_CODES.has(code)) return 'NOT_CONFIGURED';
    /* شبكةٌ أو حصّة أو رمزٌ لم يُصنَّف بعد: لا يُتّهم به النشر ولا يُخزَّن. */
    console.error('MIZAN identity claims: permission probe inconclusive', { code, reason: err instanceof Error ? err.message : String(err || '') });
    return 'UNKNOWN';
  }
}

export async function claimsWritability(now = Date.now()): Promise<ClaimsWritability> {
  if (claimsProbe && now - claimsProbe.at < CLAIMS_PROBE_TTL_MS) return claimsProbe.writability;
  if (claimsProbeInFlight) return claimsProbeInFlight;
  claimsProbeInFlight = probeClaimsWritability()
    .then(writability => {
      /* القاطع وحده يُخزَّن؛ والعارض يُعاد فحصه عند الطلب التالي. */
      if (writability !== 'UNKNOWN') claimsProbe = { at: Date.now(), writability };
      return writability;
    })
    .finally(() => { claimsProbeInFlight = null; });
  return claimsProbeInFlight;
}

/**
 * جوابٌ ثنائي لمن لا يحتمل الثلاثي. «غير معلوم» يُقرأ هنا قدرةً لا عجزًا عمدًا: منعُ
 * تعبئةٍ يملكها صاحبها لأن الشبكة تعثّرت لحظةً أسوأ من محاولةٍ تفشل فتُقال بسببها.
 *
 * والنتيجة تُقرأ مرة واحدة: قراءتها مرتين تُطلق فحصًا مخوَّلًا ثانيًا حين يكون الأول
 * «غير معلوم» — فيُضاعَف الحمل في اللحظة التي يمثّلها ذلك الجواب بعينها.
 */
export async function claimsWritable(now = Date.now()): Promise<boolean> {
  const writability = await claimsWritability(now);
  return writability !== 'DENIED' && writability !== 'NOT_CONFIGURED';
}

/** للاختبار وإعادة الفحص بعد تغيير الاعتماد. */
export function resetClaimsProbe() { claimsProbe = null; claimsProbeInFlight = null; }

/**
 * يكتب مطالبات حساب واحد، أو يمسحها حين لا يبقى له تخويل.
 *
 * `claims === null` تعني سحبًا: تُمسح المطالبات فتعود القواعد ترفضه فورًا بعد أول تحديث
 * للرمز، بدل أن تبقى صلاحيةٌ مكتوبة في رمزٍ لم يعد يستحقها.
 */
export async function writeIdentityClaims(uid: string, claims: IdentityClaims | null): Promise<ClaimSyncOutcome> {
  if (!uid) return { status: 'FAILED', reason: 'UID_REQUIRED' };
  const auth = await adminAuth();
  if (!auth) return { status: 'NOT_CONFIGURED' };
  try {
    /* الحقول المحذوفة تُكتب null لا undefined: المطالبة الباقية من دورٍ سابق أخطر من غيابها. */
    const payload = claims
      ? { role: claims.role, org_id: claims.org_id, competition_id: claims.competition_id ?? null, competition_ids: claims.competition_ids?.length ? claims.competition_ids : null }
      : { role: null, org_id: null, competition_id: null, competition_ids: null };
    await auth.setCustomUserClaims(uid, payload);
    return { status: 'SYNCED', claims };
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'CLAIM_WRITE_FAILED';
    /*
     * القيم غير الموثوقة تُمرَّر وسائطَ لا تُدسّ في نصّ التنسيق.
     *
     * `uid` يأتي من رمز خارجي. ودسُّه في النصّ يفتح بابين: محدّدات تنسيق (%s) تشوّه المخرجات،
     * وسطرٌ جديد داخل القيمة يزوّر سطر سجلّ كامل — وهذه السجلات هي أثر أعطال الهوية، فتزويرها
     * أخطر من ضياعها.
     */
    console.error('MIZAN identity claims: write failed', { uid, reason });
    return { status: 'FAILED', reason };
  }
}

/**
 * يشتقّ المطالبات من التخويل الذي قرّره ميزان.
 *
 * الدور الأعلى رتبةً هو الحاكم — وهو ترتيب السجلّ نفسه — ولا يُخترع هنا ترتيب ثانٍ يفترق عنه.
 * ونطاق المسابقة يُكتب فقط حين يحمله التخويل: كتابته فارغة تُقيّد دورًا لا يُقصد تقييده.
 */
export function claimsFromGrant(grant: { role: GovernanceRole; organizationId: string; competitionId?: string; competitionIds?: string[] }): IdentityClaims {
  return {
    role: grant.role,
    org_id: grant.organizationId,
    ...(grant.competitionId ? { competition_id: grant.competitionId } : {}),
    ...(grant.competitionIds?.length ? { competition_ids: grant.competitionIds } : {}),
  };
}
