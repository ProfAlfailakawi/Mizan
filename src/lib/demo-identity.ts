/*
 * إجراءات الهوية والإنقاذ في بيئة العرض — تُطبَّق على الصندوق المحلي المعزول وحده.
 *
 * كانت أزرار «إنهاء الجلسات» في العرض تقول «أُغلقت» ولا تغلق شيئًا، و«إعادة إصدار رمز
 * التفعيل» على صلاحيةٍ مزروعة تسأل عن دعوةٍ بمعرّف الصلاحية فتعود NOT_FOUND. وهنا المنطق
 * الخالص الذي يجعل العرض صادقًا: يتغيّر العدد والصفوف كما تتغيّر في الإنتاج.
 */
import type { AuthSessionRecord, IdentityAccountRecord, IdentityInvitationRecord, RoleGrantRecord } from '../types';

export type SessionScope = { accountId: string; competitionId?: string };

/** يُبطل الجلسات النشطة المطابقة، ويُرجع العدد المُبطَل فعلًا. */
export function revokeMatchingSessions(
  sessions: AuthSessionRecord[],
  scope: SessionScope,
): { sessions: AuthSessionRecord[]; count: number } {
  let count = 0;
  const next = sessions.map(s => {
    if (s.status !== 'ACTIVE' || s.accountId !== scope.accountId) return s;
    if (scope.competitionId && s.competitionId && s.competitionId !== scope.competitionId) return s;
    count++;
    return { ...s, status: 'REVOKED' as const };
  });
  return { sessions: next, count };
}

/** نطاق جلسات صلاحيةٍ واحدة: حسابها، ومسابقتها إن كانت مقيّدة بمسابقة. */
export const grantSessionScope = (grant: Pick<RoleGrantRecord, 'accountId' | 'competitionId'>): SessionScope =>
  ({ accountId: grant.accountId, competitionId: grant.competitionId || undefined });

/**
 * دعوة تفعيلٍ جديدة لصلاحيةٍ قائمة. تُلغى كل دعوةٍ جاهزة سابقة للحساب والدور نفسيهما، فلا
 * يبقى رمزان صالحان معًا — كما يفعل الخادم.
 */
export function grantReissueInvitations(
  invitations: IdentityInvitationRecord[],
  grant: RoleGrantRecord,
  account: IdentityAccountRecord,
  fresh: { id: string; activationTokenHash: string; now: Date; createdBy: string },
): IdentityInvitationRecord[] {
  const email = String(account.email || '').trim().toLowerCase();
  const sameTarget = (i: IdentityInvitationRecord) =>
    i.status === 'READY' && i.requestedRole === grant.role && i.email === email &&
    (i.competitionId || '') === (grant.competitionId || '');
  const invitation: IdentityInvitationRecord = {
    id: fresh.id,
    email,
    displayName: account.displayName,
    organizationId: grant.organizationId,
    requestedRole: grant.role,
    competitionId: grant.competitionId,
    committeeId: grant.committeeId,
    status: 'READY',
    createdAt: fresh.now.toISOString(),
    createdBy: fresh.createdBy,
    expiresAt: new Date(fresh.now.getTime() + 7 * 86400_000).toISOString(),
    activationTokenHash: fresh.activationTokenHash,
    accountId: account.id,
  };
  return [invitation, ...invitations.map(i => (sameTarget(i) ? { ...i, status: 'REVOKED' as const, activationTokenHash: undefined } : i))];
}

/**
 * هل يُعدّ إجراء الإنقاذ في العرض إصلاحًا؟ «تقرير التشخيص» يجمع الأدلّة ولا يعالج السبب:
 * يبقى التنبيه ولا يُحتسب إصلاحًا تلقائيًا. وما يحتاج اعتمادًا لا يُصلح فورًا.
 */
export const demoRescueRepairs = (action: string, safeAuto: boolean): boolean =>
  action !== 'diagnostic.bundle.generate' && safeAuto;
