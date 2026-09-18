/*
 * كون البيئة التجريبية — مسابقةٌ بحجم مسابقة.
 *
 * حالةُ الإطلاق فارغةٌ عن عمد (انظر `launch-state.ts`): نشرٌ حقيقي لا يجوز أن يستقبل
 * منظّمه بمتسابقين لا وجود لهم. وهذا صحيح، وهو في الوقت نفسه يترك المنتج بلا ما يُعرض
 * به: كل شاشةٍ جدولٌ فارغ.
 *
 * فالحلّ ليس إحياء البذرة القديمة في الإطلاق، بل بيئةٌ منفصلة يدخلها الزائر بضغطةٍ
 * صريحة، ببياناتها ومفتاح تخزينها الخاصّين، ولا تصير حالةَ إطلاقٍ أبدًا.
 *
 * والبذرة المحفوظة في `seed-data.ts` صادقةُ الأنواع ومكتوبةٌ بعناية، لكنها ثمانية عشر
 * متسابقًا وثلاث لجان — حجمُ اختبارٍ لا حجمُ مسابقة. هنا تُضخَّم إلى يومٍ كامل: مئتان
 * وأربعون متسابقًا في اثنتي عشرة لجنة، بنتائج وتحكيمٍ وتدقيقٍ وتظلّمات. ما يُعرض على جهةٍ
 * يجب أن يبدو كنظامٍ أدار مسابقة، لا كقالبٍ فيه ثلاثة صفوف.
 *
 * كل الأسماء والأرقام مخترعة. صيغتها عربية/خليجية لتقرأ الشاشات طبيعية، ولا تطابق أحدًا.
 */
import type {
  AppealRecord,
  AuditEvent,
  Certificate,
  Committee,
  IncidentRecord,
  IntegrationConfig,
  JudgeProfile,
  JudgeSubmission,
  Category,
  Participant,
  Organization,
  RecitedPassageRecord,
  ResultRecord,
  ReviewCase,
  SupportSession,
} from '../types';
import type { AppStoreState } from '../lib/store-state';
import { buildParticipantScopeRecord } from '../lib/participant-scope';
import { ayahCountOf, fullQuranScope, ordinalToLocus, scopeFromJuzRange, scopeRanges } from '../lib/quran-scope';
import {
  SEED_APPEALS,
  SEED_ORGANIZATION,
  SEED_AUDIT_LOGS,
  SEED_CATEGORIES,
  SEED_CERTIFICATE,
  SEED_COMPETITION,
  SEED_COMMITTEES,
  SEED_INCIDENTS,
  SEED_JUDGES,
  SEED_JUDGE_SUBMISSIONS,
  SEED_PARTICIPANTS,
  SEED_RESULTS,
  SEED_REVIEW_CASES,
} from './seed-data';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/* عشوائيةٌ حتمية: البذرة نفسها تعطي اليوم نفسه، فلقطةُ شاشةٍ لعرضٍ تبقى مطابقة بعد شهر،
   واثنان في اجتماعٍ واحد يريان الأرقام ذاتها. */
function makeRandom(seed: number): () => number {
  let state = seed >>> 0 || 0x9e3779b9;
  return () => {
    state ^= state << 13; state >>>= 0;
    state ^= state >> 17;
    state ^= state << 5; state >>>= 0;
    return state / 0x100000000;
  };
}
const pick = <T>(items: readonly T[], index: number): T => items[index % items.length];

const FIRST_AR = [
  'عبدالله', 'محمد', 'أحمد', 'إبراهيم', 'يوسف', 'عمر', 'خالد', 'سلمان',
  'بدر', 'ناصر', 'فيصل', 'طلال', 'راكان', 'مشاري', 'سعود', 'زياد',
  'أنس', 'حمزة', 'بلال', 'معاذ', 'أسامة', 'صهيب', 'عمّار', 'طارق',
];
const FIRST_AR_F = [
  'مريم', 'فاطمة', 'عائشة', 'خديجة', 'نورة', 'دانة', 'شهد', 'لولوة',
  'هيا', 'ريم', 'جنى', 'العنود', 'منيرة', 'حصة', 'وضحى', 'غلا',
];
const FAMILY_AR = [
  'الأنصاري', 'القحطاني', 'الحربي', 'العتيبي', 'الشمري', 'الدوسري',
  'المطيري', 'الزهراني', 'الغامدي', 'السبيعي', 'الرشيدي', 'العجمي',
  'الفيلكاوي', 'الكندري', 'البلوشي', 'الهاشمي', 'الصديقي', 'الفاروقي',
];
const FIRST_EN = [
  'Abdullah', 'Muhammad', 'Ahmad', 'Ibrahim', 'Yusuf', 'Umar', 'Khalid', 'Salman',
  'Badr', 'Nasser', 'Faisal', 'Talal', 'Rakan', 'Mishari', 'Saud', 'Ziyad',
  'Anas', 'Hamza', 'Bilal', 'Muadh', 'Usama', 'Suhayb', 'Ammar', 'Tariq',
];
const FIRST_EN_F = [
  'Maryam', 'Fatimah', 'Aishah', 'Khadijah', 'Nourah', 'Dana', 'Shahad', 'Lulwa',
  'Haya', 'Reem', 'Jana', 'Al-Anoud', 'Munira', 'Hessa', 'Wadha', 'Ghala',
];
const FAMILY_EN = [
  'Al-Ansari', 'Al-Qahtani', 'Al-Harbi', 'Al-Otaibi', 'Al-Shammari', 'Al-Dosari',
  'Al-Mutairi', 'Al-Zahrani', 'Al-Ghamdi', 'Al-Subaie', 'Al-Rashidi', 'Al-Ajmi',
  'Al-Failakawi', 'Al-Kandari', 'Al-Balushi', 'Al-Hashimi', 'Al-Siddiqi', 'Al-Farooqi',
];

