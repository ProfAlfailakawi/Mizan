/*
 * §27 — جردُ الحرّاس: لكل مسارٍ خادمي جوابٌ عن «من يدخله؟».
 *
 * الحرّاسُ في هذا الملفّ ليسوا قليلين، لكن لا شيء كان يضمن أن المسارَ **القادم** سيحمل
 * واحدًا منهم. ومسارٌ ينسى حارسَه لا يبدو مكسورًا: يعمل، ويردّ ٢٠٠، ويقرأ منه من لا حقّ
 * له. فالنسيانُ هنا لا يُكتشف بالتشغيل، يُكتشف بعد أن يقع.
 *
 * فهذا الاختبار يجرد **كل** مسارٍ في `server.ts` ويطالبه بحارسٍ معروف. وما لا يُحرَس
 * يجب أن يكون في قائمةٍ عامّة مكتوبةٍ باليد ومعها **سببُ** كونه عامًّا — فالانفتاح قرارٌ
 * يُتَّخذ ويُراجَع، لا حالةٌ يقع فيها المسار.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const SERVER = fs.readFileSync(path.join(process.cwd(), 'server.ts'), 'utf8');

/** حارسٌ يحسم الهوية أو الاعتماد. حدُّ المعدّل ليس حارسًا — يبطّئ المهاجم ولا يمنعه. */
const GUARD_FACTORIES = ['requireGovernanceRoles(', 'requireFirebaseRoles('] as const;
const GUARD_NAMES = ['requireFirebaseBase', 'requireEnterpriseKey', 'ownerOnly', 'aiAdvisoryAuth'] as const;

/**
 * الحرّاس يُربطون أحيانًا في ثابتٍ ثم يُمرَّر الثابتُ للمسار
 * (`const opRoles = requireFirebaseRoles([...])`). وقارئٌ لا يتبع هذا الالتفاف يقرأ
 * مسارًا محروسًا على أنه مكشوف، فيُغرق الجردَ بإنذارٍ كاذب ويُفقده قيمتَه. فتُجمع
 * أسماءُ تلك الثوابت من المصدر نفسه.
 */
function guardAliases(): string[] {
  const aliases: string[] = [];
  const factory = GUARD_FACTORIES.map(f => f.replace('(', '')).join('|');
  for (const match of SERVER.matchAll(new RegExp(`const\\s+([A-Za-z_$][\\w$]*)\\s*(?::[^=]+)?=\\s*(?:${factory})\\(`, 'g'))) {
    aliases.push(match[1]);
  }
  return aliases;
}

const IDENTITY_GUARDS = [...GUARD_FACTORIES, ...GUARD_NAMES, ...guardAliases()];

/**
 * المسارات العامّة بقصد، ومعها سببُ كونها كذلك.
 *
 * كلُّ سطرٍ هنا قرارٌ يُراجَع: ما الذي يراه زائرٌ بلا هوية، ولماذا يجوز أن يراه. وإضافةُ
 * مسارٍ إلى هنا تُقرأ في المراجعة، بخلاف مسارٍ يُنسى حارسُه فلا يراه أحد.
 */
