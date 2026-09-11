import type { Category, Committee, Participant } from '../types';
import { queueOrderValue } from './judging-integrity';

/*
 * إسقاط شاشات القاعة.
 *
 * كانت كل شاشة تقرأ المخزن وتعيد اشتقاق منطقها بيدها: لوحة الانتظار تفرز الطابور وتقصّه
 * وتبحث عن اللجنة المستدعية داخل JSX. فحين صارت اللجان عشرًا انكسر ما بُني للجنتين —
 * «التالي» يُقصّ من طابورٍ **عام** فلا يرى صاحب اللجنة العاشرة نفسه، وبطاقات النداء في
 * عمودين تفيض عن التلفاز قبل اللجنة السادسة.
 *
 * هنا الإسقاط وحده، نقيًّا: شرائح جاهزة للعرض تشتق منها كل شاشة عدستها — القاعة كلها،
 * أو لجنة واحدة، أو جيب المتسابق. والأثر — الاشتراك والرسم والقفل — يبقى في مكانه.
 *
 * ثلاث قواعد تحكم كل ما يخرج من هنا:
 *
 *   ١) **لا يخرج إلا الكود.** لا اسم، ولا سؤال، ولا موضعه، ولا درجة، ولا اسم محكّم.
 *      من ينتظر خلف الباب يرى الشاشة، فما عليها يتسع نطاق انكشافه لا محالة.
 *   ٢) **لكل لجنة طابورها.** الترتيب من `queueOrderValue` نفسه الذي تحتكم إليه أسطح
 *      التحكيم، فلا تقول الشاشة ترتيبًا وتقول اللجنة غيره.
 *   ٣) **العمر يُعلن.** كل إسقاط يحمل لحظة توليده. شاشة متجمّدة تقول إنها متجمّدة —
 *      وإلا فقد الجمهور ثقته في كل شاشة بعدها.
 */

export const DISPLAY_BOARD_VERSION = 'MIZAN-DISPLAY-BOARD-1';

/** بعد هذا العمر يُعلن التأخّر بهدوء، وبعد الثاني تُعلن الشاشة توقّفها صراحةً. */
export const BOARD_LAGGING_MS = 30_000;
export const BOARD_STALE_MS = 90_000;

/** كم اسمًا تاليًا تعرضه كل عدسة. اللجنة تتّسع لثلاثة، وخلية القاعة لواحد. */
export const PANEL_NEXT_DEPTH = 3;
export const HALL_NEXT_DEPTH = 1;

/** حدٌّ أدنى لزمن الجلسة حين تأتي اللجنة بصفر أو بقيمة غائبة — فلا يُقسَم على صفر ولا يُعرض NaN. */
const MIN_SESSION_MINUTES = 1;

export type BoardFreshness = 'LIVE' | 'LAGGING' | 'STALE';

export interface BoardCategoryTag {
  id: string;
  code: string;
  /** اسم الفئة كما تسمّيها الجهة. */
  label: string;
  /** مدى الحفظ بعبارة عربية صحيحة: «القرآن كامل» أو «عشرون جزءًا». */
  scopeLabel: string;
}

export interface BoardCallSlot {
  code: string;
  /** موضعه داخل طابور لجنته، من واحد. */
  position: number;
}

export interface CommitteeBoardSlice {
  committeeId: string;
  code: string;
  name: string;
  nameArabic: string;
  venueHall: string;
  status: Committee['status'];
  /** فئات هذه اللجنة — هويتها التي يبحث عنها الواقف في الممر. */
  categories: BoardCategoryTag[];
  nowCalling?: BoardCallSlot;
  next: BoardCallSlot[];
  waitingCount: number;
  completedCount: number;
  /**
   * لجنةٌ شاغرة وأمامها منتظرون. عطبٌ تشغيليّ حقيقي — لا حكمٌ على سرعة اللجنة: النظام
   * يحظر ترتيب اللجان بالسرعة، وهذا يقول «أحدٌ لم يُنادَ» لا «هذه اللجنة بطيئة».
   */
  stalled: boolean;
  averageSessionMinutes: number;
  /** تقدير، لا وعد. يُعرض مقرونًا بكلمة «تقريبًا». */
  estimatedWaitMinutes: number;
}

