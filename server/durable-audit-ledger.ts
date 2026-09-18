/*
 * سجلُّ التدقيق على تخزينٍ مشترك — نسختان، سلسلةٌ واحدة.
 *
 * الملفُّ المحلّي يعمل على خادمٍ واحد وينكسر بصمتٍ على أكثر: نسختان لا تريان ملفَّ
 * بعضهما، فتكتبان التسلسل ١ مرّتين، ويصير لمسابقةٍ واحدة سجلّان متوازيان — كلٌّ منهما
 * سليمٌ في نفسه، ومجموعُهما لا يُحتجّ به. ويظهر ذلك حين يُحتاج إليه بالضبط: عند النزاع.
 *
 * فالكتابةُ هنا مشروطة: الصفُّ يُكتب في مسارٍ محدَّد بتسلسله **شرطَ ألّا يكون موجودًا**.
 * فإن سبقت نسخةٌ أخرى إلى التسلسل نفسه خسر المتأخّر صراحةً، فأعاد القراءة وبنى صفَّه على
 * الرأس الجديد وحاول مرّة أخرى. والنتيجةُ سلسلةٌ واحدة مهما تعدّدت النسخ.
 *
 * وما لا يتغيّر: الإضافةُ فقط (لا تعديل ولا حذف)، وسلسلةُ الهاش، وعدمُ تكرار الحدث
 * بـ`eventId`، وعزلُ المستأجر — كلُّها منطقٌ واحد مع المهايئ المحلّي، مُختبَرٌ بعقدٍ واحد.
 */

import {
  AuditSequenceTaken,
  sealChainRow,
  verifyChain,
  type AuditChainRow,
  type AuditLedgerStore,
  type AuditVerification,
} from './audit-ledger-store';

export interface DurableAuditInput {
  eventId: string;
  organizationId: string;
  competitionId: string;
  action: string;
  entityType: string;
  entityId: string;
  reason?: string;
  humanSummaryEnglish?: string;
  clientTimestamp?: string;
  sessionId?: string;
  authenticationAssurance?: string;
  deviceId?: string;
  requestId?: string;
}

export interface DurableAuditActor {
  uid: string;
  role: string;
  organizationId: string;
  competitionId?: string;
}

export interface DurableAppendOutcome {
  row: AuditChainRow;
  /** `true` = الحدث مسجَّلٌ من قبل بنفس `eventId`؛ لم يُكتب شيء. */
  idempotent: boolean;
  /** كم مرّةً خسر السباق قبل أن ينجح — يُقرأ في التشخيص، ويكشف تزاحمًا حقيقيًا. */
  attempts: number;
}

/*
 * التزاحمُ على الرأس.
 *
 * كلُّ كاتبٍ يقرأ الرأس ثم يحاول التسلسل التالي، فمع ن كاتبًا متزامنًا يخسر آخرُهم نحو
 * ن مرّة. وسقفٌ صغير يُسقط كتابةً صحيحة لمجرّد أن الدفعة كانت كبيرة — وإسقاطُ حدثِ تدقيقٍ
 * لأن الخادم كان مشغولًا هو بالضبط ما لا يجوز.
 *
 * فالسقفُ يتّسع لدفعةٍ واقعية (لجانٌ تختم معًا في آخر جولة)، ومعه تأخيرٌ عشوائيّ صغير
 * يفكّ تزامنَ الكُتّاب فلا يعيدون الاصطدام في النقطة نفسها. وتجاوزُه يبقى عطلًا يُعلَن
 * باسمه، لا حلقةً لا تنتهي.
 */
const MAX_APPEND_ATTEMPTS = 48;
const backoff = (attempt: number) =>
  new Promise<void>(resolve => setTimeout(resolve, Math.floor(Math.random() * Math.min(40, 2 * attempt)) + 1));

export class DurableAuditLedger {
  constructor(private readonly store: AuditLedgerStore) {}

  get durability() { return this.store.durability; }

  /**
   * يضيف حدثًا. يفشل مغلقًا على حدثٍ ناقص أو مستأجرٍ لا يملكه الفاعل — الأثرُ الذي
   * يُكتب باسم غير صاحبه أسوأ من أثرٍ لم يُكتب.
   */
  async append(actor: DurableAuditActor, input: DurableAuditInput): Promise<DurableAppendOutcome> {
    if (!input.eventId || !input.competitionId || !input.action || !input.entityType || !input.entityId) {
      throw new Error('AUDIT_EVENT_INVALID');
    }
    if (actor.organizationId !== input.organizationId) throw new Error('AUDIT_TENANT_MISMATCH');
    if (actor.competitionId && actor.competitionId !== input.competitionId) throw new Error('AUDIT_COMPETITION_MISMATCH');

    for (let attempt = 1; attempt <= MAX_APPEND_ATTEMPTS; attempt += 1) {
      const rows = await this.store.rows(input.organizationId, input.competitionId);
      const duplicate = rows.find(row => row.eventId === input.eventId);
      if (duplicate) return { row: duplicate, idempotent: true, attempts: attempt };

      const previousHash = rows.at(-1)?.hash || 'GENESIS';
      const row = sealChainRow({
        ...input,
        sequence: rows.length + 1,
        actorId: actor.uid,
        actorRole: actor.role,
        serverTimestamp: new Date().toISOString(),
        previousHash,
      } as Omit<AuditChainRow, 'hash'>);

      try {
        await this.store.appendAtSequence(row);
        return { row, idempotent: false, attempts: attempt };
      } catch (error) {
        // خسارةُ السباق ليست عطلًا: نسخةٌ أخرى كتبت قبلنا، فنُعيد البناء على رأسها.
        if (!(error instanceof AuditSequenceTaken)) throw error;
        await backoff(attempt);
      }
    }
    throw new Error('AUDIT_APPEND_CONTENTION');
  }

  async list(actor: DurableAuditActor, competitionId: string, limit = 500): Promise<AuditChainRow[]> {
    if (actor.competitionId && actor.competitionId !== competitionId) throw new Error('AUDIT_COMPETITION_MISMATCH');
    const rows = await this.store.rows(actor.organizationId, competitionId);
    return rows.slice(-Math.max(1, Math.min(5000, limit))).reverse();
  }

  async verify(organizationId: string, competitionId: string): Promise<AuditVerification> {
    return verifyChain(await this.store.rows(organizationId, competitionId), organizationId, competitionId);
  }
}
