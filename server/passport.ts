/*
 * MIZAN Passport — سجلٌّ اختياري يملكه المتسابق لمشاركاته الموثّقة.
 *
 * المبادئ:
 *  - لا حساب ولا ملف اجتماعي: جواز برمزٍ سرّي يحمله صاحبه (كرابط الرحلة)، ولا يُنشأ إلا بطلبه.
 *  - لا يدخل الجوازَ إلا ما يثبته الخادم: مشاركةٌ برمز رحلة المتسابق نفسه، وشهادةٌ يُتحقق منها
 *    من سجل الشهادات العام (بصمة الحزمة وبرهان ميركل) وتطابق رمز المتسابق والمسابقة.
 *  - خاصٌّ افتراضًا. العرض العام بقرار صاحبه، ويُعاد التحقق من كل شهادة عند كل عرض، فشهادةٌ
 *    أُبطلت لاحقًا تظهر «مُبطلة» لا «موثّقة».
 *  - يُحذف كاملًا بطلب صاحبه، بلا أثر إلا عدّاد تدقيق.
 *  - مشاركة واحدة لا تُربط بأكثر من جواز.
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export interface PassportEntry {
  id: string;
  /** بصمة مسار المتسابق — تمنع ربط المشاركة نفسها بجوازين، ولا تكشف المسار. */
  participationKey: string;
  competitionId: string;
  competitionName: string;
  competitionNameArabic?: string;
  organizationName?: string;
  year?: number;
  categoryName?: string;
  riwaya?: string;
  kind: 'certificate' | 'participation';
  certificateNumber?: string;
  rank?: number;
  finalScore?: number;
  addedAt: string;
}

export interface PassportRecord {
  id: string;
  holderTokenHash: string;
  displayName: string;
  languages: string[];
  visibility: 'private' | 'public';
  entries: PassportEntry[];
  createdAt: string;
  updatedAt: string;
}

export type CertificateCheck = (number: string) => { state: 'AUTHENTIC' | 'REVOKED' | 'INVALID_PROOF' | 'NOT_FOUND'; competitionId?: string; participantCode?: string; rank?: number; finalScore?: number; categoryName?: string; organizationName?: string; issuedAt?: string };