const COUNTRIES: ReadonlyArray<readonly [string, string]> = [
  ['المملكة العربية السعودية (KSA)', 'Saudi'],
  ['الكويت (Kuwait)', 'Kuwaiti'],
  ['الإمارات (UAE)', 'Emirati'],
  ['مصر (Egypt)', 'Egyptian'],
  ['الأردن (Jordan)', 'Jordanian'],
  ['المغرب (Morocco)', 'Moroccan'],
  ['ماليزيا (Malaysia)', 'Malaysian'],
  ['إندونيسيا (Indonesia)', 'Indonesian'],
  ['تركيا (Türkiye)', 'Turkish'],
  ['باكستان (Pakistan)', 'Pakistani'],
  ['نيجيريا (Nigeria)', 'Nigerian'],
  ['البوسنة (Bosnia)', 'Bosnian'],
];

const RIWAYAT = ['Hafs', 'Warsh', 'Qalun', 'Al-Duri'];

/*
 * رواية اللجنة — حفص في البيئة التجريبية كلها، لا توزيعٌ على أربع روايات.
 *
 * التنويع هنا كان خطأً من ثلاثة وجوه، ولا يظهر أيٌّ منها إلا حين يحاول محكّمٌ
 * أن يبدأ جلسة:
 *
 *   ١. فئات البذرة نفسها مُعرَّفة بـ«حفص عن عاصم»، فمتسابقٌ يقرأ بورش داخل فئةِ
 *      حفصٍ تناقضٌ في البيانات لا واقعٌ محتمل.
 *   ٢. سحب المواضع يقرأ نصّ الرواية من حزمة تسليمها، وحفص هي الحزمة الحاضرة في
 *      كل نشر؛ أما ورش وقالون والدوري فقد لا تكون مركّبة — فيرجع السحب فارغًا،
 *      وتقول الشاشة «تعذّر تجهيز أسئلته» بلا أن تشرح السبب.
 *   ٣. واللجنة يجب أن تكون مؤهّلةً لرواية متسابقها، فيصير التنويع قيدًا ثالثًا
 *      بلا مقابل.
 *
 * والدالة باقية بمعامِلها لا ثابتًا مباشرًا: إن رُكّبت حزمُ رواياتٍ أخرى يومًا،
 * فالتغيير في هذا الموضع وحده.
 */
const riwayaForCommittee = (_committeeIndex: number): string => RIWAYAT[0];

/* توزيعُ حالاتٍ يشبه يومًا حقيقيًا: الأغلبية أدّت اختبارها ومنهم من صدرت شهادته،
   وطابورٌ قائم، وجلساتٌ جارية، ومن لم يُعتمد بعد، وتظلّمٌ أو اثنان. لوحةٌ كلّها حالةٌ
   واحدة لا تُظهر إدارة اليوم إطلاقًا. القيم من `RegistrationStatus` حرفيًا. */
const STATUS_WEIGHTS: ReadonlyArray<readonly [Participant['status'], number]> = [
  ['tested', 40],
  ['certified', 12],
  ['in_queue', 18],
  ['in_session', 5],
  ['checked_in', 12],
  ['approved', 8],
  ['submitted', 3],
  ['appealed', 2],
];

function statusAt(index: number): Participant['status'] {
  const total = STATUS_WEIGHTS.reduce((sum, [, weight]) => sum + weight, 0);
  let cursor = (index * 37) % total;
  for (const [status, weight] of STATUS_WEIGHTS) {
    if (cursor < weight) return status;
    cursor -= weight;
  }
  return 'tested';
}

/** من أدّى اختباره فله نتيجة — سواء خُتمت شهادته بعدُ أو لا. */
const HAS_RESULT: ReadonlyArray<Participant['status']> = ['tested', 'certified', 'appealed'];

const COMMITTEE_COUNT = 12;
const PARTICIPANT_COUNT = 240;

/** اثنتا عشرة لجنة مشتقّة من قالب البذرة، موزّعة على الفئات وبحالات تشغيل مختلفة. */
function demoCommittees(): Committee[] {
  const template = clone(SEED_COMMITTEES[0]);
  const categoryIds = SEED_CATEGORIES.map(category => category.id);
  return Array.from({ length: COMMITTEE_COUNT }, (_, index) => ({
    ...clone(template),
    id: `comm-demo-${index + 1}`,
    name: `Committee ${index + 1}`,
    nameArabic: `اللجنة ${index + 1}`,
    code: `C${index + 1}`,
    venueHall: `قاعة ${String.fromCharCode(65 + (index % 6))}${Math.floor(index / 6) + 1}`,
    assignedCategories: [pick(categoryIds, index)],
    headJudgeId: `usr-demo-head-${index + 1}`,
    /*
     * محكّمٌ واحد لكل لجنة في البيئة التجريبية، لا اثنان.
     *
     * بوابة كشف السؤال تشترط موافقة كل محكّمي اللجنة (`requiredJudgeIds`)، فاثنان
     * يعنيان «٠/٢» ولا يكتمل الكشف أبدًا — ومن يعرض المنتج شخصٌ واحد أمام الشاشة،
     * لا اثنان يضغطان معًا. فيبقى العرض عالقًا عند سؤالٍ لا يُفتح.
     *
     * وهذا لا يمسّ شيئًا خارج الصندوق: القاعدة نفسها باقية، والبيانات وحدها تُبنى
     * بلجانٍ من محكّمٍ واحد — وهي الحال الغالبة في المسابقات الصغيرة أصلًا.
     */
    judgeIds: [`usr-demo-judge-${index + 1}`],
    // لجنةٌ واحدة خارج الخدمة وأخرى في استراحة: يومٌ بلا أي خلل لا يُظهر كيف يُدار الخلل.
    status: index === 4 ? 'offline' : index === 7 ? 'paused' : index % 3 === 0 ? 'testing' : 'ready',
    completedCount: 8 + ((index * 7) % 26),
    averageSessionMinutes: Number((6 + (index % 5) * 0.9).toFixed(1)),
    audioInputOk: index !== 4,
    devicesConnected: index === 4 ? 0 : 3 + (index % 3),
  }));
}

