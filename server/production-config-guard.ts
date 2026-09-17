/*
 * حارس إعدادات الإنتاج — لا يبدأ خادمٌ نصف جاهز.
 *
 * كانت البيئة تُقرأ متفرّقةً عند الحاجة، فيبدأ الخادم في الإنتاج وينكشف النقص عند أول
 * طلبٍ حقيقي — أي يوم المسابقة. وهذا الملف يجمع الفحص في موضعٍ واحد يُشغَّل قبل الإقلاع
 * أو من سطر الأوامر، ويفرّق بين ما يمنع الإقلاع وما يُنبَّه عليه فحسب.
 *
 * المانعُ هنا مقصورٌ على ما لا عذر فيه:
 *   1. سرٌّ مكشوفٌ للمتصفّح (بادئة VITE_) — كل Secret خادميٌّ فقط بلا استثناء.
 *   2. بيانات العرض التجريبي مفعّلةٌ في الإنتاج — الديمو ببياناتٍ صناعية ولا يُخلط بالحقيقي.
 *   3. تعذّرُ التحقّق من هوية المستخدم على الخادم — بلا مشروع Firebase لا تُتحقَّق الرموز،
 *      فتصير الصلاحيات دعوى العميل، وهذا ليس أمنًا.
 *   4. سرُّ توقيعٍ موضوعٌ لكن قيمته نائبةٌ ضعيفة — أسوأ من غيابه لأنه يوهم بالحماية.
 *
 * وما دون ذلك تنبيهٌ لا منع: قد تكون الميزة غير مستعملة عند الجهة، فلا يُعطَّل تشغيلها
 * بحجّة إعدادٍ لا تحتاجه.
 */

import { errorMessageArabic } from '../src/lib/error-catalog';
import { islamwebPackageStatus } from './islamweb-reading-packages';

export type ConfigSeverity = 'BLOCKER' | 'WARNING';

export interface ConfigFinding {
  severity: ConfigSeverity;
  code: string;
  /** المتغيّر المعنيّ إن كان محدّدًا. */
  variable?: string;
}

/*
 * الجملةُ تُقرأ من فهرس الأعطال ولا تُكتب هنا.
 *
 * كانت مكتوبةً في الموضعين — هنا وفي الفهرس — وهما نسختان تفترقان عند أول تعديل، وهو
 * عينُ التجزئة التي يعالجها هذا المشروع. فالفهرس هو المصدر، ويُضاف إليه اسمُ المتغيّر
 * المعنيّ لأنه ما يبحث عنه المشغّل أولًا.
 */
export function configFindingMessage(finding: ConfigFinding): string {
  const sentence = errorMessageArabic(finding.code);
  return finding.variable ? `${sentence} (${finding.variable})` : sentence;
}

export interface ConfigGuardResult {
  production: boolean;
  findings: ConfigFinding[];
  blockers: ConfigFinding[];
  warnings: ConfigFinding[];
  /** هل يُسمح بالإقلاع؟ في غير الإنتاج يُسمح دائمًا مع إظهار التنبيهات. */
  mayStart: boolean;
}

/** قيمٌ نائبة شائعة لا تصلح سرًّا في الإنتاج. */
const PLACEHOLDER_SECRETS = new Set([
  'changeme', 'change-me', 'secret', 'password', 'placeholder', 'test', 'dev',
  'development', 'example', 'todo', 'xxx', 'dummy', 'sample', 'replace-me', 'none',
]);

const SIGNING_SECRET_VARS = [
  'MIZAN_PASS_SIGNING_SECRET',
  'MIZAN_CERT_SIGNING_SECRET',
  'MIZAN_WEBHOOK_SIGNING_SECRET',
] as const;

const truthy = (v: string | undefined) => /^(1|true|yes|on)$/i.test(String(v || '').trim());

/** سرٌّ ضعيف: قيمةٌ نائبة معروفة أو أقصرُ من أن تقاوم التخمين. */
export function isWeakSecret(value: string): boolean {
  const v = value.trim();
  if (!v) return false; // الغياب يُعالَج على حدة
  if (PLACEHOLDER_SECRETS.has(v.toLowerCase())) return true;
  if (v.length < 16) return true;
  if (/^(.)\1+$/.test(v)) return true; // حرفٌ واحد مكرّر
  return false;
}

/**
 * يفحص البيئة. لا يقرأ `process.env` بنفسه افتراضيًا إلا عند الاستدعاء بلا وسيط،
 * فيبقى قابلًا للاختبار بلا تلويث بيئة الاختبار.
 */
