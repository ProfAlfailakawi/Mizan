/*
 * تخزينُ سجلّ التدقيق — خلف واجهة، لأن القرصَ المحلّي لا يكفي.
 *
 * السجلُّ اليوم ملفُّ JSONL بجوار العملية. وهذا يعمل على خادمٍ واحد، وينكسر بصمتٍ على
 * Cloud Run: نسختان خلف موازِن حِمل لا تريان ملفَّ بعضهما، فتبدأ كلٌّ منهما سلسلتها من
 * `GENESIS`، وتكتبان التسلسل ١ مرّتين، ويصير لدينا سجلّان متوازيان لمسابقةٍ واحدة — كلٌّ
 * منهما «صحيح» في نفسه، ومجموعُهما لا يُحتجّ به.
 *
 * والفرقُ يظهر حين يُحتاج إليه بالضبط: عند النزاع.
 *
 * فالسلسلةُ نفسها (التسلسل، الهاش السابق، الهاش) منطقٌ نقيٌّ هنا، والتخزين مهايئ.
 * والمهايئُ الدائم يكتب كلَّ صفٍّ في مسارٍ محدَّد بتسلسله، **شرطَ ألّا يكون موجودًا** —
 * فسباقُ نسختين على التسلسل نفسه يخسره أحدهما صراحةً ويعيد المحاولة، بدل أن يفوز الاثنان
 * بصفَّين متناقضين.
 */

import crypto from 'node:crypto';

export type AuditDurability =
  /** قرصٌ محلّي: مهايئُ تطوير. لا يصلح لأكثر من نسخة واحدة، ويقول ذلك عن نفسه. */
  | 'LOCAL_DISK_DEVELOPMENT_ADAPTER'
  /** تخزينٌ مشترك دائم: نسختان تكتبان في سلسلةٍ واحدة، والسباق يُحسم لا يُتجاهل. */
  | 'SHARED_DURABLE_STORE';

export interface AuditChainRow {
  eventId: string;
  organizationId: string;
  competitionId: string;
  action: string;
  entityType: string;
  entityId: string;
  sequence: number;
  actorId: string;
  actorRole: string;
  serverTimestamp: string;
  previousHash: string;
  hash: string;
  [key: string]: unknown;
}

export interface AuditLedgerStore {
  readonly durability: AuditDurability;
  /** كل صفوف مسابقةٍ بترتيب تسلسلها. */
  rows(organizationId: string, competitionId: string): Promise<AuditChainRow[]>;
  /**
   * يكتب صفًّا **شرطَ أن يكون تسلسلُه شاغرًا**. يرمي `AuditSequenceTaken` وإلا.
   * هذا الشرطُ هو كلُّ الفرق بين سلسلةٍ واحدة وسلسلتين متوازيتين.
   */
  appendAtSequence(row: AuditChainRow): Promise<void>;
}

export class AuditSequenceTaken extends Error {
  readonly code = 'AUDIT_SEQUENCE_TAKEN';
  constructor(readonly sequence: number) {
    super(`AUDIT_SEQUENCE_TAKEN:${sequence}`);
    this.name = 'AuditSequenceTaken';
  }
}

export const canonicalAudit = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalAudit).join(',')}]`;
  const o = value as Record<string, unknown>;
  return `{${Object.keys(o).sort().map(k => `${JSON.stringify(k)}:${canonicalAudit(o[k])}`).join(',')}}`;
};

export const auditDigest = (input: string) => crypto.createHash('sha256').update(input).digest('hex');

/** يبني الهاش لصفٍّ قبل كتابته — نفسُ الصيغة التي يتحقّق بها القارئ. */
export function sealChainRow(base: Omit<AuditChainRow, 'hash'>): AuditChainRow {
  const hash = auditDigest(`${base.previousHash}|${canonicalAudit(base)}`);
  return Object.assign({}, base, { hash }) as AuditChainRow;
}

export interface AuditVerification {
  valid: boolean;
  count: number;
  lastHash: string;
  failedSequence?: number;
}

/** يتحقّق من السلسلة كاملةً — منطقٌ نقيّ لا يعرف أين تُخزَّن الصفوف. */
export function verifyChain(rows: AuditChainRow[], organizationId: string, competitionId: string): AuditVerification {
  let previous = 'GENESIS';
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const { hash, ...base } = row;
    const expected = auditDigest(`${previous}|${canonicalAudit(base)}`);
    if (row.sequence !== index + 1 || row.previousHash !== previous || hash !== expected
      || row.organizationId !== organizationId || row.competitionId !== competitionId) {
      return { valid: false, count: rows.length, failedSequence: row.sequence, lastHash: previous };
    }
    previous = hash;
  }
  return { valid: true, count: rows.length, lastHash: previous };
}

/** مهايئٌ في الذاكرة — للاختبار، ويعلن أنه ليس دائمًا. */
export class MemoryAuditStore implements AuditLedgerStore {
  readonly durability: AuditDurability = 'LOCAL_DISK_DEVELOPMENT_ADAPTER';
  private readonly byCompetition = new Map<string, AuditChainRow[]>();
  private key(organizationId: string, competitionId: string) { return `${organizationId}::${competitionId}`; }

  async rows(organizationId: string, competitionId: string) {
    return [...(this.byCompetition.get(this.key(organizationId, competitionId)) || [])].sort((a, b) => a.sequence - b.sequence);
  }

  async appendAtSequence(row: AuditChainRow) {
    const key = this.key(row.organizationId, row.competitionId);
    const rows = this.byCompetition.get(key) || [];
    if (rows.some(existing => existing.sequence === row.sequence)) throw new AuditSequenceTaken(row.sequence);
    rows.push(row);
    this.byCompetition.set(key, rows);
  }
}
