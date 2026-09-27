/*
 * ترحيل الطبقة التجارية إلى المخطط 2 — إضافيٌّ فقط، لا يحذف ولا يعيد كتابة صفٍّ قائم.
 *
 * ١) كل ترخيصٍ بلا دورة يحصل على دورته الأولى من تاريخي ترخيصه نفسه.
 * ٢) كل صفّ استعمالٍ قديم يحمل `year` يُربط بالدورة التي تحوي تاريخ إنشائه؛ وما لا يقع في
 *    دورةٍ حقيقية يُربط بدورةٍ «موروثة» معلَّمة صراحةً (legacy) بسنته الميلادية الأصلية، ولا
 *    تُعدّ هذه الدورة أبدًا دورةً حالية.
 * ٣) رصيد «الوحدات» القديم (1 وحدة = 1 جهة) لا يُحوَّل إلى مال: يُدرج في التقرير لمراجعة
 *    مسؤول المنصّة، ويبقى سجلُّه كما هو.
 * ٤) يُتحقَّق من أن عدد الصفوف قبل الترحيل يساوي عددها بعده، وإلا يُرفض الترحيل كلّه.
 */

import type { CommercialMigrationReport } from './types';
import { DEFAULT_CATALOG_CURRENCY, DEFAULT_CATALOG_PLANS, DEFAULT_OPERATOR_TIERS, DEFAULT_POLICY } from './catalog-seed';
import { CommercialError, effectiveAllowance, planPriceAt, termsOf, type CommercialState, type EngineCtx } from './engine';
import { containsInstant } from './term-calendar';

export const COMMERCIAL_SCHEMA_VERSION = 2;

const iso = (ms: number) => new Date(ms).toISOString();

export function ensureCommercialCollections(s: Partial<CommercialState>) {
  for (const key of ['planVersions', 'subscriptionTerms', 'operatorTiers', 'operatorAgreements', 'operatorWallets', 'walletLedger', 'idempotency',
    'resalePrices', 'ownershipEvents', 'migrationReports', 'brandProfiles', 'customDomains', 'discoverListings', 'webhookEndpoints', 'webhookDeliveries'] as const) {
    if (!Array.isArray(s[key])) (s as Record<string, unknown>)[key] = [];
  }
}

/** Additive catalog seed: creates missing slugs only. Never edits a plan the admin configured. */
export function seedCatalog(ctx: EngineCtx) {
  const seeded: string[] = [];
  const t = iso(ctx.at);
  for (const seed of DEFAULT_CATALOG_PLANS) {
    if (ctx.s.plans.some(p => p.slug === seed.slug)) continue;
    const planId = ctx.nextId('PLAN');
    ctx.s.plans.push({
      id: planId, slug: seed.slug, name: seed.name, nameArabic: seed.nameArabic, catalog: 'mizan', custom: seed.custom, displayOrder: seed.displayOrder,
      currency: DEFAULT_CATALOG_CURRENCY, priceMinor: seed.publicPriceMinor, billingPeriod: seed.custom ? 'custom' : 'annual', active: true,
      limits: { licensedOrganizations: 1, activeCompetitions: seed.activeCompetitionAllowance, annualParticipants: seed.participantAllowance, storageBytes: seed.storageBytes, branches: seed.branches },
      /* لا تقييد خصائص بين الباقات: كل الخصائص الأساسية ضمن كل باقة. */
      features: { all_core_features: true, external_storage: true, white_label: true, video: true },
      createdAt: t, updatedAt: t,
    });
    ctx.s.planVersions.push({
      id: ctx.nextId('PV'), planId, version: 1, currency: DEFAULT_CATALOG_CURRENCY, publicPriceMinor: seed.publicPriceMinor,
      participantAllowance: seed.participantAllowance, activeCompetitionAllowance: seed.activeCompetitionAllowance,
      effectiveFrom: '2026-01-01T00:00:00.000Z', createdAt: t, createdBy: ctx.actor.uid, note: 'Initial MIZAN global catalog',
    });
    seeded.push(seed.slug);
  }
  return seeded;
}

