/*
 * ما يكتمل به يومُ العرض خارج قوائمه الكبرى.
 *
 * `demo-universe` يبني المتسابقين واللجان والنتائج. وكانت بقية الشاشات تقرأ قوائم تُركت
 * فارغة: الأجهزة في غرفة العمليات، والإشعارات التي وصلت المتسابق، وموافقات وليّ الأمر،
 * ورحلات الوفد وفنادقه، وجواز المشاركة، وسجلّ النسخ الاحتياطية، وأختام سجلّ التدقيق،
 * ومصدر المصحف المعتمد. فتفتح كل شاشة من هذه على «لا يوجد بعد» وخلفها مسابقةٌ في منتصف
 * يومها. تُبنى هنا من بيانات الكون نفسه — المتسابق الذي أُشعر هو الذي صدرت نتيجته،
 * والوفد الذي يُنقل هو الوفد الذي في القاعة — فلا تقول شاشةٌ غير ما تقوله أختها.
 */
import type {
  AuditLedgerSealRecord, BackupRecord, Certificate, Committee, ConsentRecord, DelegationTravelRecord, DeviceRecord,
  JudgePassportEntry, JudgeProfile, NotificationRecord, Participant, ParticipantPassportEntry, QuranSourceManifestRecord,
  ResultRecord, TrainingRun, IdentityAccountRecord, RoleGrantRecord, IdentityInvitationRecord, AuthSessionRecord, PassReissueRecord,
  ParticipantCredentialLineageRecord, SessionCheckpointRecord, ContinuityIncidentRecord, SessionRecoveryRecord, Role,
} from '../types';
import { demoDigest } from '../lib/demo-authority';

const at = (hour: number, minute = 0) => new Date(Date.UTC(2027, 1, 11, hour, minute)).toISOString();

export function demoDevices(competitionId: string, committees: Committee[]): DeviceRecord[] {
  const rows: DeviceRecord[] = [];
  committees.forEach((c, i) => {
    const down = c.status === 'offline';
    rows.push({ id: `dev-demo-tab-${i + 1}`, competitionId, name: `لوحي المحكّم — ${c.nameArabic}`, type: 'judge_tablet', role: 'JudgeOS', zone: c.venueHall, committeeId: c.id, status: down ? 'offline' : i === 7 ? 'degraded' : 'online', connection: down ? 'offline' : 'online', lastSeenAt: at(down ? 11 : 13, down ? 12 : 58), lastSyncAt: at(down ? 11 : 13, down ? 10 : 57), softwareVersion: '4.12.0', batteryPercent: down ? 0 : 38 + ((i * 17) % 60) });
    rows.push({ id: `dev-demo-disp-${i + 1}`, competitionId, name: `شاشة ${c.nameArabic}`, type: 'display', role: 'Committee Display', zone: c.venueHall, committeeId: c.id, status: down ? 'offline' : 'online', connection: down ? 'offline' : 'online', lastSeenAt: at(13, 59), softwareVersion: '4.12.0' });
  });
  const shared: Array<[string, DeviceRecord['type'], DeviceRecord['role'], string, DeviceRecord['status']]> = [
    ['بوابة الدخول الشمالية', 'kiosk', 'Gate', 'المدخل الشمالي', 'online'],
    ['بوابة الدخول الجنوبية', 'kiosk', 'Gate', 'المدخل الجنوبي', 'online'],
    ['كشك الحضور الذاتي 1', 'kiosk', 'Kiosk', 'بهو الاستقبال', 'online'],
    ['كشك الحضور الذاتي 2', 'kiosk', 'Kiosk', 'بهو الاستقبال', 'degraded'],
    ['شاشة قاعة الانتظار الكبرى', 'display', 'Waiting Display', 'قاعة الانتظار', 'online'],
    ['شاشة الممرّ الشرقي', 'display', 'Waiting Display', 'الممرّ الشرقي', 'online'],
    ['خادم القاعة المحلي', 'edge_server', 'Edge', 'غرفة العمليات', 'online'],
    ['طابعة الشهادات', 'printer', 'Operations', 'مكتب الإصدار', 'online'],
    ['منصّة الحفل', 'display', 'Ceremony', 'المسرح الرئيسي', 'online'],
    ['مازج الصوت الرئيسي', 'audio', 'Broadcast', 'غرفة البثّ', 'online'],
  ];
  shared.forEach(([name, type, role, zone, status], i) => rows.push({ id: `dev-demo-shared-${i + 1}`, competitionId, name, type, role, zone, status, connection: 'online', lastSeenAt: at(13, 50 + (i % 9)), lastSyncAt: at(13, 49 + (i % 9)), softwareVersion: i === 6 ? 'edge-2.3.1' : '4.12.0', batteryPercent: type === 'kiosk' ? 64 + i * 3 : undefined }));
  return rows;
}

