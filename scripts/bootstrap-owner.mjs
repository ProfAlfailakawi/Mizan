#!/usr/bin/env node
/*
 * تهيئة أول مالك في حوكمة الهوية.
 *
 * الأدوار تأتي من حوكمة الهوية لا من مزوّد المصادقة: حساب موثَّق بلا سجل هنا يُردّ
 * بـACCOUNT_NOT_PROVISIONED. وإنشاء أول دعوة يتطلب super_admin، فأول مالك لا يستطيع
 * إنشاء نفسه من الواجهة. لولا هذه الأداة لأُقفل الباب على من يفعّل المصادقة أول مرة.
 *
 * تعمل مرة واحدة فقط: سجلّ فيه حساب واحد يُرفض. فلا تصير بابًا لترقية دور لاحقًا.
 *
 *   node scripts/bootstrap-owner.mjs --dir <مجلد الهوية> --uid <UID> \
 *     --email <البريد> --name <الاسم> --org <معرّف الجهة>
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const args = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
  const key = process.argv[i];
  if (key.startsWith('--')) args.set(key.slice(2), process.argv[i + 1]);
}

const dir = args.get('dir') || process.env.MIZAN_IDENTITY_GOVERNANCE_DIR || '';
const uid = (args.get('uid') || '').trim();
const email = (args.get('email') || '').trim().toLowerCase();
const displayName = (args.get('name') || '').trim();
const organizationId = (args.get('org') || 'org-owner').trim();

const fail = (message) => { console.error(`✗ ${message}`); process.exit(1); };

if (!dir) fail('مجلد الهوية مطلوب: --dir أو MIZAN_IDENTITY_GOVERNANCE_DIR');
if (!uid) fail('معرّف المستخدم مطلوب: --uid (من Firebase Authentication)');
if (!email || !email.includes('@')) fail('بريد صالح مطلوب: --email');
if (!displayName) fail('الاسم مطلوب: --name');

const file = path.join(dir, 'identity-governance.json');
fs.mkdirSync(dir, { recursive: true, mode: 0o700 });

let state = { version: 1, invitations: [], accounts: [], grants: [], sessions: [] };
if (fs.existsSync(file)) {
  try { state = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { fail('سجل الهوية موجود لكنه غير قابل للقراءة. لا يُكتب فوقه.'); }
  /* الحدّ الذي يمنع الأداة من أن تصير بابًا خلفيًا: تعمل على سجل فارغ وحده. */
  if ((state.accounts || []).length) {
    fail(`السجل يحوي ${state.accounts.length} حسابًا. التهيئة لأول مالك فقط؛ ما بعده يُمنح من الواجهة.`);
  }
}

const now = new Date().toISOString();
const id = (prefix) => `${prefix}_${crypto.randomUUID()}`;
const accountId = id('acct');

state.accounts.push({
  id: accountId, uid, organizationId, email, displayName,
  status: 'ACTIVE', createdAt: now, activatedFromInvitationId: 'BOOTSTRAP',
});
state.grants.push({
  id: id('grant'), accountId, organizationId, role: 'super_admin',
  status: 'ACTIVE', createdAt: now, createdBy: 'BOOTSTRAP', approvedBy: 'BOOTSTRAP', approvedAt: now,
});

const tmp = `${file}.${process.pid}.tmp`;
fs.writeFileSync(tmp, JSON.stringify(state, null, 2), { encoding: 'utf8', mode: 0o600 });
fs.renameSync(tmp, file);

/* الأثر يُكتب بسلسلة التجزئة نفسها التي يتحقق منها الخادم، وإلا بدا السجل مكسورًا
   عند أول تدقيق — وسجل نزاهة يبدو مكسورًا أسوأ من سجل لا يبدأ. */
const canonical = (v) => {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  return `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
};
const sha = (x) => crypto.createHash('sha256').update(x).digest('hex');
const auditFile = path.join(dir, `identity-audit-${organizationId.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120)}.jsonl`);
if (!fs.existsSync(auditFile)) {
  const base = {
    sequence: 1, timestamp: now, organizationId, actorId: uid, actorRole: 'super_admin',
    action: 'OWNER_BOOTSTRAPPED', entityType: 'Account', entityId: accountId,
    reason: 'تهيئة أول مالك قبل تفعيل المصادقة', previousHash: 'GENESIS',
  };
  fs.appendFileSync(auditFile, `${JSON.stringify({ ...base, hash: sha(`GENESIS|${canonical(base)}`) })}\n`, { encoding: 'utf8', mode: 0o600 });
}

console.log(`✓ هُيِّئ المالك: ${displayName} <${email}>`);
console.log(`  الجهة: ${organizationId}`);
console.log(`  السجل: ${file}`);
console.log('\nتنبيه: الأدوار الحسّاسة تتطلب عاملًا ثانيًا. فعّل التحقق بخطوتين على هذا الحساب،');
console.log('أو اضبط MIZAN_REQUIRE_MFA_FOR_SENSITIVE=false مؤقتًا، وإلا رُدّ الدخول بـMFA_REQUIRED.');
