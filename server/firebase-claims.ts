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
 *    setCustomUserClaims على معرّفٍ محجوزٍ لا وجود له. فإن كانت الصلاحية قائمة عاد
 *    الجواب «لا مستخدم بهذا المعرّف» — وهو نجاحُ الفحص؛ وإن لم تكن عاد «لا صلاحية».
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

/* معرّف محجوز لا يُنشأ حسابٌ به: الفحص لا يلمس هوية أحد. */
const PROBE_UID = 'mizan-claims-permission-probe-000000000000';
const CLAIMS_PROBE_TTL_MS = 5 * 60_000;

let claimsProbe: { at: number; writability: ClaimsWritability } | null = null;
let claimsProbeInFlight: Promise<ClaimsWritability> | null = null;

/** رسائل «لا صلاحية» كما تردّها المنصّة. ما عداها لا يُحسب رفضًا. */
const DENIED = /permission|insufficient|unauthorized|forbidden|iam|access.?denied/i;
/** «لا مستخدم بهذا المعرّف» هو نجاح الفحص: النداء وصل ونُفِّذ وردّ على غيابه. */
const USER_ABSENT = /user-not-found|no user record|not.?found/i;

async function probeClaimsWritability(): Promise<ClaimsWritability> {
  const auth = await adminAuth();
  if (!auth) return 'NOT_CONFIGURED';
  try {
    await auth.setCustomUserClaims(PROBE_UID, {});
    /* لا يُتوقّع النجاح — لا حساب بهذا المعرّف — لكنه لو وقع فالصلاحية قائمة قطعًا. */
    return 'WRITABLE';
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err || '');
    const code = String((err as { code?: string })?.code || '');
    const text = `${code} ${message}`;
    if (USER_ABSENT.test(text)) return 'WRITABLE';
    if (DENIED.test(text)) return 'DENIED';
    /* شبكةٌ أو حصّة أو عطلٌ غير معروف: لا يُتّهم به النشر ولا يُخزَّن. */
    console.error('MIZAN identity claims: permission probe inconclusive:', message);
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
 */
export async function claimsWritable(now = Date.now()): Promise<boolean> {
  return (await claimsWritability(now)) !== 'DENIED' && (await claimsWritability(now)) !== 'NOT_CONFIGURED';
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
