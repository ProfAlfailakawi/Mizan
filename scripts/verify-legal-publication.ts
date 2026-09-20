#!/usr/bin/env tsx
/*
 * العنوانُ الذي يُكتب في `MIZAN_LEGAL_*_URL` دعوى، لا قياس.
 *
 * فما دام يُكتب بيد إنسانٍ في `cloudbuild.yaml`، يبقى ممكنًا أن يشير إلى صفحةٍ لا
 * وجود لها، أو إلى نسخةٍ غير التي يُسجَّلها الأثر. وكلاهما يُنتج **الأسوأ**: تسجيلٌ
 * يعمل، وموافقةٌ تُكتب، وأثرٌ يقول «وافق على الشروط 1.0 المنشورة هنا» — والرابطُ 404،
 * أو فيه 1.1. فلا يُعرف بعد سنةٍ على أيِّ نصٍّ وقّع الموقِّع، وهو بالضبط ما بُني
 * `legal-documents.ts` كلُّه ليمنعه.
 *
 * فيُجلب العنوانُ فعلًا ويُقاس ما يردّه:
 *   · 200، ونوعُ محتواه HTML.
 *   · `X-Mizan-Legal-Version` يطابق `_VERSION` المضبوط.
 *   · `X-Mizan-Legal-Effective` يطابق `_EFFECTIVE` المضبوط.
 *   · والصفحةُ تحمل اسمَ الكيان الناشر كما في `MIZAN_LEGAL_ENTITY_NAME`.
 *
 * **ويُشغَّل بعد النشر**، حيث يصير الحكمُ على ما يُخدَم فعلًا لا على ما في الملفّ.
 *
 * وغيابُ العنوان ليس فشلًا هنا: `preflight` هو من يرفعه مانعَ إطلاق باسمه. هذا الفحصُ
 * موضوعُه **صدقُ عنوانٍ مضبوط**، فيتخطّى إن لم يُضبط ويقول إنه تخطّى.
 */
import { CONSENT_BACKED_DOCUMENTS, type LegalDocumentKind } from '../src/lib/legal-documents';

const env = process.env;
const clean = (name: string) => String(env[name] ?? '').trim();
const PREFIX: Record<LegalDocumentKind, string> = {terms: 'MIZAN_LEGAL_TERMS', privacy: 'MIZAN_LEGAL_PRIVACY'};

const TIMEOUT_MS = Number(env.MIZAN_LEGAL_VERIFY_TIMEOUT_MS || 20_000);
const ATTEMPTS = Number(env.MIZAN_LEGAL_VERIFY_ATTEMPTS || 3);

interface Failure { kind: LegalDocumentKind; code: string; detail: string }

async function fetchOnce(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try { return await fetch(url, {signal: controller.signal, redirect: 'follow'}); }
  finally { clearTimeout(timer); }
}

/*
 * يُعاد المحاولةُ على تعذُّر الوصول وحده — لا على 404 ولا على نسخةٍ مخالفة. فمراجعةٌ
 * تُعيد المحاولة على حكمٍ صادق إنما تؤجّل الحقيقة؛ وشبكةٌ تسقط مرّةً ليست حكمًا.
 */
async function reach(url: string): Promise<Response> {
  let last: unknown;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    try { return await fetchOnce(url); }
    catch (error) {
      last = error;
      if (attempt < ATTEMPTS) await new Promise(resolve => setTimeout(resolve, 1_000 * attempt));
    }
  }
  throw last;
}

async function verify(kind: LegalDocumentKind): Promise<Failure | null> {
  const prefix = PREFIX[kind];
  const url = clean(`${prefix}_URL`);
  const version = clean(`${prefix}_VERSION`);
  const effective = clean(`${prefix}_EFFECTIVE`);
  const entity = clean('MIZAN_LEGAL_ENTITY_NAME');

  let response: Response;
  try { response = await reach(url); }
  catch (error) {
    return {kind, code: 'LEGAL_URL_UNREACHABLE', detail: `${url} — ${error instanceof Error ? error.message : String(error)}`};
  }

  if (response.status !== 200) {
    return {kind, code: 'LEGAL_URL_NOT_SERVING', detail: `${url} responded ${response.status}`};
  }
  const served = {
    version: String(response.headers.get('x-mizan-legal-version') ?? '').trim(),
    effective: String(response.headers.get('x-mizan-legal-effective') ?? '').trim(),
  };
  if (!served.version || !served.effective) {
    return {kind, code: 'LEGAL_URL_NOT_A_MIZAN_PAGE',
      detail: `${url} served no X-Mizan-Legal-* headers — it is not the published document`};
  }
  if (served.version !== version || served.effective !== effective) {
    return {kind, code: 'LEGAL_URL_VERSION_MISMATCH',
      detail: `${url} serves ${served.version}/${served.effective}; the runtime records ${version}/${effective}`};
  }
  const body = await response.text();
  if (entity && !body.includes(entity)) {
    return {kind, code: 'LEGAL_URL_PUBLISHER_MISMATCH',
      detail: `${url} does not name ${entity}`};
  }
  return null;
}

async function main() {
  const configured = CONSENT_BACKED_DOCUMENTS.filter(kind => clean(`${PREFIX[kind]}_URL`));
  if (!configured.length) {
    console.log('⏭️  لم يُضبط أيُّ MIZAN_LEGAL_*_URL — لا عنوانَ يُقاس صدقُه.');
    console.log('    وغيابُه مانعُ إطلاقٍ يرفعه `npm run preflight` باسمه، لا هذا الفحص.');
    return;
  }

  const failures = (await Promise.all(configured.map(verify))).filter((f): f is Failure => f !== null);
  for (const kind of configured) {
    const failure = failures.find(f => f.kind === kind);
    const url = clean(`${PREFIX[kind]}_URL`);
    if (failure) console.error(`  ✗ ${kind}: ${failure.code}\n     ${failure.detail}`);
    else console.log(`  ✓ ${kind}: ${url} — النسخة والتاريخ والناشر مطابقة`);
  }

  const skipped = CONSENT_BACKED_DOCUMENTS.filter(kind => !configured.includes(kind));
  for (const kind of skipped) console.log(`  ⏭️  ${kind}: لم يُضبط ${PREFIX[kind]}_URL`);

  if (failures.length) {
    console.error('\nالوثيقةُ التي يُحال إليها الموقِّع ليست التي يُسجَّلها أثرُه. لا تُطلق.');
    process.exitCode = 1;
  }
}

void main();