const INTENTIONALLY_PUBLIC: Record<string, string> = {
  // ── حالةُ الخدمة ونسختها: لا بيانات مستأجر، وتُقرأ قبل أي هوية ─────────────────────
  '/api/health': 'حالةُ الخدمة — يقرؤها فحصُ الصحة في المنصّة قبل وجود أي هوية.',
  '/api/public/legal/:kind': 'الوثيقةُ التي يُطلب من المتسابق التوقيع عليها — تُقرأ قبل التوقيع وبلا حساب، وإلا وقَّع على ما لم يره.',
  '/api/version': 'نسخةُ البناء — تُقرأ لمطابقة ما يعمل بما نُشر، ولا تحمل بيانات أحد.',
  '/api/time': 'ساعةُ الخادم — يضبط عليها المتصفّح مؤقّتَ الجلسة، وتسبق الدخول.',
  '/api/capabilities': 'ما الذي هُيّئ في هذا النشر — أعلامٌ تشغيلية لا أسرار ولا بيانات.',

  // ── سطحُ التسجيل العام: غرضُه أن يفتحه من ليس في النظام بعد ────────────────────────
  '/api/public/tenant': 'هويةُ الجهة كما تظهر على صفحة تسجيلها — اسمٌ وشعارٌ نشرهما مالكُها.',
  '/api/public/competition': 'المسابقةُ المنشورة للعموم بقرار ناشرها.',
  '/api/public/competitions': 'قائمةُ المسابقات المنشورة — ما نُشر بقصدٍ لا ما في قاعدة البيانات.',
  '/api/public/competitions/:competitionId': 'صفحةُ تسجيلٍ عامّة لمسابقةٍ نُشرت.',
  '/api/public/competitions/:competitionId/register': 'تسجيلُ متسابقٍ جديد — لا هوية قبله بطبيعته؛ محروسٌ بحدّ معدّل وبتحقّقٍ من محتواه.',
  '/api/public/journeys/resolve': 'رحلةُ متسابقٍ برمزٍ سرّي يُقدَّم في الطلب — الرمزُ نفسه هو الاعتماد.',
  '/api/public/journeys/practice/context': 'تهيئةُ تدريبٍ خاص ببطاقة الرحلة — مفتاح الرحلة في الترويسة هو الاعتماد، ويُتحقق منه خادميًّا قبل إعادة نطاق المتسابق.',
  '/api/public/journeys/practice/faces': 'وجوهُ تدريب المتسابق — لا تُعاد إلا بعد التحقق من بطاقة الرحلة، والنطاق والرواية مشتقان من الخادم.',
  '/api/public/journeys/practice/face': 'وجهُ مصحفٍ للتدريب — بطاقة الرحلة هي الاعتماد والخادم يرفض أي صفحة خارج نطاق صاحبها.',
  '/api/public/journeys/practice/judging-gate': 'حالةُ بوابة الاستماع لصاحب بطاقة الرحلة — البطاقة هي الاعتماد ولا يختار المتصفح هوية المتسابق.',
  '/api/public/journeys/practice/align': 'محاذاةُ مقطع تدريبٍ خاص — بطاقة الرحلة اعتمادٌ إلزامي، ويعيد الخادم التحقق من الرواية والنطاق لكل مقطع.',
  '/api/public/journeys/practice/recognise': 'تعرّفُ مقطع تدريبٍ خاص — بطاقة الرحلة اعتمادٌ إلزامي، والرواية والحزمة تتحققان خادميًّا.',
  '/api/public/brand-assets/organizations/:organizationId/logo': 'شعارُ الجهة كما يظهر على صفحتها العامّة.',
  '/api/public/brand-assets/organizations/:organizationId/competitions/:competitionId/logo': 'شعارُ المسابقة على صفحتها العامّة.',

  // ── ما قبل الهوية: استعادةُ كلمة مرور ومعاينةُ دعوة ───────────────────────────────
  '/api/identity/password-reset/request': 'طلبُ استعادةٍ ممّن فقد دخوله — لا هوية لديه بتعريف الحالة.',
  '/api/identity/password-reset/validate': 'تحقّقٌ من رمز استعادةٍ في المسار — الرمزُ هو الاعتماد.',
  '/api/identity/password-reset/used': 'إعلامُ الخادم أن رمزًا استُهلك، فلا يُعاد استعماله.',
  '/api/identity/invitation/preview': 'معاينةُ دعوةٍ برمزها قبل التفعيل — المدعوُّ ليس في النظام بعد.',

  // ── التحقّق العلني: من يمسك ورقةً مطبوعة يتحقّق منها بلا حساب ─────────────────────
  '/api/passes/verify/:token': 'التحقّقُ من بطاقة دخولٍ مطبوعة — الرمزُ في البطاقة هو الاعتماد.',
  '/api/certificates/verify/:token': 'التحقّقُ من شهادةٍ برمزها الموقَّع.',
  '/api/public/certificates/:number': 'التحقّقُ من شهادةٍ برقمها المطبوع — غرضُه أن يفتحه من ليس في النظام.',
  '/api/trust/verify': 'إعادةُ حسابِ ختمٍ يقدّمه الشاكّ بنفسه — لا يقرأ شيئًا من المخزن.',

  // ── نصُّ القرآن وأصولُه: محتوًى عام بطبيعته، وليس بيانات مستأجر ──────────────────
  '/api/public/kfgqpc/page/:packageId/:page': 'صفحةُ مصحفٍ مطبوعة — محتوًى عام.',
  '/api/public/kfgqpc/font/:fontId': 'خطُّ المصحف — أصلٌ ثابت يُحمّله المتصفّح.',
  '/api/public/kfgqpc/audio/:readingId/:surah/:ayah': 'تلاوةُ آية — محتوًى عام، وسياسةُ الصوت حفصٌ معلنة.',
  '/api/public/kfgqpc/word-timings/:readingId/:surah/:ayah': 'توقيتاتُ كلمات التلاوة — تابعةٌ للصوت العام.',
  '/api/public/kfgqpc/passage/:readingId/:surah/:startAyah/:endAyah': 'نصُّ مقطعٍ قرآني — محتوًى عام، وروايتُه مصرَّحٌ بها في الردّ.',
  '/api/public/kfgqpc/mushaf-layout/:page': 'تخطيطُ صفحةٍ مطبوعة — إثراءٌ بصري لا بيانات.',
  '/api/public/kfgqpc/fairdraw/:readingId': 'مواضعُ صالحةٌ للسحب في رواية — بنيةُ المصحف لا سؤالُ مسابقة.',
  '/api/public/kfgqpc/mutashabihat/:readingId/:surah/:ayah': 'المتشابهُ اللفظي لموضعٍ — مشتقٌّ من نصٍّ عام.',
  '/api/public/kfgqpc/divergence/:readingId/:surah/:startAyah/:endAyah': 'مواضعُ الافتراق بين القراءات — علمٌ منشور.',
  '/api/public/kfgqpc/difficulty/:readingId/:surah/:startAyah/:endAyah': 'تقديرُ صعوبةِ مقطع — مشتقٌّ من بنية النصّ لا من مسابقة.',
  '/api/public/cue-audio': 'نغماتُ التنبيه في القاعة — أصلٌ ثابت.',

  // ── نداءاتٌ خارجية توثَّق بغير هوية مستخدم ───────────────────────────────────────
  '/api/payments/webhook': 'نداءُ مزوّد الدفع — يُوثَّق بتوقيع المزوّد على الجسم الخام، لا بهوية مستخدم.',

  // ── تطبيقُ الصفحة الواحدة ───────────────────────────────────────────────────────
  '*': 'المُلتقِط الأخير الذي يخدم ملفّات الواجهة — لا يصل إلى بيانات، والحراسةُ خلف نداءات الـAPI.',
};

