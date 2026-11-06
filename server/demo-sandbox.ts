/*
 * الصندوق التجريبي المعزول — على نموذج ميراس (Miras) بما يناسب بنية ميزان.
 *
 * ما الذي يعزله هذا الملف، وبأي معنى؟
 *
 *   عالَم العرض في ميزان (مسابقة، متسابقون، محكّمون، درجات) يُبنى في المتصفح من بذرةٍ
 *   صناعية ويعيش في `sessionStorage` لهذا اللسان وحده (انظر `src/lib/store.ts`). الخادم لا
 *   يملك نسخةً من هذا العالم أصلًا، ولا يحتاجها. فالعزل الخادمي المطلوب ليس «نسخةً خاصة من
 *   قاعدة البيانات» بل **جدارٌ يُغلق افتراضيًا**: كل طلبٍ يحمل معرّف صندوقٍ يُحسم هنا قبل أي
 *   مسارٍ آخر، فلا يبلغ مخزن الهوية ولا سجلّ التدقيق ولا Firestore ولا R2 ولا الذكاء
 *   الاصطناعي ولا الدفع ولا البريد — لا قراءةً ولا كتابة.
 *
 *   وهذا أقوى من قائمة منعٍ: ما لم يُسمَح به صراحةً في `DEMO_PASSTHROUGH` يُرفض. فمسارٌ
 *   يُضاف إلى الخادم غدًا يكون مغلقًا على الصندوق تلقائيًا، لا مفتوحًا بالنسيان.
 *
 * ما الذي يُسمح بمروره؟ قراءاتٌ (GET/HEAD) لا تمسّ بيانات جهة ولا مستخدم: الصحة والإصدار
 * والوقت، وأصول المصحف المعتمدة العامة. ولا شيء غيرها.
 *
 * النقل: المعرّف في ترويسة `x-mizan-demo` لا في كعكة — Firebase Hosting يحذف كل كعكةٍ
 * سوى `__session` قبل Cloud Run. الصيغة `demo_` + 64 ست عشري، يتحقق منها الطرفان.
 *
 * الحدود: مهلة (TTL)، سقفٌ لعدد الصناديق الحيّة، وحدّ إنشاءٍ لكل IP، وسقفٌ لطلبات الصندوق
 * الواحد. ومفتاح الإطفاء: `MIZAN_DEMO_ENABLED=false` ⇒ 404 على الدخول و403 على أي معرّفٍ
 * قائم. الافتراضي مفعّل (كميراس)، فالدخول لا يحتاج إعدادًا.
 *
 * ولا صلة لهذا بمفتاح زرع البيانات التجريبية في الإنتاج: ذاك زرعُ بيانات تجريبية في المخزن الحقيقي ويظلّ
 * محجوبًا في الإنتاج (`production-config-guard.ts`). الصندوق هنا لا يزرع شيئًا في أي مخزن.
 */
import { randomBytes } from 'node:crypto';
import type { NextFunction, Request, RequestHandler, Response } from 'express';

export const DEMO_HEADER = 'x-mizan-demo';
export const DEMO_ID_PATTERN = /^demo_[0-9a-f]{64}$/;

export const DEMO_TTL_MS = Number(process.env.MIZAN_DEMO_TTL_MS) > 0 ? Number(process.env.MIZAN_DEMO_TTL_MS) : 60 * 60_000;
export const DEMO_MAX_SANDBOXES = Number(process.env.MIZAN_DEMO_MAX_SANDBOXES) > 0 ? Number(process.env.MIZAN_DEMO_MAX_SANDBOXES) : 500;
export const DEMO_ENTER_PER_IP_PER_MIN = Number(process.env.MIZAN_DEMO_ENTER_PER_IP_PER_MIN) > 0 ? Number(process.env.MIZAN_DEMO_ENTER_PER_IP_PER_MIN) : 20;
export const DEMO_MAX_REQUESTS_PER_SANDBOX = Number(process.env.MIZAN_DEMO_MAX_REQUESTS) > 0 ? Number(process.env.MIZAN_DEMO_MAX_REQUESTS) : 5000;

