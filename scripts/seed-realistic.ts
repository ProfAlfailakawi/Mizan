#!/usr/bin/env node
/*
 * زرعٌ واقعيّ حتميّ لبيئة الفحص المحلية — **على المحاكي وحده**.
 *
 * لماذا: التطبيق في وضع الإنتاج يبدأ فارغًا (لا بيانات عرض)، فلا يمكن اختبار شاشة مدير الجهة
 * أو رئيس التحكيم أو الفوترة بلا بياناتٍ تشبه التشغيل الحقيقي. هذا السكربت يبني مجتمعًا كاملًا
 * بأسماء عربية واقعية: مشغّلون وجهات ومسابقات ولجان ومحكّمون ومتسابقون وأولياء أمور ودرجات
 * وطلبات استثناء واعتراضات وشهادات وفواتير وتخزين وسجلّ تدقيق — بأدوار المنصة كلها.
 *
 * خصائصه:
 *  - حتميّ: بذرة ثابتة، فالتشغيلان يُنتجان البيانات نفسها (المعرّفات والأسماء والدرجات).
 *  - قابل لإعادة التشغيل: يمسح مساحة QA ثم يعيد البناء (--keep يُبقي ما سبق).
 *  - لا حسابات عرض (demo) ولا بيانات من src/data: كل شيء يُولَّد هنا.
 *  - لا يكتب إلا على محاكي Firestore (FIRESTORE_EMULATOR_HOST) وفي مجلد QA المحلي.
 *  - يستعمل مستودعات الخادم الحقيقية (SaaSPlatformRepository) حيث وُجدت، فلا يُخترع شكل بيانات.
 *
 * التشغيل:  source scripts/qa/env.sh && npx tsx scripts/seed-realistic.ts [--scale=1] [--keep]
 * كلمة مرور كل الحسابات المحلية: Qa-Pass-1234  (تُعرَّف في scripts/qa/common.mjs)
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { FirestoreRestRepository } from '../server/firestore-rest';
import { SaaSPlatformRepository, SecretVault, type CommercialActor } from '../server/saas-platform';
import { fullQuranScope, scopeFromJuz, scopeFromJuzRange, scopeSignature } from '../src/lib/quran-scope';
import { getCompetitionPolicy } from '../src/lib/competition-config';
import { categoryDistribution, categoryScopeOf, resolveQuestionCount } from '../src/lib/scope-engine';
import { describeScope } from '../src/lib/quran-scope';
import type {
  AppealRecord, AuditEvent, Category, Certificate, Committee, Competition, JudgeProfile, JudgeSubmission,
  Participant, ResultRecord, ReviewCase, RuleSet, Role, RegistrationStatus,
} from '../src/types';

const emulator = String(process.env.FIRESTORE_EMULATOR_HOST || '').trim();
if (!emulator) {
  console.error('SEED_REFUSED_WITHOUT_EMULATOR: FIRESTORE_EMULATOR_HOST غير مضبوط. هذا السكربت لا يلمس Firestore حقيقيًا.');
  process.exit(2);
}
const projectId = String(process.env.FIREBASE_PROJECT_ID || 'mizan-qa').trim();
const qaDir = path.resolve(process.env.RIG_DIR || path.join(process.cwd(), '.mizan-data', 'qa'));
const args = new Set(process.argv.slice(2));
const scale = Number((process.argv.find(a => a.startsWith('--scale=')) || '--scale=1').split('=')[1]) || 1;
/** --stress=N يضيف مسابقةً كبيرة (N متسابقًا) لاختبار القوائم الطويلة والتخزين المحلي. */
const stress = Number((process.argv.find(a => a.startsWith('--stress=')) || '--stress=0').split('=')[1]) || 0;
const PASSWORD = 'Qa-Pass-1234';
const NOW = Date.parse(process.env.RIG_SEED_NOW || '2026-10-18T09:00:00Z'); // ثابت ليبقى الزرع حتميًا

/* ---------- حتمية ---------- */
function rngFrom(seed: string) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) { h = Math.imul(h ^ seed.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = (h ^= h >>> 16) >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const rnd = rngFrom('mizan-realistic-seed-v1');
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)];
const int = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
const iso = (ms: number) => new Date(ms).toISOString();
const DAY = 86_400_000;

/* ---------- أسماء عربية واقعية (عربي ‒ لاتيني) ---------- */
const MALE: [string, string][] = [['محمد', 'Muhammad'], ['أحمد', 'Ahmad'], ['عبدالله', 'Abdullah'], ['عبدالرحمن', 'Abdulrahman'], ['يوسف', 'Yusuf'], ['إبراهيم', 'Ibrahim'], ['إسماعيل', 'Ismail'], ['خالد', 'Khalid'], ['عمر', 'Omar'], ['علي', 'Ali'], ['حسن', 'Hassan'], ['حسين', 'Hussein'], ['بلال', 'Bilal'], ['حمزة', 'Hamza'], ['زيد', 'Zaid'], ['ياسين', 'Yassin'], ['سلمان', 'Salman'], ['فهد', 'Fahad'], ['ناصر', 'Nasser'], ['سعد', 'Saad'], ['صالح', 'Salih'], ['مصعب', 'Musab'], ['أنس', 'Anas'], ['معاذ', 'Muadh'], ['طارق', 'Tariq'], ['ماجد', 'Majid'], ['راشد', 'Rashid'], ['سالم', 'Salim'], ['هاشم', 'Hashim'], ['عثمان', 'Uthman'], ['أيمن', 'Ayman'], ['رضوان', 'Radwan'], ['نبيل', 'Nabil'], ['وليد', 'Walid']];
const FEMALE: [string, string][] = [['فاطمة', 'Fatima'], ['عائشة', 'Aisha'], ['مريم', 'Maryam'], ['خديجة', 'Khadija'], ['زينب', 'Zainab'], ['أسماء', 'Asma'], ['سمية', 'Sumayya'], ['هدى', 'Huda'], ['ريم', 'Reem'], ['لينا', 'Lina'], ['نور', 'Noor'], ['سارة', 'Sara'], ['آمنة', 'Amina'], ['رقية', 'Ruqayya'], ['حفصة', 'Hafsa'], ['سلمى', 'Salma'], ['ليلى', 'Layla'], ['هاجر', 'Hajar'], ['أروى', 'Arwa'], ['دعاء', 'Duaa'], ['رهف', 'Rahaf'], ['جميلة', 'Jamila']];
const FAMILY: [string, string][] = [['الأنصاري', 'Al-Ansari'], ['الحسيني', 'Al-Husseini'], ['المنصور', 'Al-Mansour'], ['العتيبي', 'Al-Otaibi'], ['الشمري', 'Al-Shammari'], ['القحطاني', 'Al-Qahtani'], ['الزهراني', 'Al-Zahrani'], ['الغامدي', 'Al-Ghamdi'], ['السيد', 'Al-Sayed'], ['الفاروق', 'Al-Farouq'], ['الهاشمي', 'Al-Hashimi'], ['التميمي', 'Al-Tamimi'], ['النجار', 'Al-Najjar'], ['الخطيب', 'Al-Khatib'], ['الحداد', 'Al-Haddad'], ['المصري', 'Al-Masri'], ['البغدادي', 'Al-Baghdadi'], ['العجمي', 'Al-Ajmi'], ['المطيري', 'Al-Mutairi'], ['الرشيدي', 'Al-Rashidi'], ['الدوسري', 'Al-Dosari'], ['البلوشي', 'Al-Balushi'], ['السعدي', 'Al-Saadi'], ['الجزائري', 'Al-Jazairi'], ['التونسي', 'Al-Tunisi'], ['المغربي', 'Al-Maghribi'], ['الشنقيطي', 'Al-Shinqiti'], ['الحمدان', 'Al-Hamdan'], ['العنزي', 'Al-Enezi'], ['الكندري', 'Al-Kandari']];
const COUNTRIES: [string, string, string, string][] = [['الكويت', 'KW', '+965', 'Kuwaiti'], ['السعودية', 'SA', '+966', 'Saudi'], ['مصر', 'EG', '+20', 'Egyptian'], ['الأردن', 'JO', '+962', 'Jordanian'], ['المغرب', 'MA', '+212', 'Moroccan'], ['الجزائر', 'DZ', '+213', 'Algerian'], ['تونس', 'TN', '+216', 'Tunisian'], ['اليمن', 'YE', '+967', 'Yemeni'], ['ماليزيا', 'MY', '+60', 'Malaysian'], ['إندونيسيا', 'ID', '+62', 'Indonesian'], ['تركيا', 'TR', '+90', 'Turkish'], ['موريتانيا', 'MR', '+222', 'Mauritanian'], ['السودان', 'SD', '+249', 'Sudanese'], ['الإمارات', 'AE', '+971', 'Emirati']];
const nameOf = (female: boolean) => { const f = pick(female ? FEMALE : MALE), a = pick(FAMILY), b = pick(MALE); return { ar: `${f[0]} ${b[0]} ${a[0]}`, en: `${f[1]} ${b[1]} ${a[1]}`, given: f[0], family: a[0] }; };

