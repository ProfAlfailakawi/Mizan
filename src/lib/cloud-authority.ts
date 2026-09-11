/*
 * سلطة السحابة: من يغلب حين تختلف نسختان؟
 *
 * الأصل هو السحابة، والمحلّي احتياطٌ لما لم يصلها بعد. وهذه الوحدة تكتب تلك القاعدة
 * صراحةً ونقيّة — بلا فايرستور ولا حالةٍ عامّة ولا متصفّح — لسببٍ واحد: أن تُختبر بتشغيلها
 * لا بقراءتها. فالخطأ هنا لا يُحدث رسالةً حمراء، بل يُخفي عمل محكّمٍ أو مدير بصمت، ولا
 * يُكتشف إلا يوم المسابقة حين يجلس أمام اللجنة متسابقٌ درجاته اختفت.
 *
 * السجلّ يحمل ما غيّره هذا الجهاز ولم يصل بعد: بحمولته، ووقت تغييره، والمسابقة التي
 * يخصّها — فلا يُكتب معلَّقٌ من مسابقةٍ في مسار أخرى.
 */

export type PendingScope = { organizationId: string; competitionId: string };
export type PendingWrite = PendingScope & { collection: string; id: string; rowId: string; markedAt: number; data: Record<string, unknown> };
export type PendingDelete = PendingScope & { collection: string; id: string; markedAt: number };

export const pendingKey = (collection: string, id: string, competitionId: string) => `${competitionId}/${collection}/${id}`;
export const sameScope = (a: PendingScope, b: PendingScope) => a.competitionId === b.competitionId && a.organizationId === b.organizationId;

/*
 * سجلّ المعلَّق.
 *
 * يُنشأ لكل جهاز واحد. عمدًا صنفٌ لا متغيّراتٌ متفرّقة: الاختبار يُنشئ منه اثنين فيحاكي
 * جهازين حقيقيين، وهو ما لا يمكن بمتغيّرٍ عامّ واحد.
 */
export class PendingRegister {
  private writes = new Map<string, PendingWrite>();
  private deletes = new Map<string, PendingDelete>();

  get size() { return this.writes.size + this.deletes.size; }
  listWrites(): PendingWrite[] { return [...this.writes.values()]; }
  listDeletes(): PendingDelete[] { return [...this.deletes.values()]; }

  /** التغيير الأحدث يحلّ محلّ سابقه، ووقت **أوّل** تغييرٍ غير مرفوع هو ما يُقارَن بالسحابة. */
  markWrite(scope: PendingScope, collection: string, id: string, data: Record<string, unknown>, now = Date.now()) {
    const key = pendingKey(collection, id, scope.competitionId);
    const rowId = typeof data?.id === 'string' ? data.id : id;
    const existing = this.writes.get(key);
    this.writes.set(key, { ...scope, collection, id, rowId, markedAt: existing?.markedAt ?? now, data });
  }
  clearWrite(scope: PendingScope, collection: string, id: string) {
    return this.writes.delete(pendingKey(collection, id, scope.competitionId));
  }
  /** حذفٌ يُسجَّل قبل الشبكة، فإن لم يصل لا يعود المحذوف يظهر في كل لقطة. */
  markDelete(scope: PendingScope, collection: string, id: string, now = Date.now()) {
    this.writes.delete(pendingKey(collection, id, scope.competitionId));
    this.deletes.set(pendingKey(collection, id, scope.competitionId), { ...scope, collection, id, markedAt: now });
  }
  clearDelete(scope: PendingScope, collection: string, id: string) {
    return this.deletes.delete(pendingKey(collection, id, scope.competitionId));
  }

  /** هل لهذا الصفّ تغييرٌ محليّ لم يُرفع؟ يُسأل بمعرّف الصفّ لا بمعرّف الوثيقة. */
  rowHasWrite(scope: PendingScope, collection: string, rowId: string) {
    for (const e of this.writes.values()) if (e.collection === collection && e.rowId === rowId && sameScope(e, scope)) return true;
    return false;
  }
  rowHasDelete(scope: PendingScope, collection: string, rowId: string) {
    for (const e of this.deletes.values()) if (e.collection === collection && e.id === rowId && sameScope(e, scope)) return true;
    return false;
  }