interface RouteEntry { method: string; route: string; line: string; lineNumber: number }

function routes(): RouteEntry[] {
  const out: RouteEntry[] = [];
  SERVER.split('\n').forEach((line, index) => {
    for (const match of line.matchAll(/app\.(get|post|put|patch|delete)\('([^']+)'/g)) {
      out.push({ method: match[1].toUpperCase(), route: match[2], line, lineNumber: index + 1 });
    }
  });
  return out;
}

const ROUTES = routes();
const guarded = (entry: RouteEntry) => {
  const after = entry.line.slice(entry.line.indexOf(`'${entry.route}'`));
  // الحارسُ يُقرأ من قائمة الوسائط قبل المعالج، لا من جسم المعالج.
  const args = after.slice(0, after.indexOf('=>') >= 0 ? after.indexOf('=>') : after.length);
  return IDENTITY_GUARDS.some(guard => args.includes(guard));
};

test('the inventory actually found the routes — an empty scan proves nothing', () => {
  assert.ok(ROUTES.length >= 200, `expected the full route table, found ${ROUTES.length}`);
  assert.ok(ROUTES.some(r => r.route === '/api/health'), 'the scan must see a route we know exists');
  assert.ok(ROUTES.some(r => r.route.startsWith('/api/enterprise/')), 'and the enterprise surface too');
});

test('every server route either carries an identity guard or is listed as public with a reason', () => {
  const unguarded = ROUTES
    .filter(entry => !guarded(entry))
    .filter(entry => !(entry.route in INTENTIONALLY_PUBLIC));

  assert.deepEqual(
    unguarded.map(e => `${e.method} ${e.route} (server.ts:${e.lineNumber})`),
    [],
    'these routes have no identity guard and are not declared public — add a guard, or declare them public with a reason',
  );
});

test('nothing sits in the public list that is not actually a route any more', () => {
  const live = new Set(ROUTES.map(r => r.route));
  const stale = Object.keys(INTENTIONALLY_PUBLIC).filter(route => !live.has(route));
  assert.deepEqual(stale, [], 'the public allow-list must not outlive its routes — a stale entry hides a future route of the same name');
});

test('every publicly declared route states why it is public', () => {
  for (const [route, reason] of Object.entries(INTENTIONALLY_PUBLIC)) {
    assert.ok(reason.trim().length > 20, `${route} is declared public without a real reason`);
  }
});

test('a rate limit is never mistaken for a guard', () => {
  // حدُّ المعدّل يبطّئ المهاجم ولا يمنعه. فلا يُقبل وحده على مسارٍ يحمل بيانات مستأجر.
  const rateOnly = ROUTES.filter(entry => {
    const after = entry.line.slice(entry.line.indexOf(`'${entry.route}'`));
    return /RateLimit/.test(after) && !guarded(entry) && !(entry.route in INTENTIONALLY_PUBLIC);
  });
  assert.deepEqual(rateOnly.map(e => `${e.method} ${e.route}`), []);
});