export interface DisplayBoard {
  version: string;
  competitionId: string;
  competitionName: string;
  competitionNameArabic: string;
  generatedAt: string;
  /** ثابتٌ اليوم. الكود وحده يُعرض، ولا يحمل الإسقاط اسمًا أصلًا ليُسرَّب. */
  privacyMode: 'CODES_ONLY';
  committees: CommitteeBoardSlice[];
  totalWaiting: number;
  /**
   * منتظرون بلا لجنة. لا يظهرون في أي شريحة، فلو لم يُعدّوا هنا لاختفوا من الشاشة
   * ومن انتباه المشرف معًا — وهذه حالة تشغيلية حقيقية: البوابة تُرجع «لا إسناد» حين
   * لا تؤهّل المتسابقَ أيُّ لجنة.
   */
  unassignedWaiting: number;
  activePanels: number;
  /** ما أنجزته القاعة كلها اليوم. الانتظار يصير تقدّمًا حين يُرى مجموعه. */
  totalCompleted: number;
  /** لجانٌ شاغرة وأمامها منتظرون — يراها المشرف قبل أن يشتكي أحد. */
  stalledPanels: number;
}

/* ── الفئة ───────────────────────────────────────────────────────────────── */

/*
 * مدى الحفظ بعربية سليمة. `memorizationScope` نصٌّ حرّ يكتبه المُعِدّ («Full Quran»،
 * «20 Juz»)، فلا يصلح لشاشة تُقرأ من بُعد أمتار — والعدد وحده يُشتق منه تمييزٌ صحيح.
 */
export function scopeLabelFor(category: Pick<Category, 'juzCount' | 'memorizationScope'>, ar = true): string {
  const juz = Number(category?.juzCount) || 0;
  if (!ar) return juz >= 30 ? 'Full Quran' : juz > 0 ? `${juz} Juz` : String(category?.memorizationScope || '').trim();
  if (juz >= 30) return 'القرآن كامل';
  if (juz === 1) return 'جزء واحد';
  if (juz === 2) return 'جزءان';
  /* تمييز العدد: من ٣ إلى ١٠ جمعُ قلّة مجرور، ومن ١١ فصاعدًا مفردٌ منصوب. */
  if (juz >= 3 && juz <= 10) return `${juz} أجزاء`;
  if (juz >= 11) return `${juz} جزءًا`;
  return String(category?.memorizationScope || '').trim();
}

/** فئات لجنة بعينها، بترتيب الفئات في المسابقة لا بترتيب الإسناد — فلا يتغيّر الوسم بين شاشتين. */
export function categoryTagsFor(committee: Committee, categories: Category[], ar = true): BoardCategoryTag[] {
  const assigned = new Set(committee.assignedCategories || []);
  return categories
    .filter((c) => assigned.has(c.id))
    .map((c) => ({
      id: c.id,
      code: c.code,
      label: (ar ? c.nameArabic || c.name : c.name || c.nameArabic) || c.code,
      scopeLabel: scopeLabelFor(c, ar),
    }));
}

/**
 * سطر هوية اللجنة. لجنةٌ بفئةٍ واحدة تُعرَّف بها؛ وبفئاتٍ عدّة يُذكر عددها لا قائمتها —
 * سطرٌ طويل على شاشةٍ بعيدة لا يُقرأ أصلًا، والتفصيل يبقى في وسوم الفئات نفسها.
 */
export function categoryLine(tags: BoardCategoryTag[], ar = true): string {
  if (!tags.length) return ar ? 'لم تُسند فئة' : 'No category assigned';
  if (tags.length === 1) return tags[0].label;
  if (!ar) return `${tags.length} categories`;
  if (tags.length === 2) return 'فئتان';
  if (tags.length <= 10) return `${tags.length} فئات`;
  return `${tags.length} فئة`;
}

/* ── الإسقاط ─────────────────────────────────────────────────────────────── */

export interface DisplayBoardInput {
  competitionId: string;
  competitionName?: string;
  competitionNameArabic?: string;
  participants: Participant[];
  committees: Committee[];
  categories: Category[];
  /** زمن الجلسة المُعدّ للمسابقة، يُستعمل حين تأتي اللجنة بلا متوسّط. */
  fallbackSessionMinutes?: number;
  /**
   * ما مضى من الجلسة الجارية لكل لجنة، حين يعرفه الجهاز. لا يعرف الجهاز إلا جلسته،
   * فما جهله يُقدَّر بنصف متوسّط الجلسة — وهو المتوقّع رياضيًا حين تُجهل البداية.
   */
  elapsedSecondsByCommittee?: Record<string, number>;
  nextDepth?: number;
  ar?: boolean;
  now?: Date;
}