export function seedOperatorTiers(ctx: EngineCtx) {
  const seeded: string[] = [];
  const t = iso(ctx.at);
  for (const seed of DEFAULT_OPERATOR_TIERS) {
    if (ctx.s.operatorTiers.some(x => x.slug === seed.slug)) continue;
    ctx.s.operatorTiers.push({ ...seed, id: ctx.nextId('TIER'), createdAt: t, updatedAt: t });
    seeded.push(seed.slug);
  }
  return seeded;
}

export function migrateCommercialSchema(ctx: EngineCtx): CommercialMigrationReport | null {
  const s = ctx.s;
  ensureCommercialCollections(s);
  if ((s.commercialSchemaVersion || 1) >= COMMERCIAL_SCHEMA_VERSION) return null;
  const notes: string[] = [];
  const usageBefore = s.participantUsage.length;
  const snapshot = new Map(s.participantUsage.map(r => [r.id, { createdAt: r.createdAt, year: r.year, participantId: r.participantId }]));

  if (!s.commercialPolicy) s.commercialPolicy = { ...DEFAULT_POLICY, updatedAt: iso(ctx.at), updatedBy: ctx.actor.uid };
  for (const p of s.plans) if (!p.catalog) p.catalog = p.ownerOperatorId ? 'operator' : 'legacy';
  const catalogPlansSeeded = seedCatalog(ctx);
  const operatorTiersSeeded = seedOperatorTiers(ctx);
  for (const o of s.organizations) if (!o.commercialOwner) o.commercialOwner = o.operatorId ? 'operator' : 'direct';

  /* ١) دورةٌ أولى لكل ترخيص من تاريخيه. */
  let termsCreatedFromLicenses = 0;
  for (const license of s.licenses) {
    if (s.subscriptionTerms.some(t => t.organizationId === license.organizationId && !t.legacy)) continue;
    const org = s.organizations.find(o => o.id === license.organizationId);
    if (!org || !s.plans.some(p => p.id === license.planId)) { notes.push(`licence ${license.id}: organization or plan missing — no term created`); continue; }
    if (!(Date.parse(license.expiresAt) > Date.parse(license.startsAt))) { notes.push(`licence ${license.id}: invalid dates — no term created`); continue; }
    const price = planPriceAt(s, license.planId, Date.parse(license.startsAt));
    const allowance = effectiveAllowance(price, license);
    const sub = s.subscriptions.find(x => x.subjectType === 'organization' && x.subjectId === org.id && x.status !== 'canceled');
    s.subscriptionTerms.push({
      id: ctx.nextId('TERM'), tenantId: org.tenantId, organizationId: org.id, subscriptionId: sub?.id, licenseId: license.id, planId: license.planId,
      planVersionId: price.planVersionId, termIndex: 1, anchorAt: license.expiresAt, startsAt: license.startsAt, endsAt: license.expiresAt, status: Date.parse(license.expiresAt) <= ctx.at ? 'closed' : 'active',
      source: 'migration', participantAllowance: allowance.participantAllowance, activeCompetitionAllowance: allowance.activeCompetitionAllowance,
      usageMetric: 'unique_participant', currency: price.currency, publicPriceMinor: sub?.amountMinor ?? price.publicPriceMinor,
      operatorId: org.operatorId, changes: [], createdAt: iso(ctx.at), createdBy: ctx.actor.uid,
    });
    termsCreatedFromLicenses++;
  }

  /* ٢) ربط الاستعمال القديم بدوراته. */
  let usageRowsLinked = 0, usageRowsLinkedToLegacyTerms = 0, legacyTermsCreated = 0;
  for (const row of s.participantUsage) {
    if (row.subscriptionTermId) continue;
    const at = Date.parse(row.createdAt);
    const real = Number.isFinite(at) ? termsOf(s, row.organizationId).find(t => containsInstant(t, at)) : undefined;
    if (real) { row.subscriptionTermId = real.id; row.usageKey = row.usageKey || row.participantId; usageRowsLinked++; continue; }
    const year = Number.isInteger(row.year) ? row.year : new Date(Number.isFinite(at) ? at : ctx.at).getUTCFullYear();
    let legacy = s.subscriptionTerms.find(t => t.legacy && t.organizationId === row.organizationId && t.legacyYear === year);
    if (!legacy) {
      const org = s.organizations.find(o => o.id === row.organizationId);
      const license = s.licenses.find(l => l.organizationId === row.organizationId);
      const planId = license?.planId || '';
      const price = planId && s.plans.some(p => p.id === planId) ? planPriceAt(s, planId, Date.UTC(year, 0, 1)) : undefined;
      legacy = {
        id: ctx.nextId('TERM'), tenantId: org?.tenantId || row.tenantId, organizationId: row.organizationId, licenseId: license?.id || '', planId,
        termIndex: 0, anchorAt: iso(Date.UTC(year + 1, 0, 1)), startsAt: iso(Date.UTC(year, 0, 1)), endsAt: iso(Date.UTC(year + 1, 0, 1)), status: 'closed',
        source: 'legacy_usage', legacy: true, legacyYear: year, participantAllowance: price ? effectiveAllowance(price, license).participantAllowance : 0,
        activeCompetitionAllowance: price ? effectiveAllowance(price, license).activeCompetitionAllowance : 0, usageMetric: 'unique_participant',
        currency: price?.currency || DEFAULT_CATALOG_CURRENCY, publicPriceMinor: 0, changes: [], createdAt: iso(ctx.at), createdBy: ctx.actor.uid,
      };
      s.subscriptionTerms.push(legacy);
      legacyTermsCreated++;
    }
    row.subscriptionTermId = legacy.id;
    row.usageKey = row.usageKey || row.participantId;
    usageRowsLinkedToLegacyTerms++;
  }

  /* ٣) التحقق: لا صفّ مفقود، ولا تاريخ أو سنة تغيّرت. */
  if (s.participantUsage.length !== usageBefore) throw new CommercialError('MIGRATION_USAGE_COUNT_CHANGED');
  for (const row of s.participantUsage) {
    const before = snapshot.get(row.id);
    if (before && (before.createdAt !== row.createdAt || before.year !== row.year || before.participantId !== row.participantId)) throw new CommercialError('MIGRATION_USAGE_ROW_ALTERED');
  }
  const seen = new Set<string>();
  let duplicatesDetected = 0;
  for (const row of s.participantUsage) {
    const key = `${row.subscriptionTermId}|${row.usageKey || row.participantId}`;
    if (seen.has(key)) duplicatesDetected++; else seen.add(key);
  }
  if (duplicatesDetected) notes.push(`${duplicatesDetected} pre-existing duplicate usage row(s) kept as-is; unique counting ignores them`);

  const legacyCreditOperators = s.operators.map(o => ({
    operatorId: o.id, operatorName: o.name, legacyCreditBalance: s.creditLedger.filter(x => x.operatorId === o.id).reduce((n, x) => n + x.quantity, 0),
  })).filter(x => x.legacyCreditBalance !== 0);
  if (legacyCreditOperators.length) notes.push('Legacy licence credits are NOT converted to money. Review each operator and fund a wallet explicitly if appropriate.');

  const report: CommercialMigrationReport = {
    id: ctx.nextId('MIGR'), ranAt: iso(ctx.at), schemaVersion: COMMERCIAL_SCHEMA_VERSION, termsCreatedFromLicenses, legacyTermsCreated,
    usageRowsBefore: usageBefore, usageRowsAfter: s.participantUsage.length, usageRowsLinked, usageRowsLinkedToLegacyTerms, duplicatesDetected,
    catalogPlansSeeded, operatorTiersSeeded, legacyCreditOperators, notes,
  };
  s.migrationReports.push(report);
  s.commercialSchemaVersion = COMMERCIAL_SCHEMA_VERSION;
  ctx.audit({ action: 'COMMERCIAL_SCHEMA_MIGRATED', entityType: 'migration', entityId: report.id, reason: `terms ${termsCreatedFromLicenses}+${legacyTermsCreated} legacy, usage ${usageBefore}→${report.usageRowsAfter}` });
  return report;
}
