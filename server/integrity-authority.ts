import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { ServerIdentity } from './identity-governance';

/*
 * سلطة النزاهة الخادمية.
 *
 * كان النصاب وقرعة FairDraw يعيشان في ذاكرة المتصفح و`localStorage`: من يفتح أدوات المطوّر
 * يكتب موافقةً لم تقع، أو يقرأ البذرة قبل أوانها. والحرّاس هناك يحرسون من الخطأ لا من العبث،
 * لأن الحارس والمَحروس في يد واحدة.
 *
 * هنا ينتقل الاثنان إلى الخادم، بحالة دائمة وسجلّ تدقيق متسلسل بالبصمات. وفرقان جوهريّان
 * عمّا كان:
 *
 * 1. **النصاب**: الموافق هو الهوية المُصدَّقة للطلب، لا اسمًا يُرسله العميل عن نفسه. والاستقلال
 *    يُفرَض هنا: لا يوافق أحدٌ مرتين، ولا يُنفِّذ من طلب.
 *
 * 2. **القرعة**: البذرة تُولَّد وتبقى **عند الخادم**، ولا يخرج منها إلا الالتزام. لا يُكشف عنها
 *    إلا بطلب لاحق مستقل. فالفصل الزمني صار واقعة مسجّلة — لحظة التزام ولحظة كشف بينهما مدة
 *    محسوبة — بدل أن يكون ادّعاءً في كائن وُلد فيه الالتزام والكشف معًا.
 *
 * وما لا يفعله هذا الملف: لا يقرّر شيئًا عن الدرجات، ولا يرى نصّ سؤال. هو يحرس الترتيب الزمني
 * وهويّة الفاعل فقط.
 */

export type QuorumStatus = 'pending' | 'ready' | 'executed' | 'cancelled' | 'expired';

export interface QuorumApproval { actorId: string; actorRole: string; approvedAt: string }
export interface QuorumRecord {
  id: string;
  organizationId: string;
  competitionId: string;
  action: string;
  entityId: string;
  /** كل مجموعة يجب أن يوافق من داخلها فاعل واحد على الأقل — والاستقلال يمنع تكرار الشخص. */
  requiredRoleGroups: string[][];
  minimumApprovals?: number;
  approvals: QuorumApproval[];
  status: QuorumStatus;
  requestedAt: string;
  requestedBy: string;
  expiresAt: string;
  executedAt?: string;
  executedBy?: string;
}

export interface FairDrawCommitment {
  id: string;
  organizationId: string;
  competitionId: string;
  participantId: string;
  /** `SHA256:<hex>` للبذرة. يُنشر عند الالتزام، والبذرة نفسها لا تخرج. */
  seedCommitmentHash: string;
  /** بصمة القيود المعلنة وقت الالتزام — تمنع تبديل الشروط بين الالتزام والكشف. */
  constraintHash: string;
  committedAt: string;
  committedBy: string;
  revealedAt?: string;
  revealedBy?: string;
  status: 'COMMITTED' | 'REVEALED';
}

interface State { version: 1; quorum: QuorumRecord[]; commitments: FairDrawCommitment[]; seeds: Record<string, string> }

export interface AuthorityAuditRow {
  sequence: number; timestamp: string; organizationId: string;
  actorId: string; actorRole: string; action: string; entityType: string; entityId: string;
  reason?: string; previousHash: string; hash: string;
}

