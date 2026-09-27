/*
 * بذور الكتالوج التجاري — قيمٌ ابتدائية تُكتب مرّةً واحدة في مخزن المنصّة إن لم تكن
 * موجودة، ثم يملكها مسؤول المنصّة ويعدّلها من لوحته. لا يقرأ منطقُ التسعير هذه الثوابتَ
 * أبدًا: يقرأ المخزن. وإعادة التشغيل لا تكتب فوق كتالوجٍ عدّله المسؤول (seed is additive).
 *
 * الأسعار بالسنت (USD)، والخصم بنقاط الأساس. حدود التخزين والفروع هنا سقوفُ أمانٍ
 * للبنية التحتية، لا خصائص تُباع.
 */

import type { OperatorTierRecord } from './types';

const GB = 1024 ** 3;

export interface CatalogPlanSeed {
  slug: string;
  name: string;
  nameArabic: string;
  publicPriceMinor: number;
  participantAllowance: number;
  activeCompetitionAllowance: number;
  storageBytes: number;
  branches: number;
  custom: boolean;
  displayOrder: number;
}

export const DEFAULT_CATALOG_CURRENCY = 'USD';

export const DEFAULT_CATALOG_PLANS: readonly CatalogPlanSeed[] = [
  { slug: 'mizan-150', name: 'MIZAN 150', nameArabic: 'ميزان 150', publicPriceMinor: 24_900, participantAllowance: 150, activeCompetitionAllowance: 1, storageBytes: 5 * GB, branches: 1, custom: false, displayOrder: 10 },
  { slug: 'mizan-500', name: 'MIZAN 500', nameArabic: 'ميزان 500', publicPriceMinor: 59_900, participantAllowance: 500, activeCompetitionAllowance: 2, storageBytes: 20 * GB, branches: 3, custom: false, displayOrder: 20 },
  { slug: 'mizan-2k', name: 'MIZAN 2K', nameArabic: 'ميزان 2K', publicPriceMinor: 149_000, participantAllowance: 2_000, activeCompetitionAllowance: 5, storageBytes: 50 * GB, branches: 10, custom: false, displayOrder: 30 },
  { slug: 'mizan-10k', name: 'MIZAN 10K', nameArabic: 'ميزان 10K', publicPriceMinor: 349_000, participantAllowance: 10_000, activeCompetitionAllowance: 10, storageBytes: 200 * GB, branches: 25, custom: false, displayOrder: 40 },
  { slug: 'mizan-50k', name: 'MIZAN 50K', nameArabic: 'ميزان 50K', publicPriceMinor: 790_000, participantAllowance: 50_000, activeCompetitionAllowance: 25, storageBytes: 1024 * GB, branches: 100, custom: false, displayOrder: 50 },
  /* الباقة الوطنية عقدٌ مخصّص: حدودها صريحة في العقد (override)، لا «كل شيء مفتوح». */
  { slug: 'mizan-national', name: 'MIZAN National', nameArabic: 'ميزان الوطنية', publicPriceMinor: 0, participantAllowance: 0, activeCompetitionAllowance: 0, storageBytes: 1024 * GB, branches: 100, custom: true, displayOrder: 60 },
];

export type OperatorTierSeed = Omit<OperatorTierRecord, 'id' | 'createdAt' | 'updatedAt'>;

export const DEFAULT_OPERATOR_TIERS: readonly OperatorTierSeed[] = [
  {
    slug: 'authorized', name: 'Authorized Operator', nameArabic: 'مشغّل معتمد', currency: 'USD',
    minimumAnnualCommitmentMinor: 250_000, discountBps: 4_000,
    defaultWhiteLabelRights: { level: 'full', customDomain: true, customEmailBranding: true, hideMizanBrand: true },
    defaultDiscoverRights: { operatorDirectory: true }, defaultGlobalSyndicationRights: true, active: true, displayOrder: 10,
  },
  {
    slug: 'growth', name: 'Growth Operator', nameArabic: 'مشغّل نموّ', currency: 'USD',
    minimumAnnualCommitmentMinor: 1_000_000, discountBps: 5_000,
    defaultWhiteLabelRights: { level: 'full', customDomain: true, customEmailBranding: true, hideMizanBrand: true },
    defaultDiscoverRights: { operatorDirectory: true }, defaultGlobalSyndicationRights: true, active: true, displayOrder: 20,
  },
  {
    slug: 'strategic', name: 'Strategic / Regional Operator', nameArabic: 'مشغّل استراتيجي / إقليمي', currency: 'USD',
    minimumAnnualCommitmentMinor: 3_000_000, discountBps: 6_000,
    defaultWhiteLabelRights: { level: 'full', customDomain: true, customEmailBranding: true, hideMizanBrand: true },
    defaultDiscoverRights: { operatorDirectory: true }, defaultGlobalSyndicationRights: true, active: true, displayOrder: 30,
  },
];

export const DEFAULT_POLICY = {
  termMonths: 12,
  graceDays: 14,
  readOnlyDays: 60,
  graceAllowsOperations: true,
  usageWarningThresholdsBps: [7_000, 8_500, 9_500, 10_000],
  defaultUsageMetric: 'unique_participant' as const,
  defaultWalletExpiryPolicy: 'expire_at_agreement_end' as const,
  upgradeProration: 'full_difference' as const,
  mapEnforcement: false,
};