export function inspectProductionConfig(env: Record<string, string | undefined> = process.env): ConfigGuardResult {
  const production = String(env.NODE_ENV || '').trim().toLowerCase() === 'production';
  const findings: ConfigFinding[] = [];

  // 1) أي سرٍّ بادئته VITE_ مكشوفٌ في حزمة المتصفّح — مانعٌ في كل بيئة، لا في الإنتاج وحده.
  for (const key of Object.keys(env)) {
    if (!/^VITE_/.test(key)) continue;
    if (!/(SECRET|PRIVATE|_KEY$|_KEY_|ACCESS_KEY|CREDENTIAL|PASSWORD|TOKEN)/i.test(key)) continue;
    // مفاتيح Firebase العامّة للعميل مقصودةٌ ومسموحة (apiKey عامّ بطبعه).
    if (/^VITE_FIREBASE_(API_KEY|APP_ID|MESSAGING_SENDER_ID)$/i.test(key)) continue;
    if (!String(env[key] || '').trim()) continue;
    findings.push({
      severity: 'BLOCKER', code: 'CLIENT_EXPOSED_SECRET', variable: key,
    });
  }

  // 2) بيانات العرض التجريبي في الإنتاج.
  if (production && truthy(env.MIZAN_ENABLE_DEMO_SEED)) {
    findings.push({
      severity: 'BLOCKER', code: 'DEMO_SEED_ENABLED_IN_PRODUCTION', variable: 'MIZAN_ENABLE_DEMO_SEED',
    });
  }

  // 3) التحقّق من الهوية على الخادم.
  if (production && !String(env.FIREBASE_PROJECT_ID || '').trim()) {
    findings.push({
      severity: 'BLOCKER', code: 'IDENTITY_VERIFICATION_UNCONFIGURED', variable: 'FIREBASE_PROJECT_ID',
    });
  }

  /*
   * 4) حزم النصّ المثبَّتة.
   *
   * التفريق مقصود: حزمةٌ **غائبة** نشرٌ ناقص — رواياتها تفشل مغلقةً باسمها وبقيةُ النظام
   * تعمل، فهذا تنبيه. وحزمةٌ **حاضرة وغير صالحة** إنذارُ نزاهة: بايتاتٌ تخالف بصمتها أو
   * قرارًا لا يشملها، ولا يُقلع خادمٌ على نصٍّ قرآنيٍّ مشكوكٍ فيه فيُمرّره صامتًا.
   */
  for (const pkg of islamwebPackageStatus(env as NodeJS.ProcessEnv)) {
    if (!pkg.present) {
      findings.push({ severity: 'WARNING', code: 'QURAN_PINNED_ARTIFACT_ABSENT', variable: pkg.rawiId });
    } else if (!pkg.loadable) {
      findings.push({ severity: 'BLOCKER', code: 'QURAN_PINNED_ARTIFACT_INVALID', variable: `${pkg.rawiId}: ${pkg.error || 'UNKNOWN'}` });
    }
  }

  // 5) أسرار التوقيع: الموضوعُ الضعيف مانع، والغائب تنبيه.
  for (const variable of SIGNING_SECRET_VARS) {
    const raw = String(env[variable] || '');
    if (raw.trim() && isWeakSecret(raw)) {
      findings.push({
        severity: 'BLOCKER', code: 'WEAK_SIGNING_SECRET', variable,
      });
    } else if (production && !raw.trim()) {
      findings.push({
        severity: 'WARNING', code: 'SIGNING_SECRET_ABSENT', variable,
      });
    }
  }

  const blockers = findings.filter(f => f.severity === 'BLOCKER');
  const warnings = findings.filter(f => f.severity === 'WARNING');
  return {
    production,
    findings,
    blockers,
    warnings,
    // المانع يمنع الإقلاع في الإنتاج؛ وفي التطوير يُعرض ولا يُعطِّل العمل.
    mayStart: production ? blockers.length === 0 : true,
  };
}

export class ProductionConfigError extends Error {
  readonly code = 'PRODUCTION_CONFIG_INVALID';
  readonly findings: ConfigFinding[];
  constructor(findings: ConfigFinding[]) {
    super(`PRODUCTION_CONFIG_INVALID: ${findings.map(f => f.code).join(', ')}`);
    this.name = 'ProductionConfigError';
    this.findings = findings;
  }
}

/**
 * يرمي في الإنتاج عند وجود مانع — ليُستدعى قبل الإقلاع فيفشل الخادم سريعًا وبوضوح
 * بدل أن يعمل ناقصًا. في غير الإنتاج لا يرمي، ويكتفي بإرجاع النتيجة.
 */
export function assertProductionConfig(env: Record<string, string | undefined> = process.env): ConfigGuardResult {
  const result = inspectProductionConfig(env);
  if (!result.mayStart) throw new ProductionConfigError(result.blockers);
  return result;
}

/** تقريرٌ نصّي للمشغّل — بلا كشف قيم الأسرار. */
export function formatConfigReport(result: ConfigGuardResult): string {
  const lines: string[] = [];
  lines.push(`بيئة: ${result.production ? 'إنتاج' : 'غير إنتاج'}`);
  if (!result.findings.length) { lines.push('لا ملاحظات — الإعداد سليم.'); return lines.join('\n'); }
  for (const f of result.blockers) lines.push(`[مانع] ${f.code}: ${configFindingMessage(f)}`);
  for (const f of result.warnings) lines.push(`[تنبيه] ${f.code}: ${configFindingMessage(f)}`);
  lines.push(result.mayStart ? 'النتيجة: يُسمح بالإقلاع.' : 'النتيجة: الإقلاع ممنوع حتى تُرفع الموانع.');
  return lines.join('\n');
}