/* ---------- الهيكل ---------- */
type UserRow = { uid: string; email: string; name: string; role: Role; orgId?: string; competitionId?: string; operatorId?: string; mfa: boolean; password?: string; disabled?: boolean };
const users: UserRow[] = [];
const emailTaken = new Set<string>();
const MFA_ROLES = new Set<Role>(['super_admin', 'operator_owner', 'operator_admin', 'org_admin', 'storage_admin', 'billing_admin', 'branch_admin', 'comp_admin', 'head_judge', 'judge', 'auditor']);
function addUser(role: Role, slug: string, name: string, scope: { orgId?: string; competitionId?: string; operatorId?: string } = {}, extra: Partial<UserRow> = {}): UserRow {
  let email = `${slug}@qa.mizan.test`;
  if (emailTaken.has(email)) throw new Error(`duplicate email ${email}`);
  emailTaken.add(email);
  const u: UserRow = { uid: `qa-${sha(email).slice(0, 20)}`, email, name, role, mfa: MFA_ROLES.has(role), ...scope, ...extra };
  users.push(u);
  return u;
}

const ARABIC_ORG_NAMES: [string, string, string][] = [
  ['جمعية تحفيظ القرآن الكريم', 'Quran Memorization Society', 'جمعية'], ['مركز الفرقان لتعليم القرآن', 'Al-Furqan Quran Center', 'مركز'], ['الهيئة العالمية لخدمة القرآن', 'Global Quran Service Authority', 'هيئة'],
  ['وقف النور القرآني', 'Al-Noor Quran Endowment', 'وقف'], ['دار البيان للقرآن والسنة', 'Dar Al-Bayan', 'دار'], ['أكاديمية الإتقان القرآنية', 'Itqan Quran Academy', 'أكاديمية'],
  ['جمعية الرحمة الخيرية', 'Al-Rahma Charity', 'جمعية'], ['مركز السراج للقراءات', 'Al-Siraj Qiraat Center', 'مركز'], ['مؤسسة التبيان', 'Al-Tibyan Foundation', 'مؤسسة'],
  ['رابطة حفظة القرآن', 'Quran Memorizers League', 'رابطة'], ['جمعية الهدى القرآنية', 'Al-Huda Quran Society', 'جمعية'], ['معهد الإمام عاصم', 'Imam Asim Institute', 'معهد'],
];
const OPERATORS = ['شركة نور للحلول المؤسسية', 'مجموعة البيان التقنية', 'شركة الفرقان للخدمات'];
const CITIES = ['الكويت', 'الرياض', 'القاهرة', 'عمّان', 'الدوحة', 'الرباط', 'جاكرتا', 'إسطنبول', 'مسقط', 'تونس'];

const RULESET = (id: string): RuleSet => ({
  id, version: '1.0.0', name: 'بروتوكول التحكيم المعتمد', judgesCountPerPanel: 3, dropExtremes: true,
  criteria: [
    { id: 'crit-memorization', name: 'Memorization', nameArabic: 'الحفظ والضبط', maxScore: 70, weight: 0.7, assignedJudgeType: 'memorization' },
    { id: 'crit-tajweed', name: 'Tajweed', nameArabic: 'التجويد', maxScore: 25, weight: 0.25, assignedJudgeType: 'tajweed' },
    { id: 'crit-performance', name: 'Performance', nameArabic: 'الوقف والابتداء وحسن الأداء', maxScore: 5, weight: 0.05, assignedJudgeType: 'performance' },
  ],
  penalties: { mistake: 0.5, promptOpening: 1, repetition: 0.25, tajweedMinor: 0.25, tajweedMajor: 0.5, hesitationStop: 0.5 },
  questionsPerParticipant: 3, questionDurationMinutes: 8, minimumPassingScore: 80,
  tieBreakRules: ['memorization_priority', 'tajweed_priority', 'fewest_penalties'],
  appealsAllowed: true, appealWindowHours: 12, silentAIGuardianEnabled: true, frozenAt: iso(NOW - 30 * DAY),
});

const CATEGORY_DEFS = [
  { key: 'full', ar: 'حفظ القرآن الكريم كاملًا', en: 'Full Quran', juz: 30, maxAge: 30, minutes: 12 },
  { key: 'j20', ar: 'حفظ عشرين جزءًا', en: '20 Juz', juz: 20, maxAge: 25, minutes: 10 },
  { key: 'j10', ar: 'حفظ عشرة أجزاء للناشئة', en: '10 Juz Youth', juz: 10, maxAge: 17, minutes: 8 },
  { key: 'j5', ar: 'حفظ خمسة أجزاء للصغار', en: '5 Juz Juniors', juz: 5, maxAge: 13, minutes: 6 },
];

