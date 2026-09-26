/*
 * سلطة النزاهة في البيئة التجريبية.
 *
 * البيئة التجريبية بلا حساب ولا خادم، فكان كل نداءٍ إلى سلطة النزاهة يعود `NOT_SIGNED_IN`:
 * زرّ «اعتماد الختم» لا يتقدّم، و«نشر» لا ينشر، والشهادة لا تُفتح — والعرض كله يقف عند
 * أظهر ما في المنتج. وتعطيلُ الحارس في المخزن ليس حلًّا: هو نفسه ما يحمي المسابقة الحقيقية.
 *
 * فيُجاب النداء هنا بما كان الخادم سيجيب به، بالخوارزمية نفسها (`computePanelScore`)،
 * وبالحدود نفسها: النصاب لا يكتمل بموافقتين من هوية واحدة، والموافقتان من مجموعتَي أدوار
 * مختلفتين. والبصمة المُعادة موسومة `DIGEST_ONLY` — لا توقيع يُدّعى في عرض.
 *
 * ولا يُفعَّل إلا بنداءٍ صريح من المخزن حين تكون راية الديمو مرفوعة في هذا التبويب؛ نشرٌ
 * حقيقي لا يمرّ به أبدًا.
 */
import { computePanelScore, panelPenaltyCount, type ScoringCriterion, type ScoringSubmission } from './scoring-core';

export interface DemoActor { id: string; role: string; name?: string }

let actorOf: (() => DemoActor) | null = null;

/** يُنادى من المخزن وحده، داخل البيئة التجريبية. */
export function enableDemoAuthority(provider: () => DemoActor): void { actorOf = provider; }
export function demoAuthorityActive(): boolean { return !!actorOf; }

interface DemoQuorum {
  id: string; competitionId: string; action: string; entityId: string;
  requiredRoleGroups: string[][]; minimumApprovals?: number;
  approvals: { actorId: string; actorRole: string; approvedAt: string }[];
  status: 'pending' | 'ready' | 'executed' | 'cancelled' | 'expired';
  requestedAt: string; requestedBy: string; expiresAt: string; executedAt?: string; executedBy?: string;
}

const QUORUM_KEY = 'mizan_demo_quorum_v1';
function readQuorums(): DemoQuorum[] {
  try { return JSON.parse(window.sessionStorage.getItem(QUORUM_KEY) || '[]') as DemoQuorum[] } catch { return [] }
}
function writeQuorums(rows: DemoQuorum[]): void {
  try { window.sessionStorage.setItem(QUORUM_KEY, JSON.stringify(rows)) } catch { /* العرض يستمرّ في الذاكرة */ }
}

/** بصمة حتمية بطول SHA-256 (٦٤ خانة). ليست SHA-256 ولا تُدّعى كذلك: وسمها `DIGEST_ONLY`. */
export function demoDigest(text: string): string {
  let out = '';
  for (let round = 0; round < 8; round++) {
    let h = 0x811c9dc5 ^ (round * 0x9e3779b1);
    for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    out += (h >>> 0).toString(16).padStart(8, '0');
  }
  return out;
}

const quorumSatisfied = (q: DemoQuorum) => q.requiredRoleGroups.every(group => q.approvals.some(a => group.includes(a.actorRole)))
  && new Set(q.approvals.map(a => a.actorId)).size >= Math.max(q.minimumApprovals || 0, q.requiredRoleGroups.length);

type Result = { ok: true; value: unknown } | { ok: false; failure: 'FORBIDDEN' | 'REFUSED'; code?: string };

