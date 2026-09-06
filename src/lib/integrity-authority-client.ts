import {auth} from './firebase';

/*
 * عميل سلطة النزاهة.
 *
 * كل ما هنا يستدعي الخادم ولا يحسب شيئًا. والسبب أن الحسابات التي يحرسها هذا الملف — من ختم
 * النتيجة ومن وافق عليها ومتى كُشفت بذرة القرعة — لا تصلح أن تُحسب في الجهاز الذي يملكه صاحب
 * المصلحة في نتيجتها.
 *
 * وقاعدةٌ واحدة تحكم كل دالة هنا: **الفشل لا يُترجم نجاحًا**. تعذّر الوصول إلى الخادم يعود
 * برمز صريح، والمستدعي يقف؛ ولا تُلفَّق بصمة محلّية لتسدّ الفراغ، لأن ختمًا لا سند له أسوأ من
 * لا ختم — فهو يورث ثقةً لا يستحقها.
 */

/** الرمز يُعرض للمستخدم كسبب، فيبقى مفهومًا لا رقمًا. */
export type AuthorityFailure =
  | 'NOT_SIGNED_IN' | 'UNREACHABLE' | 'NOT_CONFIGURED' | 'FORBIDDEN' | 'REFUSED';

export type AuthorityResult<T> = { ok: true; value: T } | { ok: false; failure: AuthorityFailure; code?: string };

/** حارس نوع صريح: التضييق على راية منطقية لا يعمل خارج الوضع الصارم، والوجود يعمل دائمًا. */
export const succeeded = <T,>(r: AuthorityResult<T>): r is {ok: true; value: T} => 'value' in r;

