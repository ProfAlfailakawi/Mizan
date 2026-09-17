import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { inspectProductionConfig } from '../server/production-config-guard';

/*
 * أسوأ من غياب سجلٍّ خادمي هو الظنّ أنه موجود.
 *
 * `MIZAN_AUDIT_LEDGER_DIR` اختياريٌّ بالكامل: بلا قيمة يصير كل إلحاقٍ في السجلّ لا شيء
 * بصمت، وتردّ نقاط قراءته 503. فيشغّل المسؤول مسابقةً كاملة ظانًّا أن عنده سلسلة بصماتٍ
 * خادمية يُحتجّ بها، ولا يكتشف العكس إلا يوم يُطلب الدليل — وهو أسوأ يومٍ لاكتشافه.
 *
 * وتنبيهٌ لا منع: جهةٌ قد تشغّل بلا سجلٍّ خادمي عن قصد، ومنعُ الإقلاع يوقف نشرًا قائمًا.
 */

const base = { NODE_ENV: 'production', FIREBASE_PROJECT_ID: 'mizan-test' } as Record<string, string>;
const codes = (env: Record<string, string | undefined>) => inspectProductionConfig(env).findings.map(f => f.code);

test('production says out loud when there is no server-side audit ledger', () => {
  const found = inspectProductionConfig(base).findings.find(f => f.code === 'SERVER_AUDIT_LEDGER_UNCONFIGURED');
  assert.ok(found, 'an unconfigured ledger is reported');
  assert.equal(found!.severity, 'WARNING', 'reported, not a blocker — some organisations run without one on purpose');
  assert.equal(found!.variable, 'MIZAN_AUDIT_LEDGER_DIR');
});

test('a ledger pointed at ephemeral disk is called out separately', () => {
  for (const dir of ['/tmp/mizan-ledger', '/var/tmp/x', '/dev/shm/ledger']) {
    assert.ok(codes({ ...base, MIZAN_AUDIT_LEDGER_DIR: dir }).includes('SERVER_AUDIT_LEDGER_EPHEMERAL'), dir);
  }
  const durable = codes({ ...base, MIZAN_AUDIT_LEDGER_DIR: '/mnt/mizan/audit' });
  assert.ok(!durable.includes('SERVER_AUDIT_LEDGER_EPHEMERAL'));
  assert.ok(!durable.includes('SERVER_AUDIT_LEDGER_UNCONFIGURED'));
});

test('outside production the ledger is not reported at all', () => {
  const dev = codes({ NODE_ENV: 'development' });
  assert.ok(!dev.includes('SERVER_AUDIT_LEDGER_UNCONFIGURED'));
  assert.ok(!dev.includes('SERVER_AUDIT_LEDGER_EPHEMERAL'));
});

test('both codes carry a sentence that says what to do, not just what is wrong', () => {
  const catalog = fs.readFileSync(path.join(process.cwd(), 'src', 'lib', 'error-catalog.ts'), 'utf8');
  for (const code of ['SERVER_AUDIT_LEDGER_UNCONFIGURED', 'SERVER_AUDIT_LEDGER_EPHEMERAL']) {
    assert.ok(catalog.includes(`'${code}'`), `${code} is registered in the error catalog`);
  }
  assert.match(catalog, /MIZAN_AUDIT_LEDGER_DIR على مسارٍ دائم/);
});