export function buildDisplayBoard(input: DisplayBoardInput): DisplayBoard {
  const {
    competitionId,
    participants,
    committees,
    categories,
    fallbackSessionMinutes,
    elapsedSecondsByCommittee,
    nextDepth = PANEL_NEXT_DEPTH,
    ar = true,
    now = new Date(),
  } = input;

  const scoped = participants.filter((p) => p.competitionId === competitionId);
  const waiting = scoped.filter((p) => p.status === 'in_queue').sort((a, b) => queueOrderValue(a) - queueOrderValue(b));
  const panels = committees.filter((c) => c.competitionId === competitionId);

  /* طابور كل لجنة مرّة واحدة: عشر لجان × طابورٍ كامل لكلٍّ منها مسحٌ تربيعي بلا داعٍ. */
  const queues = new Map<string, Participant[]>();
  let unassignedWaiting = 0;
  for (const p of waiting) {
    const id = p.assignedCommitteeId;
    if (!id) { unassignedWaiting += 1; continue; }
    const rows = queues.get(id);
    if (rows) rows.push(p); else queues.set(id, [p]);
  }

  const byId = new Map(scoped.map((p) => [p.id, p]));
  const depth = Math.max(0, nextDepth);

  const slices: CommitteeBoardSlice[] = panels.map((c) => {
    const queue = queues.get(c.id) || [];
    const tags = categoryTagsFor(c, categories, ar);
    const avg = Math.max(MIN_SESSION_MINUTES, Number(c.averageSessionMinutes) || Number(fallbackSessionMinutes) || 0);

    /* لجنةٌ تشير إلى متسابقٍ لم يعد في السجل لا تُسقط الشاشة: النداء يغيب وحده. */
    const current = c.currentParticipantId ? byId.get(c.currentParticipantId) : undefined;

    /* بقيّة الجلسة الجارية: معلومةً إن عرفها الجهاز، وإلا نصف المتوسّط. */
    const elapsedSeconds = elapsedSecondsByCommittee?.[c.id];
    const remainingMinutes = current
      ? typeof elapsedSeconds === 'number' && Number.isFinite(elapsedSeconds)
        ? Math.max(0, avg - elapsedSeconds / 60)
        : avg / 2
      : 0;

    return {
      committeeId: c.id,
      code: c.code,
      name: c.name,
      nameArabic: c.nameArabic,
      venueHall: c.venueHall || '',
      status: c.status,
      categories: tags,
      nowCalling: current ? { code: current.code, position: 0 } : undefined,
      next: queue.slice(0, depth).map((p, i) => ({ code: p.code, position: i + 1 })),
      waitingCount: queue.length,
      completedCount: Math.max(0, Number(c.completedCount) || 0),
      stalled: !current && queue.length > 0 && c.status !== 'offline',
      averageSessionMinutes: avg,
      estimatedWaitMinutes: Math.round(queue.length * avg + remainingMinutes),
    };
  });

  return {
    version: DISPLAY_BOARD_VERSION,
    competitionId,
    competitionName: String(input.competitionName || ''),
    competitionNameArabic: String(input.competitionNameArabic || ''),
    generatedAt: now.toISOString(),
    privacyMode: 'CODES_ONLY',
    committees: slices,
    totalWaiting: waiting.length,
    unassignedWaiting,
    activePanels: panels.filter((c) => c.status === 'testing').length,
    totalCompleted: slices.reduce((sum, c) => sum + c.completedCount, 0),
    stalledPanels: slices.filter((c) => c.stalled).length,
  };
}

/* ── العدسات ─────────────────────────────────────────────────────────────── */

/**
 * شريحة لجنة بعينها. المفتاح كودٌ (`C7`) أو معرّف — والكود غير حسّاس لحالة الأحرف
 * لأنه يُكتب بيد المشرف في رابط الشاشة.
 */
export function selectCommitteeSlice(board: DisplayBoard, key: string): CommitteeBoardSlice | undefined {
  const needle = String(key || '').trim().toLowerCase();
  if (!needle) return undefined;
  return board.committees.find((c) => c.committeeId.toLowerCase() === needle || c.code.toLowerCase() === needle);
}