/** مفتاح الإطفاء: مفعّل افتراضيًا، ويُعطَّل بـ`MIZAN_DEMO_ENABLED=false` وحده. */
export const demoEnabled = (env: Record<string, string | undefined> = process.env): boolean => env.MIZAN_DEMO_ENABLED !== 'false';

/*
 * قراءاتٌ فقط، بلا بيانات جهة ولا مستخدم. كل ما عداها مرفوضٌ على الصندوق.
 * (مسارات `/api/public/competitions` و`/api/public/brand` وأمثالها تقرأ بيانات جهاتٍ حقيقية
 * فهي خارج القائمة عمدًا؛ والعميل التجريبي لا يطلبها أصلًا.)
 */
const DEMO_PASSTHROUGH: RegExp[] = [
  /^\/api\/health$/,
  /^\/api\/version$/,
  /^\/api\/time$/,
  /^\/api\/capabilities$/,
  /^\/api\/public\/kfgqpc\//,
  /^\/api\/public\/quran-audio\/\d{6}\.mp3$/,
];

export function isDemoPassthrough(method: string, path: string): boolean {
  if (method !== 'GET' && method !== 'HEAD') return false;
  return DEMO_PASSTHROUGH.some((re) => re.test(path));
}

interface Sandbox { createdAt: number; expiresAt: number; requests: number }

export class DemoSandboxRegistry {
  private readonly boxes = new Map<string, Sandbox>();
  private readonly enterHits = new Map<string, { windowStart: number; count: number }>();

  constructor(
    private readonly opts = { ttlMs: DEMO_TTL_MS, maxSandboxes: DEMO_MAX_SANDBOXES, enterPerIpPerMin: DEMO_ENTER_PER_IP_PER_MIN, maxRequests: DEMO_MAX_REQUESTS_PER_SANDBOX },
    private readonly now: () => number = Date.now,
  ) {}

  private sweep(): void {
    const t = this.now();
    for (const [id, box] of this.boxes) if (box.expiresAt <= t) this.boxes.delete(id);
    for (const [ip, hit] of this.enterHits) if (t - hit.windowStart > 60_000) this.enterHits.delete(ip);
  }

  get size(): number { this.sweep(); return this.boxes.size; }

  /** يُنشئ صندوقًا، أو يردّ بسبب الرفض. */
  create(ip: string): { ok: true; id: string; ttlMs: number } | { ok: false; reason: 'RATE_LIMITED' | 'CAPACITY' } {
    this.sweep();
    const t = this.now();
    const hit = this.enterHits.get(ip);
    if (hit && t - hit.windowStart <= 60_000) {
      if (hit.count >= this.opts.enterPerIpPerMin) return { ok: false, reason: 'RATE_LIMITED' };
      hit.count += 1;
    } else this.enterHits.set(ip, { windowStart: t, count: 1 });
    if (this.boxes.size >= this.opts.maxSandboxes) return { ok: false, reason: 'CAPACITY' };
    const id = `demo_${randomBytes(32).toString('hex')}`;
    this.boxes.set(id, { createdAt: t, expiresAt: t + this.opts.ttlMs, requests: 0 });
    return { ok: true, id, ttlMs: this.opts.ttlMs };
  }

  /** صندوقٌ حيّ؟ ويحسب الطلب على سقفه. */
  touch(id: string): 'OK' | 'UNKNOWN' | 'BUDGET' {
    this.sweep();
    const box = this.boxes.get(id);
    if (!box) return 'UNKNOWN';
    box.requests += 1;
    return box.requests > this.opts.maxRequests ? 'BUDGET' : 'OK';
  }

  /** يمدّ المهلة ويصفّر العدّاد. لا حالةَ خادمية أخرى للصندوق لتُمحى. */
  reset(id: string): boolean {
    this.sweep();
    const box = this.boxes.get(id);
    if (!box) return false;
    box.expiresAt = this.now() + this.opts.ttlMs;
    box.requests = 0;
    return true;
  }

  destroy(id: string): void { this.boxes.delete(id); }
}

export function readDemoId(req: Pick<Request, 'headers'>): string {
  const raw = req.headers[DEMO_HEADER];
  const value = String(Array.isArray(raw) ? raw[0] : raw || '').trim();
  return DEMO_ID_PATTERN.test(value) ? value : '';
}