export function demoNotifications(competitionId: string, participants: Participant[], results: ResultRecord[]): NotificationRecord[] {
  const rows: NotificationRecord[] = [];
  const resultOf = new Map(results.map(r => [r.participantId, r]));
  participants.slice(0, 120).forEach((p, i) => {
    const channel: NotificationRecord['channel'] = i % 3 === 0 ? 'whatsapp' : i % 3 === 1 ? 'email' : 'sms';
    const push = (templateKey: string, hour: number, minute: number, status: NotificationRecord['status'] = 'sent') => rows.push({
      id: `ntf-demo-${rows.length + 1}`, competitionId, participantId: p.id, channel, templateKey, locale: 'ar',
      recipient: channel === 'email' ? p.email : p.phone, status, attempts: status === 'failed' ? 3 : 1, createdAt: at(hour, minute),
      sentAt: status === 'sent' ? at(hour, minute + 1) : undefined, error: status === 'failed' ? 'رقم غير قابل للوصول' : undefined,
      fallbackChannel: status === 'failed' ? 'in_app' : undefined, consentSatisfied: true, idempotencyKey: `${p.id}:${templateKey}`,
    });
    push('registration.approved', 6, i % 60);
    if (p.checkedInAt) push('checkin.confirmed', 8, 45);
    if (p.status === 'in_queue') push('queue.turn_soon', 13, (i * 3) % 60, i % 17 === 0 ? 'failed' : 'sent');
    if (resultOf.get(p.id)) push('session.completed', 12, (i * 7) % 60);
    if (p.status === 'certified') push('certificate.issued', 17, 31);
  });
  return rows;
}

export function demoConsents(competitionId: string, participants: Participant[]): ConsentRecord[] {
  const kinds: ConsentRecord['kind'][] = ['terms', 'privacy', 'audio_recording', 'human_review'];
  const rows: ConsentRecord[] = [];
  participants.forEach((p, i) => {
    kinds.forEach(kind => rows.push({ id: `cns-demo-${p.id}-${kind}`, participantId: p.id, competitionId, kind, version: '2027.1', accepted: true, acceptedAt: p.statusHistory?.[0]?.timestamp || at(6), publisher: 'جهة ميزان التجريبية للمسابقات القرآنية', publisherLevel: 'organization', documentEffectiveDate: '2026-10-01' }));
    /* القاصر يحتاج موافقة وليّه: من وُلد بعد ٢٠٠٩ في هذا العرض. */
    if (Number(String(p.dateOfBirth || '').slice(0, 4)) >= 2009) rows.push({ id: `cns-demo-${p.id}-guardian`, participantId: p.id, competitionId, kind: 'guardian', version: '2027.1', accepted: true, acceptedAt: at(6, i % 60), guardianName: `ولي أمر ${p.fullNameArabic}`, publisher: 'جهة ميزان التجريبية للمسابقات القرآنية', publisherLevel: 'organization' });
    if (i % 4 !== 3) rows.push({ id: `cns-demo-${p.id}-ai`, participantId: p.id, competitionId, kind: 'ai_processing', version: '2027.1', accepted: i % 9 !== 0, acceptedAt: at(6, i % 60) });
  });
  return rows;
}