/** شرائح عدّة بالترتيب المطلوب، مع تجاهل ما لا وجود له — شاشة التناوب لا تسقط بمفتاح خطأ. */
export function selectCommitteeSlices(board: DisplayBoard, keys: string[]): CommitteeBoardSlice[] {
  const seen = new Set<string>();
  const out: CommitteeBoardSlice[] = [];
  for (const key of keys) {
    const slice = selectCommitteeSlice(board, key);
    if (slice && !seen.has(slice.committeeId)) { seen.add(slice.committeeId); out.push(slice); }
  }
  return out;
}

/** مفاتيح الشاشة من نصٍّ واحد في الرابط: `C7,C8` أو `C7 C8`. */
export function parsePanelKeys(raw: string | null | undefined): string[] {
  return String(raw || '').split(/[\s,]+/).map((x) => x.trim()).filter(Boolean);
}

/* ── الصدق الزمني ────────────────────────────────────────────────────────── */

export interface BoardAge {
  state: BoardFreshness;
  ageSeconds: number;
}

/**
 * عمر الإسقاط وحالته. ساعةُ الجهاز قد تسبق ساعة المصدر، فالعمر السالب يُقصّ إلى صفر
 * بدل أن يُعرض «قبل ‎-٤‎ ثوانٍ» — ولا يُعدّ ذلك تأخّرًا.
 */
export function boardAge(generatedAt: string, now: Date = new Date()): BoardAge {
  const at = Date.parse(generatedAt);
  if (!Number.isFinite(at)) return { state: 'STALE', ageSeconds: 0 };
  const ms = Math.max(0, now.getTime() - at);
  return {
    state: ms >= BOARD_STALE_MS ? 'STALE' : ms >= BOARD_LAGGING_MS ? 'LAGGING' : 'LIVE',
    ageSeconds: Math.floor(ms / 1000),
  };
}

/** «الآن» / «قبل ٨ ثوانٍ» / «قبل ٣ دقائق» — تمييزٌ صحيح، فالشاشة تُقرأ لا تُفكّ. */
export function describeAge(ageSeconds: number, ar = true): string {
  const s = Math.max(0, Math.floor(ageSeconds));
  if (!ar) return s < 5 ? 'just now' : s < 60 ? `${s}s ago` : `${Math.floor(s / 60)}m ago`;
  /* ما دون خمس ثوانٍ «الآن»: عدّادٌ يرمش كل ثانية على شاشةِ قاعةٍ يشدّ العين بلا فائدة. */
  if (s < 5) return 'الآن';
  if (s < 60) return s <= 10 ? `قبل ${s} ثوانٍ` : `قبل ${s} ثانية`;
  const m = Math.floor(s / 60);
  return m === 1 ? 'قبل دقيقة' : m === 2 ? 'قبل دقيقتين' : m <= 10 ? `قبل ${m} دقائق` : `قبل ${m} دقيقة`;
}

/** الزمن المتوقّع بعبارة تُقرأ. الصفر ليس «٠ دقيقة» بل «لا انتظار». */
export function describeWait(minutes: number, ar = true): string {
  const m = Math.max(0, Math.round(minutes));
  if (!ar) return m === 0 ? 'No wait' : m < 60 ? `~${m} min` : `~${Math.floor(m / 60)}h ${m % 60}m`;
  if (m === 0) return 'لا انتظار';
  if (m === 1) return 'دقيقة تقريبًا';
  if (m === 2) return 'دقيقتان تقريبًا';
  if (m <= 10) return `${m} دقائق تقريبًا`;
  if (m < 60) return `${m} دقيقة تقريبًا`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  const hours = h === 1 ? 'ساعة' : h === 2 ? 'ساعتان' : `${h} ساعات`;
  return rest ? `${hours} و${rest} دقيقة تقريبًا` : `${hours} تقريبًا`;
}

/** حالة اللجنة بعبارة تُعرض على شاشة، لا برمزٍ داخلي. */
export function describePanelStatus(status: Committee['status'], reciting: boolean, ar = true): string {
  if (!ar) {
    if (status === 'offline') return 'Offline';
    if (status === 'paused') return 'Paused';
    if (status === 'testing') return reciting ? 'Recitation in progress' : 'Session in progress';
    return 'Ready';
  }
  if (status === 'offline') return 'متوقفة';
  if (status === 'paused') return 'موقوفة مؤقتًا';
  if (status === 'testing') return reciting ? 'تحت التلاوة' : 'الجلسة جارية';
  return 'جاهزة لاستقبال التالي';
}

