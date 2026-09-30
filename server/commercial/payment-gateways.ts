/*
 * بوابات الدفع الخاصة بكل جهة أو مشغّل — لتحصيل رسوم التسجيل من المتسابقين.
 *
 * ميزان لا يختار البوابة: جهةٌ تستخدم ماي فاتورة، وأخرى تاب، ومشغّلٌ يعدّ بوابته فتسري على
 * جهاته. والمال يذهب إلى حساب الجهة أو المشغّل مباشرة، لا إلى ميزان.
 *
 * القواعد:
 *  - البوابة المعتمدة لجهة: بوابتها النشطة، وإلا بوابة مشغّلها النشطة، وإلا لا شيء (تحصيل يدوي).
 *  - الأسرار في الخزنة المشفرة، ولا تُعاد إلى المتصفح أبدًا.
 *  - لا تُفعَّل بوابة إلا بعد اختبارٍ ناجح بمفاتيح الجهة (checkout + استعلام حالة).
 *  - كل عملية دفع «نيّة» مسجّلة بمبلغها وعملتها؛ والتسوية تشترط تطابقهما، ومرةً واحدة فقط.
 */

import { CommercialError, type CommercialState, type EngineCtx } from './engine';

export type GatewayOwnerType = 'operator' | 'organization';
export type GatewayStatus = 'pending_test' | 'active' | 'disabled';