/* ---------- الحالة المُولَّدة ---------- */
type CompBundle = {
  doc: Competition; participants: Participant[]; committees: Committee[]; judges: JudgeProfile[];
  submissions: (JudgeSubmission & Record<string, unknown>)[]; results: ResultRecord[]; certificates: Certificate[];
  reviews: ReviewCase[]; appeals: (AppealRecord & { uploaderUid?: string })[]; audit: AuditEvent[]; checkins: Record<string, unknown>[];
  scopes: Record<string, unknown>[]; staff: Record<string, UserRow[]>;
  journeys: { path: string; data: Record<string, unknown> }[];
};
const journeyLinks: { participantId: string; competitionId: string; code: string; journeyToken: string; guardianToken: string }[] = [];
const bundles: CompBundle[] = [];
const identityGrants: { user: UserRow; role: Role; orgId: string; competitionId?: string; operatorId?: string }[] = [];
const summary: Record<string, number> = {};
const bump = (k: string, n = 1) => { summary[k] = (summary[k] || 0) + n; };

async function main() {
  if (!args.has('--keep')) {
    // لا يُحذف مجلد data كله: خادمٌ يعمل يحتفظ بمجلداته (مؤقّتات التذكير تكتب فيها). تُحذف ملفات الزرع وحدها.
    fs.rmSync(path.join(qaDir, 'data', 'identity'), { recursive: true, force: true });
    const saasDir = path.join(qaDir, 'data', 'saas');
    for (const f of fs.existsSync(saasDir) ? fs.readdirSync(saasDir) : []) if (f.startsWith('saas-platform.json') || f === 'vault') fs.rmSync(path.join(saasDir, f), { recursive: true, force: true });
    // يمسح المحاكي كاملًا (نقطة المحاكي الرسمية) — لا تعمل إلا عليه.
    const res = await fetch(`http://${emulator}/emulator/v1/projects/${projectId}/databases/(default)/documents`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`EMULATOR_RESET_FAILED ${res.status}`);
  }
  fs.mkdirSync(path.join(qaDir, 'data', 'saas', 'vault'), { recursive: true });

  /* ===== المنصة التجارية: مشغّلون، جهات، باقات، اشتراكات، فواتير، تخزين ===== */
  const platform = new SaaSPlatformRepository(path.join(qaDir, 'data', 'saas', 'saas-platform.json'),
    new SecretVault(path.join(qaDir, 'data', 'saas', 'vault', 'storage-secrets.enc.json'), process.env.MIZAN_STORAGE_SECRET_MASTER_KEY || 'qa-local-storage-master-key-0123456789'));
  const owner = addUser('super_admin', 'owner', 'مالك المنصة — سلطان الفيلكاوي');
  const ownerActor: CommercialActor = { uid: owner.uid, role: 'super_admin', organizationId: '__platform__' };
  identityGrants.push({ user: owner, role: 'super_admin', orgId: '__platform__' });
  addUser('support_agent', 'support-1', 'مي الدوسري — الدعم الفني', { orgId: '__platform__' });
  addUser('support_agent', 'support-2', 'خالد العجمي — الدعم الفني', { orgId: '__platform__' });

  const basePlan: any = platform.seedInitialPlan(ownerActor, { name: 'الباقة الأساسية', currency: 'KWD', priceMinor: 250_000, limits: { licensedOrganizations: 1, activeCompetitions: 3, annualParticipants: 2500, storageBytes: 10 * 1024 ** 3, branches: 3 } as any, features: { external_storage: true, white_label: false, video: false } });
  const proPlan: any = platform.upsertPlan(ownerActor, { name: 'الباقة المتقدمة', currency: 'KWD', priceMinor: 600_000, billingPeriod: 'annual', active: true, limits: { licensedOrganizations: 1, activeCompetitions: 10, annualParticipants: 10000, storageBytes: 100 * 1024 ** 3, branches: 10 } as any, features: { external_storage: true, white_label: true, video: true } });

  const operatorIds: string[] = [];
  const operatorUsers: UserRow[][] = [];
  OPERATORS.forEach((name, i) => {
    const op: any = platform.createOperator(ownerActor, { name, pricingTier: i === 0 ? 'standard' : 'partner', whiteLabelLevel: i === 2 ? 'full' : 'co_branded' });
    operatorIds.push(op.id);
    platform.adjustCredits(ownerActor, op.id, 8, 'رصيد افتتاحي للفحص');
    const nm = nameOf(false);
    const ownerU = addUser('operator_owner', `operator${i + 1}-owner`, `${nm.ar} (مالك مشغّل)`, { operatorId: op.id });
    const adm1 = addUser('operator_admin', `operator${i + 1}-admin1`, `${nameOf(true).ar} (مدير مشغّل)`, { operatorId: op.id });
    const adm2 = addUser('operator_admin', `operator${i + 1}-admin2`, `${nameOf(false).ar} (مدير مشغّل)`, { operatorId: op.id });
    for (const u of [ownerU, adm1, adm2]) identityGrants.push({ user: u, role: u.role, orgId: `__operator__:${op.id}`, operatorId: op.id });
    operatorUsers.push([ownerU, adm1, adm2]);
    bump('operators');
  });

  const orgCount = Math.max(3, Math.round(12 * Math.min(scale, 1)));
  const compsPerOrg = scale >= 1 ? 2 : 1;
  const orgs: { id: string; arName: string; enName: string; operatorId?: string; planId: string }[] = [];
  for (let i = 0; i < orgCount; i++) {
    const def = ARABIC_ORG_NAMES[i % ARABIC_ORG_NAMES.length];
    const city = CITIES[i % CITIES.length];
    const operatorId = i % 4 === 3 ? undefined : operatorIds[i % operatorIds.length];
    const plan = i % 3 === 0 ? proPlan : basePlan;
    const country = COUNTRIES[i % COUNTRIES.length];
    const startsAt = iso(NOW - (60 + i * 20) * DAY);
    const expiresAt = iso(NOW + (i === 5 ? 9 : i === 8 ? -3 : 300) * DAY); // جهة قاربت على الانتهاء وأخرى انتهت
    const actor: CommercialActor = operatorId
      ? { uid: operatorUsers[operatorIds.indexOf(operatorId)][0].uid, role: 'operator_owner', organizationId: `__operator__:${operatorId}`, operatorId }
      : ownerActor;
    const created: any = platform.createOrganization(ownerActor.role === actor.role ? ownerActor : actor, {
      officialName: `${def[0]} — ${city}`, shortName: def[0].slice(0, 40), organizationType: 'nonprofit', country: country[1],
      legalEmail: `info${i + 1}@org${i + 1}.qa.mizan.test`, legalPhone: `${country[2]}5${String(1000000 + i * 1111).slice(0, 7)}`,
      operatorId, planId: plan.id, startsAt, expiresAt,
    });
    const org = created.organization;
    orgs.push({ id: org.id, arName: `${def[0]} — ${city}`, enName: `${def[1]} — ${city}`, operatorId, planId: plan.id });
    bump('organizations');
  }

  /* مسابقات + أشخاص لكل جهة */
  const statusPlan: Competition['status'][] = ['registration_open', 'live', 'completed', 'draft'];
  for (let oi = 0; oi < orgs.length; oi++) {
    const org = orgs[oi];
    const oSlug = `org${oi + 1}`;
    const orgAdmins = [addUser('org_admin', `${oSlug}-admin1`, `${nameOf(false).ar} (مدير الجهة)`, { orgId: org.id }), addUser('org_admin', `${oSlug}-admin2`, `${nameOf(true).ar} (مدير الجهة)`, { orgId: org.id })];
    const billing = addUser('billing_admin', `${oSlug}-billing`, `${nameOf(false).ar} (مدير الفوترة)`, { orgId: org.id });
    const storage = addUser('storage_admin', `${oSlug}-storage`, `${nameOf(false).ar} (مدير التخزين)`, { orgId: org.id });
    const branches = [addUser('branch_admin', `${oSlug}-branch1`, `${nameOf(false).ar} (مدير الفرع)`, { orgId: org.id }), addUser('branch_admin', `${oSlug}-branch2`, `${nameOf(true).ar} (مديرة الفرع)`, { orgId: org.id })];
    const auditor = addUser('auditor', `${oSlug}-auditor`, `${nameOf(false).ar} (مدقق)`, { orgId: org.id });
    for (const u of [...orgAdmins, billing, storage, ...branches, auditor]) identityGrants.push({ user: u, role: u.role, orgId: org.id });
    // اشتراك وفواتير
    const sub: any = platform.createSubscription(ownerActor, { subjectType: 'organization', subjectId: org.id, planId: org.planId, startsAt: iso(NOW - 120 * DAY), channelOverrideReason: 'زرع بيانات فحص' } as any);
    const statuses = ['paid', 'paid', 'open', oi % 3 === 0 ? 'overdue' : 'open'] as const;
    statuses.forEach((st, k) => {
      const inv: any = platform.issueInvoice(ownerActor, { subjectType: 'organization', subjectId: org.id, subscriptionId: sub.id, amountMinor: 250_000 + k * 12_500, currency: 'KWD', dueAt: iso(NOW + (st === 'overdue' ? -15 : 10 + k * 5) * DAY), note: `دورة ${k + 1}` });
      if (st === 'paid') platform.markInvoicePaid(ownerActor, inv.id, { method: 'bank_transfer', reference: `TRX-${oi}-${k}`, paidAt: iso(NOW - (90 - k * 20) * DAY) });
      bump('invoices');
    });
    bump('subscriptions');

    for (let ci = 0; ci < compsPerOrg; ci++) {
      const status = statusPlan[(oi * compsPerOrg + ci) % statusPlan.length];
      const b = await buildCompetition(oi, ci, org, status, { orgAdmins, auditor });
      bundles.push(b);
      // استخدام تجاري
      try {
        const commState = status === 'completed' ? 'completed' : status === 'draft' ? 'draft' : status === 'live' ? 'judging' : 'registration_open';
        platform.setCompetitionState(ownerActor, { organizationId: org.id, competitionId: b.doc.id, state: commState as any });
        for (const p of b.participants.slice(0, 20)) platform.recordParticipant(ownerActor, { organizationId: org.id, competitionId: b.doc.id, participantId: p.id });
      } catch (e) { /* حدود الباقة تُسجَّل ولا توقف الزرع */ bump('commercialLimitHits'); }
    }
    if (stress && oi === 0) bundles.push(await buildCompetition(oi, 0, org, 'live', { orgAdmins, auditor }, stress));
    // سجلات تخزين واقعية
    for (let f = 0; f < 4; f++) {
      try {
        const kind = [['audio', 'audio/mpeg', 'recitation.mp3', 4_800_000], ['image', 'image/jpeg', 'certificate-bg.jpg', 900_000], ['document', 'application/pdf', 'rules.pdf', 350_000], ['audio', 'audio/mpeg', 'session.mp3', 6_200_000]][f] as [string, string, string, number];
        const rec: any = platform.reserveUpload(ownerActor, { organizationId: org.id, fileType: kind[2], mimeType: kind[1], sizeBytes: kind[3] });
        if (f < 3) platform.finalizeUpload(ownerActor, rec.id ?? rec.object?.id, { organizationId: org.id, checksum: sha(`${org.id}-${f}`) });
        bump('storageObjects');
      } catch { bump('storageErrors'); }
    }
  }

  /* ===== كتابة Firestore ===== */
  const repo = new FirestoreRestRepository(projectId);
  let ops: { path: string; data: Record<string, unknown> }[] = [];
  const flush = async () => {
    while (ops.length) {
      const chunk = ops.splice(0, 200);
      await repo.commitAtomically({ upserts: chunk });
    }
  };
  for (const b of bundles) {
    const base = `organizations/${b.doc.organizationId}/competitions/${b.doc.id}`;
    const updatedAt = iso(NOW - DAY);
    ops.push({ path: base, data: { organizationId: b.doc.organizationId, competition: b.doc as any, judges: b.judges as any, updatedAt, emergencyFrozen: false } });
    const put = (col: string, id: string, row: Record<string, unknown>) => ops.push({ path: `${base}/${col}/${id}`, data: { organizationId: b.doc.organizationId, competitionId: b.doc.id, ...row } });
    for (const p of b.participants) put('participants', p.id, p as any);
    for (const c of b.committees) put('committees', c.id, c as any);
    for (const s of b.submissions) put('judge_submissions', `${s.sessionId}_${s.judgeId}`, s);
    for (const r of b.results) put('results', r.id, r as any);
    for (const c of b.certificates) put('certificates', c.id, c as any);
    for (const r of b.reviews) put('reviews', r.id, r as any);
    for (const a of b.appeals) put('appeals', a.id, a as any);
    for (const a of b.audit) put('audit', a.id, { ...a, uploaderUid: users.find(u => u.competitionId === b.doc.id && u.role === a.actorRole)?.uid || owner.uid });
    for (const c of b.checkins) put('checkins', String(c.participantId), c);
    for (const j of b.journeys) ops.push(j);
    for (const s of b.scopes) put('participant_scopes', String(s.id), s);
    if (b.doc.status !== 'draft') {
      ops.push({ path: `public_competitions/${b.doc.id}`, data: { organizationId: b.doc.organizationId, competition: b.doc as any, updatedAt } });
    }
    bump('participants', b.participants.length); bump('committees', b.committees.length); bump('judgeSubmissions', b.submissions.length);
    bump('results', b.results.length); bump('certificates', b.certificates.length); bump('reviewCases', b.reviews.length);
    bump('appeals', b.appeals.length); bump('auditEvents', b.audit.length); bump('checkins', b.checkins.length);
    bump('competitions');
  }
  await flush();

  /* ===== الهويات على الخادم (سجل حوكمة الهوية) + جدول الحسابات للمحاكي ===== */
  writeIdentityState();
  fs.writeFileSync(path.join(qaDir, 'users.json'), JSON.stringify(users, null, 1));
  fs.writeFileSync(path.join(qaDir, 'journeys.json'), JSON.stringify(journeyLinks, null, 1));
  fs.writeFileSync(path.join(qaDir, 'seed-summary.json'), JSON.stringify({ users: users.length, byRole: countBy(users.map(u => u.role)), ...summary, password: PASSWORD }, null, 2));
  console.log('تم الزرع الواقعي:');
  console.log(`  الحسابات: ${users.length}`);
  for (const [r, n] of Object.entries(countBy(users.map(u => u.role)))) console.log(`    ${r}: ${n}`);
  for (const [k, v] of Object.entries(summary)) console.log(`  ${k}: ${v}`);
  console.log(`  كلمة المرور لكل الحسابات: ${PASSWORD}`);
}

