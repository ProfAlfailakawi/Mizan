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
  JudgeProfile,
  JudgeSubmission,
  Participant,
  Organization,
  ResultRecord,
  ReviewCase,
  SupportSession,
} from '../types';
import type { AppStoreState } from '../lib/store-state';
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
    judgeIds: [`usr-demo-judge-${index * 2 + 1}`, `usr-demo-judge-${index * 2 + 2}`],
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
        certifiedRiwayat: [pick(RIWAYAT, index + j), 'Hafs'].filter((v, i, a) => a.indexOf(v) === i),
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
      categoryId: pick(SEED_CATEGORIES, index).id,
      riwaya: pick(RIWAYAT, index),
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

function demoAppeals(results: ResultRecord[]): AppealRecord[] {
  const template = SEED_APPEALS.length ? clone(SEED_APPEALS[0]) : null;
  if (!template) return [];
  return results.slice(0, 9).map((result, index) => ({
    ...clone(template),
    id: `appeal-demo-${index + 1}`,
    participantId: result.participantId,
    status: index % 4 === 0 ? 'submitted' : index % 4 === 1 ? 'under_review' : index % 4 === 2 ? 'accepted' : 'rejected',
    submittedAt: new Date(Date.UTC(2027, 1, 11, 14, index * 6)).toISOString(),
  }));
}

function demoIncidents(committees: Committee[]): IncidentRecord[] {
  const template = SEED_INCIDENTS.length ? clone(SEED_INCIDENTS[0]) : null;
  if (!template) return [];
  const kinds: ReadonlyArray<readonly [string, string]> = [
    ['انقطاع صوت في القاعة', 'تعذّر التقاط الصوت لمدة أربع دقائق؛ استُؤنفت الجلسة بعد إعادة التوصيل.'],
    ['تأخر وصول متسابق', 'وصل بعد انقضاء حجزه فأُعيد جدولته في نهاية الطابور.'],
    ['خلاف على درجة', 'فارق بين محكّمين تجاوز الحدّ المسموح فأُحيل إلى رئيس اللجنة.'],
    ['عطل جهاز', 'جهاز لوحي توقف أثناء الإدخال؛ استُعيدت الدرجة من نقطة الحفظ.'],
    ['انقطاع شبكة', 'عملت القاعة دون اتصال لسبع دقائق ثم زُوملت السجلات.'],
  ];
  return kinds.map(([title, description], index) => ({
    ...clone(template),
    id: `inc-demo-${index + 1}`,
    title,
    description,
    committeeId: pick(committees, index + 2).id,
    severity: index === 2 ? 'critical' : index % 2 === 0 ? 'moderate' : 'low',
    status: index === 0 ? 'active' : index === 1 ? 'investigating' : 'resolved',
    createdAt: new Date(Date.UTC(2027, 1, 11, 9 + index, index * 11)).toISOString(),
  }));
}

function demoReviewCases(results: ResultRecord[]): ReviewCase[] {
  const template = SEED_REVIEW_CASES.length ? clone(SEED_REVIEW_CASES[0]) : null;
  if (!template) return [];
  return results
    .filter(result => result.status === 'calculated' || result.status === 'quality_checked')
    .slice(0, 8)
    .map((result, index) => ({
      ...clone(template),
      id: `rc-demo-${index + 1}`,
      participantId: result.participantId,
      status: index % 3 === 0 ? 'pending' : index % 3 === 1 ? 'confirmed' : 'dismissed',
    }));
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

/** يُبنى مرة واحدة لكل تحميل صفحة. */
export function buildDemoUniverse(): DemoUniverse {
  const committees = demoCommittees();
  const judges = demoJudges(committees);
  const participants = demoParticipants(committees);
  const results = demoResults(participants);
  return {
    committees,
    judges,
    participants,
    results,
    judgeSubmissions: demoJudgeSubmissions(participants, judges),
    auditLogs: demoAuditLogs(participants, committees),
    appeals: demoAppeals(results),
    incidents: demoIncidents(committees),
    reviewCases: demoReviewCases(results),
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

export function buildDemoInitialState(base: AppStoreState): AppStoreState {
  const universe = buildDemoUniverse();
  const organization = demoOrganization();
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
    categories: clone(SEED_CATEGORIES),
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
  };
}