const canonical = (v: unknown): string => {
  if (v === null || v === undefined || typeof v !== 'object') return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).sort().filter((k) => o[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(',')}}`;
};
const hash = (x: string) => crypto.createHash('sha256').update(x).digest('hex');
const safeSegment = (v: string) => v.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);

/** أدوار لا تُحتسب في النصاب مهما كانت صلاحيتها: تجاوز الجذر يُبطل معنى الاستقلال. */
const NEVER_COUNTS = new Set(['super_admin']);

export const QUORUM_WINDOW_MS = 30 * 60 * 1000;
/**
 * أقل مدة بين الالتزام والكشف. الغرض ليس التأخير بل أن يكون الفصل **قابلًا للإثبات**: كشفٌ
 * يقع في نفس اللحظة لا يُميَّز عن التزامٍ كُتب بعد معرفة النتيجة.
 */
export const MIN_REVEAL_GAP_MS = 1000;

export type QuorumOutcome =
  | { ok: true; record: QuorumRecord }
  | { ok: false; code: 'NOT_FOUND' | 'ALREADY_FINAL' | 'EXPIRED' | 'ROLE_NOT_REQUIRED' | 'ALREADY_APPROVED' | 'NOT_READY' | 'REQUESTER_CANNOT_EXECUTE' | 'SCOPE_MISMATCH' };

export type RevealOutcome =
  | { ok: true; commitment: FairDrawCommitment; seed: string; separationMs: number }
  | { ok: false; code: 'NOT_FOUND' | 'ALREADY_REVEALED' | 'TOO_SOON' | 'SCOPE_MISMATCH' | 'CONSTRAINTS_CHANGED' | 'SEED_LOST' };

export class IntegrityAuthorityRepository {
  private file: string;
  constructor(private dir: string) {
    if (!dir) throw new Error('INTEGRITY_AUTHORITY_DIR_REQUIRED');
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    this.file = path.join(dir, 'integrity-authority.json');
    if (!fs.existsSync(this.file)) this.write({ version: 1, quorum: [], commitments: [], seeds: {} });
  }

  private read(): State {
    try {
      const s = JSON.parse(fs.readFileSync(this.file, 'utf8')) as State;
      return { version: 1, quorum: s.quorum || [], commitments: s.commitments || [], seeds: s.seeds || {} };
    } catch { throw new Error('INTEGRITY_AUTHORITY_CORRUPT') }
  }
  /*
   * الكتابة الذرّية بـrename هي الصواب على قرص POSIX. لكن الوحدة المُركَّبة على تخزين سحابي
   * (GCS FUSE مثلًا) ليست قرصًا: rename فيها نسخٌ ثم حذف، وقد لا تُدعم أصلًا.
   *
   * فتُجرَّب الذرّية أولًا، وعند تعذّرها يُكتب في الموضع مباشرة. والنزول عن الذرّية يُقال في
   * السجل ولا يُبتلع: نافذة التعرّض تصير كتابةً غير مكتملة عند انقطاع، وهذا يجب أن يُعرف.
   */
  private write(s: State) {
    const body = JSON.stringify(s, null, 2);
    const tmp = `${this.file}.${process.pid}.${Date.now()}.tmp`;
    try {
      fs.writeFileSync(tmp, body, { encoding: 'utf8', mode: 0o600 });
      fs.renameSync(tmp, this.file);
      return;
    } catch (err) {
      try { fs.unlinkSync(tmp) } catch { /* لا شيء نظّفه */ }
      if (!this.warnedNonAtomic) {
        console.warn(`Integrity authority: atomic rename unavailable on ${path.dirname(this.file)} (${err instanceof Error ? err.message : 'unknown'}); writing in place. A crash mid-write can leave the state file truncated.`);
        this.warnedNonAtomic = true;
      }
    }
    fs.writeFileSync(this.file, body, { encoding: 'utf8', mode: 0o600 });
  }
  private warnedNonAtomic = false;

  private auditFile(organizationId: string) { return path.join(this.dir, `integrity-audit-${safeSegment(organizationId)}.jsonl`) }
  /** سجل ملحق-فقط مسلسل بالبصمات: حذف سطر أو تعديله يكسر السلسلة عند التالي. */
  private appendAudit(actor: ServerIdentity, action: string, entityType: string, entityId: string, reason?: string) {
    const file = this.auditFile(actor.organizationId);
    let previousHash = 'GENESIS', sequence = 1;
    try {
      const lines = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean) : [];
      if (lines.length) { const last = JSON.parse(lines[lines.length - 1]) as AuthorityAuditRow; previousHash = last.hash; sequence = last.sequence + 1 }
    } catch { throw new Error('INTEGRITY_AUDIT_CORRUPT') }
    const base = { sequence, timestamp: new Date().toISOString(), organizationId: actor.organizationId, actorId: actor.uid, actorRole: actor.role, action, entityType, entityId, reason, previousHash };
    const row: AuthorityAuditRow = { ...base, hash: hash(`${previousHash}|${canonical(base)}`) };
    fs.appendFileSync(file, JSON.stringify(row) + '\n', { encoding: 'utf8', mode: 0o600 });
    return row;
  }

  /** يُقرأ السجل للتدقيق، مع التحقّق من اتصال السلسلة — لا يُقال «سليم» دون فحصه. */
  readAudit(organizationId: string): { rows: AuthorityAuditRow[]; chainIntact: boolean } {
    const file = this.auditFile(organizationId);
    if (!fs.existsSync(file)) return { rows: [], chainIntact: true };
    const rows = fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l) as AuthorityAuditRow);
    let previousHash = 'GENESIS', chainIntact = true;
    for (const r of rows) {
      const { hash: h, ...base } = r;
      if (r.previousHash !== previousHash || hash(`${previousHash}|${canonical(base)}`) !== h) { chainIntact = false; break }
      previousHash = h;
    }
    return { rows, chainIntact };
  }

  private scoped(actor: ServerIdentity, organizationId: string, competitionId?: string) {
    if (actor.organizationId !== organizationId) return false;
    return !(actor.competitionId && competitionId && actor.competitionId !== competitionId);
  }

  private settle(q: QuorumRecord): QuorumRecord {
    if (q.status === 'pending' && Date.parse(q.expiresAt) < Date.now()) return { ...q, status: 'expired' };
    return q;
  }

  /** هل اكتمل النصاب: فاعل مستقل من كل مجموعة مطلوبة، وبلوغ الحد الأدنى إن حُدِّد. */
  private satisfied(q: QuorumRecord): boolean {
    const counted = q.approvals.filter((a) => !NEVER_COUNTS.has(a.actorRole));
    if (q.minimumApprovals && counted.length < q.minimumApprovals) return false;
    const used = new Set<string>();
    for (const group of q.requiredRoleGroups) {
      const hit = counted.find((a) => group.includes(a.actorRole) && !used.has(a.actorId));
      if (!hit) return false;
      used.add(hit.actorId);
    }
    return true;
  }

  listQuorum(actor: ServerIdentity, competitionId: string): QuorumRecord[] {
    const s = this.read();
    return s.quorum.filter((q) => q.organizationId === actor.organizationId && q.competitionId === competitionId).map((q) => this.settle(q));
  }

  /** طلب إجراء يتطلّب سلطات مستقلة. الطلب المفتوح نفسه يُعاد بدل إنشاء ثانٍ يُشتّت الموافقات. */
  requestQuorum(actor: ServerIdentity, input: { competitionId: string; action: string; entityId: string; requiredRoleGroups: string[][]; minimumApprovals?: number }): QuorumOutcome {
    if (!this.scoped(actor, actor.organizationId, input.competitionId)) return { ok: false, code: 'SCOPE_MISMATCH' };
    const s = this.read();
    const open = s.quorum.find((q) => q.competitionId === input.competitionId && q.action === input.action && q.entityId === input.entityId && !['executed', 'cancelled'].includes(q.status));
    if (open) {
      const settled = this.settle(open);
      if (settled.status !== 'expired') return { ok: true, record: settled };
      // الطلب المنتهي يُثبَّت منتهيًا قبل فتح غيره، فلا يبقى معلّقًا في الحالة إلى الأبد.
      s.quorum = s.quorum.map((q) => (q.id === open.id ? settled : q));
    }
    const now = Date.now();
    const record: QuorumRecord = {
      id: `quorum_${crypto.randomUUID()}`,
      organizationId: actor.organizationId, competitionId: input.competitionId,
      action: input.action, entityId: input.entityId,
      requiredRoleGroups: input.requiredRoleGroups.length ? input.requiredRoleGroups : [['head_judge'], ['comp_admin', 'org_admin']],
      minimumApprovals: input.minimumApprovals,
      approvals: [], status: 'pending',
      requestedAt: new Date(now).toISOString(), requestedBy: actor.uid,
      expiresAt: new Date(now + QUORUM_WINDOW_MS).toISOString(),
    };
    s.quorum = [record, ...s.quorum];
    this.write(s);
    this.appendAudit(actor, 'QUORUM_REQUESTED', 'QuorumAction', record.id, `${input.action} on ${input.entityId}`);
    return { ok: true, record };
  }

  /** موافقة واحدة من الفاعل المُصدَّق. لا تُقبل نيابةً عن أحد، ولا تُحتسب مرتين. */
  approveQuorum(actor: ServerIdentity, id: string): QuorumOutcome {
    const s = this.read();
    const idx = s.quorum.findIndex((q) => q.id === id);
    if (idx < 0) return { ok: false, code: 'NOT_FOUND' };
    const current = this.settle(s.quorum[idx]);
    if (!this.scoped(actor, current.organizationId, current.competitionId)) return { ok: false, code: 'SCOPE_MISMATCH' };
    if (current.status === 'executed' || current.status === 'cancelled') return { ok: false, code: 'ALREADY_FINAL' };
    if (current.status === 'expired') { s.quorum[idx] = current; this.write(s); return { ok: false, code: 'EXPIRED' } }
    const allowed = current.requiredRoleGroups.flat();
    if (!allowed.includes(actor.role) || NEVER_COUNTS.has(actor.role)) return { ok: false, code: 'ROLE_NOT_REQUIRED' };
    if (current.approvals.some((a) => a.actorId === actor.uid)) return { ok: false, code: 'ALREADY_APPROVED' };
    const approvals = [...current.approvals, { actorId: actor.uid, actorRole: actor.role, approvedAt: new Date().toISOString() }];
    const next: QuorumRecord = { ...current, approvals, status: this.satisfied({ ...current, approvals }) ? 'ready' : 'pending' };
    s.quorum[idx] = next; this.write(s);
    this.appendAudit(actor, 'QUORUM_APPROVED', 'QuorumAction', id, `approval ${approvals.length}`);
    return { ok: true, record: next };
  }

  /** التنفيذ بعد الاكتمال، وبيد غير يد الطالب: فصلٌ للواجبات لا يُترك للعميل. */
  executeQuorum(actor: ServerIdentity, id: string): QuorumOutcome {
    const s = this.read();
    const idx = s.quorum.findIndex((q) => q.id === id);
    if (idx < 0) return { ok: false, code: 'NOT_FOUND' };
    const current = this.settle(s.quorum[idx]);
    if (!this.scoped(actor, current.organizationId, current.competitionId)) return { ok: false, code: 'SCOPE_MISMATCH' };
    if (current.status === 'executed' || current.status === 'cancelled') return { ok: false, code: 'ALREADY_FINAL' };
    if (current.status === 'expired') { s.quorum[idx] = current; this.write(s); return { ok: false, code: 'EXPIRED' } }
    if (current.status !== 'ready' || !this.satisfied(current)) return { ok: false, code: 'NOT_READY' };
    if (current.requestedBy === actor.uid) return { ok: false, code: 'REQUESTER_CANNOT_EXECUTE' };
    const next: QuorumRecord = { ...current, status: 'executed', executedAt: new Date().toISOString(), executedBy: actor.uid };
    s.quorum[idx] = next; this.write(s);
    this.appendAudit(actor, 'QUORUM_EXECUTED', 'QuorumAction', id, current.action);
    return { ok: true, record: next };
  }

  /**
   * الالتزام: يولّد الخادم البذرة ويحتفظ بها، ولا يُعيد إلا بصمتها. الاستدعاء لا يمكن أن
   * يُخرج البذرة مهما طُلب — ليست في المُخرَج أصلًا.
   */
  commitFairDraw(actor: ServerIdentity, input: { competitionId: string; participantId: string; constraintHash: string }): FairDrawCommitment {
    const s = this.read();
    const seed = crypto.randomBytes(32).toString('hex');
    const commitment: FairDrawCommitment = {
      id: `fdcommit_${crypto.randomUUID()}`,
      organizationId: actor.organizationId, competitionId: input.competitionId, participantId: input.participantId,
      seedCommitmentHash: `SHA256:${hash(seed)}`,
      constraintHash: input.constraintHash,
      committedAt: new Date().toISOString(), committedBy: actor.uid,
      status: 'COMMITTED',
    };
    s.commitments = [commitment, ...s.commitments];
    s.seeds[commitment.id] = seed;
    this.write(s);
    this.appendAudit(actor, 'FAIRDRAW_COMMITTED', 'FairDrawCommitment', commitment.id, commitment.seedCommitmentHash);
    return commitment;
  }

  listCommitments(actor: ServerIdentity, competitionId: string): FairDrawCommitment[] {
    return this.read().commitments.filter((c) => c.organizationId === actor.organizationId && c.competitionId === competitionId);
  }

  /**
   * الكشف: يُعاد البذرة مرة واحدة ويُثبَّت وقت الكشف. تُرفض القراءة إن تغيّرت القيود عمّا
   * التُزم به، لأن التزامًا على شروط وكشفًا على غيرها ليس التزامًا.
   */
  revealFairDraw(actor: ServerIdentity, id: string, expectedConstraintHash?: string): RevealOutcome {
    const s = this.read();
    const idx = s.commitments.findIndex((c) => c.id === id);
    if (idx < 0) return { ok: false, code: 'NOT_FOUND' };
    const c = s.commitments[idx];
    if (!this.scoped(actor, c.organizationId, c.competitionId)) return { ok: false, code: 'SCOPE_MISMATCH' };
    if (c.status === 'REVEALED') return { ok: false, code: 'ALREADY_REVEALED' };
    if (expectedConstraintHash && expectedConstraintHash !== c.constraintHash) return { ok: false, code: 'CONSTRAINTS_CHANGED' };
    const separationMs = Date.now() - Date.parse(c.committedAt);
    if (separationMs < MIN_REVEAL_GAP_MS) return { ok: false, code: 'TOO_SOON' };
    const seed = s.seeds[id];
    if (!seed) return { ok: false, code: 'SEED_LOST' };
    const revealed: FairDrawCommitment = { ...c, status: 'REVEALED', revealedAt: new Date().toISOString(), revealedBy: actor.uid };
    s.commitments[idx] = revealed;
    this.write(s);
    this.appendAudit(actor, 'FAIRDRAW_REVEALED', 'FairDrawCommitment', id, `separation ${separationMs}ms`);
    return { ok: true, commitment: revealed, seed, separationMs };
  }
}

/**
 * التحقّق المحمول من فصل الالتزام عن الكشف، بلا وصول إلى الخادم: الالتزام يطابق البذرة،
 * والكشف وقع **بعد** الالتزام بمدة معتبرة. الترتيب المعكوس أو المنعدم يُرفض صراحةً.
 */
export function verifyCommitRevealSeparation(input: { seedCommitmentHash: string; seed: string; committedAt: string; revealedAt?: string }):
  { valid: boolean; reason?: 'COMMITMENT_MISMATCH' | 'NOT_REVEALED' | 'REVEAL_NOT_AFTER_COMMIT' | 'INSUFFICIENT_SEPARATION'; separationMs?: number } {
  if (`SHA256:${hash(input.seed)}` !== input.seedCommitmentHash) return { valid: false, reason: 'COMMITMENT_MISMATCH' };
  if (!input.revealedAt) return { valid: false, reason: 'NOT_REVEALED' };
  const committed = Date.parse(input.committedAt), revealed = Date.parse(input.revealedAt);
  if (!Number.isFinite(committed) || !Number.isFinite(revealed) || revealed <= committed) return { valid: false, reason: 'REVEAL_NOT_AFTER_COMMIT' };
  const separationMs = revealed - committed;
  if (separationMs < MIN_REVEAL_GAP_MS) return { valid: false, reason: 'INSUFFICIENT_SEPARATION', separationMs };
  return { valid: true, separationMs };
}