/* ── القراءة من مصدرٍ خارجي ──────────────────────────────────────────────── */

/*
 * إسقاطٌ يُقرأ من وثيقةٍ عامة لا يُصدَّق كما جاء.
 *
 * شاشة القاعة تقرأ `public_boards/{competitionId}` بلا تسجيل دخول، فالوثيقة مكشوفة
 * للقراءة. والكاتب مُصرَّح له، لكن «مُصرَّح» ليست «معصوم»: جهازٌ مخترق، أو إصدارٌ أقدم
 * يكتب حقولًا زائدة، أو خطأٌ في النشر — كلّها تصل الشاشة.
 *
 * فالمُحلِّل هنا **يعيد بناء** الإسقاط من الحقول المعروفة وحدها بأنواعها، ولا ينسخ ما جاء.
 * وأثرُه أن حقلًا لم يُصمَّم — اسمًا، سؤالًا، درجة — لا يمكن أن يصل الشاشة ولو كُتب في
 * الوثيقة: ليس له مكانٌ في البناء الجديد فيسقط صامتًا. المنعُ بالبنية لا بالثقة.
 */

const asText = (v: unknown, max = 200): string => (typeof v === 'string' ? v.slice(0, max) : '');
const asCount = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
};
const PANEL_STATUSES: Committee['status'][] = ['ready', 'testing', 'paused', 'offline'];

function parseSlot(raw: unknown): BoardCallSlot | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const code = asText((raw as Record<string, unknown>).code, 40);
  return code ? { code, position: asCount((raw as Record<string, unknown>).position) } : undefined;
}

function parseSlice(raw: unknown): CommitteeBoardSlice | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const committeeId = asText(r.committeeId, 80);
  if (!committeeId) return null;
  const status = PANEL_STATUSES.includes(r.status as Committee['status']) ? (r.status as Committee['status']) : 'ready';
  return {
    committeeId,
    code: asText(r.code, 24),
    name: asText(r.name, 120),
    nameArabic: asText(r.nameArabic, 120),
    venueHall: asText(r.venueHall, 120),
    status,
    categories: (Array.isArray(r.categories) ? r.categories : []).slice(0, 24).flatMap((t) => {
      if (!t || typeof t !== 'object') return [];
      const tag = t as Record<string, unknown>;
      const id = asText(tag.id, 80);
      return id ? [{ id, code: asText(tag.code, 24), label: asText(tag.label, 120), scopeLabel: asText(tag.scopeLabel, 60) }] : [];
    }),
    nowCalling: parseSlot(r.nowCalling),
    next: (Array.isArray(r.next) ? r.next : []).slice(0, 12).flatMap((x) => { const s = parseSlot(x); return s ? [s] : [] }),
    waitingCount: asCount(r.waitingCount),
    completedCount: asCount(r.completedCount),
    stalled: r.stalled === true,
    averageSessionMinutes: Math.max(MIN_SESSION_MINUTES, asCount(r.averageSessionMinutes)),
    estimatedWaitMinutes: asCount(r.estimatedWaitMinutes),
  };
}

/** يعيد إسقاطًا نظيفًا، أو `null` حين لا يكون ما جاء إسقاطًا أصلًا. */
export function parseDisplayBoard(raw: unknown): DisplayBoard | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const competitionId = asText(r.competitionId, 80);
  const generatedAt = asText(r.generatedAt, 40);
  if (!competitionId || !Number.isFinite(Date.parse(generatedAt))) return null;

  const committees = (Array.isArray(r.committees) ? r.committees : [])
    .slice(0, 64)
    .flatMap((c) => { const s = parseSlice(c); return s ? [s] : [] });

  return {
    version: DISPLAY_BOARD_VERSION,
    competitionId,
    competitionName: asText(r.competitionName, 200),
    competitionNameArabic: asText(r.competitionNameArabic, 200),
    generatedAt,
    /* الخصوصية تُفرَض هنا، ولا تُقرأ من الوثيقة: قيمةٌ أخرى مكتوبةً لا تفتح بابًا. */
    privacyMode: 'CODES_ONLY',
    committees,
    totalWaiting: asCount(r.totalWaiting),
    unassignedWaiting: asCount(r.unassignedWaiting),
    activePanels: asCount(r.activePanels),
    totalCompleted: asCount(r.totalCompleted),
    stalledPanels: committees.filter((c) => c.stalled).length,
  };
}