async function call<T>(path: string, init?: {method?: string; body?: unknown}): Promise<AuthorityResult<T>> {
  const user = auth.currentUser;
  if (!user) return {ok: false, failure: 'NOT_SIGNED_IN'};
  let response: Response;
  try {
    const token = await user.getIdToken();
    response = await fetch(path, {
      method: init?.method || 'GET',
      headers: {'content-type': 'application/json', authorization: `Bearer ${token}`},
      cache: 'no-store',
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch { return {ok: false, failure: 'UNREACHABLE'} }

  if (response.ok) { try { return {ok: true, value: await response.json() as T} } catch { return {ok: false, failure: 'UNREACHABLE'} } }
  let code: string | undefined;
  try { code = String(((await response.json()) as {code?: string})?.code || '') || undefined } catch { /* جسم غير مقروء لا يغيّر التصنيف */ }
  if (response.status === 503) return {ok: false, failure: 'NOT_CONFIGURED', code};
  if (response.status === 401 || response.status === 403) return {ok: false, failure: 'FORBIDDEN', code};
  return {ok: false, failure: 'REFUSED', code};
}

/* ── ختم النتيجة ────────────────────────────────────────────────────────────── */

export interface SealedResultView {
  participantId: string;
  finalScore: number;
  criterionScores: Record<string, number>;
  penaltyCount: number;
  contributingJudges: number;
  sealedBy: string;
  sealedAt: string;
  sealSha256: string;
  inputsSha256: string;
  assurance: 'SIGNED_ED25519' | 'DIGEST_ONLY';
  signature?: {algorithm: string; keyId: string; value: string};
  attestation?: {verdict: string};
}

export interface SealRequestInput {
  competitionId: string; participantId: string; sessionId: string; categoryId?: string;
  submissions: unknown[]; criteria: unknown[]; mode: string; dropExtremes?: boolean; sessionEventCount?: number;
  previousSealSha256?: string; previousFinalScore?: number;
}

/**
 * يُرسَل الخام — إرسالات المحكمين والمعايير — ولا تُرسَل الدرجة. الخادم يؤلّفها ويختمها،
 * فلا يوجد رقم يمكن للعميل أن يمليه.
 */
export function sealResultOnServer(input: SealRequestInput) {
  return call<SealedResultView>('/api/results/seal', {method: 'POST', body: input});
}

export function verifySealOnServer(sealed: unknown) {
  return call<{intact: boolean; signature: string; sealSha256: string}>('/api/results/seal/verify', {method: 'POST', body: {sealed}});
}

/* ── النصاب ─────────────────────────────────────────────────────────────────── */

export interface QuorumView {
  id: string; competitionId: string; action: string; entityId: string;
  requiredRoleGroups: string[][]; minimumApprovals?: number;
  approvals: {actorId: string; actorRole: string; approvedAt: string}[];
  status: 'pending' | 'ready' | 'executed' | 'cancelled' | 'expired';
  requestedAt: string; requestedBy: string; expiresAt: string;
  executedAt?: string; executedBy?: string;
}

export function listQuorum(competitionId: string) {
  return call<{actions: QuorumView[]}>(`/api/integrity/quorum?competitionId=${encodeURIComponent(competitionId)}`);
}
export function requestQuorum(input: {competitionId: string; action: string; entityId: string; requiredRoleGroups: string[][]; minimumApprovals?: number}) {
  return call<QuorumView>('/api/integrity/quorum/request', {method: 'POST', body: input});
}
export function approveQuorum(id: string) {
  return call<QuorumView>(`/api/integrity/quorum/${encodeURIComponent(id)}/approve`, {method: 'POST'});
}
export function executeQuorum(id: string) {
  return call<QuorumView>(`/api/integrity/quorum/${encodeURIComponent(id)}/execute`, {method: 'POST'});
}

/* ── قرعة FairDraw: التزام ثم كشف ───────────────────────────────────────────── */

export interface FairDrawCommitmentView {
  id: string; competitionId: string; participantId: string;
  seedCommitmentHash: string; constraintHash: string;
  committedAt: string; committedBy: string;
  revealedAt?: string; revealedBy?: string;
  status: 'COMMITTED' | 'REVEALED';
}

/** لا تُعيد بذرة. البذرة تُولَّد عند الخادم وتبقى عنده إلى أن يُطلب كشفها بطلب مستقل. */
export function commitFairDraw(input: {competitionId: string; participantId: string; constraintHash: string}) {
  return call<FairDrawCommitmentView>('/api/integrity/fairdraw/commit', {method: 'POST', body: input});
}
export function listFairDrawCommitments(competitionId: string) {
  return call<{commitments: FairDrawCommitmentView[]}>(`/api/integrity/fairdraw/commitments?competitionId=${encodeURIComponent(competitionId)}`);
}
/** الكشف يُعيد البذرة ومدّة الفصل عن الالتزام — والمدّة هي الدليل، لا البذرة وحدها. */
export function revealFairDraw(id: string, constraintHash?: string) {
  return call<{commitment: FairDrawCommitmentView; seed: string; separationMs: number}>(
    `/api/integrity/fairdraw/${encodeURIComponent(id)}/reveal`, {method: 'POST', body: {constraintHash}});
}

/** سبب مقروء لكل تعذّر، بالعربية والإنجليزية — لأن من يقف أمام هذا الحاجز مسؤول لا مطوّر. */
export function authorityFailureText(failure: AuthorityFailure, ar: boolean): string {
  switch (failure) {
    case 'NOT_SIGNED_IN': return ar ? 'لا توجد جلسة دخول مُصدَّقة؛ الختم يُنسب إلى شخص، فلا يقع بلا هوية.' : 'No authenticated session; a seal is attributed to a person and cannot be issued anonymously.';
    case 'NOT_CONFIGURED': return ar ? 'سلطة النزاهة الخادمية غير مهيّأة. ما يُحسب في المتصفح لا يصلح دليلَ نزاهة، فلا يُختم.' : 'The server integrity authority is not configured. What the browser computes is not integrity evidence, so nothing is sealed.';
    case 'FORBIDDEN': return ar ? 'هذه الصلاحية ليست لحسابك.' : 'Your account does not hold this authority.';
    case 'UNREACHABLE': return ar ? 'تعذّر الوصول إلى الخادم. لا يُختم بالبصمة المحلية بديلًا.' : 'The server could not be reached. A local digest is not substituted for it.';
    case 'REFUSED': return ar ? 'رفض الخادم الطلب.' : 'The server refused the request.';
  }
}