  serialize() { return JSON.stringify({ writes: this.listWrites(), deletes: this.listDeletes() }); }
  /** سجلٌّ تالف لا يمنع الإقلاع: ما لا يُفهم يُتجاهل، وما يُفهم يُستأنف. */
  static deserialize(raw: string | null): PendingRegister {
    const register = new PendingRegister();
    if (!raw) return register;
    try {
      const parsed = JSON.parse(raw) as { writes?: PendingWrite[]; deletes?: PendingDelete[] };
      for (const w of parsed.writes || []) {
        if (!w?.collection || !w?.id || !w?.competitionId) continue;
        register.writes.set(pendingKey(w.collection, w.id, w.competitionId), { ...w, rowId: w.rowId || w.id });
      }
      for (const d of parsed.deletes || []) {
        if (!d?.collection || !d?.id || !d?.competitionId) continue;
        register.deletes.set(pendingKey(d.collection, d.id, d.competitionId), d);
      }
    } catch { /* تالف */ }
    return register;
  }
}

/*
 * قرار الرفع.
 *
 * إن كانت نسخة السحابة أحدث من تغييرنا فقد سبقنا إليها غيرنا: يُترك الأصل ويُسقَط
 * المعلَّق. وتساوي الطابعين ليس سبقًا — هي كتابتنا نفسها عائدةً إلينا.
 */
export type UploadDecision = 'upload' | 'drop-cloud-is-newer' | 'drop-not-writable' | 'skip-other-competition';

export function decideUpload(entry: PendingWrite, options: {
  scope: PendingScope;
  canWrite: (collection: string) => boolean;
  cloudUpdatedAt: number;
}): UploadDecision {
  if (!sameScope(entry, options.scope)) return 'skip-other-competition';
  if (!options.canWrite(entry.collection)) return 'drop-not-writable';
  if (options.cloudUpdatedAt && options.cloudUpdatedAt > entry.markedAt) return 'drop-cloud-is-newer';
  return 'upload';
}

/** الوثيقة الأمّ للمسابقة: لا يُكتب فوق الأصل بما هو أقدم منه. */
export function configWriteAllowed(cloudUpdatedAt: number, localUpdatedAt: number) {
  if (!cloudUpdatedAt || !localUpdatedAt) return true;
  return cloudUpdatedAt <= localUpdatedAt;
}

/*
 * الدمج الوارد.
 *
 * السحابة تغلب على كل صفّ — إلا صفًّا غيّره هذا الجهاز ولم يُرفع بعد (وإلا مُحي تغييره من
 * الشاشة قبل أن يُكتب)، وإلا صفًّا حُذف محليًّا ولم يصل حذفه (وإلا عاد المحذوف يظهر).
 */
export function mergeRowsFromCloud<T extends { id: string }>(
  local: T[],
  remote: T[],
  guards?: { isPendingWrite: (rowId: string) => boolean; isPendingDelete: (rowId: string) => boolean },
): T[] {
  const byId = new Map<string, T>(local.map(x => [x.id, x]));
  for (const row of remote) {
    if (!row || typeof row.id !== 'string') continue;
    if (guards?.isPendingDelete(row.id)) continue;
    if (guards?.isPendingWrite(row.id) && byId.has(row.id)) continue;
    byId.set(row.id, { ...(byId.get(row.id) || {} as T), ...row });
  }
  return [...byId.values()];
}

/*
 * النتيجة لها سلطةٌ فوق ذلك: المختوم لا يتراجع مهما كان المحليّ. والحارس المحليّ لا يعمل
 * إلا عند تساوي الرتبة — وإلا لحُبست نتيجةٌ ختمها الخادم خلف مسوّدةٍ على جهاز.
 */
export function mergeRankedFromCloud<T extends { id: string; status: string }>(
  local: T[],
  remote: T[],
  rank: Record<string, number>,
  isPendingWrite: (rowId: string) => boolean = () => false,
): T[] {
  const byId = new Map<string, T>(local.map(r => [r.id, r]));
  for (const row of remote) {
    const current = byId.get(row.id);
    if (!current) { byId.set(row.id, row); continue; }
    const remoteRank = rank[row.status] ?? 0, localRank = rank[current.status] ?? 0;
    if (remoteRank === localRank && isPendingWrite(row.id)) continue;
    byId.set(row.id, remoteRank >= localRank ? row : current);
  }
  return [...byId.values()];
}
