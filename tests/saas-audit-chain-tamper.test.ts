import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { SaaSPlatformRepository } from '../server/saas-platform';

/*
 * `verifyAudit` هو الدعوى: سجلُّ SaaS التجاري مقيَّدٌ بسلسلةِ تلبيد، فلا تُغيَّر سطورُه
 * بعد كتابتها بلا أثر. وفيه ما يُحتجّ به: إنشاءُ جهة، وسدادُ فاتورةٍ عبر البوّابة،
 * ومفاتيحُ الإيقاف، وكسرُ الزجاج.
 *
 * وكان المحروسُ منه الجانبَ الموجب وحده: `verifyAudit().valid === true` على سجلٍّ
 * سليم. ودالةٌ تُرجع `true` دائمًا تجتاز ذلك — فتبقى الدعوى بلا سند، ويُقرأ السجلُّ
 * سنتين بوصفه محرَّرًا من التلاعب وهو غيرُ مفحوص.
 *
 * فيُحرَس الجانبُ السالب: يُعبَث بالملفّ على القرص — لا في الذاكرة — ويجب أن يُكتشف.
 * وتُميَّز السلسلةُ من مجموعِ تحقّقٍ لكل سطر: سطرٌ مُلحق بتلبيدٍ صحيحٍ لنفسه ورابطٍ
 * مكسور يجب أن يُرفض كذلك، وإلا فليست سلسلة.
 */

const owner = { uid: 'owner', role: 'super_admin', organizationId: '__platform__' };
const dates = { startsAt: '2026-01-01', expiresAt: '2027-01-01' };

/* نسخةٌ من تلبيد المستودع، تُستخدم لصناعة سطرٍ مزوَّرٍ «سليمِ التلبيد». */
const canonical = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const o = value as Record<string, unknown>;
  return `{${Object.keys(o).sort().map(k => `${JSON.stringify(k)}:${canonical(o[k])}`).join(',')}}`;
};
const hash = (value: unknown) => crypto.createHash('sha256').update(canonical(value)).digest('hex');

/* سجلٌّ فيه سطورٌ حقيقية، ثم تُعبَث نسختُه على القرص بما تصفه `tamper`. */
const withTamperedLedger = (
  tamper: (rows: any[]) => any[] | void,
  expectation: (result: ReturnType<SaaSPlatformRepository['verifyAudit']>, rowsBefore: any[]) => void,
) => () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mizan-audit-chain-'));
  const file = path.join(dir, 'state.json');
  try {
    const repo = new SaaSPlatformRepository(file);
    const plan = repo.seedInitialPlan(owner);
    for (const name of ['Alpha', 'Beta', 'Gamma']) {
      repo.createOrganization(owner, {
        officialName: name, shortName: name, organizationType: 'charity',
        country: 'KW', planId: plan.id, ...dates,
      });
    }
    // السلامةُ أولًا: بلا عبث، السلسلة صحيحة. فلو سقط هذا لكان العبثُ بريئًا.
    const clean = repo.verifyAudit();
    assert.equal(clean.valid, true, 'the untampered ledger must verify');
    assert.ok((clean as { rows: number }).rows >= 3, 'the ledger has real rows to tamper with');

    const state = JSON.parse(fs.readFileSync(file, 'utf8'));
    const before = JSON.parse(JSON.stringify(state.audit));
    const replaced = tamper(state.audit);
    if (replaced) state.audit = replaced;
    fs.writeFileSync(file, JSON.stringify(state, null, 2));

    expectation(new SaaSPlatformRepository(file).verifyAudit(), before);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
};

test('an altered action is detected', withTamperedLedger(
  rows => { rows[1].action = 'ORGANIZATION_DELETED'; },
  result => {
    assert.equal(result.valid, false, 'rewriting what happened must break the chain');
    assert.equal((result as { sequence: number }).sequence, 2, 'the failing row is named');
  }));

test('an altered actor is detected', withTamperedLedger(
  // مَن فعل: أخطرُ حقلٍ يُغيَّر، وأهدأُه إن لم يُفحص.
  rows => { rows[0].actorId = 'somebody-else'; },
  result => assert.equal(result.valid, false, 'rewriting who acted must break the chain')));

test('an altered reason is detected', withTamperedLedger(
  rows => { rows[2].reason = 'a different justification'; },
  result => assert.equal(result.valid, false, 'rewriting the stated reason must break the chain')));

test('a deleted row is detected', withTamperedLedger(
  rows => rows.filter((_, i) => i !== 1),
  result => assert.equal(result.valid, false, 'excising a row must break the chain')));

test('reordered rows are detected', withTamperedLedger(
  rows => [rows[1], rows[0], ...rows.slice(2)],
  result => assert.equal(result.valid, false, 'reordering must break the chain')));

test('a forged row with a self-consistent hash is still rejected', withTamperedLedger(
  rows => {
    /*
     * هذه الحالةُ تفصل السلسلةَ من مجموع تحقّقٍ لكل سطر: السطرُ المزوَّر تلبيدُه
     * صحيحٌ لنفسه تمامًا، ولكنه يُدسّ في الوسط فينكسر رابطُ ما بعده.
     */
    const forged = { ...rows[2], id: 'AUD-FORGED', sequence: rows[2].sequence, action: 'KILL_SWITCH_SET', previousHash: rows[1].hash };
    delete (forged as any).hash;
    return [...rows.slice(0, 2), { ...forged, hash: hash(forged) }, ...rows.slice(2)];
  },
  result => assert.equal(result.valid, false,
    'a per-row checksum is not a chain: an inserted row must still break it')));

test('truncating the ledger to a prefix is detected by the anchor', withTamperedLedger(
  /*
   * كان هذا حدًّا مُوثَّقًا: قطعُ الذيل يُنتج سلسلةً صحيحةً أقصر، ولا تكشفه سلسلةُ
   * تلبيدٍ وحدها. وقد أُغلق الحدُّ بمرساةٍ خارج السلسلة تحفظ الطولَ والتلبيدَ الأخير.
   *
   * فالحالةُ هنا تنتقل من توثيقِ حدٍّ إلى فحصِ منعٍ. وتفصيلُ المرساة ومستوَيَي
   * حمايتها في `saas-audit-anchor.test.ts`.
   */
  rows => rows.slice(0, 1),
  (result, before) => {
    assert.equal(result.valid, false, 'a truncated prefix must no longer pass');
    assert.equal((result as unknown as { code: string }).code, 'AUDIT_LEDGER_TRUNCATED');
    assert.ok(before.length > 1, 'rows really were removed');
  }));
