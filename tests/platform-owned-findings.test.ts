import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { detectContradictions } from '../src/lib/policy-compiler';
import type { Competition } from '../src/types';

const read = (file: string) => fs.readFileSync(file, 'utf8');

/*
 * رادار التعارض يعرض للجهة ما تملك إصلاحه.
 *
 * «لا يوجد مصدر قرآني معتمد لرواية…» و«قدرة الذكاء غير معتمدة لرواية…» ليستا عطبًا في
 * مسابقة الجهة بل نقصًا في تسليم منصّة ميزان. والجهة لا تملك من أمرهما شيئًا — لا زرَّ
 * ولا إعداد — فعرضُهما عليها قلقٌ بلا فعل، وحكمٌ على منتجٍ اشترته بأنه ناقص.
 */

const competition = (): Competition => ({
  id: 'comp-owner-test',
  organizationId: 'org-1',
  name: 'Test',
  nameArabic: 'اختبار',
  edition: '1',
  status: 'setup',
  categories: [{ id: 'c1', code: 'C1', name: 'Cat', nameArabic: 'فئة', riwaya: 'A reading that was never delivered', juzCount: 30, memorizationScope: 'Full Quran' }],
  ruleSet: { judgesCountPerPanel: 1, minimumPassingScore: 50, criteria: [{ id: 'k', name: 'K', nameArabic: 'ك', weight: 1 }] },
} as unknown as Competition);

test('platform delivery findings are labelled as the platform’s, and everything else stays the organizer’s', () => {
  const issues = detectContradictions({
    competition: competition(),
    quranSources: [],
    aiValidations: [],
    availableQualifiedJudges: 0,
    committeeCount: 1,
  });

  const platform = issues.filter(x => x.owner === 'platform');
  assert.ok(platform.length > 0, 'an undelivered reading raises a platform-owned finding');
  assert.ok(platform.every(x => /Quran source|crosswalk|AI unavailable/i.test(x.title)), 'and only delivery items carry that label');

  /* والافتراض هو الإظهار: إغفالُ المالك لا يُخفي شيئًا عن الجهة. */
  assert.ok(issues.every(x => x.owner === 'platform' || x.owner === 'organizer'), 'every finding names an owner');
  const shortage = issues.find(x => /judge shortage/i.test(x.title));
  assert.equal(shortage?.owner, 'organizer', 'a judge shortage is the organization’s to fix, and stays visible');
});

test('the radar hides platform items from every role but the platform owner — and hides nothing else', () => {
  const lab = read('src/components/admin/ReadinessLab.tsx');

  assert.match(lab, /const platformOwner=s\.currentUser\.role==='super_admin';/, 'only the platform owner sees them');
  assert.match(lab, /platformOwner\?all:all\.filter\(x=>x\.owner!=='platform'\)/, 'and the filter drops platform items alone');

  /* وهو حجبُ عرضٍ لا حذف: البند يبقى يُبنى ويُحسب، ويُقرأ في شاشة المنصّة. */
  assert.match(lab, /const all=useMemo\(\(\)=>detectContradictions/, 'the findings are still all computed');
  assert.match(lab, /platformOwner&&all\.some\(x=>x\.owner==='platform'\)/, 'and the owner is told how many are withheld');
});