export function demoTravel(competitionId: string, participants: Participant[]): DelegationTravelRecord[] {
  const flights = ['EK 2512', 'SV 554', 'QR 1017', 'MS 912', 'TK 762', 'GF 504', 'WY 611'];
  return participants.filter(p => p.delegationId === 'delegation-current').map((p, i) => ({
    id: `trv-demo-${i + 1}`, competitionId, delegationId: 'delegation-current', participantId: p.id,
    flightNumber: flights[i % flights.length], arrivalAirport: i % 4 === 0 ? 'DWC' : 'DXB', arrivalAt: new Date(Date.UTC(2027, 1, 9, 6 + (i % 12), (i * 13) % 60)).toISOString(),
    hotel: i % 2 ? 'فندق روضة البستان' : 'فندق جراند حياة دبي', room: `${3 + (i % 6)}${String(10 + i).padStart(2, '0')}`,
    transportStatus: i % 5 === 0 ? 'pending' : i % 5 === 1 ? 'scheduled' : 'completed', companionCount: i % 3 === 0 ? 1 : 0,
    notes: i % 6 === 0 ? 'يحتاج مرافقه وجبات خاصة' : i % 7 === 0 ? 'وصول متأخر — استقبال ليلي' : undefined,
  }));
}

export function demoPassports(competitionId: string, participants: Participant[], results: ResultRecord[], certificates: Certificate[], judges: JudgeProfile[], committees: Committee[]): { participantPassport: ParticipantPassportEntry[]; judgePassport: JudgePassportEntry[] } {
  const certOf = new Map(certificates.map(c => [c.participantId, c]));
  const participantPassport: ParticipantPassportEntry[] = [];
  results.forEach(r => {
    const cert = certOf.get(r.participantId);
    if (cert) participantPassport.push({ id: `pp-demo-${r.id}`, participantId: r.participantId, competitionId, competitionName: 'MIZAN Demo International Quran Competition 2027', categoryName: r.categoryName, year: '2027', result: `${r.rank} / ${r.finalScore}`, certificateNumber: cert.certificateNumber, verified: true });
  });
  /* سجلٌّ سابق لبعضهم: جوازٌ بصفحةٍ واحدة لا يُري معنى الجواز. */
  participants.filter(p => p.status === 'certified').slice(0, 12).forEach((p, i) => participantPassport.push({ id: `pp-demo-hist-${i + 1}`, participantId: p.id, competitionId: 'comp-demo-2026', competitionName: 'MIZAN Regional Quran Competition 2026', categoryName: 'Ten Juz Memorization', year: '2026', result: `${2 + (i % 5)} / ${(88 + (i % 9) * 1.1).toFixed(2)}`, certificateNumber: `MZN-2026-REG26-${p.code.replace(/[^A-Za-z0-9]/g, '')}`, verified: true }));
  const judgePassport = judges.map(j => {
    const committee = committees.find(c => c.id === j.assignedCommitteeId);
    return { id: `jp-demo-${j.id}`, judgeId: j.userId || j.id, competitionId, competitionName: 'MIZAN Demo International Quran Competition 2027', role: committee?.headJudgeId === j.userId ? 'head_judge' : 'judge', riwayat: j.certifiedRiwayat || ['Hafs'], calibrationScore: j.calibrationScore, completedSessions: committee?.completedCount || 0, verified: true };
  });
  return { participantPassport, judgePassport };
}

