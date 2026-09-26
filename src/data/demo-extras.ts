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
  ResultRecord, TrainingRun,
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