function demoJudges(committees: Committee[]): JudgeProfile[] {
  const random = makeRandom(0x6a75);
  const template = clone(SEED_JUDGES[0]);
  const judges: JudgeProfile[] = [];
  committees.forEach((committee, index) => {
    [`usr-demo-head-${index + 1}`, ...committee.judgeIds].forEach((userId, j) => {
      const isHead = j === 0;
      judges.push({
        ...clone(template),
        id: `judge-demo-${index + 1}-${j + 1}`,
        userId,
        name: `${pick(FIRST_EN, index * 3 + j)} ${pick(FAMILY_EN, index * 5 + j)}`,
        nameArabic: `${pick(FIRST_AR, index * 3 + j)} ${pick(FAMILY_AR, index * 5 + j)}`,
        title: isHead ? 'رئيس لجنة تحكيم' : 'محكّم',
        country: pick(COUNTRIES, index + j)[0],
        /* اللجنة مُعتمدةٌ في الرواية التي يقرأ بها متسابقوها (`riwayaForCommittee`)،
           وفي حفص معها. واللائحة تشترط لجنةً مؤهّلةً لرواية المتسابق، فلجنةٌ تستقبل
           ورشًا ومحكّمُها معتمدٌ في قالون وحفص لا تُفتح لها جلسةٌ أبدًا. */
        certifiedRiwayat: [riwayaForCommittee(index), 'Hafs'].filter((v, i, a) => a.indexOf(v) === i),
        assignedCommitteeId: committee.id,
        conflictsDeclared: [],
        calibrationScore: Number((88 + random() * 11).toFixed(1)),
        isReady: !(index === 4),
      });
    });
  });
  return judges;
}

function demoParticipants(committees: Committee[]): Participant[] {
  const random = makeRandom(0x7061);
  const template = clone(SEED_PARTICIPANTS[0]);
  return Array.from({ length: PARTICIPANT_COUNT }, (_, index) => {
    const female = index % 3 === 1;
    const firstAr = female ? pick(FIRST_AR_F, index) : pick(FIRST_AR, index);
    const firstEn = female ? pick(FIRST_EN_F, index) : pick(FIRST_EN, index);
    const familyIndex = (index * 7) % FAMILY_AR.length;
    const [country, nationality] = pick(COUNTRIES, index);
    const committee = pick(committees, index);
    const status = statusAt(index);
    const inQueue = status === 'in_queue' || status === 'in_session';
    return {
      ...clone(template),
      id: `part-demo-${index + 1}`,
      code: `${String.fromCharCode(65 + (index % 4))}-${1000 + index}`,
      fullName: `${firstEn} ${FAMILY_EN[familyIndex]}`,
      fullNameArabic: `${firstAr} ${FAMILY_AR[familyIndex]}`,
      email: `participant${index + 1}@demo.mizan.test`,
      phone: `+9715${String(10000000 + index * 7919).slice(0, 8)}`,
      country,
      nationality,
      nationalIdOrPassport: `DEMO-${String(1000000 + index * 13)}`,
      identityLast4: String(1000 + (index * 13) % 9000).slice(-4),
      dateOfBirth: `${1998 + (index % 14)}-0${1 + (index % 9)}-1${index % 9}`,
      gender: female ? 'female' : 'male',
      /*
       * الفئة تتبع اللجنة، لا تُختار مستقلةً عنها.
       *
       * اللجنة لا تستقبل إلا فئاتها (`assignedCategories`)، فمتسابقٌ أُسند إلى لجنةٍ
       * لا تخدم فئته لا تُفتح له جلسةٌ أبدًا: «لا توجد لجنة متوافقة معه». وكانت
       * الفئة تُوزَّع بمعزلٍ عن اللجنة، فأغلب المتسابقين وقعوا في هذا التناقض —
       * وهو لا يظهر في أي جدول، ولا يظهر إلا حين يحاول محكّمٌ أن يبدأ جلسة.
       */
      categoryId: committee.assignedCategories[0] || pick(SEED_CATEGORIES, index).id,
      // الرواية تتبع اللجنة كما تتبعها الفئة — وإلا سقط التوافق عند بدء الجلسة.
      riwaya: riwayaForCommittee(committees.indexOf(committee)),
      institution: `مركز تحفيظ القرآن الكريم — ${pick(COUNTRIES, index)[0].split(' (')[0]}`,
      status,
      statusHistory: [
        { status: 'submitted' as const, timestamp: '2026-11-12T09:00:00Z', actor: 'participant' },
        { status: 'approved' as const, timestamp: '2026-11-14T14:20:00Z', actor: 'AI Eligibility Engine' },
      ],
      assignedCommitteeId: status === 'submitted' || status === 'approved' ? undefined : committee.id,
      queueNumber: inQueue ? 1 + (index % 20) : undefined,
      originalQueueNumber: inQueue ? 1 + (index % 20) : undefined,
      /* وفدٌ قائم: بوابة مدير الوفد تُرشّح على `delegation-current`، فبلا إسنادٍ
         هنا كانت تفتح على قائمةٍ فارغة رغم وجود مئتين وأربعين متسابقًا. */
      delegationId: index % 13 === 0 ? 'delegation-current' : undefined,
      checkedInAt: status === 'submitted' || status === 'approved' ? undefined : '2027-02-11T08:45:12Z',
      promisedWaitMinutes: inQueue ? 5 + Math.floor(random() * 40) : undefined,
    };
  });
}