const countBy = (xs: string[]) => xs.reduce<Record<string, number>>((m, x) => { m[x] = (m[x] || 0) + 1; return m; }, {});

function writeIdentityState() {
  const dir = path.join(qaDir, 'data', 'identity');
  fs.mkdirSync(dir, { recursive: true });
  const accounts: any[] = [], grants: any[] = [];
  const seen = new Set<string>();
  for (const g of identityGrants) {
    const u = g.user;
    const accId = `acc-${u.uid.slice(3, 15)}`;
    if (!seen.has(u.uid)) {
      seen.add(u.uid);
      accounts.push({ id: accId, uid: u.uid, organizationId: g.orgId, operatorId: g.operatorId, email: u.email, displayName: u.name, status: 'ACTIVE', createdAt: iso(NOW - 100 * DAY), activatedFromInvitationId: `inv-${accId}` });
    }
    grants.push({ id: `grant-${u.uid.slice(3, 15)}-${g.role}${g.competitionId ? '-' + g.competitionId.slice(-6) : ''}`, accountId: accId, organizationId: g.orgId, operatorId: g.operatorId, competitionId: g.competitionId, role: g.role, status: 'ACTIVE', createdAt: iso(NOW - 100 * DAY), createdBy: owner0() });
  }
  fs.writeFileSync(path.join(dir, 'identity-governance.json'), JSON.stringify({ version: 1, invitations: [], accounts, grants, sessions: [], competitionClosures: [], passwordResetRequests: [] }, null, 2), { mode: 0o600 });
  summary.identityAccounts = accounts.length; summary.identityGrants = grants.length;
}
const owner0 = () => users[0].uid;