const hasDemoHeader = (req: Pick<Request, 'headers'>): boolean => req.headers[DEMO_HEADER] !== undefined;

/*
 * الجدار. يُركَّب أول ما يُركَّب على `/api`، قبل قارئ JSON والمحدِّد العام وكل مسار.
 *
 * - بلا ترويسة: يمرّ الطلب كما كان تمامًا (لا أثر على أي مستخدم حقيقي).
 * - ترويسةٌ مشوّهة أو صندوقٌ منتهٍ أو مفتاحٌ مُطفأ: يُرفض ولا يسقط إلى المخزن الحقيقي.
 * - ترويسةٌ صالحة: مسارات التمرير فقط، وكل ما سواها 403 `DEMO_SANDBOX_ISOLATED`.
 */
export function createDemoGate(registry: DemoSandboxRegistry, isEnabled: () => boolean = demoEnabled): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!hasDemoHeader(req)) return next();
    /* مسارات الصندوق نفسها (دخول/إعادة ضبط) تُعالَج في معالجاتها لا هنا. */
    if (req.path === '/demo/enter' || req.path === '/demo/reset' || req.path === '/demo/config') return next();
    const id = readDemoId(req);
    if (!id || !isEnabled()) return void res.status(403).json({ code: 'DEMO_SANDBOX_REJECTED' });
    const state = registry.touch(id);
    if (state === 'UNKNOWN') return void res.status(410).json({ code: 'DEMO_SANDBOX_EXPIRED' });
    if (state === 'BUDGET') return void res.status(429).json({ code: 'DEMO_SANDBOX_BUDGET' });
    if (isDemoPassthrough(req.method, `/api${req.path}`)) return next();
    return void res.status(403).json({ code: 'DEMO_SANDBOX_ISOLATED' });
  };
}

/** معالجات `/api/demo/*`. تُركَّب بعد الجدار وقبل أي مسار. */
export function createDemoRoutes(registry: DemoSandboxRegistry, isEnabled: () => boolean = demoEnabled) {
  const enter: RequestHandler = (req, res) => {
    if (!isEnabled()) return void res.status(404).json({ code: 'DEMO_DISABLED' });
    const out = registry.create(String(req.ip || 'unknown'));
    if (!out.ok) {
      return void res.status(out.reason === 'RATE_LIMITED' ? 429 : 503).json({ code: out.reason === 'RATE_LIMITED' ? 'DEMO_RATE_LIMITED' : 'DEMO_CAPACITY' });
    }
    res.setHeader('Cache-Control', 'no-store');
    res.json({ ok: true, demo: true, sessionId: out.id, ttlMs: out.ttlMs });
  };
  const reset: RequestHandler = (req, res) => {
    if (!isEnabled()) return void res.status(404).json({ code: 'DEMO_DISABLED' });
    const id = readDemoId(req);
    if (!id || !registry.reset(id)) return void res.status(410).json({ code: 'DEMO_SANDBOX_EXPIRED' });
    res.json({ ok: true });
  };
  const config: RequestHandler = (req, res) => {
    const id = readDemoId(req);
    res.setHeader('Cache-Control', 'no-store');
    res.json({ enabled: isEnabled(), active: !!id && isEnabled() && registry.touch(id) !== 'UNKNOWN', ttlMs: DEMO_TTL_MS });
  };
  return { enter, reset, config };
}

/** صفحة الرابط المباشر: تُنشئ الصندوق من المتصفح ثم تدخل التطبيق. السكربت خارجي (CSP: script-src 'self'). */
export const DEMO_LANDING_HTML = `<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>النسخة التجريبية — ميزان</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#F8F5ED;color:#17352D;font-family:system-ui,'Noto Naskh Arabic',sans-serif;text-align:center;padding:24px}p{font-size:18px;line-height:1.9}a{color:#6b5314;font-weight:700}</style></head>
<body><main><h1>ميزان</h1><p id="m">جارٍ تجهيز النسخة التجريبية المعزولة…</p><noscript><p>تحتاج النسخة التجريبية إلى تفعيل جافاسكربت.</p></noscript></main>
<script src="/demo-entry.js"></script></body></html>`;