function demoResults(participants: Participant[]): ResultRecord[] {
  const random = makeRandom(0x7265);
  const template = clone(SEED_RESULTS[0]);
  const completed = participants.filter(participant => HAS_RESULT.includes(participant.status));
  return completed
    .map((participant, index) => {
      const category = SEED_CATEGORIES.find(item => item.id === participant.categoryId);
      return {
        ...clone(template),
        id: `res-demo-${index + 1}`,
        participantId: participant.id,
        participantCode: participant.code,
        participantName: participant.fullName,
        participantNameArabic: participant.fullNameArabic,
        country: participant.country,
        categoryId: participant.categoryId,
        categoryName: category?.name || '',
        /* الاسم العربي للفئة يُكتب مع الإنجليزي: شاشة النتائج تعرض العربي متى وُجد،
           فكان غيابه يُظهر «Consecutive Juz 20» في شاشةٍ عربية بالكامل. */
        categoryNameArabic: category?.nameArabic || '',
        finalScore: Number((72 + random() * 27.5).toFixed(2)),
        // أغلب النتائج مختومة، وبعضها ما زال في مرحلةٍ سابقة: شاشة الختم تحتاج
        // شيئًا تختمه، وشاشة الجودة تحتاج شيئًا تفحصه.
        status: (index % 9 === 0 ? 'calculated' : index % 7 === 0 ? 'quality_checked' : index % 11 === 0 ? 'approved' : 'sealed') as ResultRecord['status'],
        rank: 0,
        awardTitle: undefined,
        awardTitleArabic: undefined,
      };
    })
    .sort((a, b) => b.finalScore - a.finalScore)
    .map((result, index) => ({
      ...result,
      rank: index + 1,
      awardTitle: index === 0 ? 'First Place' : index === 1 ? 'Second Place' : index === 2 ? 'Third Place' : undefined,
      awardTitleArabic: index === 0 ? 'المركز الأول' : index === 1 ? 'المركز الثاني' : index === 2 ? 'المركز الثالث' : undefined,
    }));
}

function demoAuditLogs(participants: Participant[], committees: Committee[]): AuditEvent[] {
  const template = clone(SEED_AUDIT_LOGS[0]);
  const actions = [
    'PARTICIPANT_CHECKED_IN', 'QUESTION_SET_SEALED', 'QUESTION_SET_REVEALED',
    'SESSION_STARTED', 'SESSION_COMPLETED', 'SCORE_SUBMITTED', 'RESULT_SEALED',
    'APPEAL_OPENED', 'APPEAL_RESOLVED', 'INCIDENT_RAISED', 'QUEUE_TRANSFER',
    'SCOPE_APPROVED', 'SCOPE_REJECTED', 'JUDGE_CALIBRATED', 'COMMITTEE_PAUSED',
  ];
  return Array.from({ length: 320 }, (_, index) => {
    const participant = pick(participants, index * 3);
    const committee = pick(committees, index);
    return {
      ...clone(template),
      id: `aud-demo-${index + 1}`,
      action: pick(actions, index),
      actorId: index % 6 === 0 ? 'usr-demo-admin' : committee.headJudgeId,
      actorName: index % 6 === 0 ? 'مدير المسابقة (تجريبي)' : `رئيس ${committee.nameArabic}`,
      targetId: participant.id,
      targetType: 'participant',
      timestamp: new Date(Date.UTC(2027, 1, 11, 6 + Math.floor(index / 32), (index * 7) % 60)).toISOString(),
      details: `${pick(actions, index)} — ${participant.fullNameArabic} (${participant.code})`,
    };
  });
}

function demoJudgeSubmissions(participants: Participant[], judges: JudgeProfile[]): JudgeSubmission[] {
  const random = makeRandom(0x6a73);
  const template = clone(SEED_JUDGE_SUBMISSIONS[0]);
  const graded = participants.filter(participant => HAS_RESULT.includes(participant.status));
  const submissions: JudgeSubmission[] = [];
  graded.forEach((participant, p) => {
    const panel = judges.filter(judge => judge.assignedCommitteeId === participant.assignedCommitteeId);
    panel.slice(0, 3).forEach((judge, j) => {
      submissions.push({
        ...clone(template),
        participantId: participant.id,
        judgeId: judge.userId,
        totalScore: Number((72 + random() * 27).toFixed(2)),
        submittedAt: new Date(Date.UTC(2027, 1, 11, 7 + (p % 9), (p * 5) % 60)).toISOString(),
      });
    });
  });
  return submissions;
}

/*
 * الاعتراضات: كلٌّ باسم صاحبه وسببه.
 *
 * كانت تُستنسخ من قالب البذرة ويُبدَّل `participantId` وحده، و`participantCode` يبقى كما
 * هو في القالب — فتُعرض خمسة اعتراضاتٍ كلها «A-104» وكلها بالسبب نفسه. ولا يكشف ذلك
 * خللًا في الشاشة: الشاشة تعرض ما أُعطيت. فيُبنى كل سجلٍّ من نتيجته هو.
 */
const APPEAL_GROUNDS: ReadonlyArray<readonly [AppealRecord['grounds'], string]> = [
  ['scoring_miscalculation', 'يرى المتسابق أن خصم درجة الحفظ عند الدقيقة 02:22 احتُسب مرتين، ويطلب إعادة احتساب المجموع.'],
  ['audio_interruption', 'انقطع الصوت في القاعة أثناء الموضع الثالث، ويطلب إعادة الاستماع إلى المقطع كاملًا.'],
  ['question_scope_dispute', 'يرى أن الموضع الرابع خارج نطاق فئته المعتمد، ويطلب مراجعة حدود النطاق.'],
  ['scoring_miscalculation', 'فارق بين ما رصده المحكّمان في موضعٍ واحد، ويطلب مراجعة السبب.'],
  ['audio_interruption', 'تداخل صوتٌ من القاعة المجاورة في أثناء تلاوته، ويطلب تقدير أثره.'],
];

function demoAppeals(results: ResultRecord[], participants: Participant[]): AppealRecord[] {
  const template = SEED_APPEALS.length ? clone(SEED_APPEALS[0]) : null;
  if (!template) return [];
  const byId = new Map(participants.map(p => [p.id, p]));
  return results.slice(0, 9).map((result, index) => {
    const participant = byId.get(result.participantId);
    const [grounds, reasonText] = pick(APPEAL_GROUNDS, index);
    return {
      ...clone(template),
      id: `appeal-demo-${index + 1}`,
      participantId: result.participantId,
      participantCode: participant?.code || result.participantCode,
      categoryName: result.categoryName,
      grounds,
      reasonText,
      status: index % 4 === 0 ? 'submitted' : index % 4 === 1 ? 'under_review' : index % 4 === 2 ? 'accepted' : 'rejected',
      createdAt: new Date(Date.UTC(2027, 1, 11, 14, index * 6)).toISOString(),
    };
  });
}

