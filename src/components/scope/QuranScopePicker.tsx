import React, { useEffect, useMemo, useState } from 'react';
import { BookOpen, Check, ChevronDown, Layers, ListChecks, MapPin, Search, Sparkles, Trash2, X } from 'lucide-react';
import {
  QURAN_HIZB_TOTAL, QURAN_JUZ_TOTAL, QURAN_SURAH_TOTAL, ayahCountOf, juzBounds, juzOfLocus, surahNameArabic, surahNameEnglish,
} from '../../lib/quran-canon';
import {
  SCOPE_PRESETS, describeScope, describeSegment, emptyScope, makeScope, normalizeScope, scopeAyahCount,
  scopeFromJuz, scopeFromSurahs, scopeFromUnits, scopeMetrics, scopeSubtract, scopeUnion, validateScope,
  type QuranScope, type QuranScopeSegment,
} from '../../lib/quran-scope';
import { coveredUnitIndexes, touchedUnitIndexes } from '../../lib/participant-scope';
import { Button } from '../design-system/Button';

/*
 * مُنتقي نطاق الحفظ.
 *
 * الشاشة الواحدة تخدم طرفين: منظّمًا يرسم نطاق فئة، ومتسابقًا يختار نطاق حفظه. ولذلك تبدأ
 * بسيطةً — اختصارات وشبكة أجزاء — ولا تكشف المقاطع وحدود الآيات إلا لمن طلبها.
 *
 * والاختصارات أسماء لا أنواع: «القرآن كاملًا» لا يفعل شيئًا سوى بناء نطاقٍ يغطي المصحف،
 * ويبقى قابلًا للتعديل بعدها. ولا يوجد في الكود فرعٌ يتصرّف بحسب اسم الاختصار.
 */

export interface ScopeHeat { juz: number; participants: number; pressure: number }

export interface QuranScopePickerProps {
  value: QuranScope;
  onChange: (scope: QuranScope) => void;
  arabic: boolean;
  /** المظلّة المسموح الاختيار من داخلها. ما خرج عنها يُعرض معطّلًا لا مخفيًا. */
  parentScope?: QuranScope;
  disabled?: boolean;
  /** قراءة فقط: يعرض النطاق دون السماح بتغييره. */
  readOnly?: boolean;
  /** حرارة التسجيل لكل جزء — تُعرض للمنظّم لا للمتسابق. */
  heat?: ScopeHeat[];
  idPrefix?: string;
}

type AyahRange = readonly [number, number];

/**
 * إذا كان النطاق الحالي مكوّنًا من أجزاء كاملة فقط، نحفظ «مظلّة الأجزاء» مستقلة عن
 * المقاطع الدقيقة. بهذه الطريقة لا يضيع حدّ الجزء بعد أول تعديل لآية داخل حدوده.
 */
function exactJuzGuard(scope: QuranScope): QuranScope | null {
  const normalized = normalizeScope(scope);
  const m = scopeMetrics(normalized);
  if (!m.fullJuz.length || m.partialJuz.length) return null;
  const built = scopeFromJuz(m.fullJuz);
  const same = scopeAyahCount(scopeSubtract(normalized, built)) === 0 && scopeAyahCount(scopeSubtract(built, normalized)) === 0;
  return same ? built : null;
}

function ayahRangesWithin(scope: QuranScope | null, surah: number): AyahRange[] {
  if (!scope) return [[1, ayahCountOf(surah)]];
  const ranges: AyahRange[] = [];
  for (const segment of normalizeScope(scope).segments) {
    if (surah < segment.start.surah || surah > segment.end.surah) continue;
    const from = segment.start.surah === surah ? segment.start.ayah : 1;
    const to = segment.end.surah === surah ? segment.end.ayah : ayahCountOf(surah);
    if (from <= to) ranges.push([from, to]);
  }
  return ranges;
}

function clampToRanges(value: number, ranges: AyahRange[]): number {
  if (!ranges.length) return 1;
  for (const [from, to] of ranges) if (value >= from && value <= to) return value;
  let best = ranges[0][0], distance = Math.abs(value - best);
  for (const [from, to] of ranges) {
    for (const candidate of [from, to]) {
      const d = Math.abs(value - candidate);
      if (d < distance) { best = candidate; distance = d; }
    }
  }
  return best;
}

