/*
 * تجهيز نشرٍ حقيقي لميزان.
 *
 * يولّد ما يمكن توليده آليًا (مفاتيح التوقيع والأسرار ومجلدات البيانات)، ويكتبها في ملف
 * بيئة، ثم يذكر بوضوح ما يبقى على الإنسان (مشروع Firebase، سجل الجهات، مفتاح الصوت).
 *
 * لا يلمس شيئًا موجودًا: أي قيمة مضبوطة سلفًا تُحترم كما هي، فتشغيله مرتين آمن.
 *
 *   node scripts/provision-deployment.mjs [--out .env.production] [--data-root /var/lib/mizan]
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const OUT = path.resolve(arg('out', '.env.production'));
const DATA_ROOT = path.resolve(arg('data-root', path.join(process.cwd(), '.mizan-data')));

/* ── ما يُقرأ من ملف موجود، فلا يُبدَّل سرٌّ يعمل ───────────────────────────── */
const existing = new Map();
if (fs.existsSync(OUT)) {
  for (const line of fs.readFileSync(OUT, 'utf8').split('\n')) {
    const m = /^([A-Z0-9_]+)=([\s\S]*)$/.exec(line.trim());
    if (m) existing.set(m[1], m[2]);
  }
}
const keep = (k) => existing.get(k) || process.env[k] || '';

const secret = () => crypto.randomBytes(32).toString('base64url');

/* مفتاح توقيع الثقة: زوج Ed25519. المعرّف مشتق من المفتاح العام فيتغيّر بتغيّره. */
function trustKey() {
  const kept = keep('MIZAN_TRUST_SIGNING_PRIVATE_KEY_PEM');
  if (kept) return { pem: kept, id: keep('MIZAN_TRUST_KEY_ID') };
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
  const pem = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
  const spki = publicKey.export({ format: 'der', type: 'spki' }).toString('base64url');
  const id = `ed25519:${crypto.createHash('sha256').update(spki).digest('hex').slice(0, 16)}`;
  return { pem, id };
}

const DIRS = {
  MIZAN_IDENTITY_GOVERNANCE_DIR: 'identity',
  MIZAN_INTEGRITY_AUTHORITY_DIR: 'integrity-authority',
  MIZAN_AUDIT_LEDGER_DIR: 'audit-ledger',
  MIZAN_QURAN_SOURCE_DIR: 'quran-source',
  MIZAN_QURAN_INTELLIGENCE_DIR: 'quran-intelligence',
  MIZAN_QUESTION_ESCROW_DIR: 'question-escrow',
  MIZAN_SECURE_QUESTION_RUNTIME_DIR: 'secure-question-runtime',
  MIZAN_SERVER_QUESTION_POOL_DIR: 'question-pool',
  MIZAN_EDGE_DATA_DIR: 'edge',
  MIZAN_COLD_VAULT_DIR: 'cold-vault',
  MIZAN_WITNESS_MODE_DIR: 'witness',
  MIZAN_WORD_TIMINGS_DIR: 'word-timings',
};

const trust = trustKey();
const env = {
  VITE_REQUIRE_AUTH: 'true',
  MIZAN_ENTERPRISE_API_KEY: keep('MIZAN_ENTERPRISE_API_KEY') || secret(),
  MIZAN_PASS_SIGNING_SECRET: keep('MIZAN_PASS_SIGNING_SECRET') || secret(),
  MIZAN_CERT_SIGNING_SECRET: keep('MIZAN_CERT_SIGNING_SECRET') || secret(),
  MIZAN_QUESTION_ESCROW_MASTER_KEY: keep('MIZAN_QUESTION_ESCROW_MASTER_KEY') || secret(),
  MIZAN_WEBHOOK_SIGNING_SECRET: keep('MIZAN_WEBHOOK_SIGNING_SECRET') || secret(),
  MIZAN_TRUST_SIGNING_PRIVATE_KEY_PEM: trust.pem,
  MIZAN_TRUST_KEY_ID: trust.id,
  MIZAN_REQUIRE_MFA_FOR_SENSITIVE: keep('MIZAN_REQUIRE_MFA_FOR_SENSITIVE') || 'true',
};
for (const [key, folder] of Object.entries(DIRS)) {
  const dir = keep(key) || path.join(DATA_ROOT, folder);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  env[key] = dir;
}

/* ما لا يستطيع أي سكربت اختراعه — يُكتب فارغًا ليُملأ بيد إنسان. */
const HUMAN = {
  FIREBASE_PROJECT_ID: 'مشروع Firebase الذي يثبت هوية المستخدمين',
  MIZAN_BASE_DOMAIN: 'النطاق الأساسي الذي تتفرّع منه نطاقات الجهات',
  MIZAN_TENANTS: 'سجل الجهات (أو MIZAN_TENANTS_FILE)',
  MIZAN_GEMINI_API_KEY: 'مفتاح توليد مقاطع عبارة الإيقاف (مرة واحدة)',
};
for (const key of Object.keys(HUMAN)) env[key] = keep(key);

const body = [
  '# مُولَّد بواسطة scripts/provision-deployment.mjs — يحتوي أسرارًا: لا يُرفع إلى git.',
  `# ${new Date().toISOString()}`,
  '',
  // مفتاح PEM يُكتب سطرًا واحدًا بـ \\n حرفية: هو الشكل الذي يقبله كل مدير أسرار، والخادم يفكّه.
  ...Object.entries(env).map(([k, v]) => `${k}=${v.includes('\n') ? v.replace(/\n/g, '\\n') : v}`),
  '',
].join('\n');
fs.writeFileSync(OUT, body, { mode: 0o600 });

const missing = Object.entries(HUMAN).filter(([k]) => !env[k]);
console.log(`✓ كُتب ${path.relative(process.cwd(), OUT)} (صلاحيات 600)`);
console.log(`✓ مجلدات البيانات تحت ${DATA_ROOT}`);
console.log(`✓ وُلِّدت الأسرار ومفتاح التوقيع (${trust.id})`);
if (missing.length) {
  console.log(`\nيبقى عليك ${missing.length}:`);
  for (const [k, why] of missing) console.log(`  • ${k} — ${why}`);
} else {
  console.log('\nلا شيء متبقٍ: كل القيم مضبوطة.');
}
console.log('\nثم:  npm run build && node --env-file=' + path.relative(process.cwd(), OUT) + ' dist/server.cjs');
console.log('وللتحقق:  curl -s localhost:3000/api/health');