function demoIncidents(committees: Committee[]): IncidentRecord[] {
  const template = SEED_INCIDENTS.length ? clone(SEED_INCIDENTS[0]) : null;
  if (!template) return [];
  /* النوع يُكتب صريحًا: شاشة العمليات تسمّي العطل بنوعه، و`type` هو ما تقرؤه. */
  const kinds: ReadonlyArray<readonly [IncidentRecord['type'], string, string]> = [
    ['audio_mic', 'انقطاع صوت في القاعة', 'تعذّر التقاط الصوت لمدة أربع دقائق؛ استُؤنفت الجلسة بعد إعادة التوصيل.'],
    ['participant_emergency', 'تأخر وصول متسابق', 'وصل بعد انقضاء حجزه فأُعيد جدولته في نهاية الطابور.'],
    ['judge_absence', 'خلاف على درجة', 'فارق بين محكّمين تجاوز الحدّ المسموح فأُحيل إلى رئيس اللجنة.'],
    ['device', 'عطل جهاز', 'جهاز لوحي توقف أثناء الإدخال؛ استُعيدت الدرجة من نقطة الحفظ.'],
    ['network', 'انقطاع شبكة', 'عملت القاعة دون اتصال لسبع دقائق ثم زُوملت السجلات.'],
    ['power', 'تذبذب كهرباء في القاعة B2', 'عملت الأجهزة على بطارياتها ثمانيَ دقائق ولم تسقط جلسة.'],
    ['venue', 'ازدحام عند مدخل القاعة A1', 'أُعيد توجيه وفدين إلى المدخل الشمالي.'],
  ];
  return kinds.map(([type, title, description], index) => ({
    ...clone(template),
    id: `inc-demo-${index + 1}`,
    type,
    title,
    description,
    reportedBy: `usr-demo-head-${(index % committees.length) + 1}`,
    severity: index === 2 ? 'critical' : index % 2 === 0 ? 'moderate' : 'low',
    status: index === 0 ? 'active' : index === 1 ? 'investigating' : index === 5 ? 'investigating' : 'resolved',
    occurrences: index === 0 ? 3 : 1,
    reportedAt: new Date(Date.UTC(2027, 1, 11, 9 + index, index * 11)).toISOString(),
    lastOccurredAt: new Date(Date.UTC(2027, 1, 11, 9 + index, index * 11 + 20)).toISOString(),
  }));
}

/*
 * مراجعات التحكيم: أسبابٌ مختلفة لمتسابقين مختلفين.
 *
 * كانت — كالاعتراضات — تحمل كود القالب وسببه، فيرى رئيس اللجنة ثلاث مراجعاتٍ متطابقة
 * الظاهر لا يفرّق بينها شيء، ولا يظهر منها ما تصلح الشاشة لعرضه أصلًا.
 */
const REVIEW_REASONS: ReadonlyArray<readonly [ReviewCase['reason'], ReviewCase['severity'], string]> = [
  ['judge_variance', 'medium', 'رصد المحكّم الأول خطأ حفظ (‎-0.5) عند الدقيقة 02:22، ورصد المحكّم الثاني ملاحظة تجويد (‎-0.25).'],
  ['ai_high_confidence_alert', 'high', 'إشارة نزاهة آلية: احتمال انتقال إلى آية متشابهة عند الدقيقة 01:14، بثقة مرتفعة.'],
  ['audio_dropout', 'low', 'انقطاع في الالتقاط دام إحدى عشرة ثانية أثناء الموضع الثاني؛ أُعيد الاستماع في القاعة.'],
  ['score_outlier', 'high', 'درجة المحكّم الثالث تبعد عن متوسط لجنته على المتسابق نفسه بأكثر من الحد المسموح.'],
  ['judge_variance', 'low', 'فارق ربع درجة في معيار الوقف والابتداء بين محكّمَي اللجنة.'],
  ['ai_high_confidence_alert', 'medium', 'تردّد متكرر عند الموضع الرابع؛ رُصد آليًا ويُعرض للمراجعة البشرية.'],
];

function demoReviewCases(results: ResultRecord[], participants: Participant[]): ReviewCase[] {
  const template = SEED_REVIEW_CASES.length ? clone(SEED_REVIEW_CASES[0]) : null;
  if (!template) return [];
  const byId = new Map(participants.map(p => [p.id, p]));
  return results
    .filter(result => result.status === 'calculated' || result.status === 'quality_checked')
    .slice(0, 8)
    .map((result, index) => {
      const participant = byId.get(result.participantId);
      const [reason, severity, details] = pick(REVIEW_REASONS, index);
      return {
        ...clone(template),
        id: `rc-demo-${index + 1}`,
        sessionId: `sess-demo-${index + 1}`,
        participantId: result.participantId,
        participantCode: participant?.code || result.participantCode,
        committeeId: participant?.assignedCommitteeId || template.committeeId,
        reason,
        severity,
        details,
        timestampSec: 45 + index * 37,
        status: index % 3 === 0 ? 'pending' : index % 3 === 1 ? 'confirmed' : 'dismissed',
      };
    });
}

function demoCertificates(results: ResultRecord[]): Certificate[] {
  const template = clone(SEED_CERTIFICATE);
  return results
    .filter(result => result.status === 'sealed')
    .slice(0, 40)
    .map((result, index) => ({
      ...clone(template),
      id: `cert-demo-${index + 1}`,
      participantId: result.participantId,
      participantName: result.participantName,
      participantNameArabic: result.participantNameArabic,
      finalScore: result.finalScore,
      rank: result.rank,
      issuedAt: '2027-02-11T17:30:00Z',
    }));
}

export interface DemoUniverse {
  committees: Committee[];
  judges: JudgeProfile[];
  participants: Participant[];
  results: ResultRecord[];
  judgeSubmissions: JudgeSubmission[];
  auditLogs: AuditEvent[];
  appeals: AppealRecord[];
  incidents: IncidentRecord[];
  reviewCases: ReviewCase[];
  certificates: Certificate[];
}

