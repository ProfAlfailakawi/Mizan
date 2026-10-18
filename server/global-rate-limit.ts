import crypto from 'node:crypto';

/*
 * المحدّد العام للطلبات: يُحسب لكل مستخدم موثَّق لا لكل عنوان IP.
 *
 * القاعة التي فيها مئات الأجهزة على شبكة Wi-Fi واحدة تظهر للخادم بعنوان واحد، فكان حدّ العنوان (600 في الدقيقة)
 * يحجب الجميع معًا. الآن يُفتاح الطلب الموثَّق بهوية صاحبه (uid من رمز تحقّقنا من توقيعه)، ويبقى حدّ العنوان
 * للزوار المجهولين فقط. ورمزٌ مزوَّر أو منتهٍ لا يمنح مفتاحًا مستقلًا: يسقط إلى حدّ العنوان، فلا يُتحايل على الحماية
 * بتدوير رموز وهمية.
 */
export interface GlobalRateLimitOptions {
  windowMs: number;
  /** حدّ الزائر المجهول لكل عنوان IP (RATE_LIMIT_MAX). */
  anonymousMax: number;
  /** حدّ المستخدم الموثَّق لكل هوية (RATE_LIMIT_MAX_AUTHENTICATED). */
  authenticatedMax: number;
  /** يتحقق من الرمز ويعيد uid، أو يرمي إن كان غير صالح. */
  verify?: (token: string) => Promise<{ uid: string; exp?: number }>;
  now?: () => number;
}
export interface RateDecision { allowed: boolean; key: string; limit: number; remaining: number; resetAt: number; scope: 'user' | 'ip' }

const bearerOf = (header: unknown): string => {
  const m = /^Bearer\s+([A-Za-z0-9._-]{20,4096})$/.exec(String(header || ''));
  return m ? m[1] : '';
};

export class GlobalRateLimiter {
  private buckets = new Map<string, { count: number; resetAt: number }>();
  private verified = new Map<string, { uid: string; until: number }>();
  private lastSweep = 0;
  constructor(private readonly o: GlobalRateLimitOptions) {}
  private now() { return (this.o.now || Date.now)(); }

  async keyFor(authorization: unknown, ip: string): Promise<{ key: string; limit: number; scope: 'user' | 'ip' }> {
    const token = bearerOf(authorization);
    if (token && this.o.verify) {
      const digest = crypto.createHash('sha256').update(token).digest('hex');
      const now = this.now();
      const hit = this.verified.get(digest);
      if (hit && hit.until > now) return { key: `u:${hit.uid}`, limit: this.o.authenticatedMax, scope: 'user' };
      try {
        const id = await this.o.verify(token);
        if (id.uid) {
          const until = Math.min(now + 5 * 60_000, id.exp ? id.exp * 1000 : now + 5 * 60_000);
          if (this.verified.size > 20_000) this.verified.clear();
          this.verified.set(digest, { uid: id.uid, until });
          return { key: `u:${id.uid}`, limit: this.o.authenticatedMax, scope: 'user' };
        }
      } catch { /* غير صالح: يسقط إلى حدّ العنوان */ }
    }
    return { key: `ip:${ip || 'unknown'}`, limit: this.o.anonymousMax, scope: 'ip' };
  }

  async check(authorization: unknown, ip: string): Promise<RateDecision> {
    const { key, limit, scope } = await this.keyFor(authorization, ip);
    const now = this.now();
    if (now - this.lastSweep > this.o.windowMs) {
      for (const [k, v] of this.buckets) if (v.resetAt < now) this.buckets.delete(k);
      this.lastSweep = now;
    }
    let b = this.buckets.get(key);
    if (!b || b.resetAt < now) { b = { count: 0, resetAt: now + this.o.windowMs }; this.buckets.set(key, b); }
    b.count++;
    return { allowed: b.count <= limit, key, limit, remaining: Math.max(0, limit - b.count), resetAt: b.resetAt, scope };
  }
}
