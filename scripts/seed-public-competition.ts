#!/usr/bin/env node
/*
 * يزرع مسابقةً منشورةً في `public_competitions/<id>` — **على المحاكي وحده**.
 *
 * سببُ وجوده: قسمُ التسجيل في `qa:scope-visual` كان يُتخطّى باسمه، لأن رابط التسجيل
 * العامّ **يُعيد الجلبَ من الخادم دائمًا ولا يقبل نسخةَ المتصفّح** — وذلك مقصودٌ ومكتوبٌ
 * في `src/App.tsx`: وإلّا لعُرضت الصفحةُ كاملةً على جهاز الإدارة وحده، فيختبرها المسؤول
 * فتنجح، ويفتحها المتسابق فلا يجد شيئًا.
 *
 * فالتخطّي كان صادقًا، لكنّه يترك **بابَ المتسابق الأمامي** بلا فحصٍ في متصفّح: النموذج،
 * وقاعدةُ الفئة، والموافقةُ التي تُسجَّل ضدّ نسخةِ الوثيقة. وهذا يُشغَّل الآن على محاكي
 * Firestore بخادمٍ حقيقيّ.
 *
 * **ولا يكتب إلا على المحاكي.** غيابُ `FIRESTORE_EMULATOR_HOST` يوقفه — لا يُحاول ثم
 * يفشل: سكربتُ زرعٍ يصادف اعتمادَ إنتاجٍ في بيئةٍ ما يكتب في سجلّ مسابقاتٍ حقيقيّ.
 */

import { FirestoreRestRepository } from '../server/firestore-rest';
import { SEED_COMPETITION } from '../src/data/seed-data';

const emulator = String(process.env.FIRESTORE_EMULATOR_HOST || '').trim();
if (!emulator) {
  console.error('SEED_REFUSED_WITHOUT_EMULATOR: FIRESTORE_EMULATOR_HOST غير مضبوط.');
  console.error('  هذا السكربت يزرع بياناتٍ تجريبية، ولا يُسمح له بلمس Firestore حقيقيّ.');
  process.exit(2);
}

const projectId = String(process.env.FIREBASE_PROJECT_ID || 'mizan-qa-surface').trim();

async function main() {
  // ويكفي المُهايئُ نفسُه: هو يحترم المحاكي في العنوان وفي الرمز معًا.
  const repository = new FirestoreRestRepository(projectId);

  /*
   * ومعرّفٌ خاصٌّ بالفحص، لا معرّفُ مسابقة العرض.
   *
   * الخادمُ العامّ يرفض `comp-dubai-2027` وجهتَها `org-gqa-global` صراحةً
   * (`RETIRED_SEED_COMPETITION_IDS` في `server.ts`): بياناتُ العرض لا تُخدَم على الرابط
   * العامّ، وإلّا ظهرت مسابقةٌ تجريبيةٌ لزائرٍ حقيقيّ. وهو حارسٌ صحيح، فلا يُلتفّ عليه —
   * يُزرع للفحص كيانٌ باسمه، مشتقٌّ من الشكل نفسه.
   */
  const competition = {
    ...SEED_COMPETITION,
    id: process.env.MIZAN_QA_COMPETITION_ID || 'comp-qa-surface',
    organizationId: process.env.MIZAN_QA_ORGANIZATION_ID || 'org-qa-surface',
  };
  await repository.commitAtomically({
    upserts: [{
      path: `public_competitions/${competition.id}`,
      /*
       * الشكلُ هو ما يكتبه المنتج نفسه عند النشر (`store.ts`): الجهة، والمسابقة، ووقت
       * التحديث. وشكلٌ يُخترع هنا يجعل الفحصَ يقيس شيئًا لا يُنتجه المنتج.
       */
      data: {
        organizationId: competition.organizationId,
        competition: competition as unknown as Record<string, unknown>,
        updatedAt: new Date().toISOString(),
      },
    }],
  });

  console.log(`زُرعت المسابقة المنشورة: public_competitions/${competition.id}`);
  console.log(`  الفئات: ${competition.categories.length} · المشروع: ${projectId} · المحاكي: ${emulator}`);
}

main().catch(err => { console.error(`SEED_FAILED: ${err instanceof Error ? err.message : String(err)}`); process.exit(1); });