/*
 * من تنادي كل لجنة الآن.
 *
 * شاشة اللجنة وقاعة الانتظار تقرآن النداء من `committee.currentParticipantId` — وهو
 * الحقل نفسه الذي يكتبه بدء الجلسة ويمحوه اكتمالها. وكانت البيئة التجريبية تبني
 * متسابقين بحالة «داخل اللجنة» ولا تخبر لجانهم بهم، فتقول كل شاشةٍ في القاعة «لا يوجد
 * استدعاء — لم يُنادَ أحد بعد» بينما خمسة يقرؤون أمام لجانهم.
 *
 * والحالتان تُضبطان معًا: اللجنة تصير «تستقبل متسابقًا» ويُكتب فيها من تناديه، فلا تقول
 * الشاشة حالةً وتقول البيانات غيرها.
 */
function wireLiveCalls(committees: Committee[], participants: Participant[]): void {
  const called = new Set<string>();
  for (const committee of committees) {
    if (committee.status === 'offline') continue;
    const inSession = participants.find(p =>
      p.assignedCommitteeId === committee.id && p.status === 'in_session' && !called.has(p.id));
    if (!inSession) continue;
    called.add(inSession.id);
    committee.currentParticipantId = inSession.id;
    committee.status = 'testing';
  }
}

/*
 * سجلّ ما تُلي اليوم.
 *
 * خريطة «اليوم تُتلى في هذه القاعة» تُبنى من هذا السجلّ (انظر `hall-recitation.ts`)،
 * وهو في المنتج الحقيقي يُكتب سطرًا سطرًا عند اكتمال كل جلسة. وهنا يُبنى بأثر رجعي عمّن
 * أنهى اختباره في هذا اليوم التجريبي: لكل متسابقٍ أُدّي اختباره مواضعُ بعدد أسئلة يومه،
 * موزّعة على نطاق فئته بالقسمة لا بالتكديس — فتُضيء الخريطة كما تُضيء بعد يومٍ حقيقي،
 * ولا تُضيء صفحةٌ لم يقف أمامها أحد.
 */
function demoRecitationLedger(participants: Participant[], categories: Category[], competitionId: string): RecitedPassageRecord[] {
  const random = makeRandom(0x7265_6369);
  const rows: RecitedPassageRecord[] = [];
  const done = participants.filter(p => HAS_RESULT.includes(p.status));
  done.forEach((participant, index) => {
    const category = categories.find(c => c.id === participant.categoryId);
    const scope = category?.scope?.segments?.length ? category.scope : fullQuranScope();
    const ranges = scopeRanges(scope);
    const total = ranges.reduce((sum, [a, b]) => sum + (b - a + 1), 0);
    if (!total) return;
    const questions = Math.max(1, Math.min(8, Number(category?.questionsCount) || 4));
    for (let q = 0; q < questions; q++) {
      /* قسمةٌ على عدد الأسئلة ثم اختيارٌ داخل القسم: يومٌ كامل يغطّي النطاق بلا أن
         تتكدّس كل المواضع في جزئه الأول. */
      const bucket = total / questions;
      const offset = Math.min(total - 1, Math.floor(q * bucket + random() * bucket));
      let walked = 0;
      for (const [a, b] of ranges) {
        const size = b - a + 1;
        if (offset < walked + size) {
          const locus = ordinalToLocus(a + (offset - walked));
          const surahEnd = ayahCountOf(locus.surah) || locus.ayah;
          rows.push({
            id: `recited-demo-${index + 1}-${q + 1}`,
            competitionId,
            committeeId: participant.assignedCommitteeId || '',
            participantId: participant.id,
            sessionId: `sess-demo-${participant.id}`,
            surah: locus.surah,
            startAyah: locus.ayah,
            endAyah: Math.min(surahEnd, locus.ayah + 3),
            recordedAt: new Date(Date.UTC(2027, 1, 11, 7 + (index % 9), (index * 5) % 60)).toISOString(),
          });
          break;
        }
        walked += size;
      }
    }
  });
  return rows;
}

/** يُبنى مرة واحدة لكل تحميل صفحة. */
export function buildDemoUniverse(): DemoUniverse {
  const committees = demoCommittees();
  const judges = demoJudges(committees);
  const participants = demoParticipants(committees);
  wireLiveCalls(committees, participants);
  const results = demoResults(participants);
  return {
    committees,
    judges,
    participants,
    results,
    judgeSubmissions: demoJudgeSubmissions(participants, judges),
    auditLogs: demoAuditLogs(participants, committees),
    appeals: demoAppeals(results, participants),
    incidents: demoIncidents(committees),
    reviewCases: demoReviewCases(results, participants),
    certificates: demoCertificates(results),
  };
}

/**
 * حالة المخزن الكاملة للبيئة التجريبية.
 *
 * بُنيت هنا لا في `store.ts` عن قصد: قاعدة `production-runtime-audit` تمنع أي ملف
 * تشغيلي تحت `src/lib` أو `src/components` أو `server` من ذكر بيانات البذرة، وهي
 * قاعدةٌ صحيحة تحرس قرار «حالة الإطلاق الفارغة». فيبقى كل ذكرٍ للبذرة داخل `src/data`
 * وحدها، ويصل إليها المخزن باستيرادٍ ديناميكي لا يُنفَّذ إلا إذا كانت راية الديمو
 * مرفوعة — فلا تدخل هذه البيانات حزمة نشرٍ حقيقي أصلًا.
 */
/*
 * جلسات الدعم — الوحيدة المربوطة بالوقت الحاضر لا بتاريخ المسابقة.
 *
 * لوحة الدعم تصنّف بالزمن النسبي: «جديدة» ما طُلب خلال ربع ساعة، و«مفتوحة» ما لم
 * تنتهِ صلاحيته بعد. فتواريخ ٢٠٢٧ الثابتة كانت تُسقط كل شيء في خانةٍ واحدة وتترك
 * البقية أصفارًا. ولهذا وحده تُبنى هذه السجلات من `Date.now()`، ويبقى كل ما عداها
 * حتميًا كما هو.
 */