export interface PaymentGatewayConfigRecord {
  id: string;
  ownerType: GatewayOwnerType;
  ownerId: string;
  /** اسم قصير للبوابة (myfatoorah، tap، stripe…) — وصفي، لا يغيّر السلوك. */
  provider: string;
  presetId?: string;
  displayName: string;
  /** ملف البوابة (PaymentProviderProfile) بلا أسرار. */
  profile: Record<string, unknown>;
  secretRef: string;
  status: GatewayStatus;
  lastTest?: { at: string; ok: boolean; code?: string };
  verifiedAt?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export type IntentStatus = 'created' | 'paid' | 'failed' | 'expired';

export interface RegistrationPaymentIntentRecord {
  id: string;
  gatewayConfigId: string;
  provider: string;
  organizationId: string;
  competitionId: string;
  participantId: string;
  /** مسار وثيقة المتسابق في Firestore — يُشتقّ على الخادم لا من المتصفح. */
  participantPath: string;
  amountMinor: number;
  currency: string;
  externalRef: string;
  status: IntentStatus;
  purpose: 'registration_fee' | 'gateway_test';
  paidAmountMinor?: number;
  settledAt?: string;
  /** وقت كتابة «مدفوع» في وثيقة المتسابق؛ غيابه مع paid يعني أن الكتابة لم تتم بعد فتُعاد. */
  recordedAt?: string;
  lastCheckedAt?: string;
  failureCode?: string;
  createdAt: string;
}

export interface GatewayCollections {
  paymentGateways?: PaymentGatewayConfigRecord[];
  registrationPaymentIntents?: RegistrationPaymentIntentRecord[];
}

type State = CommercialState & GatewayCollections;
const iso = (ms: number) => new Date(ms).toISOString();
const clean = (v: unknown, max = 200) => String(v ?? '').trim().slice(0, max);
const gateways = (s: State) => (s.paymentGateways ||= []);
const intents = (s: State) => (s.registrationPaymentIntents ||= []);

export const INTENT_RECONCILE_WINDOW_MS = 3 * 86_400_000;

/** صلاحية إدارة بوابة مالكٍ ما. الجهة: مدير الجهة أو مسؤول فوترتها أو مشغّلها. المشغّل: مالكه. */
export function assertGatewayManager(s: State, actor: EngineCtx['actor'], ownerType: GatewayOwnerType, ownerId: string) {
  if (actor.role === 'super_admin') return;
  if (ownerType === 'operator') {
    if (actor.role === 'operator_owner' && actor.operatorId === ownerId) return;
    throw new CommercialError('OPERATOR_OWNER_REQUIRED');
  }
  const org = s.organizations.find(o => o.id === ownerId);
  if (!org) throw new CommercialError('ORGANIZATION_NOT_FOUND');
  if ((actor.role === 'operator_owner' || actor.role === 'operator_admin') && actor.operatorId && org.operatorId === actor.operatorId) return;
  if (actor.organizationId !== ownerId) throw new CommercialError('CROSS_TENANT_ACCESS_BLOCKED');
  if (!['org_admin', 'billing_admin'].includes(actor.role)) throw new CommercialError('ORG_BILLING_ADMIN_REQUIRED');
}

export function assertOwnerExists(s: State, ownerType: GatewayOwnerType, ownerId: string) {
  const ok = ownerType === 'operator' ? s.operators.some(o => o.id === ownerId) : s.organizations.some(o => o.id === ownerId);
  if (!ok) throw new CommercialError(ownerType === 'operator' ? 'OPERATOR_NOT_FOUND' : 'ORGANIZATION_NOT_FOUND');
}

export const redactGateway = (g: PaymentGatewayConfigRecord) => ({ ...g, secretRef: 'stored_securely' });

/**
 * يحفظ بوابةً جديدة بحالة «بانتظار الاختبار». البوابة النشطة السابقة لنفس المالك تبقى
 * نشطة حتى تجتاز الجديدة اختبارها، فلا ينقطع التحصيل أثناء التبديل.
 */
export function saveGatewayConfig(ctx: EngineCtx, input: { ownerType: GatewayOwnerType; ownerId: string; provider: string; presetId?: string; displayName?: string; profile: Record<string, unknown>; secretRef: string }) {
  const s = ctx.s as State;
  assertOwnerExists(s, input.ownerType, input.ownerId);
  assertGatewayManager(s, ctx.actor, input.ownerType, input.ownerId);
  const t = iso(ctx.at);
  /* بوابة سابقة لم تُختبر بعد تُستبدل؛ لا نترك مسوداتٍ متراكمة. */
  for (const g of gateways(s)) if (g.ownerType === input.ownerType && g.ownerId === input.ownerId && g.status === 'pending_test') { g.status = 'disabled'; g.updatedAt = t; }
  const row: PaymentGatewayConfigRecord = {
    id: ctx.nextId('PGW'), ownerType: input.ownerType, ownerId: input.ownerId,
    provider: clean(input.provider, 40).toLowerCase().replace(/[^a-z0-9_-]/g, '') || 'gateway',
    presetId: clean(input.presetId, 60) || undefined,
    displayName: clean(input.displayName || input.provider, 80),
    profile: input.profile, secretRef: input.secretRef, status: 'pending_test',
    createdAt: t, updatedAt: t, createdBy: ctx.actor.uid,
  };
  gateways(s).push(row);
  ctx.audit({ organizationId: input.ownerType === 'organization' ? input.ownerId : undefined, action: 'PAYMENT_GATEWAY_SAVED', entityType: 'payment_gateway', entityId: row.id, reason: row.provider });
  return row;
}

/** نتيجة الاختبار. النجاح يفعّل البوابة ويعطّل سابقتها لنفس المالك. */
export function recordGatewayTest(ctx: EngineCtx, gatewayId: string, outcome: { ok: boolean; code?: string }) {
  const s = ctx.s as State;
  const g = gateways(s).find(x => x.id === gatewayId);
  if (!g) throw new CommercialError('PAYMENT_GATEWAY_NOT_FOUND');
  assertGatewayManager(s, ctx.actor, g.ownerType, g.ownerId);
  if (g.status === 'disabled') throw new CommercialError('PAYMENT_GATEWAY_DISABLED');
  const t = iso(ctx.at);
  g.lastTest = { at: t, ok: outcome.ok, code: outcome.code };
  g.updatedAt = t;
  if (outcome.ok) {
    for (const other of gateways(s)) if (other.id !== g.id && other.ownerType === g.ownerType && other.ownerId === g.ownerId && other.status === 'active') { other.status = 'disabled'; other.updatedAt = t; }
    g.status = 'active';
    g.verifiedAt = t;
  }
  ctx.audit({ organizationId: g.ownerType === 'organization' ? g.ownerId : undefined, action: outcome.ok ? 'PAYMENT_GATEWAY_VERIFIED' : 'PAYMENT_GATEWAY_TEST_FAILED', entityType: 'payment_gateway', entityId: g.id, reason: outcome.code });
  return g;
}

export function disableGateway(ctx: EngineCtx, gatewayId: string) {
  const s = ctx.s as State;
  const g = gateways(s).find(x => x.id === gatewayId);
  if (!g) throw new CommercialError('PAYMENT_GATEWAY_NOT_FOUND');
  assertGatewayManager(s, ctx.actor, g.ownerType, g.ownerId);
  g.status = 'disabled';
  g.updatedAt = iso(ctx.at);
  ctx.audit({ organizationId: g.ownerType === 'organization' ? g.ownerId : undefined, action: 'PAYMENT_GATEWAY_DISABLED', entityType: 'payment_gateway', entityId: g.id });
  return g;
}

export function listGateways(s: State, ownerType: GatewayOwnerType, ownerId: string) {
  return gateways(s).filter(g => g.ownerType === ownerType && g.ownerId === ownerId).slice().reverse().map(redactGateway);
}

/** البوابة التي تُحصّل بها هذه الجهة الآن: بوابتها، ثم بوابة مشغّلها. */
export function effectiveGateway(s: State, organizationId: string): PaymentGatewayConfigRecord | null {
  const org = s.organizations.find(o => o.id === organizationId);
  if (!org || org.status === 'archived' || org.status === 'suspended') return null;
  const own = gateways(s).find(g => g.ownerType === 'organization' && g.ownerId === organizationId && g.status === 'active');
  if (own) return own;
  if (org.operatorId) {
    const op = s.operators.find(o => o.id === org.operatorId);
    if (op && op.status === 'active') return gateways(s).find(g => g.ownerType === 'operator' && g.ownerId === op.id && g.status === 'active') || null;
  }
  return null;
}

export function recordIntent(ctx: EngineCtx, input: Omit<RegistrationPaymentIntentRecord, 'id' | 'status' | 'createdAt'>) {
  const s = ctx.s as State;
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) throw new CommercialError('AMOUNT_MINOR_MUST_BE_POSITIVE_INTEGER');
  if (intents(s).some(i => i.gatewayConfigId === input.gatewayConfigId && i.externalRef === input.externalRef)) throw new CommercialError('PAYMENT_REFERENCE_DUPLICATE');
  const row: RegistrationPaymentIntentRecord = { ...input, currency: input.currency.toUpperCase(), id: ctx.nextId('RPI'), status: 'created', createdAt: iso(ctx.at) };
  intents(s).push(row);
  ctx.audit({ organizationId: input.organizationId, action: 'REGISTRATION_PAYMENT_STARTED', entityType: 'registration_payment_intent', entityId: row.id });
  return row;
}