async function buildCompetition(oi: number, ci: number, org: { id: string; arName: string; enName: string; operatorId?: string }, status: Competition['status'], ctx: { orgAdmins: UserRow[]; auditor: UserRow }, size?: number): Promise<CompBundle> {
  const seq = size ? 900 + oi : oi * 10 + ci + 1;
  const compId = `comp-${String(seq).padStart(3, '0')}-${2026 + ci}`;
  const slug = `c${seq}`;
  const ruleSet = RULESET(`rule-${slug}`);
  const categories: Category[] = CATEGORY_DEFS.map((d, i) => ({
    id: `cat-${slug}-${d.key}`, competitionId: compId, code: `CAT-0${i + 1}`, name: d.en, nameArabic: d.ar, description: `${d.ar} مع التجويد`,
    riwaya: 'حفص عن عاصم', memorizationScope: d.juz === 30 ? 'كامل القرآن (30 جزءًا)' : `${d.juz} جزءًا`, juzCount: d.juz, maxAge: d.maxAge,
    targetParticipants: 20, targetDurationMinutes: d.minutes, scope: d.juz === 30 ? fullQuranScope() : scopeFromJuzRange(1, d.juz), scopeMode: 'fixed', scopeVersion: 1, scopeMigration: 'none',
  } as Category));
  const tz = 'Asia/Kuwait';
  const start = NOW + (status === 'completed' ? -20 : status === 'live' ? 0 : status === 'draft' ? 60 : 25) * DAY;
  const doc: Competition = {
    id: compId, organizationId: org.id, name: `${org.enName} Quran Competition ${2026 + ci}`, nameArabic: `${['مسابقة', 'جائزة'][ci % 2]} ${org.arName.split(' — ')[0].replace(/ القرآن الكريم$/, '')} السنوية ${2026 + ci}`,
    edition: `النسخة ${['الأولى', 'الثانية', 'الثالثة', 'الرابعة'][(oi + ci) % 4]}`, country: COUNTRIES[oi % COUNTRIES.length][0], timezone: tz,
    status, automationLevel: 'assisted', startDate: iso(start).slice(0, 10), endDate: iso(start + 4 * DAY).slice(0, 10),
    registrationStartDate: iso(start - 60 * DAY).slice(0, 10), registrationEndDate: iso(start - 5 * DAY).slice(0, 10),
    categories, ruleSet, ruleSets: [ruleSet], venueName: 'قاعة المؤتمرات الكبرى', venuesCount: 2,
    totalRegistered: 0, totalApproved: 0, totalAttended: 0, currentDay: status === 'live' ? 2 : status === 'completed' ? 4 : 0, totalDays: 4,
    readinessChecklist: { datesConfigured: true, categoriesConfigured: true, ruleSetFrozen: status !== 'draft', judgesAssigned: status !== 'draft', quranSourceLocked: status !== 'draft', devicesRegistered: status !== 'draft', certificatesReady: status === 'completed' },
    updatedAt: iso(NOW - DAY),
  } as Competition;
  doc.policy = getCompetitionPolicy(doc);

  /* طاقم المسابقة */
  const staff: Record<string, UserRow[]> = {};
  const mk = (role: Role, n: number, label: string, female?: boolean) => {
    staff[role] = [];
    for (let i = 0; i < n; i++) {
      const nm = nameOf(female ?? (i % 5 === 4));
      const u = addUser(role, `${slug}-${role.replace(/_/g, '-')}-${i + 1}`, `${nm.ar} (${label})`, { orgId: org.id, competitionId: compId });
      staff[role].push(u);
      identityGrants.push({ user: u, role, orgId: org.id, competitionId: compId });
    }
  };
  mk('comp_admin', 1, 'مدير المسابقة', false); mk('head_judge', 2, 'رئيس تحكيم', false); mk('judge', 8, 'محكّم');
  mk('ops_manager', 2, 'مدير تشغيل', false); mk('exception_host', 2, 'مكتب الاستثناء'); mk('delegation_manager', 4, 'مدير وفد', false); mk('broadcast_operator', 1, 'البث والحفل', false);
  // المدقق على مستوى الجهة يعمل على كل مسابقاتها: منحة بنطاق المسابقة
  identityGrants.push({ user: ctx.auditor, role: 'auditor', orgId: org.id, competitionId: compId });

  /* اللجان والمحكّمون */
  const committees: Committee[] = []; const judges: JudgeProfile[] = [];
  const judgeUsers = staff.judge;
  for (let c = 0; c < 2; c++) {
    const panel = judgeUsers.slice(c * 4, c * 4 + 4);
    committees.push({
      id: `comm-${slug}-${c + 1}`, competitionId: compId, name: `Committee ${c + 1}`, nameArabic: `اللجنة ${['الأولى', 'الثانية'][c]}`, code: `C${c + 1}`, venueHall: `قاعة ${['أ', 'ب'][c]}`,
      assignedCategories: categories.map(x => x.id), headJudgeId: staff.head_judge[c].uid, judgeIds: panel.map(p => p.uid),
      status: status === 'live' ? (c === 0 ? 'testing' : 'ready') : 'ready', completedCount: 0, averageSessionMinutes: 8 + c, audioInputOk: true, devicesConnected: 4,
    });
    panel.forEach(p => judges.push({ id: `judge-${p.uid.slice(3, 11)}`, userId: p.uid, name: p.name, nameArabic: p.name, title: 'محكّم معتمد', country: COUNTRIES[int(0, 5)][0], specialty: 'all', certifiedRiwayat: ['حفص عن عاصم'], assignedCommitteeId: committees[c].id, conflictsDeclared: [], calibrationScore: 90 + int(0, 9) + rnd(), isReady: true, competitionId: compId } as JudgeProfile));
  }

  /* المتسابقون */
  const N = size || Math.max(8, Math.round(48 * Math.min(scale, 1)));
  const participants: Participant[] = []; const guardians: UserRow[] = [];
  const statusDist = (i: number): RegistrationStatus => {
    if (status === 'draft') return i % 4 === 0 ? 'draft' : 'submitted';
    if (status === 'registration_open') return (['submitted', 'under_review', 'approved', 'approved', 'rejected', 'approved'] as RegistrationStatus[])[i % 6];
    if (status === 'live') return (['approved', 'checked_in', 'in_queue', 'in_session', 'tested', 'tested', 'tested', 'appealed'] as RegistrationStatus[])[i % 8];
    return i % 11 === 0 ? 'rejected' : i % 9 === 0 ? 'appealed' : i % 3 === 0 ? 'certified' : 'tested';
  };
  for (let i = 0; i < N; i++) {
    const female = i % 2 === 1; const nm = nameOf(female); const country = pick(COUNTRIES); const cat = categories[i % categories.length];
    const minor = cat.maxAge !== undefined && (cat.maxAge as number) <= 17;
    const age = minor ? int(9, cat.maxAge as number) : int(18, Math.min(30, cat.maxAge as number));
    const pid = `part-${slug}-${String(i + 1).padStart(3, '0')}`;
    const st = statusDist(i);
    const created = NOW - int(10, 55) * DAY;
    const hist: Participant['statusHistory'] = [{ status: 'submitted', timestamp: iso(created), actor: 'participant' }];
    const lifecycle: RegistrationStatus[] = ['under_review', 'approved', 'checked_in', 'in_queue', 'in_session', 'tested', 'appealed', 'certified'];
    const stopAt = st === 'rejected' ? -1 : lifecycle.indexOf(st);
    if (st === 'rejected') hist.push({ status: 'rejected', timestamp: iso(created + DAY), actor: 'delegation_manager', reason: 'عمر المتسابق خارج حدود الفئة' });
    else for (let k = 0; k <= stopAt && st !== 'submitted' && st !== 'draft'; k++) hist.push({ status: lifecycle[k], timestamp: iso(created + (k + 1) * 3_600_000 * 5), actor: k < 2 ? 'delegation_manager' : 'system' });
    const committee = committees[i % 2];
    const p: Participant = {
      id: pid, code: `${['A', 'B'][ci % 2]}-${100 + i + 1}`, competitionId: compId, organizationId: org.id,
      fullName: nm.en, fullNameArabic: nm.ar, email: `${slug}-p${i + 1}@qa.mizan.test`, phone: `${country[2]}5${String(1000000 + int(0, 8999999)).slice(0, 7)}`,
      country: country[0], nationality: country[3], nationalIdOrPassport: `${country[1]}${int(10000000, 99999999)}`, dateOfBirth: iso(NOW - age * 365.25 * DAY).slice(0, 10),
      gender: female ? 'female' : 'male', categoryId: cat.id, riwaya: 'حفص عن عاصم', institution: `${pick(['مركز', 'دار', 'معهد'])} ${pick(FAMILY)[0]} لتحفيظ القرآن`,
      delegationId: `delegation-${staff.delegation_manager[i % staff.delegation_manager.length].uid}`, status: st, statusHistory: hist, createdAt: iso(created),
      ...(['checked_in', 'in_queue', 'in_session', 'tested', 'appealed', 'certified'].includes(st) ? { checkedInAt: iso(created + 25 * DAY), checkInMethod: 'kiosk_qr' as const, arrivalSlot: '08:30–09:00', assignedCommitteeId: committee.id, queueNumber: i + 1 } : {}),
      ...(i % 17 === 0 ? { specialNeeds: true } : {}),
    } as Participant;
    participants.push(p);
    const pu = addUser('participant', `${slug}-p${i + 1}`, nm.ar, { orgId: org.id, competitionId: compId });
    if (minor) { const g = addUser('guardian', `${slug}-g${i + 1}`, `${nameOf(i % 3 === 0).ar} (ولي أمر ${nm.given})`, { orgId: org.id, competitionId: compId }); guardians.push(g); }
    void pu;
  }
  doc.totalRegistered = participants.filter(p => p.status !== 'draft').length;
  doc.totalApproved = participants.filter(p => !['draft', 'submitted', 'under_review', 'rejected'].includes(p.status)).length;
  doc.totalAttended = participants.filter(p => ['checked_in', 'in_queue', 'in_session', 'tested', 'appealed', 'certified'].includes(p.status)).length;
  doc.policy = getCompetitionPolicy(doc);

  /* الدرجات والنتائج */
  const submissions: any[] = []; const results: ResultRecord[] = []; const certificates: Certificate[] = []; const reviews: ReviewCase[] = []; const appeals: any[] = []; const checkins: any[] = []; const scopes: any[] = [];
  const tested = participants.filter(p => ['tested', 'appealed', 'certified'].includes(p.status));
  const perCat = new Map<string, { p: Participant; score: number; crit: Record<string, number>; pen: number }[]>();
  tested.forEach((p, idx) => {
    const committee = committees.find(c => c.id === p.assignedCommitteeId)!;
    const sessionId = `sess-${p.id}`;
    const base = 72 + rnd() * 27;
    const panelScores: number[] = [];
    committee.judgeIds.slice(0, 3).forEach((juid, ji) => {
      const j = users.find(u => u.uid === juid)!;
      const skew = (ji - 1) * (idx % 7 === 0 ? 4 : 1);
      const mem = Math.max(0, Math.min(70, +(base * 0.7 + skew * 0.6 + (rnd() - 0.5)).toFixed(2)));
      const taj = Math.max(0, Math.min(25, +(base * 0.25 + skew * 0.2 + (rnd() - 0.5) * 0.6).toFixed(2)));
      const perf = Math.max(0, Math.min(5, +(base * 0.05 + (rnd() - 0.5) * 0.3).toFixed(2)));
      const total = +(mem + taj + perf).toFixed(2); panelScores.push(total);
      submissions.push({ judgeId: juid, judgeName: j.name, participantId: p.id, sessionId, criterionScores: { 'crit-memorization': mem, 'crit-tajweed': taj, 'crit-performance': perf }, totalScore: total, eventsCount: int(1, 4), sessionPenaltyCount: int(0, 4), submittedAt: iso(NOW - 2 * DAY + idx * 60_000 * 9 + ji * 60_000), locked: true, ruleSetId: ruleSet.id, ruleSetVersion: ruleSet.version, uploaderUid: juid });
    });
    const sorted = [...panelScores].sort((a, b) => a - b);
    const final = +(sorted.length >= 3 ? sorted[1] : sorted.reduce((a, b) => a + b, 0) / sorted.length).toFixed(2);
    const cs = submissions.filter(s => s.sessionId === sessionId);
    const crit = { 'crit-memorization': +(cs.reduce((a, s) => a + s.criterionScores['crit-memorization'], 0) / cs.length).toFixed(2), 'crit-tajweed': +(cs.reduce((a, s) => a + s.criterionScores['crit-tajweed'], 0) / cs.length).toFixed(2), 'crit-performance': +(cs.reduce((a, s) => a + s.criterionScores['crit-performance'], 0) / cs.length).toFixed(2) };
    const arr = perCat.get(p.categoryId) || []; arr.push({ p, score: final, crit, pen: cs.reduce((a, s) => a + (s.sessionPenaltyCount || 0), 0) }); perCat.set(p.categoryId, arr);
    // حالات مراجعة عند التباعد
    if (Math.max(...panelScores) - Math.min(...panelScores) > 6) reviews.push({ id: `rev-${p.id}`, competitionId: compId, sessionId, participantId: p.id, participantCode: p.code, committeeId: committee.id, reason: 'judge_variance', severity: 'medium', timestampSec: int(30, 400), details: 'تباعد درجات المحكمين تجاوز الحد المسموح، تلزم مراجعة رئيس التحكيم.', status: status === 'completed' ? 'confirmed' : 'pending', ...(status === 'completed' ? { headJudgeDecision: { actor: staff.head_judge[0].uid, action: 'confirmed' as const, adjustedPenaltyDelta: 0, notes: 'روجعت الجلسة ولا تعديل.', resolvedAt: iso(NOW - DAY) } } : {}) } as ReviewCase);
  });
  for (const [catId, rows] of perCat) {
    rows.sort((a, b) => b.score - a.score || a.pen - b.pen);
    rows.forEach((r, i) => {
      const cat = categories.find(c => c.id === catId)!;
      const award = i === 0 ? ['First Place', 'المركز الأول'] : i === 1 ? ['Second Place', 'المركز الثاني'] : i === 2 ? ['Third Place', 'المركز الثالث'] : r.score >= 90 ? ['Honorable Mention', 'تقدير امتياز'] : ['Qualified', 'مؤهل'];
      const final = status === 'completed';
      const sealer = staff.head_judge[0], publisher = ctx.orgAdmins[0];
      const rs: ResultRecord = {
        id: `res-${r.p.id}`, competitionId: compId, participantId: r.p.id, participantCode: r.p.code, participantName: r.p.fullName, participantNameArabic: r.p.fullNameArabic, country: r.p.country,
        categoryId: catId, categoryName: cat.name, categoryNameArabic: cat.nameArabic, finalScore: r.score, rank: i + 1, criterionScores: r.crit, penaltyCount: r.pen,
        status: final ? (i % 5 === 4 ? 'sealed' : 'published') : (i % 3 === 0 ? 'approved' : 'calculated'),
        awardTitle: award[0] as any, awardTitleArabic: award[1] as any,
        ...(final ? { sealMetadata: { sealedBy: sealer.name, sealedById: sealer.uid, sealedByUid: sealer.uid, sealedAt: iso(NOW - 3 * DAY), cryptographicChecksum: sha(`${compId}|${r.p.id}|${r.score}`), assurance: 'SERVER_DIGEST' as const, serverSealSha256: sha(`seal|${compId}|${r.p.id}`), contributingJudges: 3 } } : {}),
        ...(final && i % 5 !== 4 ? { publishedById: publisher.uid, publishedAt: iso(NOW - 2 * DAY) } : {}),
      } as ResultRecord;
      (rs as any).uploaderUid = final ? sealer.uid : staff.head_judge[0].uid;
      results.push(rs);
      if (final && i % 5 !== 4 && i < 6) {
        const num = `MZN-${2026 + ci}-${r.p.code}-${String(int(1000, 9999))}`;
        certificates.push({ id: `cert-${r.p.id}`, certificateNumber: num, competitionId: compId, competitionName: doc.name, competitionNameArabic: doc.nameArabic, organizationName: org.enName, organizationNameArabic: org.arName, participantId: r.p.id, participantName: r.p.fullName, participantNameArabic: r.p.fullNameArabic, categoryName: cat.name, categoryNameArabic: cat.nameArabic, score: r.score, rank: i + 1, awardTextArabic: `تشهد الجهة المنظمة بأن المتسابق قد أتمّ الاختبار ونال ${award[1]}.`, issueDate: iso(NOW - DAY).slice(0, 10), signatories: [{ name: staff.head_judge[0].name, title: 'رئيس لجنة التحكيم' }, { name: ctx.orgAdmins[0].name, title: 'مدير الجهة' }], verificationToken: sha(num).slice(0, 24), verificationUrl: `/verify/${num}`, isAuthentic: true, qrPayload: `/verify/${num}`, resultId: rs.id } as Certificate);
      }
    });
  }
  // اعتراضات
  participants.filter(p => p.status === 'appealed').forEach((p, i) => {
    const pu = users.find(u => u.role === 'participant' && u.email === `${slug}-p${participants.indexOf(p) + 1}@qa.mizan.test`)!;
    appeals.push({ id: `apl-${p.id}`, competitionId: compId, participantId: p.id, participantCode: p.code, categoryName: categories.find(c => c.id === p.categoryId)!.nameArabic, grounds: (['scoring_miscalculation', 'audio_interruption', 'question_scope_dispute'] as const)[i % 3], reasonText: ['أرى أن خصم درجة الحفظ احتُسب مرتين، وأرجو إعادة احتساب المجموع.', 'انقطع الصوت في القاعة لثوانٍ أثناء التلاوة وأطلب إعادة تقييم المقطع.', 'خرج السؤال عن النطاق المقرر للفئة وأطلب مراجعة أهليته.'][i % 3], status: (['submitted', 'under_review', 'accepted', 'rejected'] as const)[i % 4], createdAt: iso(NOW - DAY), uploaderUid: pu.uid, ...(i % 4 >= 2 ? { resolutionNotes: 'روجع الطلب وفق السياسة المعتمدة.', resolvedBy: staff.head_judge[0].name, resolvedAt: iso(NOW - 12 * 3_600_000) } : {}) });
  });
  // تسجيلات الحضور وطلبات الاستثناء (وصول متأخر / QR مفقود)
  participants.filter(p => p.checkedInAt).forEach((p, i) => checkins.push({ participantId: p.id, method: i % 6 === 0 ? 'exception_host' : 'kiosk_qr', at: p.checkedInAt, by: i % 6 === 0 ? staff.exception_host[0].uid : 'kiosk-01', uploaderUid: staff.ops_manager[0].uid, ...(i % 6 === 0 ? { exception: i % 12 === 0 ? 'late_arrival' : 'missing_qr', note: i % 12 === 0 ? 'وصل المتسابق بعد إغلاق الفترة' : 'تعذّر قراءة رمز QR فتم التحقق بالهوية' } : {}) }));
  // نطاقات متسابقين
  participants.slice(0, 6).forEach((p, i) => { const sc = scopeFromJuz([1 + i, 2 + i]); scopes.push({ id: `pscope-${p.id}-v1`, organizationId: org.id, competitionId: compId, categoryId: p.categoryId, participantId: p.id, version: 1, selection: sc, scope: sc, scopeSignature: scopeSignature(sc), selectionRuleVersion: 1, status: 'approved', changeReason: 'اختيار عند التسجيل', createdAt: p.createdAt, updatedAt: p.createdAt, submittedAt: p.createdAt, approvedAt: p.createdAt, approvedBy: staff.comp_admin[0].uid, uploaderUid: staff.delegation_manager[0].uid }); });

  // سجل التدقيق المتسلسل
  const audit: AuditEvent[] = []; let prev = 'GENESIS';
  const events: [string, Role, string, string, string][] = [
    ['COMPETITION_CREATED', 'comp_admin', 'Competition', compId, 'إنشاء المسابقة وضبط الفئات والقواعد'],
    ['RULESET_FROZEN', 'comp_admin', 'RuleSet', ruleSet.id, 'تجميد جدول التقييم قبل التحكيم'],
    ['COMMITTEE_ASSIGNED', 'ops_manager', 'Committee', committees[0].id, 'تعيين المحكمين على اللجنة الأولى'],
    ...participants.slice(0, 14).map((p, i) => ['PARTICIPANT_APPROVED', 'delegation_manager', 'Participant', p.id, `اعتماد تسجيل المتسابق ${p.fullNameArabic}`] as [string, Role, string, string, string]),
    ...results.slice(0, 10).map(r => ['RESULT_CALCULATED', 'head_judge', 'ResultRecord', r.id, `احتساب نتيجة ${r.participantNameArabic}`] as [string, Role, string, string, string]),
  ];
  events.forEach(([action, role, entityType, entityId, summaryAr], i) => {
    const actor = staff[role]?.[0] || staff.comp_admin[0];
    const hash = sha(`${prev}|${action}|${entityId}|${i}`);
    audit.push({ id: `aud-${slug}-${String(i + 1).padStart(3, '0')}`, timestamp: iso(NOW - 30 * DAY + i * 3_600_000 * 7), organizationId: org.id, competitionId: compId, actorId: actor.uid, actorName: actor.name, actorRole: role, action, entityType, entityId, humanSummaryArabic: summaryAr, humanSummaryEnglish: action.replace(/_/g, ' ').toLowerCase(), previousStateHash: prev, currentStateHash: hash, sequence: i + 1, assurance: 'client_hash_chain' } as AuditEvent);
    prev = hash;
  });
  committees.forEach(c => { c.completedCount = participants.filter(p => p.assignedCommitteeId === c.id && ['tested', 'appealed', 'certified'].includes(p.status)).length; });

  /* بطاقات الرحلة العامة: المتسابق وولي أمره يدخلان برابطٍ خاص لا بحساب. كلُّ متسابقٍ مزروع له رابطان صالحان. */
  const journeys: { path: string; data: Record<string, unknown> }[] = [];
  for (const p of participants) {
    const cat = categories.find(c => c.id === p.categoryId)!;
    const scope = categoryScopeOf(cat), questionCount = resolveQuestionCount(cat, doc.policy!), distribution = categoryDistribution(cat, questionCount);
    const mkToken = (aud: string) => `mz_${aud}_${crypto.createHash('sha256').update(`seed|${p.id}|${aud}`).digest('base64url').slice(0, 43)}`;
    const jt = mkToken('journey'), gt = mkToken('guardian');
    const res = results.find(r => r.participantId === p.id);
    const base = { organizationId: org.id, competitionId: compId, participantId: p.id, competitionName: doc.name, competitionNameArabic: doc.nameArabic, participantCode: p.code, participantName: p.fullName, participantNameArabic: p.fullNameArabic, status: p.status, arrivalSlot: p.arrivalSlot ?? null, queueNumber: p.queueNumber ?? null, venueName: doc.venueName, committee: p.assignedCommitteeId ? { code: committees.find(c => c.id === p.assignedCommitteeId)?.code, hall: committees.find(c => c.id === p.assignedCommitteeId)?.venueHall } : null, result: null, certificate: null, preparation: { scopeTextArabic: describeScope(scope, true), scopeTextEnglish: describeScope(scope, false), scope, riwaya: p.riwaya, spreadAcrossZones: distribution.mode !== 'free' && distribution.zones.length > 1, questionCount, minutesPerQuestion: Math.max(1, Math.round((cat.targetDurationMinutes || questionCount * 5) / Math.max(1, questionCount))) }, revoked: false, updatedAt: iso(NOW - DAY) };
    void res;
    p.journeyAccessTokenHash = sha(jt); p.guardianAccessTokenHash = sha(gt); p.journeyTokenCustody = 'holder_only';
    journeys.push({ path: `public_journeys/${sha(jt)}`, data: { ...base, audience: 'participant', tokenHashVersion: 'sha256-v1' } }, { path: `public_journeys/${sha(gt)}`, data: { ...base, audience: 'guardian', tokenHashVersion: 'sha256-v1' } });
    journeyLinks.push({ participantId: p.id, competitionId: compId, code: p.code, journeyToken: jt, guardianToken: gt });
  }
  return { doc, participants, committees, judges, submissions, results, certificates, reviews, appeals, audit, checkins, scopes, staff, journeys };
}

main().catch(err => { console.error(`SEED_FAILED: ${err instanceof Error ? err.stack : String(err)}`); process.exit(1); });