export function demoOperationsRecords(organizationId: string, competitionId: string, auditCount: number): { backups: BackupRecord[]; auditLedgerSeals: AuditLedgerSealRecord[]; trainingRuns: TrainingRun[]; quranSourceManifests: QuranSourceManifestRecord[] } {
  const backups: BackupRecord[] = [6, 9, 12, 13].map((hour, i) => ({ id: `bak-demo-${i + 1}`, organizationId, competitionId, createdAt: at(hour, 0), scope: 'competition', checksum: `SHA256:${demoDigest(`backup-${hour}`)}`, status: 'ready', sizeLabel: `${(18.4 + i * 6.3).toFixed(1)} MB` }));
  let previous = 0;
  const auditLedgerSeals: AuditLedgerSealRecord[] = [8, 10, 12, 14].map((hour, i) => {
    const eventCount = Math.round(auditCount * ((i + 1) / 4));
    const row: AuditLedgerSealRecord = { id: `als-demo-${i + 1}`, competitionId, createdAt: at(hour, 0), createdBy: 'usr-demo-admin', eventCount, headHash: demoDigest(`ledger-${previous}-${eventCount}`), firstEventId: `aud-demo-${previous + 1}`, lastEventId: `aud-demo-${eventCount}`, assurance: 'server_hash_chain', verificationState: 'VERIFIED' };
    previous = eventCount;
    return row;
  });
  const trainingRuns: TrainingRun[] = [
    { id: 'trn-demo-1', competitionId, type: 'judge_practice', status: 'completed', startedAt: '2027-02-09T09:00:00Z', score: 94.5, notes: 'معايرة المحكّمين على ثماني تلاوات مرجعية' },
    { id: 'trn-demo-2', competitionId, type: 'operations_dry_run', status: 'completed', startedAt: '2027-02-10T16:00:00Z', score: 91, notes: 'بروفة يوم كامل بمئة متسابق افتراضي' },
    { id: 'trn-demo-3', competitionId, type: 'sandbox', status: 'ready', notes: 'بيئة تدريب للمتطوعين الجدد' },
  ];
  const quranSourceManifests: QuranSourceManifestRecord[] = [{
    id: 'qsm-demo-hafs', organizationId, riwaya: 'Hafs', edition: 'مصحف المدينة النبوية — مجمع الملك فهد', version: '1.0', checksumSha256: demoDigest('kfgqpc-hafs-v1'),
    sourceAuthority: 'مجمع الملك فهد لطباعة المصحف الشريف', reviewerNames: ['د. عبدالرحمن الشهري', 'د. محمد الأنصاري'], status: 'approved', createdAt: '2026-09-01T08:00:00Z', approvedAt: '2026-09-20T08:00:00Z',
    qiraah: 'عاصم', imam: 'عاصم بن أبي النجود', rawi: 'حفص', certificationState: 'CERTIFIED', revocationState: 'ACTIVE', immutable: true,
  }];
  return { backups, auditLedgerSeals, trainingRuns, quranSourceManifests };
}

/*
 * حوكمة الهوية في بيئة العرض: الحسابات والصلاحيات والدعوات وجلسات الدخول.
 *
 * كانت هذه القوائم كلها فارغة، فتقول بطاقة الجهة «0 مستخدمون مفوضون» عن جهةٍ يعمل فيها
 * أربعة وعشرون محكّمًا، ويقول المدقّق «0 حساب نشط، 0 جلسة دخول» فوق سجلٍّ من ثلاثمئة
 * حدث، وتفتح «الفريق والصلاحيات» على لا أحد. والحسابات هنا هي أصحاب الكون نفسه: محكّمو
 * اللجان ورؤساؤها بأسمائهم في `judges`، وطاقم الإدارة بالهويات التي يدخل بها الزائر
 * حين يبدّل الدور (`usr-demo-<role>`) — فلا يرى اسمًا في الفريق لا يجده في اللجنة.
 *
 * وانقطاعات الجلسات هنا كلها محسومة: حادثٌ مفتوح يُظهر لوحة الاستعادة في رأس كل صفحة
 * إدارة، والغرض أن يرى المدقّق أثرها لا أن يُستقبل الزائر بإنذار.
 */
export interface DemoIdentityGovernance {
  identityAccounts: IdentityAccountRecord[];
  roleGrants: RoleGrantRecord[];
  identityInvitations: IdentityInvitationRecord[];
  authSessions: AuthSessionRecord[];
  passReissues: PassReissueRecord[];
  credentialLineages: ParticipantCredentialLineageRecord[];
  sessionCheckpoints: SessionCheckpointRecord[];
  continuityIncidents: ContinuityIncidentRecord[];
  sessionRecoveries: SessionRecoveryRecord[];
}

const STAFF: ReadonlyArray<readonly [Role, string, string]> = [
  ['comp_admin', 'usr-demo-admin', 'مدير المسابقة (تجريبي)'],
  ['org_admin', 'usr-demo-org_admin', 'مدير الجهة (تجريبي)'],
  ['ops_manager', 'usr-demo-ops_manager', 'مدير التشغيل (تجريبي)'],
  ['exception_host', 'usr-demo-exception_host', 'مسؤول الحالات الاستثنائية (تجريبي)'],
  ['delegation_manager', 'usr-demo-delegation_manager', 'مدير الوفد (تجريبي)'],
  ['broadcast_operator', 'usr-demo-broadcast_operator', 'مشغّل البثّ (تجريبي)'],
  ['auditor', 'usr-demo-auditor', 'المدقّق (تجريبي)'],
  ['support_agent', 'usr-demo-support_agent', 'الدعم (تجريبي)'],
];