const cellTone = (selected: boolean, allowed: boolean) =>
  !allowed ? 'border-[#e6e4dd] bg-[#f4f2ec] text-[#b3b1a9] cursor-not-allowed'
    : selected ? 'border-[#214C40] bg-[#214C40] text-white shadow-[inset_0_1px_0_rgba(255,255,255,.18)]'
      : 'border-[#dcdad2] bg-white text-[#39423d] hover:border-[#2F6555] hover:bg-[#f2f7f4]';

export const QuranScopePicker: React.FC<QuranScopePickerProps> = ({ value, onChange, arabic, parentScope, disabled, readOnly, heat, idPrefix = 'scope' }) => {
  const [advanced, setAdvanced] = useState(false);
  const [rangeAnchor, setRangeAnchor] = useState<number | null>(null);
  const [surahQuery, setSurahQuery] = useState('');
  const [surahOpen, setSurahOpen] = useState(false);
  const [juzGuard, setJuzGuard] = useState<QuranScope | null>(() => exactJuzGuard(normalizeScope(value)));
  const [rangeError, setRangeError] = useState('');

  const scope = normalizeScope(value);
  const metrics = useMemo(() => scopeMetrics(scope), [scope]);
  const selectedJuz = useMemo(() => new Set(touchedUnitIndexes(scope, 'juz')), [scope]);
  const completeJuz = useMemo(() => new Set(coveredUnitIndexes(scope, 'juz')), [scope]);
  const allowedJuz = useMemo(() => (parentScope && scopeAyahCount(parentScope) > 0 ? new Set(touchedUnitIndexes(parentScope, 'juz')) : null), [parentScope]);
  const selectedSurahs = useMemo(() => new Set(coveredUnitIndexes(scope, 'surah')), [scope]);
  /* الحزب والسور وحدتا تحديد كاملتان إلى جانب الجزء: بعض المسابقات تُعلن نطاقها بالأحزاب،
     وبعضها — نادرًا — بالسور. الجدول قائم في المصحف، فلا داعي لأن تُترجم اللجنة حزبها إلى آيات. */
  const selectedHizb = useMemo(() => new Set(coveredUnitIndexes(scope, 'hizb')), [scope]);
  const touchedHizb = useMemo(() => new Set(touchedUnitIndexes(scope, 'hizb')), [scope]);
  const allowedHizb = useMemo(() => (parentScope && scopeAyahCount(parentScope) > 0 ? new Set(touchedUnitIndexes(parentScope, 'hizb')) : null), [parentScope]);
  const locked = !!disabled || !!readOnly;
  const heatByJuz = useMemo(() => new Map<number, ScopeHeat>((heat || []).map(h => [h.juz, h] as const)), [heat]);
  const maxHeat = useMemo(() => Math.max(1, ...(heat || []).map(h => h.participants)), [heat]);
  const guardMetrics = useMemo(() => juzGuard ? scopeMetrics(juzGuard) : null, [juzGuard]);
  const guardSurahs = useMemo(() => guardMetrics ? new Set(guardMetrics.surahs) : null, [guardMetrics]);

  // عند الانتقال إلى فئة أخرى لا تحمل قيود الجزء القديم معها.
  useEffect(() => { setJuzGuard(exactJuzGuard(normalizeScope(value))); setRangeError(''); }, [idPrefix]);

  const emit = (next: QuranScope) => { if (!locked) onChange(normalizeScope(next)); };
  const clipToParent = (next: QuranScope) => (parentScope && scopeAyahCount(parentScope) > 0 ? scopeSubtract(next, scopeSubtract(next, parentScope)) : next);
  const emitJuzSelection = (next: QuranScope) => {
    const clipped = clipToParent(next);
    setJuzGuard(exactJuzGuard(clipped));
    setRangeError('');
    emit(clipped);
  };

  const toggleJuz = (juz: number, withRange: boolean) => {
    if (locked || (allowedJuz && !allowedJuz.has(juz))) return;
    if (withRange && rangeAnchor !== null) {
      const from = Math.min(rangeAnchor, juz), to = Math.max(rangeAnchor, juz);
      const list = Array.from({ length: to - from + 1 }, (_, i) => from + i).filter(n => !allowedJuz || allowedJuz.has(n));
      emitJuzSelection(scopeUnion(scope, scopeFromJuz(list)));
      setRangeAnchor(null);
      return;
    }
    setRangeAnchor(juz);
    emitJuzSelection(completeJuz.has(juz) ? scopeSubtract(scope, scopeFromJuz([juz])) : scopeUnion(scope, scopeFromJuz([juz])));
  };

  const toggleHizb = (hizb: number) => {
    if (locked || (allowedHizb && !allowedHizb.has(hizb))) return;
    const unit = scopeFromUnits('hizb', [hizb]);
    const next = selectedHizb.has(hizb) ? scopeSubtract(scope, unit) : scopeUnion(scope, unit);
    setJuzGuard(exactJuzGuard(clipToParent(next)));
    setRangeError('');
    emit(clipToParent(next));
  };

  const toggleSurah = (surah: number) => {
    if (locked) return;
    setRangeError('');
    const wholeSurah=scopeFromSurahs([surah]);
    if(juzGuard){
      // في وضع الجزء، «اختيار بالسور» يعني الجزء الواقع من السورة داخل الجزء المختار فقط.
      // لا يجوز لسورة حدودية (مثل البقرة) أن توسّع النطاق خلسةً إلى جزءٍ آخر.
      const bounded=scopeSubtract(wholeSurah,scopeSubtract(wholeSurah,juzGuard));
      const boundedSelected=scopeAyahCount(bounded)>0&&scopeAyahCount(scopeSubtract(bounded,scope))===0;
      emit(boundedSelected?scopeSubtract(scope,bounded):scopeUnion(scope,bounded));
      return;
    }
    emit(clipToParent(selectedSurahs.has(surah) ? scopeSubtract(scope, wholeSurah) : scopeUnion(scope, wholeSurah)));
  };

  const updateSegment = (index: number, patch: Partial<QuranScopeSegment>) => {
    const segments = scope.segments.map((segment, i) => (i === index ? { ...segment, ...patch } : segment));
    emit(makeScope(segments));
  };
  const removeSegment = (index: number) => { setRangeError(''); emit(makeScope(scope.segments.filter((_, i) => i !== index))); };
  const addSegment = () => {
    const first = juzGuard ? scopeMetrics(juzGuard).firstLocus : null;
    const start = first || { surah: 1, ayah: 1 };
    const ranges = ayahRangesWithin(juzGuard, start.surah);
    const end = { surah: start.surah, ayah: Math.min(ranges[0]?.[1] || ayahCountOf(start.surah), start.ayah + 6) };
    setRangeError('');
    emit(makeScope([...scope.segments, { start, end }]));
  };

  const editableSurahs = useMemo(
    () => Array.from({ length: QURAN_SURAH_TOTAL }, (_, i) => i + 1).filter(surah => !guardSurahs || guardSurahs.has(surah)),
    [guardSurahs],
  );
  const surahOptions = useMemo(() => {
    const query = surahQuery.trim();
    return editableSurahs.filter(surah => {
      if (!query) return true;
      const name = arabic ? surahNameArabic(surah) : surahNameEnglish(surah);
      return name.includes(query) || String(surah) === query;
    });
  }, [surahQuery, arabic, editableSurahs]);
  const guardLabel = guardMetrics?.fullJuz.length
    ? (arabic ? `الجزء ${guardMetrics.fullJuz.join('، ')}` : `juz ${guardMetrics.fullJuz.join(', ')}`)
    : '';
  const reportOutOfGuard = (surah: number, attempted: number, ranges: AyahRange[]) => {
    const max = ayahCountOf(surah);
    if (attempted < 1 || attempted > max) {
      setRangeError(arabic
        ? `الآية ${attempted} خارج سورة ${surahNameArabic(surah)}؛ آخر آية في السورة هي ${max}.`
        : `Ayah ${attempted} is outside Surat ${surahNameEnglish(surah)}; the surah ends at ${max}.`);
      return;
    }
    const actualJuz = juzOfLocus({ surah, ayah: attempted });
    const allowed = ranges.map(([a, b]) => a === b ? `${a}` : `${a}–${b}`).join('، ');
    setRangeError(arabic
      ? `الآية ${attempted} من سورة ${surahNameArabic(surah)} تقع في الجزء ${actualJuz} وهي خارج ${guardLabel} المحدد. المسموح داخل السورة ضمن النطاق المحدد: ${allowed}.`
      : `Ayah ${attempted} of Surat ${surahNameEnglish(surah)} is in juz ${actualJuz}, outside the selected ${guardLabel}. Allowed here: ${allowed}.`);
  };

  const issues = validateScope(scope);

  return (
    <div className="space-y-4">
      {/* الاختصارات: أسماء بشرية تبني نطاقًا عاديًا قابلًا للتعديل */}
      {!readOnly && (
        <div>
          <div className="mizan-kicker mb-2">{arabic ? 'اختصارات' : 'SHORTCUTS'}</div>
          <div className="flex flex-wrap gap-2">
            {SCOPE_PRESETS.map(preset => {
              const built = preset.build();
              const active = scopeAyahCount(scopeSubtract(built, scope)) === 0 && scopeAyahCount(scopeSubtract(scope, built)) === 0;
              return (
                <button key={preset.id} type="button" disabled={locked} onClick={() => { const clipped = clipToParent(built); setJuzGuard(exactJuzGuard(clipped)); setRangeError(''); emit(clipped); }} aria-pressed={active}
                  className={`min-h-10 rounded-xl border px-3.5 text-xs font-black transition disabled:opacity-45 ${active ? 'border-[#214C40] bg-[#E7EEE9] text-[#214C40]' : 'border-[#dcdad2] bg-white text-[#5b6460] hover:bg-[#f4f2ec]'}`}>
                  {arabic ? preset.ar : preset.en}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* شبكة الأجزاء الثلاثين */}
      <div>
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="mizan-kicker">{arabic ? 'الأجزاء' : 'JUZ'}</div>
          {!readOnly && <p className="text-[10px] text-[#696f6b]">{arabic ? 'اضغط جزءًا لإضافته، ثم اضغط آخر مع الاستمرار على Shift لاختيار ما بينهما.' : 'Tap a juz to add it, then Shift-tap another to take the range between them.'}</p>}
        </div>
        <div className="grid grid-cols-5 sm:grid-cols-6 lg:grid-cols-10 gap-1.5" role="group" aria-label={arabic ? 'اختيار الأجزاء' : 'Select juz'}>
          {Array.from({ length: QURAN_JUZ_TOTAL }, (_, i) => i + 1).map(juz => {
            const complete = completeJuz.has(juz), partial = !complete && selectedJuz.has(juz);
            const allowed = !allowedJuz || allowedJuz.has(juz);
            const row = heatByJuz.get(juz);
            return (
              <button key={juz} type="button" id={`${idPrefix}-juz-${juz}`} disabled={locked || !allowed}
                aria-pressed={complete || partial}
                aria-label={arabic ? `الجزء ${juz}${partial ? ' (جزئي)' : ''}${row ? ` — ${row.participants} متسابقًا` : ''}` : `Juz ${juz}${partial ? ' (partial)' : ''}`}
                onClick={e => toggleJuz(juz, (e as unknown as { shiftKey?: boolean }).shiftKey === true)}
                className={`relative min-h-12 rounded-xl border text-sm font-black tabular-nums transition ${cellTone(complete, allowed)} ${partial ? '!border-[#9b7542] !bg-[#F2EADC] !text-[#7d5e34]' : ''}`}>
                <span>{juz}</span>
                {partial && <span className="absolute inset-x-2 bottom-1 text-[8px] font-bold">{arabic ? 'جزئي' : 'part'}</span>}
                {row && row.participants > 0 && (
                  <span aria-hidden="true" className="absolute inset-x-1.5 bottom-1 h-1 rounded-full bg-current opacity-30">
                    <span className="block h-1 rounded-full bg-current" style={{ width: `${Math.round((row.participants / maxHeat) * 100)}%` }} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {!readOnly && (
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" variant="ghost" disabled={locked} onClick={() => emitJuzSelection(scopeFromJuz(Array.from({ length: QURAN_JUZ_TOTAL }, (_, i) => i + 1)))} icon={<ListChecks className="w-4 h-4" />}>
              {arabic ? 'تحديد الكل' : 'Select all'}
            </Button>
            <Button size="sm" variant="ghost" disabled={locked || !scope.segments.length} onClick={() => { setJuzGuard(null); setRangeError(''); emit(emptyScope()); }} icon={<X className="w-4 h-4" />}>
              {arabic ? 'إلغاء التحديد' : 'Deselect all'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAdvanced(v => !v)} icon={advanced ? <ChevronDown className="w-4 h-4" /> : <Layers className="w-4 h-4" />}>
              {advanced ? (arabic ? 'إخفاء التفاصيل الدقيقة' : 'Hide fine detail') : (arabic ? 'أحزاب وسور ومقاطع' : 'Hizb, surahs and segments')}
            </Button>
          </div>
        )}
      </div>

      {/* التفاصيل الدقيقة: سور ومقاطع بحدود آيات */}
      {advanced && !readOnly && (
        <div className="space-y-4 rounded-2xl border border-[#e4e2da] bg-[#fbfaf7] p-4">
          {juzGuard && guardMetrics && (
            <div className="rounded-xl border border-[#cddbd3] bg-[#F7FAF8] px-3 py-2 text-[10px] font-bold leading-5 text-[#214C40]">
              {arabic
                ? `التفاصيل الدقيقة مقيدة بـ ${guardLabel}. السور والآيات الخارجة عن الجزء المحدد مخفية ولن يقبلها النظام.`
                : `Fine editing is constrained to the selected ${guardLabel}. Out-of-range surahs and ayat are hidden and rejected.`}
            </div>
          )}
          {rangeError && <div role="alert" className="rounded-xl border border-[#e0c6c1] bg-[#F9F0EE] px-3 py-2 text-[11px] font-bold leading-5 text-[#8a3f34]">{rangeError}</div>}
          <div>
            <div className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-2 text-xs font-black text-[#39423d]"><Layers className="w-4 h-4" />{arabic ? 'اختيار بالأحزاب' : 'By hizb'}</span>
              <span className="text-[10px] font-bold text-[#696f6b]">{selectedHizb.size ? (arabic ? `${selectedHizb.size} حزبًا كاملًا` : `${selectedHizb.size} complete`) : (arabic ? 'لا شيء' : 'none')}</span>
            </div>
            <div className="mt-2 grid grid-cols-6 gap-1 sm:grid-cols-10 lg:grid-cols-12" role="group" aria-label={arabic ? 'اختيار الأحزاب' : 'Select hizb'}>
              {Array.from({ length: QURAN_HIZB_TOTAL }, (_, i) => i + 1).map(hizb => {
                const complete = selectedHizb.has(hizb), partial = !complete && touchedHizb.has(hizb);
                const allowed = !allowedHizb || allowedHizb.has(hizb);
                return (
                  <button key={hizb} type="button" id={`${idPrefix}-hizb-${hizb}`} disabled={locked || !allowed}
                    aria-pressed={complete || partial}
                    aria-label={arabic ? `الحزب ${hizb}${partial ? ' (جزئي)' : ''}` : `Hizb ${hizb}${partial ? ' (partial)' : ''}`}
                    onClick={() => toggleHizb(hizb)}
                    className={`min-h-10 rounded-lg border text-[11px] font-black tabular-nums transition ${cellTone(complete, allowed)} ${partial ? '!border-[#9b7542] !bg-[#F2EADC] !text-[#7d5e34]' : ''}`}>
                    {hizb}
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-[10px] leading-5 text-[#696f6b]">{arabic ? 'الحزب نصف الجزء؛ ستون حزبًا في المصحف. اختياره يعدّل النطاق نفسه الذي تعدّله الأجزاء.' : 'A hizb is half a juz; sixty in the Mushaf. Selecting one edits the same scope the juz grid edits.'}</p>
          </div>

          <div>
            <button type="button" onClick={() => setSurahOpen(v => !v)} className="flex w-full items-center justify-between gap-3 text-start">
              <span className="inline-flex items-center gap-2 text-xs font-black text-[#39423d]"><BookOpen className="w-4 h-4" />{arabic ? 'اختيار بالسور' : 'By surah'}</span>
              <span className="text-[10px] font-bold text-[#696f6b]">{selectedSurahs.size ? (arabic ? `${selectedSurahs.size} سورة كاملة` : `${selectedSurahs.size} complete`) : (arabic ? 'لا شيء' : 'none')}</span>
            </button>
            {surahOpen && (
              <div className="mt-3 space-y-2">
                <label className="relative block">
                  <span className="sr-only">{arabic ? 'بحث عن سورة' : 'Search surah'}</span>
                  <Search className="pointer-events-none absolute inset-inline-start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#696f6b] start-3" />
                  <input value={surahQuery} onChange={e => setSurahQuery(e.target.value)} placeholder={arabic ? 'ابحث باسم السورة أو رقمها' : 'Search by name or number'}
                    className="mizan-input ps-10 text-xs" />
                </label>
                <div className="max-h-52 overflow-y-auto rounded-xl border border-[#e4e2da] bg-white p-1.5">
                  <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
                    {surahOptions.map(surah => (
                      <button key={surah} type="button" onClick={() => toggleSurah(surah)} aria-pressed={selectedSurahs.has(surah)}
                        className={`flex min-h-10 items-center justify-between gap-2 rounded-lg px-2.5 text-[11px] font-bold transition ${selectedSurahs.has(surah) ? 'bg-[#E7EEE9] text-[#214C40]' : 'text-[#5b6460] hover:bg-[#f4f2ec]'}`}>
                        <span className="min-w-0 truncate">{surah}. {arabic ? surahNameArabic(surah) : surahNameEnglish(surah)}</span>
                        {selectedSurahs.has(surah) && <Check className="h-3.5 w-3.5 shrink-0" />}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-2 text-xs font-black text-[#39423d]"><MapPin className="w-4 h-4" />{arabic ? 'المقاطع بحدود الآيات' : 'Segments by ayah bounds'}</span>
              <Button size="sm" variant="ghost" onClick={addSegment} disabled={locked}>{arabic ? 'إضافة مقطع' : 'Add segment'}</Button>
            </div>
            <div className="mt-2 space-y-2">
              {scope.segments.length === 0 && <p className="rounded-xl bg-[#f1efe9] p-3 text-[11px] text-[#6a706c]">{arabic ? 'لا مقاطع بعد. اختر أجزاء أو سورًا أعلاه، أو أضف مقطعًا بحدود آيات دقيقة.' : 'No segments yet. Pick juz or surahs above, or add a precise ayah segment.'}</p>}
              {scope.segments.map((segment, index) => (
                <div key={`${idPrefix}-segment-${index}`} className="rounded-xl border border-[#e4e2da] bg-white p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-black text-[#39423d]">{describeSegment(segment, arabic)}</span>
                    <Button size="sm" shape="square" variant="ghost" aria-label={arabic ? 'حذف المقطع' : 'Remove segment'} onClick={() => removeSegment(index)} icon={<Trash2 className="w-4 h-4" />} />
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <LocusField label={arabic ? 'من سورة' : 'From surah'} kind="surah" value={segment.start.surah} arabic={arabic} surahOptions={editableSurahs}
                      onChange={v => { const ranges = ayahRangesWithin(juzGuard, v); setRangeError(''); updateSegment(index, { start: { surah: v, ayah: clampToRanges(segment.start.ayah, ranges) } }); }} />
                    <LocusField label={arabic ? 'من آية' : 'From ayah'} kind="ayah" max={ayahCountOf(segment.start.surah)} value={segment.start.ayah} arabic={arabic}
                      ayahRanges={ayahRangesWithin(juzGuard, segment.start.surah)} onInvalid={v => reportOutOfGuard(segment.start.surah, v, ayahRangesWithin(juzGuard, segment.start.surah))}
                      onChange={v => { setRangeError(''); updateSegment(index, { start: { ...segment.start, ayah: v } }); }} />
                    <LocusField label={arabic ? 'إلى سورة' : 'To surah'} kind="surah" value={segment.end.surah} arabic={arabic} surahOptions={editableSurahs}
                      onChange={v => { const ranges = ayahRangesWithin(juzGuard, v); setRangeError(''); updateSegment(index, { end: { surah: v, ayah: clampToRanges(segment.end.ayah, ranges) } }); }} />
                    <LocusField label={arabic ? 'إلى آية' : 'To ayah'} kind="ayah" max={ayahCountOf(segment.end.surah)} value={segment.end.ayah} arabic={arabic}
                      ayahRanges={ayahRangesWithin(juzGuard, segment.end.surah)} onInvalid={v => reportOutOfGuard(segment.end.surah, v, ayahRangesWithin(juzGuard, segment.end.surah))}
                      onChange={v => { setRangeError(''); updateSegment(index, { end: { ...segment.end, ayah: v } }); }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <ScopeSummary scope={scope} arabic={arabic} />

      {issues.length > 0 && (
        <ul role="status" className="space-y-1 rounded-xl bg-[#F5EDE2] p-3 text-[11px] font-bold text-[#7a5a2f]">
          {issues.map(issue => <li key={`${issue.code}-${issue.segmentIndex ?? 'x'}`}>{arabic ? issue.ar : issue.en}</li>)}
        </ul>
      )}
      {metrics.assurance === 'DERIVED_PROPORTIONAL' && (
        <p className="flex items-start gap-2 text-[10px] leading-5 text-[#696f6b]">
          <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {arabic ? 'حدود الأحزاب والأرباع والصفحات مشتقة تناسبيًا من جدول الأجزاء، ويمكن ضبطها على آية بعينها من «سور ومقاطع وآيات».' : 'Hizb, rub and page bounds are derived proportionally; adjust them to an exact ayah from “Surahs, segments and ayat”.'}
        </p>
      )}
    </div>
  );
};

const normalizeNumericDraft = (raw: string) => raw
  .replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
  .replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
  .replace(/[^0-9]/g, '');

const LocusField: React.FC<{
  label: string; kind: 'surah' | 'ayah'; value: number; max?: number; arabic: boolean;
  surahOptions?: number[]; ayahRanges?: AyahRange[]; onInvalid?: (value: number) => void;
  onChange: (value: number) => void;
}> = ({ label, kind, value, max, arabic, surahOptions, ayahRanges, onInvalid, onChange }) => {
  const ceiling = kind === 'surah' ? QURAN_SURAH_TOTAL : Math.max(1, max || 1);
  const options = surahOptions?.length ? surahOptions : Array.from({ length: QURAN_SURAH_TOTAL }, (_, i) => i + 1);
  const ranges = ayahRanges?.length ? ayahRanges : ([[1, ceiling]] as AyahRange[]);
  const floor = Math.min(...ranges.map(([from]) => from));
  const rangeCeiling = Math.max(...ranges.map(([, to]) => to));
  const allowedText = ranges.map(([from, to]) => from === to ? `${from}` : `${from}–${to}`).join('، ');
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commitAyah = () => {
    const clean = normalizeNumericDraft(draft);
    if (!clean) { setDraft(String(value)); return; }
    const attempted = Number(clean);
    const canonical = Number.isInteger(attempted) && attempted >= 1 && attempted <= ceiling;
    const inSelectedRange = ranges.some(([from, to]) => attempted >= from && attempted <= to);
    if (!canonical || !inSelectedRange) { onInvalid?.(attempted); setDraft(String(value)); return; }
    setDraft(String(attempted));
    if (attempted !== value) onChange(attempted);
  };
  return (
    <label className="block min-w-0">
      <span className="block text-[9px] font-black tracking-[.1em] text-[#696f6b]">{label}</span>
      {kind === 'surah' ? (
        <select value={value} onChange={e => onChange(Number(e.target.value))} className="mizan-input mt-1 text-[11px]">
          {options.map(surah => (
            <option key={surah} value={surah}>{surah}. {arabic ? surahNameArabic(surah) : surahNameEnglish(surah)}</option>
          ))}
        </select>
      ) : (
        <>
          <input type="text" inputMode="numeric" pattern="[0-9]*" value={draft}
            onFocus={e => e.currentTarget.select()}
            onChange={e => setDraft(normalizeNumericDraft(e.target.value))}
            onBlur={commitAyah}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commitAyah(); e.currentTarget.blur(); } }}
            aria-valuemin={floor} aria-valuemax={rangeCeiling}
            className="mizan-input mt-1 text-[11px] tabular-nums" />
          {ayahRanges && <span className="mt-1 block text-[8px] font-bold leading-4 text-[#696f6b]">{arabic ? `المسموح: ${allowedText}` : `Allowed: ${allowedText}`}</span>}
        </>
      )}
    </label>
  );
};

/** بطاقة الملخّص الحيّ: ما الذي اختاره الآن، بالأرقام لا بالانطباع. */
export const ScopeSummary: React.FC<{ scope: QuranScope; arabic: boolean; compact?: boolean }> = ({ scope, arabic, compact }) => {
  const metrics = useMemo(() => scopeMetrics(scope), [scope]);
  const rows: [string, React.ReactNode][] = [
    [arabic ? 'الآيات' : 'Ayat', metrics.ayahCount.toLocaleString(arabic ? 'ar-KW-u-nu-latn' : 'en-US')],
    [arabic ? 'السور' : 'Surahs', metrics.surahCount],
    [arabic ? 'أجزاء كاملة' : 'Complete juz', metrics.fullJuz.length],
    [arabic ? 'أجزاء جزئية' : 'Partial juz', metrics.partialJuz.length],
    [arabic ? 'الصفحات (تقريبًا)' : 'Pages (approx.)', metrics.approximatePageCount],
    [arabic ? 'المقاطع' : 'Segments', metrics.segmentCount],
  ];
  return (
    <div className={`rounded-2xl border border-[#cddbd3] bg-[#F7FAF8] ${compact ? 'p-3' : 'p-4 sm:p-5'}`} role="status" aria-live="polite">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="min-w-0">
          <div className="mizan-kicker">{arabic ? 'النطاق المختار' : 'SELECTED SCOPE'}</div>
          <p className="mt-1 text-sm font-black text-[#214C40]">{describeScope(scope, arabic)}</p>
        </div>
        <span className="rounded-full bg-white px-3 py-1 text-[10px] font-black tabular-nums text-[#2F6555]">
          {arabic ? `${metrics.juzEquivalent} جزء بالمعادلة` : `${metrics.juzEquivalent} juz-equivalent`}
        </span>
      </div>
      <dl className={`mt-3 grid gap-2 ${compact ? 'grid-cols-3' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-6'}`}>
        {rows.map(([label, value]) => (
          <div key={label} className="min-w-0 rounded-xl bg-white/80 px-2.5 py-2">
            <dt className="text-[9px] font-bold text-[#656b67]">{label}</dt>
            <dd className="mt-0.5 text-sm font-black tabular-nums text-[#24302b]">{value}</dd>
          </div>
        ))}
      </dl>
      {metrics.firstLocus && metrics.lastLocus && (
        <p className="mt-3 text-[10px] leading-5 text-[#5f6662]">
          {arabic
            ? `يبدأ عند ${surahNameArabic(metrics.firstLocus.surah)} ${metrics.firstLocus.ayah} وينتهي عند ${surahNameArabic(metrics.lastLocus.surah)} ${metrics.lastLocus.ayah}.`
            : `Starts at ${surahNameEnglish(metrics.firstLocus.surah)} ${metrics.firstLocus.ayah} and ends at ${surahNameEnglish(metrics.lastLocus.surah)} ${metrics.lastLocus.ayah}.`}
        </p>
      )}
    </div>
  );
};