/** أحدث نيّة مفتوحة أو مدفوعة لهذا المتسابق — لإعادة استخدام صفحة دفعٍ لم تكتمل بدل إنشاء أخرى. */
export function latestIntentFor(s: State, participantPath: string) {
  return intents(s).filter(i => i.participantPath === participantPath && i.purpose === 'registration_fee').at(-1);
}

export function intentByReference(s: State, gatewayConfigId: string, externalRef: string) {
  return intents(s).find(i => i.gatewayConfigId === gatewayConfigId && i.externalRef === externalRef);
}

export interface SettlementInput { status: 'paid' | 'failed' | 'pending'; amountMinor?: number; currency?: string }

/**
 * تطبيق نتيجة البوابة على النيّة. مبلغٌ أو عملةٌ لا تطابق ما طُلب لا تُعدّ سدادًا أبدًا،
 * بل تُعلَّم للمراجعة. والتكرار آمن: نيّةٌ مدفوعة لا تتغيّر.
 */
export function applySettlement(ctx: EngineCtx, intentId: string, result: SettlementInput) {
  const s = ctx.s as State;
  const i = intents(s).find(x => x.id === intentId);
  if (!i) throw new CommercialError('PAYMENT_INTENT_NOT_FOUND');
  const t = iso(ctx.at);
  i.lastCheckedAt = t;
  if (i.status === 'paid') return { intent: i, changed: false };
  if (result.status === 'paid') {
    /* «مدفوع» بلا مبلغ أو عملة مقروءين لا يُثبت شيئًا: ملفٌّ ناقص أو ردٌّ مشوّه لا يُسجّل سدادًا. */
    if (result.amountMinor === undefined || !result.currency) { i.failureCode = 'SETTLEMENT_UNVERIFIABLE'; ctx.audit({ organizationId: i.organizationId, action: 'REGISTRATION_PAYMENT_MISMATCH', entityType: 'registration_payment_intent', entityId: i.id, reason: 'unverifiable' }); return { intent: i, changed: false }; }
    if (result.amountMinor !== undefined && result.amountMinor !== i.amountMinor) { i.failureCode = 'AMOUNT_MISMATCH'; ctx.audit({ organizationId: i.organizationId, action: 'REGISTRATION_PAYMENT_MISMATCH', entityType: 'registration_payment_intent', entityId: i.id, reason: 'amount' }); return { intent: i, changed: false }; }
    if (result.currency && result.currency.toUpperCase() !== i.currency) { i.failureCode = 'CURRENCY_MISMATCH'; ctx.audit({ organizationId: i.organizationId, action: 'REGISTRATION_PAYMENT_MISMATCH', entityType: 'registration_payment_intent', entityId: i.id, reason: 'currency' }); return { intent: i, changed: false }; }
    i.status = 'paid';
    i.paidAmountMinor = result.amountMinor ?? i.amountMinor;
    i.settledAt = t;
    i.failureCode = undefined;
    ctx.audit({ organizationId: i.organizationId, action: 'REGISTRATION_PAYMENT_SETTLED', entityType: 'registration_payment_intent', entityId: i.id });
    return { intent: i, changed: true };
  }
  if (result.status === 'failed' && i.status === 'created') { i.status = 'failed'; return { intent: i, changed: true }; }
  if (i.status === 'created' && ctx.at - Date.parse(i.createdAt) > INTENT_RECONCILE_WINDOW_MS) { i.status = 'expired'; return { intent: i, changed: true }; }
  return { intent: i, changed: false };
}

export function markIntentRecorded(ctx: EngineCtx, intentId: string) {
  const i = intents(ctx.s as State).find(x => x.id === intentId);
  if (i && !i.recordedAt) i.recordedAt = iso(ctx.at);
  return i;
}

/** نيّاتٌ تحتاج مراجعة: مفتوحة حديثة، أو مدفوعة لم تُكتب في وثيقة المتسابق بعد. */
export function intentsToReconcile(s: State, at: number, limit = 50) {
  return intents(s).filter(i => (i.status === 'created' && at - Date.parse(i.createdAt) <= INTENT_RECONCILE_WINDOW_MS + 86_400_000) || (i.status === 'paid' && !i.recordedAt && i.purpose === 'registration_fee')).slice(0, limit);
}

export function intentsForOrganization(s: State, organizationId: string, competitionId?: string) {
  return intents(s).filter(i => i.organizationId === organizationId && (!competitionId || i.competitionId === competitionId) && i.purpose === 'registration_fee').slice(-500).reverse();
}