function demoSupportSessions(competitionId: string, organizationId: string): SupportSession[] {
  const now = Date.now();
  const at = (minutes: number) => new Date(now + minutes * 60_000).toISOString();
  const rows: Array<[string, SupportSession['status'], number, number]> = [
    ['تعذّر على رئيس اللجنة 3 فتح قائمة الختم بعد انقطاع الشبكة', 'requested', -4, 90],
    ['طلب تدقيق سبب رفض تسليم محكّم في اللجنة 7', 'requested', -9, 120],
    ['استفسار عن إعادة إصدار بطاقة متسابق فُقدت في القاعة', 'requested', -52, 60],
    ['مرافقة فنية أثناء ضبط أجهزة اللجنة 5 بعد عودتها للخدمة', 'approved', -95, 240],
    ['جلسة دعم جارية: مراجعة تسلسل الطابور بعد نقل متسابقَين', 'active', -35, 180],
    ['أُغلقت: إعادة ضبط صوت اللجنة 2 — تم التحقق مع المشغّل', 'ended', -320, -140],
  ];
  return rows.map(([reason, status, createdMinutes, expiresMinutes], index) => ({
    id: `sup-demo-${index + 1}`,
    organizationId,
    competitionId,
    requestedBy: index % 2 === 0 ? 'usr-demo-comp_admin' : `usr-demo-head-${index + 1}`,
    approvedBy: status === 'approved' || status === 'active' || status === 'ended' ? 'usr-demo-support_agent' : undefined,
    reason,
    status,
    createdAt: at(createdMinutes),
    updatedAt: status === 'requested' ? undefined : at(createdMinutes + 5),
    expiresAt: at(expiresMinutes),
  }));
}

/*
 * جهةُ العرض — بمعرّفٍ خاصٍّ بها.
 *
 * كانت البيئة تُبقي جهةَ الإطلاق الفارغة (`org-pending-setup`)، ولوحةُ «مسابقات
 * الجهة» تُخفي عمدًا كل مسابقةٍ تتبعها لأنها مسوّدة الإقلاع. فمن دخل بدور مدير
 * الجهة أو مدير الفرع رأى صفرًا وثلاثة أصفار، والمسابقة كاملةٌ خلف الشاشة.
 *
 * والمعرّف ليس معرّف البذرة المتقاعدة (`org-gqa-global`) ولا مسوّدة الإقلاع:
 * معرّفٌ ثالث لا يلتبس بأيٍّ منهما، فلا يقع تحت حارس بقايا البذرة ولا تحت إخفاء
 * المسوّدة.
 */
const DEMO_ORGANIZATION_ID = 'org-demo-mizan';

function demoOrganization(): Organization {
  return {
    ...clone(SEED_ORGANIZATION),
    id: DEMO_ORGANIZATION_ID,
    name: 'MIZAN Demo Competition Authority',
    nameArabic: 'جهة ميزان التجريبية للمسابقات القرآنية',
  };
}

/*
 * نطاق الحفظ المعتمد لكل متسابق في فئةٍ يختار نطاقها بنفسه.
 *
 * فئة «ربع القرآن» نمطها `participant_selected`: لا تبدأ جلسةُ متسابقٍ فيها حتى
 * يوجد له نطاقٌ **معتمد**، وإلا رُفض البدء بـ«نطاق الحفظ يحتاج مراجعة». وكانت
 * البيئة لا تولّد أي نطاق، فثُلث المتسابقين لا يمكن تحكيمهم إطلاقًا — ولا يظهر
 * ذلك في أي شاشة حتى يحاول محكّمٌ أن يبدأ.
 *
 * والاختيار ثمانية أجزاء متتابعة تختلف نقطة بدئها بين متسابق وآخر، كما تقتضي
 * قاعدة الفئة (`exactUnits: 8`).
 */
export function demoParticipantScopes(
  participants: Participant[],
  categories: typeof SEED_CATEGORIES,
  organizationId: string,
  competitionId: string,
): AppStoreState['participantScopes'] {
  const rows: AppStoreState['participantScopes'] = [];
  participants.forEach((participant, index) => {
    const category = categories.find(c => c.id === participant.categoryId);
    if (!category || category.scopeMode !== 'participant_selected' || !category.selectionRule) return;
    const firstJuz = 1 + ((index * 3) % 23);
    rows.push(
      buildParticipantScopeRecord({
        id: `pscope-demo-${index + 1}`,
        organizationId,
        competitionId,
        categoryId: category.id,
        participantId: participant.id,
        rule: category.selectionRule,
        selection: scopeFromJuzRange(firstJuz, firstJuz + 7),
        version: 1,
        status: 'approved',
        now: '2027-02-09T09:00:00Z',
      }),
    );
  });
  return rows;
}

/*
 * نطاق الفئة يُكتب صريحًا في بيئة العرض، ولا يُترك ليُخمَّن.
 *
 * ثلاث فئات في البذرة تقول نطاقها بعبارةٍ للقراءة — «20 جزءاً» ومعها
 * `juzCount: 20` — بلا `scope` مبنيّ. و`migrateLegacyScope` يرفض أن يشتقّ منها
 * نطاقًا عن حقّ: «عشرون جزءًا» لا تقول **أيّ** عشرين، واشتقاقُها تخمينًا يعني
 * سؤال متسابقٍ عن أجزاء لم يحفظها. فيردّ `needs_scope_confirmation`، وينتظر أن
 * يعتمد المنظّم النطاق بنفسه.
 *
 * وفي العرض لا منظّم ينتظرونه. فكانت كل جلسة تُردّ بـ«الفئة بلا نطاق محدد»،
 * ولا يرى المحكّم إلا «تعذّر بدء الجلسة… أو تعذّر تجهيز أسئلته» — ولا يظهر
 * السبب في أي جدول قبلها. فالعرض كله يقف عند أول ضغطة على «ابدأ جلسته».
 *
 * فيُعتمد النطاق هنا بدل تعطيل الحارس: الأجزاء الأولى بعدد ما تعلنه الفئة
 * نفسها، وهو عُرف المسابقات الأشيع وهو الاقتراح الذي يعرضه المُرحِّل ذاته على
 * المنظّم. والحارس يبقى كما هو لكل مسابقة حقيقية.
 *
 * و«ربع القرآن» تُترك كما هي: نطاقها يختاره المتسابق، ولكلٍّ سجلُّه المعتمد في
 * `demoParticipantScopes`.
 */