/** يعيد `null` لمسارٍ لا تحاكيه البيئة التجريبية، فيمضي النداء إلى طريقه المعتاد. */
export function demoAuthorityCall(path: string, init?: { method?: string; body?: unknown }): Result | null {
  if (!actorOf) return null;
  const actor = actorOf();
  const body = (init?.body || {}) as Record<string, unknown>;
  const now = new Date().toISOString();

  if (path === '/api/results/seal') {
    const submissions = (Array.isArray(body.submissions) ? body.submissions : []) as ScoringSubmission[];
    const criteria = (Array.isArray(body.criteria) ? body.criteria : []) as ScoringCriterion[];
    if (!submissions.length || !criteria.length) return { ok: false, failure: 'REFUSED', code: submissions.length ? 'NO_CRITERIA' : 'NO_SUBMISSIONS' };
    const panel = computePanelScore({ submissions, criteria, mode: String(body.mode || 'all_judges_all_criteria'), dropExtremes: !!body.dropExtremes });
    const inputsSha256 = demoDigest(JSON.stringify({ p: body.participantId, s: submissions, c: criteria }));
    const sealSha256 = demoDigest(`${inputsSha256}|${panel.finalScore}|${actor.id}|${now}`);
    return { ok: true, value: {
      participantId: body.participantId, finalScore: panel.finalScore, criterionScores: panel.criterionScores,
      penaltyCount: panelPenaltyCount(submissions, Number(body.sessionEventCount) || 0), contributingJudges: submissions.length,
      sealedBy: actor.id, sealedAt: now, sealSha256, inputsSha256, assurance: 'DIGEST_ONLY',
    } };
  }

  if (path === '/api/results/publish') {
    return { ok: true, value: { organizationId: '', competitionId: body.competitionId, publishedBy: actor.id, publishedAt: now, sealCount: 0 } };
  }

  if (path.startsWith('/api/governance/') || path === '/api/results/score-correction' || path === '/api/participants/reading-change') {
    return { ok: true, value: { attested: true, summary: 'بيئة تجريبية: سُجّل الإجراء محليًا.' } };
  }

  if (path.startsWith('/api/integrity/quorum')) {
    const rows = readQuorums();
    if (path.startsWith('/api/integrity/quorum?')) {
      const competitionId = new URLSearchParams(path.split('?')[1]).get('competitionId');
      return { ok: true, value: { actions: rows.filter(q => q.competitionId === competitionId) } };
    }
    if (path === '/api/integrity/quorum/request') {
      const open = rows.find(q => q.competitionId === body.competitionId && q.action === body.action && q.entityId === body.entityId && (q.status === 'pending' || q.status === 'ready'));
      if (open) return { ok: true, value: open };
      const q: DemoQuorum = {
        id: `quorum-demo-${rows.length + 1}-${Date.now().toString(36)}`, competitionId: String(body.competitionId), action: String(body.action), entityId: String(body.entityId),
        requiredRoleGroups: (body.requiredRoleGroups as string[][]) || [], minimumApprovals: body.minimumApprovals as number | undefined,
        approvals: [], status: 'pending', requestedAt: now, requestedBy: actor.id, expiresAt: new Date(Date.now() + 24 * 3600_000).toISOString(),
      };
      writeQuorums([...rows, q]);
      return { ok: true, value: q };
    }
    const match = path.match(/^\/api\/integrity\/quorum\/([^/]+)\/(approve|execute)$/);
    if (match) {
      const id = decodeURIComponent(match[1]);
      const q = rows.find(x => x.id === id);
      if (!q) return { ok: false, failure: 'REFUSED', code: 'QUORUM_NOT_FOUND' };
      let next = q;
      if (match[2] === 'approve') {
        if (!q.requiredRoleGroups.flat().includes(actor.role)) return { ok: false, failure: 'FORBIDDEN', code: 'ROLE_NOT_REQUIRED' };
        if (!q.approvals.some(a => a.actorId === actor.id)) next = { ...q, approvals: [...q.approvals, { actorId: actor.id, actorRole: actor.role, approvedAt: now }] };
        next = { ...next, status: quorumSatisfied(next) ? 'ready' : 'pending' };
      } else {
        if (!quorumSatisfied(q)) return { ok: false, failure: 'REFUSED', code: 'QUORUM_NOT_READY' };
        next = { ...q, status: 'executed', executedAt: now, executedBy: actor.id };
      }
      writeQuorums(rows.map(x => x.id === id ? next : x));
      return { ok: true, value: next };
    }
  }
  return null;
}