export function demoIdentityGovernance(
  organizationId: string, competitionId: string, judges: JudgeProfile[], committees: Committee[], participants: Participant[],
): DemoIdentityGovernance {
  const identityAccounts: IdentityAccountRecord[] = [];
  const roleGrants: RoleGrantRecord[] = [];
  const authSessions: AuthSessionRecord[] = [];
  const addAccount = (id: string, displayName: string, email: string, role: Role, committeeId: string | undefined, index: number, online: boolean) => {
    identityAccounts.push({
      id, firebaseUid: id, email, displayName, organizationId, status: 'ACTIVE',
      createdAt: '2027-01-05T09:00:00.000Z', createdBy: 'usr-demo-org_admin', activatedAt: '2027-01-06T10:00:00.000Z',
      lastAuthenticatedAt: at(online ? 7 : 6, (index * 7) % 60), mfaRequired: ['comp_admin', 'org_admin', 'auditor'].includes(role), identityAssurance: 'DEMO',
    });
    roleGrants.push({
      id: `grant-${id}`, accountId: id, role, organizationId, competitionId: role === 'org_admin' ? undefined : competitionId, committeeId,
      status: 'ACTIVE', requestedAt: '2027-01-05T09:00:00.000Z', requestedBy: 'usr-demo-org_admin', approvedAt: '2027-01-05T12:00:00.000Z',
      approvedBy: role === 'org_admin' ? 'usr-demo-admin' : 'usr-demo-org_admin', validFrom: '2027-02-10T00:00:00.000Z', expiresAt: '2027-02-14T23:59:00.000Z',
      reason: committeeId ? 'تكليف تحكيم في مسابقة ٢٠٢٧' : 'فريق تشغيل مسابقة ٢٠٢٧', dualApprovalRequired: ['head_judge', 'auditor'].includes(role),
    });
    authSessions.push({
      id: `auth-${id}`, accountId: id, firebaseUid: id, organizationId, competitionId: role === 'org_admin' ? undefined : competitionId, role,
      deviceId: committeeId ? `dev-demo-tab-${committees.findIndex(c => c.id === committeeId) + 1}` : `dev-demo-staff-${index + 1}`,
      deviceName: committeeId ? `لوحي ${committees.find(c => c.id === committeeId)?.nameArabic || ''}` : 'حاسوب غرفة العمليات',
      openedAt: at(7, (index * 3) % 60), lastSeenAt: at(online ? 13 : 11, online ? 50 + (index % 9) : 20), expiresAt: at(20),
      status: online ? 'ACTIVE' : 'ENDED', authenticationAssurance: ['comp_admin', 'org_admin', 'auditor'].includes(role) ? 'MFA' : 'SINGLE_FACTOR',
      ipHint: `10.20.${1 + (index % 6)}.x`,
    });
  };
  STAFF.forEach(([role, id, name], i) => addAccount(id, name, `demo.${role}@mizan.test`, role, undefined, i, true));
  judges.forEach((judge, i) => {
    const committee = committees.find(c => c.id === judge.assignedCommitteeId);
    const isHead = committee?.headJudgeId === judge.userId;
    addAccount(judge.userId, judge.nameArabic, `${judge.userId.replace('usr-', '')}@demo.mizan.test`, isHead ? 'head_judge' : 'judge', committee?.id, STAFF.length + i, committee?.status !== 'offline');
  });

  const invitation = (index: number, displayName: string, requestedRole: Role, status: IdentityInvitationRecord['status'], committeeId?: string): IdentityInvitationRecord => ({
    id: `inv-demo-${index}`, email: `invite${index}@demo.mizan.test`, displayName, organizationId, requestedRole, competitionId, committeeId, status,
    createdAt: at(6, 10 * index), createdBy: 'usr-demo-admin', approvedAt: status === 'READY' ? at(6, 10 * index + 5) : undefined,
    approvedBy: status === 'READY' ? 'usr-demo-org_admin' : undefined, expiresAt: '2027-02-18T00:00:00.000Z',
  });
  const identityInvitations = [
    invitation(1, 'عبدالرحمن الشمّري', 'judge', 'PENDING_APPROVAL', committees[4]?.id),
    invitation(2, 'حصة العتيبي', 'ops_manager', 'READY'),
    invitation(3, 'يعقوب البلوشي', 'exception_host', 'READY'),
  ];

  const reissued = participants.filter(p => p.checkedInAt).slice(3, 6);
  const reasons: PassReissueRecord['reason'][] = ['LOST', 'DAMAGED', 'NAME_CORRECTION'];
  const checks: PassReissueRecord['identityVerification'][] = ['PHOTO_ID', 'PASSPORT', 'DELEGATION_CONFIRMATION'];
  const passReissues: PassReissueRecord[] = reissued.map((p, i) => ({
    id: `reissue-demo-${i + 1}`, competitionId, participantId: p.id, oldCredentialIds: [`pass-${p.id}-1`], newCredentialId: `pass-${p.id}-2`,
    lineageId: `lineage-${p.id}`, generation: 2, reason: reasons[i], identityVerification: checks[i], requestedAt: at(8, 50 + i * 3),
    requestedBy: 'usr-demo-exception_host', status: 'ISSUED', revocationEpoch: 1,
  }));
  const credentialLineages: ParticipantCredentialLineageRecord[] = reissued.map((p, i) => ({
    id: `lineage-rec-${p.id}`, competitionId, participantId: p.id, lineageId: `lineage-${p.id}`, latestGeneration: 2,
    latestCredentialId: `pass-${p.id}-2`, revocationEpoch: 1, updatedAt: at(8, 50 + i * 3), updatedBy: 'usr-demo-exception_host',
  }));

  /* انقطاعان محسومان: كهرباء في لجنة، وشبكة في أخرى — كلاهما استُؤنف على السؤال نفسه. */
  const tested = participants.filter(p => p.status === 'tested' && p.assignedCommitteeId).slice(0, 2);
  const kinds: ContinuityIncidentRecord['type'][] = ['POWER_LOSS', 'NETWORK_LOSS'];
  const sessionCheckpoints: SessionCheckpointRecord[] = [];
  const continuityIncidents: ContinuityIncidentRecord[] = [];
  const sessionRecoveries: SessionRecoveryRecord[] = [];
  tested.forEach((p, i) => {
    const sessionId = `sess-demo-${p.id}`;
    const committee = committees.find(c => c.id === p.assignedCommitteeId);
    const checkpointId = `cp-demo-${i + 1}`;
    sessionCheckpoints.push({
      id: checkpointId, competitionId, sessionId, participantId: p.id, committeeId: p.assignedCommitteeId!, phase: 'RECITING', questionIndex: 1,
      questionRevealed: true, durationSeconds: 212 + i * 40, eventIds: [], lockedJudgeIds: [], sequence: 4, createdAt: at(10 + i, 12),
      createdBy: committee?.judgeIds[0] || 'usr-demo-admin', checkpointHash: demoDigest(`${checkpointId}|${p.id}`), assurance: 'edge_persisted',
    });
    continuityIncidents.push({
      id: `cont-demo-${i + 1}`, competitionId, sessionId, participantId: p.id, type: kinds[i], occurredAt: at(10 + i, 13),
      reportedBy: committee?.headJudgeId || 'usr-demo-ops_manager', lastCheckpointId: checkpointId, status: 'RESOLVED',
      notes: i === 0 ? 'انقطع التيار عن لوحي اللجنة ٩٠ ثانية، وعاد على الموضع نفسه.' : 'فقد اللوحي الشبكة؛ حُفظ التقدّم على خادم القاعة.',
    });
    sessionRecoveries.push({
      id: `recovery-demo-${i + 1}`, competitionId, sessionId, participantId: p.id, incidentId: `cont-demo-${i + 1}`, checkpointId,
      decision: 'RESUME_SAME_SESSION_SAME_QUESTION', reason: 'استئناف من آخر نقطة محفوظة دون كشف سؤال جديد', preserveRevealedQuestion: true,
      preserveLockedJudgeSubmissions: true, createdAt: at(10 + i, 15), createdBy: 'usr-demo-ops_manager',
      approvedByHeadJudge: committee?.headJudgeId, status: 'APPLIED',
    });
  });

  return { identityAccounts, roleGrants, identityInvitations, authSessions, passReissues, credentialLineages, sessionCheckpoints, continuityIncidents, sessionRecoveries };
}