const sha = (v: string) => crypto.createHash('sha256').update(v).digest('hex');
const clean = (v: unknown, max = 120) => String(v ?? '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, max);
const LANG = /^[a-z]{2,3}(-[A-Z]{2})?$/;
const MAX_ENTRIES = 200;

export const validPassportToken = (t: string) => /^mz_passport_[A-Za-z0-9_-]{43}$/.test(t);
export const validPassportId = (t: string) => /^pp_[A-Za-z0-9_-]{22}$/.test(t);

export class PassportStore {
  constructor(private file: string, private clock: () => number = () => Date.now()) {
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  }
  private read(): PassportRecord[] { try { return JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch { return []; } }
  private write(rows: PassportRecord[]) { const tmp = `${this.file}.${process.pid}.tmp`; fs.writeFileSync(tmp, JSON.stringify(rows), { mode: 0o600 }); fs.renameSync(tmp, this.file); }
  private now() { return new Date(this.clock()).toISOString(); }

  private byToken(rows: PassportRecord[], token: string) {
    if (!validPassportToken(token)) throw new Error('PASSPORT_TOKEN_INVALID');
    const h = sha(token);
    const p = rows.find(r => r.holderTokenHash.length === h.length && crypto.timingSafeEqual(Buffer.from(r.holderTokenHash), Buffer.from(h)));
    if (!p) throw new Error('PASSPORT_NOT_FOUND');
    return p;
  }

  create(displayName?: string) {
    const rows = this.read();
    const token = `mz_passport_${crypto.randomBytes(32).toString('base64url')}`;
    const t = this.now();
    const p: PassportRecord = { id: `pp_${crypto.randomBytes(16).toString('base64url')}`, holderTokenHash: sha(token), displayName: clean(displayName, 80), languages: [], visibility: 'private', entries: [], createdAt: t, updatedAt: t };
    rows.push(p);
    this.write(rows);
    return { passport: this.ownerView(p), token };
  }

  /**
   * إضافة مشاركة ثبتت على الخادم. المُنادي (المسار) يتحقق من رمز الرحلة ويشتق هويّة المشاركة؛
   * وهنا يُتحقق من الشهادة ومطابقتها، ويُمنع ربط المشاركة بجواز آخر.
   */
  addEntry(token: string, input: { participationPath: string; participantCode: string; competitionId: string; competitionName: string; competitionNameArabic?: string; organizationName?: string; year?: number; categoryName?: string; riwaya?: string; certificateNumber?: string }, check: CertificateCheck) {
    const rows = this.read();
    const p = this.byToken(rows, token);
    const participationKey = sha(`participation:${input.participationPath}`);
    const owner = rows.find(r => r.entries.some(e => e.participationKey === participationKey));
    if (owner && owner.id !== p.id) throw new Error('PASSPORT_ENTRY_CLAIMED_ELSEWHERE');
    if (p.entries.length >= MAX_ENTRIES) throw new Error('PASSPORT_FULL');
    let kind: PassportEntry['kind'] = 'participation', certificateNumber: string | undefined, rank: number | undefined, finalScore: number | undefined, categoryName = clean(input.categoryName), organizationName = clean(input.organizationName);
    const number = clean(input.certificateNumber, 120);
    if (number) {
      const v = check(number);
      /* شهادةٌ لا تخصّ هذه المسابقة وهذا المتسابق لا تُقبل أبدًا، ولو كانت صحيحة. */
      if (v.state === 'AUTHENTIC' && v.competitionId === input.competitionId && v.participantCode === input.participantCode) {
        kind = 'certificate'; certificateNumber = number; rank = v.rank; finalScore = v.finalScore;
        categoryName = clean(v.categoryName) || categoryName; organizationName = clean(v.organizationName) || organizationName;
      } else if (v.state !== 'NOT_FOUND' && v.state !== 'AUTHENTIC') {
        throw new Error(`PASSPORT_CERTIFICATE_${v.state}`);
      }
    }
    const entry: PassportEntry = {
      id: `pe_${crypto.randomBytes(9).toString('base64url')}`, participationKey, competitionId: clean(input.competitionId), competitionName: clean(input.competitionName, 160),
      competitionNameArabic: clean(input.competitionNameArabic, 160) || undefined, organizationName: organizationName || undefined,
      year: Number.isInteger(input.year) ? input.year : undefined, categoryName: categoryName || undefined, riwaya: clean(input.riwaya, 60) || undefined,
      kind, certificateNumber, rank, finalScore, addedAt: this.now(),
    };
    const existing = p.entries.findIndex(e => e.participationKey === participationKey);
    /* إعادة الإضافة تُحدِّث السجل (مثلًا حين تصدر الشهادة بعد المشاركة) ولا تكرّره. */
    if (existing >= 0) { entry.id = p.entries[existing].id; p.entries[existing] = entry; } else p.entries.push(entry);
    p.updatedAt = this.now();
    this.write(rows);
    return { passport: this.ownerView(p), entry };
  }

  update(token: string, patch: { displayName?: string; languages?: string[]; visibility?: 'private' | 'public' }) {
    const rows = this.read();
    const p = this.byToken(rows, token);
    if (patch.displayName !== undefined) p.displayName = clean(patch.displayName, 80);
    if (patch.languages !== undefined) p.languages = [...new Set((Array.isArray(patch.languages) ? patch.languages : []).map(x => clean(x, 10)).filter(x => LANG.test(x)))].slice(0, 10);
    if (patch.visibility !== undefined) {
      if (patch.visibility !== 'private' && patch.visibility !== 'public') throw new Error('PASSPORT_VISIBILITY_INVALID');
      if (patch.visibility === 'public' && !p.displayName) throw new Error('PASSPORT_DISPLAY_NAME_REQUIRED');
      p.visibility = patch.visibility;
    }
    p.updatedAt = this.now();
    this.write(rows);
    return this.ownerView(p);
  }

  removeEntry(token: string, entryId: string) {
    const rows = this.read();
    const p = this.byToken(rows, token);
    const before = p.entries.length;
    p.entries = p.entries.filter(e => e.id !== entryId);
    if (p.entries.length === before) throw new Error('PASSPORT_ENTRY_NOT_FOUND');
    p.updatedAt = this.now();
    this.write(rows);
    return this.ownerView(p);
  }

  erase(token: string) {
    const rows = this.read();
    const p = this.byToken(rows, token);
    this.write(rows.filter(r => r.id !== p.id));
    return true;
  }

  owner(token: string) { return this.ownerView(this.byToken(this.read(), token)); }

  /** العرض العام: فقط إن اختار صاحبه النشر، ومع حكم تحقق حيّ لكل شهادة. */
  publicView(id: string, check: CertificateCheck) {
    if (!validPassportId(id)) return null;
    const p = this.read().find(r => r.id === id);
    if (!p || p.visibility !== 'public') return null;
    return {
      id: p.id, displayName: p.displayName, languages: p.languages, updatedAt: p.updatedAt,
      entries: p.entries.map(e => ({ ...this.publicEntry(e), verification: e.certificateNumber ? check(e.certificateNumber).state : 'participation_confirmed' as const })),
    };
  }

  private publicEntry(e: PassportEntry) { const { participationKey: _k, ...rest } = e; return rest; }
  private ownerView(p: PassportRecord) { return { id: p.id, displayName: p.displayName, languages: p.languages, visibility: p.visibility, entries: p.entries.map(e => this.publicEntry(e)), createdAt: p.createdAt, updatedAt: p.updatedAt }; }
}
