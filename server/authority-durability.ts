import fs from 'fs';
import path from 'path';

/*
 * هل يصلح هذا المسار لحفظ سلطة النزاهة؟
 *
 * سلطة النزاهة تحفظ شيئين لا يُغتفر ضياعهما: موافقات النصاب، وبذور القرعة بين الالتزام والكشف.
 * وحفظهما في ملف صحيحٌ على خادم واحد بقرص دائم، وخاطئٌ تمامًا على منصّة تُشغّل نسخًا متعددة
 * بأقراص مؤقتة — مثل Cloud Run بإعداده الافتراضي:
 *
 * - كل نسخة ترى ملفها وحدها، فموافقةٌ سُجّلت على نسخة لا تراها الأخرى، فيُطلب النصاب مرتين
 *   ولا يكتمل، أو — وهو الأسوأ — تُحتسب موافقتان لشخص واحد لأن كلًّا منهما في ملف مختلف.
 * - وإعادة تشغيل النسخة تمحو القرص، فتضيع بذرة التُزم بها ولم تُكشف بعد: التزامٌ لا يمكن
 *   الوفاء به، وقرعةٌ لا تُثبت.
 *
 * ولذلك لا يُقبل تفعيل السلطة على مسار غير دائم. والامتناع هنا ليس تشدّدًا: تشغيلها على قرص
 * مؤقّت يُنتج أختامًا يسندها دليل قد يختفي — وهذا أسوأ من الامتناع الصريح الذي يراه المسؤول
 * فيعالجه.
 */

export type DurabilityVerdict =
  | { durable: true; path: string; note: string }
  | { durable: false; code: 'NOT_CONFIGURED' | 'NOT_WRITABLE' | 'EPHEMERAL_CONTAINER_PATH'; message: string };

/**
 * مؤشرات تشغيلٍ داخل حاوية بلا قرص دائم. لا نستنتج المنصّة من اسمها فقط، بل من اجتماع
 * كونها بيئة حاوية معروفة مع مسارٍ داخل نظام ملفات الحاوية نفسه.
 */
function looksLikeServerlessContainer(env: NodeJS.ProcessEnv): boolean {
  return !!(env.K_SERVICE || env.CLOUD_RUN_JOB || env.FUNCTION_TARGET || env.CONTAINER_APP_NAME);
}

/** مسارات نعرف أنها داخل الحاوية وتُمحى مع إعادة تشغيلها. */
const EPHEMERAL_PREFIXES = ['/tmp', '/var/tmp', '/dev/shm', '/app', '/workspace', '/home'];

/**
 * أُعلن المسار دائمًا صراحةً؟ المشغّل الذي يركّب وحدة تخزين يعرف ما فعل، ولا يصحّ أن نخمّن
 * ضدّه — لكنه إعلانٌ واعٍ لا افتراضٌ صامت.
 */
const DECLARED_DURABLE = 'MIZAN_INTEGRITY_AUTHORITY_DURABLE';

export function assessAuthorityDurability(dir: string, env: NodeJS.ProcessEnv = process.env): DurabilityVerdict {
  if (!dir) return { durable: false, code: 'NOT_CONFIGURED', message: 'MIZAN_INTEGRITY_AUTHORITY_DIR is unset; the server integrity authority stays off and sealing refuses rather than falling back to the browser.' };

  const resolved = path.resolve(dir);
  const declared = String(env[DECLARED_DURABLE] || '').toLowerCase() === 'true';

  if (!declared && looksLikeServerlessContainer(env) && EPHEMERAL_PREFIXES.some((p) => resolved === p || resolved.startsWith(`${p}/`))) {
    return {
      durable: false, code: 'EPHEMERAL_CONTAINER_PATH',
      message: `${resolved} is inside a serverless container filesystem: quorum approvals would differ between instances and an unrevealed draw seed would be lost on restart. Mount a durable volume (Cloud Run: --add-volume/--add-volume-mount) and point MIZAN_INTEGRITY_AUTHORITY_DIR at it, or set ${DECLARED_DURABLE}=true if the path is genuinely backed by shared persistent storage.`,
    };
  }

  try {
    fs.mkdirSync(resolved, { recursive: true, mode: 0o700 });
    // الكتابة تُختبر فعلًا: صلاحية معلنة في البيانات الوصفية ليست صلاحية كتابة.
    const probe = path.join(resolved, `.durability-probe-${process.pid}`);
    fs.writeFileSync(probe, 'probe', { mode: 0o600 });
    fs.unlinkSync(probe);
  } catch (err) {
    return { durable: false, code: 'NOT_WRITABLE', message: `${resolved} is not writable by the server process (${err instanceof Error ? err.message : 'unknown error'}).` };
  }

  return {
    durable: true, path: resolved,
    note: declared ? 'declared durable by the operator' : 'local or mounted filesystem',
  };
}
