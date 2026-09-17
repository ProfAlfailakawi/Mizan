/*
 * مهايئُ التخزين المشترك لسجلّ التدقيق — Firestore.
 *
 * لِمَ Firestore ولِمَ هذه الصيغة بالذات: الشرطُ الذي يحتاجه سجلٌّ متسلسل هو «اكتب هذا
 * التسلسل إن لم يكن مكتوبًا». وهذا موجودٌ في Firestore بلا معاملة كاملة: كتابةٌ مشروطة
 * بـ`currentDocument.exists=false` على مسارٍ اسمُه التسلسل. فالسباقُ بين نسختين يُحسم
 * في المخزن نفسه: إحداهما تكتب والأخرى تُردّ بـ409، فتُعيد البناء على الرأس الجديد.
 *
 * ولهذا يحمل كلُّ صفٍّ اسمَ مستندٍ مشتقًّا من تسلسله (`000001`) لا معرّفًا عشوائيًّا:
 * المعرّفُ العشوائي يجعل كلَّ كتابةٍ تنجح، فتفوز النسختان معًا وتضيع السلسلة.
 *
 * والترتيبُ يُقرأ من التسلسل لا من وقت الكتابة: الوقتُ يتقارب بين نسختين حدَّ التساوي،
 * والتسلسلُ لا يتساوى أبدًا لأن المخزن يمنعه.
 */

import {
  AuditSequenceTaken,
  type AuditChainRow,
  type AuditDurability,
  type AuditLedgerStore,
} from './audit-ledger-store';

/** ما يحتاجه هذا المهايئ من طبقة Firestore — يُحقن ليُختبر على المحاكي. */
export interface FirestoreAuditBackend {
  listDocumentPaths(collectionPath: string, limit?: number): Promise<string[]>;
  get(path: string): Promise<Record<string, unknown> | null>;
  createAtomically(documents: { path: string; data: Record<string, unknown> }[]): Promise<void>;
}

const safeSegment = (value: string) => String(value || '').replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120);
/** ستّة أرقام تكفي لمليون حدثٍ في مسابقة، وتُبقي الترتيب المعجمي مطابقًا للعددي. */
const sequenceId = (sequence: number) => String(sequence).padStart(6, '0');

export class FirestoreAuditStore implements AuditLedgerStore {
  readonly durability: AuditDurability = 'SHARED_DURABLE_STORE';

  constructor(
    private readonly backend: FirestoreAuditBackend,
    /** جذرُ السجلّ. يُفصل عن بيانات المسابقة كي لا يُحذف معها بحذفٍ شجريّ. */
    private readonly root = 'server_audit',
  ) {}

  private collection(organizationId: string, competitionId: string) {
    return `${this.root}/${safeSegment(organizationId)}__${safeSegment(competitionId)}/events`;
  }

  async rows(organizationId: string, competitionId: string): Promise<AuditChainRow[]> {
    const collection = this.collection(organizationId, competitionId);
    const paths = await this.backend.listDocumentPaths(collection);
    if (!paths.length) return [];
    const documents = await Promise.all(paths.map(path => this.backend.get(path)));
    return documents
      .filter((doc): doc is Record<string, unknown> => !!doc)
      .map(doc => doc as unknown as AuditChainRow)
      .sort((a, b) => Number(a.sequence) - Number(b.sequence));
  }

  async appendAtSequence(row: AuditChainRow): Promise<void> {
    const path = `${this.collection(row.organizationId, row.competitionId)}/${sequenceId(row.sequence)}`;
    try {
      await this.backend.createAtomically([{ path, data: row as unknown as Record<string, unknown> }]);
    } catch (error) {
      /*
       * `FIRESTORE_CONFLICT` هنا ليس عطلًا: هو المخزنُ يقول «هذا التسلسل مأخوذ». وهو
       * بالضبط ما نريده أن يقوله — فيُترجَم إلى خسارةِ سباقٍ يعيد المنادي المحاولة.
       */
      if (error instanceof Error && error.message === 'FIRESTORE_CONFLICT') throw new AuditSequenceTaken(row.sequence);
      throw error;
    }
  }
}