export function demoCategories(): Category[] {
  return clone(SEED_CATEGORIES).map(category => {
    if (category.scopeMode === 'participant_selected') return category;
    if (category.scope?.segments?.length) return category;
    const juzCount = Math.round(Number(category.juzCount) || 0);
    if (juzCount < 1) return category;
    return {
      ...category,
      scope: juzCount >= 30 ? fullQuranScope() : scopeFromJuzRange(1, juzCount),
      scopeMode: 'fixed' as const,
      scopeVersion: category.scopeVersion || 1,
      scopeMigration: 'derived_from_legacy' as const,
    };
  });
}

export function buildDemoInitialState(base: AppStoreState): AppStoreState {
  const universe = buildDemoUniverse();
  const organization = demoOrganization();
  const categories = demoCategories();
  const competition = {
    ...base.competition,
    id: SEED_COMPETITION.id,
    organizationId: organization.id,
    name: SEED_COMPETITION.name,
    nameArabic: SEED_COMPETITION.nameArabic,
    edition: SEED_COMPETITION.edition,
    country: SEED_COMPETITION.country,
    timezone: SEED_COMPETITION.timezone,
    startDate: SEED_COMPETITION.startDate,
    endDate: SEED_COMPETITION.endDate,
    status: SEED_COMPETITION.status,
    categories,
    venueName: SEED_COMPETITION.venueName,
    venuesCount: universe.committees.length,
    totalRegistered: universe.participants.length,
    totalApproved: universe.participants.filter(p => p.status !== 'submitted').length,
    totalAttended: universe.participants.filter(p => p.checkedInAt).length,
    currentDay: 1,
    totalDays: SEED_COMPETITION.totalDays,
  };
  return {
    ...base,
    currentUser: {
      id: 'usr-demo-admin',
      name: 'MIZAN Demo Director',
      nameArabic: 'مدير المسابقة (بيئة تجريبية)',
      email: 'demo.director@mizan.test',
      role: 'comp_admin',
      organizationId: organization.id,
    } as AppStoreState['currentUser'],
    organization,
    organizations: [organization],
    competition,
    competitions: [competition],
    // المتسابق يتبع جهة العرض لا جهة البذرة المتقاعدة.
    participants: universe.participants.map(participant => ({ ...participant, organizationId: organization.id })),
    committees: universe.committees,
    judges: universe.judges,
    results: universe.results,
    judgeSubmissions: universe.judgeSubmissions,
    auditLogs: universe.auditLogs,
    appeals: universe.appeals,
    incidents: universe.incidents,
    reviewCases: universe.reviewCases,
    certificates: universe.certificates,
    supportSessions: demoSupportSessions(competition.id, organization.id),
    /* أثر يومٍ كامل من التلاوة: منه تُضيء خريطة القاعة، وبغيره تبقى ٦٠٤ صفحة مطفأة. */
    recitationLedger: demoRecitationLedger(universe.participants, categories, competition.id),
    /* قنوات الجهة مربوطة: شاشة «القنوات» بلا ربطٍ واحد تقول إن المنظومة لا تصل بأحد. */
    integrations: demoIntegrations(organization.id),
    /* القائمة نفسها التي تدخل المسابقة — لا نسخة ثانية قد تفترق عنها. */
    participantScopes: demoParticipantScopes(universe.participants, categories, organization.id, competition.id),
  };
}

/*
 * قنوات الجهة في بيئة العرض.
 *
 * الشاشة تقرأ `integrations` وتقول عن كل قناةٍ لا سجلَّ لها «غير مربوط»، فكانت الشاشة
 * ستّ بطاقاتٍ رماديةٍ كلها — وهو وصفٌ صادق لجهةٍ لم تُهيَّأ، لا لجهةٍ تدير مسابقةً دولية.
 * وهذه أسماء مزوّدين تجريبية لا أسرار: الأسرار لا تُكتب في المتصفّح أصلًا، والحقل الذي
 * يحملها (`secretRef`) إشارةٌ إلى خزنة الخادم لا قيمةٌ فيها.
 */
function demoIntegrations(organizationId: string): IntegrationConfig[] {
  const rows: Array<[IntegrationConfig['kind'], string, IntegrationConfig['status'], boolean, string]> = [
    ['email', 'بوابة البريد الرسمية للجهة', 'configured', true, 'https://mail.demo.mizan.test/api'],
    ['sms', 'مزوّد الرسائل القصيرة المعتمد', 'configured', true, 'https://sms.demo.mizan.test/api'],
    ['whatsapp', 'حساب واتساب للأعمال — إشعارات المتسابقين', 'configured', true, 'https://wa.demo.mizan.test/api'],
    ['storage', 'تخزين الجهة (Cloudflare R2 — منطقة أوروبا)', 'configured', true, 'https://r2.demo.mizan.test'],
    ['identity', 'مزوّد الهوية الموحّدة للجهة', 'configured', true, 'https://id.demo.mizan.test'],
    /* قناةٌ محفوظة ومتعثّرة عن قصد: يومٌ بلا أي خلل لا يُظهر كيف يُعرض الخلل. */
    ['broadcast', 'مزوّد البثّ — قناة الحفل', 'degraded', true, 'https://live.demo.mizan.test'],
  ];
  return rows.map(([kind, name, status, enabled, endpoint], index) => ({
    id: `integration-demo-${index + 1}`,
    organizationId,
    kind,
    name,
    enabled,
    status,
    endpoint,
    secretRef: `vault://demo/${kind}`,
    lastCheckedAt: new Date(Date.UTC(2027, 1, 11, 6, 30 + index)).toISOString(),
  }));
}