test('the enterprise surface is uniformly behind the platform key', () => {
  const enterprise = ROUTES.filter(entry => entry.route.startsWith('/api/enterprise/'));
  assert.ok(enterprise.length >= 10, `expected a real enterprise surface, found ${enterprise.length}`);
  for (const entry of enterprise) {
    const after = entry.line.slice(entry.line.indexOf(`'${entry.route}'`));
    assert.ok(after.includes('requireEnterpriseKey'), `${entry.method} ${entry.route} is under /api/enterprise/ without the platform key`);
  }
});

test('the owner surface is uniformly behind the owner guard', () => {
  const owner = ROUTES.filter(entry => entry.route.startsWith('/api/owner/'));
  assert.ok(owner.length >= 5, `expected an owner surface, found ${owner.length}`);
  for (const entry of owner) {
    const after = entry.line.slice(entry.line.indexOf(`'${entry.route}'`));
    assert.ok(after.includes('ownerOnly'), `${entry.method} ${entry.route} is under /api/owner/ without ownerOnly`);
  }
});

test('an authenticated route reads the tenant from the body only behind a platform-level role', () => {
  /*
   * الحقلُ الذي يستطيع الخادم اشتقاقه لا يُؤخذ من الجسم. لكنّ للقاعدة استثناءً مشروعًا:
   * دورٌ منصّيّ (`super_admin`) أو مشغّلٌ يملك الجهة يتصرّف **عبر** المستأجرين بطبيعة
   * عمله، فلا بدّ أن يسمّي الجهة التي يقصدها.
   *
   * فالمطلوب ليس منعَ القراءة، بل أن تكون **مشروطةً** بذلك الدور. وقراءةٌ بلا شرطٍ تعني
   * أن أيَّ حاملِ دورٍ مسموحٍ يكتب معرّف جهةٍ أخرى فيُقبل — وهو تجاوزُ مستأجرين صامت.
   */
  const platformGate = /role\s*===\s*'super_admin'|operatorExists\(|organizationBelongsToOperator\(|platformAdmin/;
  const offenders = ROUTES.filter(entry => {
    const after = entry.line.slice(entry.line.indexOf(`'${entry.route}'`));
    // المفتاحُ المنصّي قرارٌ موثَّق على حدة في `server/enterprise-scope.ts`.
    if (after.includes('requireEnterpriseKey') || after.includes('ownerOnly')) return false;
    if (!after.includes('requireGovernanceRoles(') && !after.includes('requireFirebaseRoles(')) return false;
    if (!/(?:body|req\.body)(?:\?)?\.organizationId/.test(after)) return false;
    if (platformGate.test(after)) return false;
    return !(entry.route in TENANT_VALIDATED_DEEPER);
  });
  assert.deepEqual(
    offenders.map(e => `${e.method} ${e.route} (server.ts:${e.lineNumber})`),
    [],
    'these authenticated routes take organizationId from the body with no platform-role gate — any allowed role could name another tenant',
  );
});

/*
 * الشرطُ قد يسكن طبقةً أعمق: المسارُ يمرّر المعرّف والمستودعُ يرفض التجاوز. وهذا مقبول،
 * لكنه لا يُقبل مسكوتًا عنه — يُسمّى موضعُ الفحص هنا، ويُثبت أنه ما زال قائمًا، فلا يُحذف
 * الحارسُ يومًا ويبقى المسارُ يبدو كما كان.
 */
const TENANT_VALIDATED_DEEPER: Record<string, { file: string; marker: string }> = {
  '/api/identity/competitions/:id/close': {
    file: 'server/identity-governance.ts',
    marker: "CROSS_TENANT_CLOSE_BLOCKED",
  },
};

test('a tenant check that lives one layer down is named, and still there', () => {
  for (const [route, where] of Object.entries(TENANT_VALIDATED_DEEPER)) {
    const source = fs.readFileSync(path.join(process.cwd(), where.file), 'utf8');
    assert.ok(source.includes(where.marker),
      `${route} relies on ${where.marker} in ${where.file}, and it is no longer there — the route is now open across tenants`);
    // والرفضُ مشروطٌ بالدور، لا رفضٌ للجميع ولا سماحٌ للجميع.
    assert.match(source, /actor\.role!=='super_admin'&&requestedOrganizationId&&requestedOrganizationId!==actor\.organizationId/,
      `${where.file} must still gate the cross-tenant case on the platform role`);
  }
});
