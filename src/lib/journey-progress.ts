/*
 * أين وصل المتسابق فعلًا؟
 *
 * الحالةُ المكتوبة على سجلّه قد تتأخّر عن الواقع: جلسةٌ أُنهيت ولم يُكتب بعدها «tested»،
 * فيبقى المسار عالقًا عند «الانتظار» والمتسابق قد خرج بدرجته. فالمسارُ يُشتقّ من أقوى
 * شاهد: الشهادةُ ثم النتيجةُ ثم تقييماتُ المحكّمين المقفلة ثم الحالةُ المكتوبة — ولا ينزل
 * شاهدٌ أقوى إلى ما دونه.
 */
export const JOURNEY_ORDER = ['submitted', 'under_review', 'approved', 'checked_in', 'in_queue', 'in_session', 'tested', 'appealed', 'certified'] as const;
export type JourneyStage = typeof JOURNEY_ORDER[number];

const ALIASES: Record<string, JourneyStage> = {
  draft: 'submitted', pending: 'submitted', registered: 'submitted', reviewing: 'under_review',
  accepted: 'approved', arrived: 'checked_in', waiting: 'in_queue', queued: 'in_queue', called: 'in_session',
  judging: 'in_session', reciting: 'in_session', completed: 'tested', judged: 'tested', scored: 'tested',
  finished: 'tested', done: 'tested', result_published: 'tested', published: 'tested', appeal: 'appealed',
};

export const normalizeJourneyStage = (status: string | null | undefined): JourneyStage => {
  const s = String(status || '').trim().toLowerCase();
  if ((JOURNEY_ORDER as readonly string[]).includes(s)) return s as JourneyStage;
  return ALIASES[s] ?? 'submitted';
};

export interface JourneyEvidence {
  status: string | null | undefined;
  /** نتيجةٌ محسوبة أو منشورة لهذا المتسابق. */
  hasResult?: boolean;
  hasCertificate?: boolean;
  /** قُفل تقييمُ محكّمٍ واحدٍ على الأقل — أي انتهت تلاوته. */
  hasLockedScores?: boolean;
  /** جلستُه مفتوحةٌ الآن. */
  inSession?: boolean;
}

export const deriveJourneyStage = (e: JourneyEvidence): JourneyStage => {
  const rank = (s: JourneyStage) => JOURNEY_ORDER.indexOf(s);
  let stage = normalizeJourneyStage(e.status);
  const lift = (s: JourneyStage) => { if (rank(s) > rank(stage)) stage = s; };
  if (e.inSession) lift('in_session');
  if (e.hasLockedScores || e.hasResult) lift('tested');
  if (e.hasCertificate) lift('certified');
  return stage;
};

export const journeyStepIndex = (e: JourneyEvidence): number => JOURNEY_ORDER.indexOf(deriveJourneyStage(e));

/*
 * رقم المتسابق يُقرأ بصوتٍ عالٍ عند النداء، فيُعرض مجمّعًا: «A-3869311» كان يظهر كتلةً
 * واحدة، وفي سطرٍ عربيٍّ ينقلب إلى «3869311-A». يُجمَّع كلّ ثلاثة أرقام من اليمين
 * بمسافةٍ ضيّقة، ويُعرض دائمًا باتجاهٍ من اليسار (dir="ltr").
 */
export const formatParticipantCode = (code: string | null | undefined): string => {
  const raw = String(code ?? '').trim();
  const m = /^([A-Za-z]{0,3})-?(\d{4,})$/.exec(raw);
  if (!m) return raw;
  const grouped = m[2].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return m[1] ? `${m[1].toUpperCase()}-${grouped}` : grouped;
};

/** اسمٌ للعرض: لا يظهر رقمٌ أو معرّفٌ خام مكان الاسم. */
export const displayParticipantName = (name: string | null | undefined, code: string | null | undefined, ar: boolean): string => {
  const n = String(name ?? '').trim();
  if (n && !/^[A-Za-z]{0,3}-?\d{4,}$/.test(n) && !/^part-/.test(n)) return n;
  const c = formatParticipantCode(code || n);
  return c ? (ar ? `المتسابق ${c}` : `Participant ${c}`) : (ar ? 'المتسابق' : 'Participant');
};
