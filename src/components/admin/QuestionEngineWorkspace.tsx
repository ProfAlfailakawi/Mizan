import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, BookMarked, CheckCircle2, ChevronLeft, CircleAlert, Flame, Layers, ListChecks,
  LockKeyhole, PlayCircle, Plus, Settings2, ShieldCheck, Sparkles, Target, Trash2, Wand2,
  Layers3, BookCopy, Activity,
} from 'lucide-react';
import { useAppStore } from '../../lib/store';
import { OfficialQuranLibrary } from './OfficialQuranLibrary';
import { QuranIntelligenceHealthConsole } from './QuranIntelligenceHealthConsole';
import { getCompetitionPolicy } from '../../lib/competition-config';
import { bilingualName } from '../../lib/ui-language';
import type { Category, ScopeSimulationRecord } from '../../types';
import {
  describeScope, fullQuranScope, scopeAyahCount, scopeFromJuzRange, scopeSignature, scopeSubtract, scopeUnion, type QuranScope,
} from '../../lib/quran-scope';
import {
  autoBalancedZones, describeZone, emptyZone, validateDistributionPlan, zoneQuestionTotal,
  type QuestionDistributionPlan, type QuestionZone,
} from '../../lib/question-zones';
import { DEFAULT_REPEAT_POLICY, describeRepeatPolicy, type RepeatPolicy } from '../../lib/repeat-policy';
import { categoryDistribution, categoryRepeatPolicy, categoryScopeOf, resolveQuestionCount } from '../../lib/scope-engine';
import { QuranScopePicker, ScopeSummary } from '../scope/QuranScopePicker';
import { ScopeHeatMap } from '../scope/ScopeHeatMap';
import type { DemandAnalysis } from '../../lib/scope-demand';
import { ScopeSimulationStudio, type WhatIfState } from '../scope/ScopeSimulationStudio';
import { ModelFairnessStudio } from '../scope/ModelFairnessStudio';
import { Button } from '../design-system/Button';
import { Badge } from '../design-system/Badge';
import { EmptyState } from '../design-system/EmptyState';
import { useConfirm } from '../design-system/ConfirmDialog';
import { fetchRuntimeHealth, type MizanRuntimeHealth } from '../../lib/runtime-capabilities';

/*
 * مساحة عمل محرك النطاق والأسئلة.
 *
 * A competition category is data + scope + rules, not a hard-coded competition type.
 * الفئة في ميزان تُعرّف بنطاقها وقواعدها الفعلية، لا باسمٍ ثابت داخل الكود.
 *
 * الترتيب هنا يتبع ترتيب القرار لا ترتيب البيانات: أين يُسأل؟ من يختار؟ كيف يوزَّع؟ ما سياسة
 * التكرار؟ ثم ما الذي يقوله الواقع (ازدحام التسجيل، المحاكاة)، ثم هل نحن جاهزون؟
 *
 * والوضع البسيط يكفي مسابقة مدرسة في دقائق؛ والمتقدّم لمن يحتاج مقاطع ومناطق وقواعد.
 */

/*
 * «المكتبة» و«صحّة الذكاء» كانتا مبنيّتين ولا تُفتحان.
 *
 * الشاشتان موجودتان منذ حين وتعرضان حالةً خادميّةً لا يعرضها غيرُهما — أصولُ المجمَّع
 * المعتمدة وحالةُ تسليمها، وجاهزيةُ طبقات الذكاء لكلّ رواية — ولم يكن شيءٌ في المنتج
 * يستوردهما. فكان المشغّلُ لا يستطيع فتحَهما بحال، وبدا الأمرُ كأن الميزة غيرُ موجودة.
 *
 * وموضعُهما هنا لا في مكانٍ آخر: من يسأل «على أيّ مصحفٍ تُبنى الأسئلة؟» و«أيُّ رواياتٍ
 * جاهزة؟» يسألهما وهو في ورشة المحرّك.
 */
type Tab = 'scope' | 'distribution' | 'policy' | 'demand' | 'simulation' | 'models' | 'readiness' | 'library' | 'intelligence';
type Store = ReturnType<typeof useAppStore>;

export const QuestionEngineWorkspace: React.FC = () => {
  const store = useAppStore();
  const ar = store.language === 'ar';
  const policy = getCompetitionPolicy(store.competition);
  const [tab, setTab] = useState<Tab>('scope');
  const [selectedId, setSelectedId] = useState(store.competition.categories[0]?.id || '');
  const category = store.competition.categories.find(c => c.id === selectedId) || store.competition.categories[0];

  const tabs: [Tab, React.ComponentType<{ className?: string }>, string][] = [
    ['scope', BookMarked, ar ? 'النطاق' : 'Scope'],
    ['distribution', Layers, ar ? 'توزيع الأسئلة' : 'Distribution'],
    ['policy', Settings2, ar ? 'سياسة الأسئلة' : 'Question policy'],
    ['demand', Flame, ar ? 'الازدحام' : 'Demand'],
    ['simulation', PlayCircle, ar ? 'المحاكاة' : 'Simulation'],
    ['models', Layers3, ar ? 'النماذج والعدالة' : 'Models & fairness'],
    ['readiness', ShieldCheck, ar ? 'الجاهزية' : 'Readiness'],
    ['library', BookCopy, ar ? 'المكتبة الرسمية' : 'Official library'],
    ['intelligence', Activity, ar ? 'صحّة الذكاء' : 'Intelligence health'],
  ];

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="mizan-kicker">{ar ? 'محرك النطاق والأسئلة' : 'SCOPE & QUESTION ENGINE'}</div>
          <h1 className="mt-1 text-2xl font-black sm:text-3xl">{ar ? 'الفئة تُعرّف بنطاقها لا باسمها' : 'A category is defined by its range, not its name'}</h1>
          <p className="mt-2 max-w-2xl text-xs leading-6 text-[#666c68]">
            {ar
              ? 'سمِّ الفئة ما شئت — «ربع القرآن» أو «الفئة الذهبية» أو «أ». ميزان لا يستنتج شيئًا من الاسم؛ يعمل على النطاق القرآني الحقيقي وقواعده.'
              : 'Name the category anything. Mizan infers nothing from the name; it works on the real Quranic range and its rules.'}
          </p>
        </div>
      </header>

      {store.competition.categories.length === 0 ? (
        <div className="mizan-surface">
          <EmptyState icon={Plus} title={ar ? 'لا توجد فئات بعد' : 'No categories yet'}
            hint={ar ? 'أنشئ فئة من شاشة «هوية المسابقة» ثم عُد إلى هنا لتحديد نطاقها وقواعدها.' : 'Create a category in Competition DNA, then define its range and rules here.'} />
        </div>
      ) : (
        <>
          <CategoryStrip store={store} ar={ar} selectedId={category?.id || ''} onSelect={setSelectedId} policy={policy} />
          <div className="mizan-tabs" role="tablist">
            {tabs.map(([id, Icon, label]) => (
              <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`mizan-tab ${tab === id ? 'is-active' : ''}`}>
                <Icon className="h-4 w-4" />{label}
              </button>
            ))}
          </div>
          <div className="mizan-surface p-5 sm:p-7">
            {tab === 'scope' && <ScopeTab store={store} ar={ar} category={category} />}
            {tab === 'distribution' && <DistributionTab store={store} ar={ar} category={category} />}
            {tab === 'policy' && <PolicyTab store={store} ar={ar} category={category} />}
            {tab === 'demand' && <DemandTab store={store} ar={ar} />}
            {tab === 'simulation' && <SimulationTab store={store} ar={ar} />}
            {tab === 'models' && <ModelFairnessStudio store={store} ar={ar} categoryId={category?.id} />}
            {tab === 'readiness' && <ReadinessTab store={store} ar={ar} onNavigate={setTab} />}
            {tab === 'library' && <OfficialQuranLibrary />}
            {tab === 'intelligence' && <QuranIntelligenceHealthConsole ar={ar} />}
          </div>
        </>
      )}
    </div>
  );
};

const CategoryStrip: React.FC<{ store: Store; ar: boolean; selectedId: string; onSelect: (id: string) => void; policy: ReturnType<typeof getCompetitionPolicy> }> = ({ store, ar, selectedId, onSelect, policy }) => (
  <div className="flex gap-2 overflow-x-auto pb-1">
    {store.competition.categories.map(category => {
      const scope = categoryScopeOf(category);
      const needsScope = scopeAyahCount(scope) === 0;
      return (
        <button key={category.id} type="button" onClick={() => onSelect(category.id)} aria-pressed={selectedId === category.id}
          className={`min-w-[200px] shrink-0 rounded-2xl border p-3.5 text-start transition ${selectedId === category.id ? 'border-[#214C40] bg-[#E7EEE9]' : 'border-[#dcdad2] bg-white hover:bg-[#f7f5ef]'}`}>
          <div className="flex items-start justify-between gap-2">
            <span className="min-w-0 truncate text-sm font-black text-[#24302b]">{bilingualName(category, ar)}</span>
            {needsScope
              ? <Badge variant="amber">{ar ? 'بلا نطاق' : 'No range'}</Badge>
              : <Badge>{ar ? 'ثابت للفئة' : 'Category range'}</Badge>}
          </div>
          <p className="mt-1.5 truncate text-[11px] font-bold text-[#5b6460]">{needsScope ? (ar ? 'يحتاج تحديد نطاق' : 'Needs a range') : describeScope(scope, ar)}</p>
          <p className="mt-1 text-[10px] text-[#696f6b]">
            {ar ? `${resolveQuestionCount(category, policy)} أسئلة · ${store.participants.filter(p => p.competitionId === store.competition.id && p.categoryId === category.id).length} متسابقًا` : `${resolveQuestionCount(category, policy)} questions · ${store.participants.filter(p => p.competitionId === store.competition.id && p.categoryId === category.id).length} participants`}
          </p>
        </button>
      );
    })}
  </div>
);

const SectionHead: React.FC<{ ar: boolean; kicker: string; title: string; hint: string }> = ({ kicker, title, hint }) => (
  <div className="mb-5">
    <div className="mizan-kicker">{kicker}</div>
    <h2 className="mt-1 text-lg font-black">{title}</h2>
    <p className="mt-1.5 max-w-2xl text-xs leading-6 text-[#666c68]">{hint}</p>
  </div>
);

const ScopeTab: React.FC<{ store: Store; ar: boolean; category?: Category }> = ({ store, ar, category }) => {
  const [draft, setDraft] = useState<QuranScope | null>(null);
  const [saved, setSaved] = useState(false);
  const migration = useMemo(() => store.categoryScopeMigrationPlan().find(x => x.categoryId === category?.id), [store, category?.id]);
  if (!category) return null;
  const current = categoryScopeOf(category);
  const scope = draft ?? current;
  const dirty = scopeSignature(scope) !== scopeSignature(current);

  const save = () => {
    const result = store.setCategoryScope(category.id, scope);
    if (result.ok) { setDraft(null); setSaved(true); window.setTimeout(() => setSaved(false), 2500); }
  };

  return (
    <div className="space-y-5">
      <SectionHead ar={ar} kicker={ar ? 'نطاق الفئة' : 'CATEGORY RANGE'} title={ar ? 'أين يجوز أن يُطرح السؤال؟' : 'Where may a question come from?'}
        hint={ar ? 'هذا هو المرجع الوحيد للسحب. لا يُشتق شيء من اسم الفئة ولا من عدد أجزائها.' : 'This is the single source of truth for the draw. Nothing is inferred from the category name.'} />

      {migration && migration.outcome.status === 'needs_scope_confirmation' && scopeAyahCount(current) === 0 && (
        <div className="rounded-2xl border border-[#e6d9c2] bg-[#FBF7F0] p-4" role="status">
          <h3 className="inline-flex items-center gap-2 text-sm font-black text-[#7d5e34]"><AlertTriangle className="h-4 w-4" />{ar ? 'بيانات قديمة تحتاج قرارك' : 'Legacy data needs your decision'}</h3>
          <p className="mt-2 text-[11px] leading-6 text-[#7a5a2f]">{ar ? migration.outcome.basisArabic : migration.outcome.basisEnglish}</p>
          {migration.outcome.suggestion && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-black text-[#7d5e34]">{ar ? 'الاقتراح:' : 'Suggestion:'} {describeScope(migration.outcome.suggestion, ar)}</span>
              <Button size="sm" variant="outline" onClick={() => setDraft(migration.outcome.suggestion!)}>{ar ? 'استخدم الاقتراح للمراجعة' : 'Load the suggestion'}</Button>
            </div>
          )}
        </div>
      )}

      <QuranScopePicker value={scope} onChange={setDraft} arabic={ar} idPrefix={`cat-${category.id}`} />

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#efeee8] pt-4">
        <p className="text-[11px] text-[#696f6b]">
          {ar ? `النسخة الحالية ${category.scopeVersion || 1}. أي تعديل يرفع النسخة ويبطل النماذج المبنية على السابقة.` : `Current version ${category.scopeVersion || 1}. Any change bumps it and invalidates models built on the old one.`}
        </p>
        <div className="flex items-center gap-2">
          {saved && <span role="status" className="inline-flex items-center gap-1.5 rounded-full bg-[#E7EEE9] px-3 py-1.5 text-[10px] font-black text-[#214C40]"><CheckCircle2 className="h-3.5 w-3.5" />{ar ? 'حُفظ النطاق' : 'Range saved'}</span>}
          {dirty && <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>{ar ? 'تراجع' : 'Revert'}</Button>}
          <Button size="sm" disabled={!dirty || scopeAyahCount(scope) === 0} onClick={save}>{ar ? 'حفظ النطاق' : 'Save range'}</Button>
        </div>
      </div>
    </div>
  );
};

const DistributionTab: React.FC<{ store: Store; ar: boolean; category?: Category }> = ({ store, ar, category }) => {
  const policy = getCompetitionPolicy(store.competition);
  const [plan, setPlan] = useState<QuestionDistributionPlan | null>(null);
  if (!category) return null;
  const questionCount = resolveQuestionCount(category, policy);
  const current = categoryDistribution(category, questionCount);
  const draft = plan ?? current;
  const scope = categoryScopeOf(category);
  const issues = validateDistributionPlan(draft, scope, questionCount);
  const errors = issues.filter(x => x.severity === 'error');

  /*
   * تحرير المناطق يُخرج الخطة من «القسمة التلقائية» إلى «مناطق تحددها اللجنة».
   *
   * كانت اللجنة تضيف منطقة أو تغيّر عددًا وهي في الوضع التلقائي، فيُعاد توليد المناطق
   * عند السحب من النطاق نفسه ويُهمل ما كتبته — تعديلٌ يُقبل في الشاشة ولا أثر له في
   * الواقع. فمن حرّر منطقة فقد قصد مناطق يحددها بنفسه، ويُقال له ذلك في الشاشة.
   */
  const asCommitteeZones = (next: QuestionDistributionPlan): QuestionDistributionPlan =>
    next.mode === 'auto_balanced' ? { ...next, mode: 'custom_zones', autoZoneCount: undefined } : next;

  const patchZone = (index: number, patch: Partial<QuestionZone>) =>
    setPlan(asCommitteeZones({ ...draft, zones: draft.zones.map((zone, i) => (i === index ? { ...zone, ...patch } : zone)) }));

  /*
   * المنطقة الجديدة تولد بنطاق حقيقي لا فارغ.
   *
   * «منطقة بلا نطاق» خطأٌ يمنع الحفظ، فكان زرّ الإضافة يبدو كأنه لا يعمل: تُضاف المنطقة
   * ثم يُقفل الحفظ برسالةٍ في آخر الشاشة. الجديدة الآن تأخذ ما لم تغطّه المناطق من نطاق
   * الفئة، فإن كان النطاق مغطّى كاملًا أخذت نطاق الفئة كله وللجنة أن تضيّقه.
   */
  const addZone = () => {
    const order = draft.zones.length + 1;
    const covered = draft.zones.reduce<QuranScope | null>((acc, zone) => acc ? scopeUnion(acc, zone.scope) : zone.scope, null);
    const remainder = covered ? scopeSubtract(scope, covered) : scope;
    const zoneScope = scopeAyahCount(remainder) > 0 ? remainder : scope;
    setPlan(asCommitteeZones({ ...draft, zones: [...draft.zones, { ...emptyZone(order), scope: zoneScope, requiredQuestionCount: 0 }] }));
  };

  /*
   * موازنة الأعداد: مجموع أسئلة المناطق يجب أن يساوي عدد أسئلة المتسابق تمامًا، وكان
   * ضبط ذلك يدويًّا منطقةً منطقة. هذه توزّع الفارق بالتساوي والبقية على الأوائل.
   */
  const balanceCounts = () => {
    const zones = draft.zones;
    if (!zones.length) return;
    const free = Math.max(0, Math.round(draft.freeQuestionCount || 0));
    const forZones = Math.max(0, questionCount - (draft.mode === 'hybrid' ? free : 0));
    const base = Math.floor(forZones / zones.length);
    const remainder = forZones - base * zones.length;
    setPlan(asCommitteeZones({ ...draft, zones: zones.map((zone, i) => ({ ...zone, requiredQuestionCount: base + (i < remainder ? 1 : 0) })) }));
  };

  return (
    <div className="space-y-5">
      <SectionHead ar={ar} kicker={ar ? 'توزيع الأسئلة' : 'QUESTION DISTRIBUTION'} title={ar ? 'من أين يأتي كل سؤال؟' : 'Where does each question come from?'}
        hint={ar ? 'عدد الأسئلة مستقل تمامًا عن حجم النطاق: ثلاثون جزءًا وسؤال واحد إعدادٌ مشروع، وجزء واحد وعشرة أسئلة كذلك.' : 'The question count is independent of the range size in both directions.'} />

      <div className="grid gap-3 sm:grid-cols-2">
        <NumberBox ar={ar} label={ar ? 'عدد الأسئلة لكل متسابق' : 'Questions per participant'} value={questionCount} min={1} max={40}
          onChange={v => store.setCategoryQuestionCount(category.id, v)} hint={ar ? 'يتقدّم على إعداد المسابقة العام.' : 'Overrides the competition-wide setting.'} />
        <label className="block">
          <span className="block text-[10px] font-black tracking-[.1em] text-[#696f6b]">{ar ? 'طريقة التوزيع' : 'Distribution mode'}</span>
          <select value={draft.mode} onChange={e => {
            const mode = e.target.value as QuestionDistributionPlan['mode'];
            setPlan(mode === 'auto_balanced'
              ? { ...draft, mode, zones: autoBalancedZones(scope, questionCount), autoZoneCount: questionCount }
              : mode === 'custom_zones' && !draft.zones.length
                ? { ...draft, mode, zones: autoBalancedZones(scope, questionCount) }
                : { ...draft, mode });
          }} className="mizan-input mt-1 text-xs">
            <option value="free">{ar ? 'سحب حر من كامل النطاق' : 'Free draw across the range'}</option>
            <option value="auto_balanced">{ar ? 'قسمة متوازنة تلقائية' : 'Automatic balanced split'}</option>
            <option value="custom_zones">{ar ? 'مناطق تحددها اللجنة' : 'Committee-defined zones'}</option>
            <option value="hybrid">{ar ? 'مختلط: مناطق وأسئلة حرة' : 'Hybrid: zones plus open questions'}</option>
          </select>
        </label>
      </div>

      {draft.mode === 'free' && (
        <p className="rounded-xl bg-[#f1efe9] px-3.5 py-3 text-[11px] leading-6 text-[#5b6460]">
          {ar ? 'كل سؤال يُسحب من أي موضع داخل نطاق المتسابق، مع مراعاة المباعدة وعدم التكرار.' : 'Every question is drawn from anywhere inside the participant range, still respecting separation and no-repeat rules.'}
        </p>
      )}

      {draft.mode !== 'free' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-black">{ar ? `المناطق (${draft.zones.length})` : `Zones (${draft.zones.length})`}</h3>
            {/* ثلاثةُ أزرارٍ بلا التفاف: مجموعها ٣٦٠ بكسل، فتُخرج الصفحةَ عن عرض الهاتف
                (٣٩٧ > ٣٧٥) فتنزلق الشاشةُ كلُّها أفقيًّا. والصفُّ الخارجي يلتفّ والداخلي لا. */}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="ghost" icon={<Wand2 className="h-4 w-4" />}
                onClick={() => setPlan({ ...draft, zones: autoBalancedZones(scope, draft.zones.length || questionCount) })}>
                {ar ? 'اقترح قسمة متوازنة' : 'Suggest a balanced split'}
              </Button>
              <Button size="sm" variant="ghost" icon={<ListChecks className="h-4 w-4" />} disabled={!draft.zones.length} onClick={balanceCounts}>
                {ar ? 'وزّع الأعداد' : 'Balance counts'}
              </Button>
              <Button size="sm" variant="ghost" icon={<Plus className="h-4 w-4" />} onClick={addZone}>
                {ar ? 'منطقة جديدة' : 'Add zone'}
              </Button>
            </div>
          </div>

          {draft.mode === 'auto_balanced' && (
            <p className="rounded-xl bg-[#F5EDE2] px-3.5 py-2.5 text-[11px] leading-6 text-[#7a5a2f]">
              {ar
                ? 'أنت في القسمة التلقائية: المناطق تُحسب عند السحب من نطاق كل متسابق، وما تعدّله هنا لا يُحفظ حتى تنتقل الخطة إلى «مناطق تحددها اللجنة» — وهو ما سيحدث تلقائيًا بأول تعديل.'
                : 'This plan is on the automatic split: zones are recomputed per participant at draw time. The first edit here switches it to committee-defined zones so your changes take effect.'}
            </p>
          )}

          <ul className="space-y-2">
            {draft.zones.map((zone, index) => (
              <li key={zone.id} className="rounded-2xl border border-[#e4e2da] bg-white p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <input value={zone.nameArabic || zone.name} onChange={e => patchZone(index, { nameArabic: e.target.value, name: e.target.value })}
                    aria-label={ar ? `اسم المنطقة ${index + 1}` : `Zone ${index + 1} name`}
                    className="min-w-0 flex-1 border-0 bg-transparent text-sm font-black text-[#24302b] outline-none" />
                  <div className="flex items-center gap-2">
                    <NumberBox ar={ar} compact label={ar ? 'أسئلة' : 'Questions'} value={zone.requiredQuestionCount} min={0} max={20} onChange={v => patchZone(index, { requiredQuestionCount: v })} />
                    <Button size="sm" shape="square" variant="ghost" aria-label={ar ? 'حذف المنطقة' : 'Remove zone'} icon={<Trash2 className="h-4 w-4" />} onClick={() => setPlan(asCommitteeZones({ ...draft, zones: draft.zones.filter((_, i) => i !== index) }))} />
                  </div>
                </div>
                <p className="mt-1 text-[11px] font-bold text-[#5b6460]">{describeZone(zone, ar)}</p>
                <details className="mt-2">
                  <summary className="cursor-pointer text-[10px] font-black text-[#2F6555]">{ar ? 'تعديل نطاق هذه المنطقة' : 'Edit this zone range'}</summary>
                  <div className="mt-3"><QuranScopePicker value={zone.scope} onChange={next => patchZone(index, { scope: next })} arabic={ar} parentScope={scope} idPrefix={`zone-${zone.id}`} /></div>
                </details>
              </li>
            ))}
          </ul>

          {draft.mode === 'hybrid' && (
            <NumberBox ar={ar} label={ar ? 'أسئلة حرة خارج المناطق' : 'Open questions outside zones'} value={draft.freeQuestionCount || 0} min={0} max={20} onChange={v => setPlan({ ...draft, freeQuestionCount: v })} />
          )}

          <div className={`rounded-xl px-3.5 py-3 text-[11px] font-bold ${errors.length ? 'bg-[#F6E7E7] text-[#7A2E2E]' : 'bg-[#E7EEE9] text-[#214C40]'}`} role="status">
            {errors.length
              ? errors.map(x => <div key={x.code + (x.zoneId || '')}>{ar ? x.ar : x.en}</div>)
              : (ar ? `مجموع أسئلة المناطق ${zoneQuestionTotal(draft)} ويطابق عدد أسئلة المتسابق.` : `Zones request ${zoneQuestionTotal(draft)} questions, matching the participant count.`)}
          </div>
          {issues.filter(x => x.severity !== 'error').map(x => (
            <p key={x.code + (x.zoneId || '')} className="rounded-xl bg-[#F5EDE2] px-3.5 py-2.5 text-[11px] text-[#7a5a2f]">{ar ? x.ar : x.en}</p>
          ))}
        </div>
      )}

      <div className="flex items-center justify-end gap-2 border-t border-[#efeee8] pt-4">
        {plan && <Button size="sm" variant="ghost" onClick={() => setPlan(null)}>{ar ? 'تراجع' : 'Revert'}</Button>}
        <Button size="sm" disabled={!plan || errors.length > 0} onClick={() => { store.setCategoryDistribution(category.id, draft); setPlan(null); }}>{ar ? 'حفظ التوزيع' : 'Save distribution'}</Button>
      </div>
    </div>
  );
};

const PolicyTab: React.FC<{ store: Store; ar: boolean; category?: Category }> = ({ store, ar, category }) => {
  const policy = getCompetitionPolicy(store.competition);
  const [draft, setDraft] = useState<RepeatPolicy | null>(null);
  if (!category) return null;
  const current = categoryRepeatPolicy(category, policy);
  const value = draft ?? current;
  const patch = (next: Partial<RepeatPolicy>) => setDraft({ ...value, ...next });

  return (
    <div className="space-y-5">
      <SectionHead ar={ar} kicker={ar ? 'سياسة الأسئلة' : 'QUESTION POLICY'} title={ar ? 'متى يجوز أن يتكرر السؤال؟' : 'When may a question repeat?'}
        hint={ar ? 'ميزان لا يَعِد بعدم التكرار حين يكون مستحيلًا رياضيًا؛ يُقلّله، ويُباعد بين استعمالاته، ويوازن الحمل، ويسجّل السبب.' : 'Mizan does not promise zero repetition when it is mathematically impossible; it minimises, separates, balances and records the reason.'} />

      <div className="grid gap-3 lg:grid-cols-3">
        {(['strict_no_repeat', 'repeat_when_necessary', 'balanced_reuse'] as const).map(mode => (
          <ModeCard key={mode} active={value.mode === mode} ar={ar}
            title={mode === 'strict_no_repeat' ? (ar ? 'منع التكرار تمامًا' : 'Strict no repeat') : mode === 'repeat_when_necessary' ? (ar ? 'التكرار عند الضرورة' : 'Repeat when necessary') : (ar ? 'إعادة استعمال متوازنة' : 'Balanced reuse')}
            body={describeRepeatPolicy({ ...value, mode }, ar)}
            onClick={() => patch({ mode })} />
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <NumberBox ar={ar} label={ar ? 'أقل مباعدة بين استعمالين (متسابقون)' : 'Minimum gap between reuses (participants)'} value={value.minimumParticipantGap || 0} min={0} max={2000} step={5} onChange={v => patch({ minimumParticipantGap: v })} />
        <NumberBox ar={ar} label={ar ? 'أقصى استعمال للسؤال الواحد' : 'Maximum uses per question'} value={value.maxUsesPerQuestion || 0} min={0} max={100} onChange={v => patch({ maxUsesPerQuestion: v || undefined })} hint={ar ? 'صفر = بلا سقف صريح' : '0 = no explicit ceiling'} />
        <NumberBox ar={ar} label={ar ? 'نصف قطر الجوار (آيات)' : 'Neighbourhood radius (ayat)'} value={value.neighborhoodAyahRadius} min={0} max={50} onChange={v => patch({ neighborhoodAyahRadius: v })} hint={ar ? 'سؤالان يبدآن من آيتين متجاورتين ليسا سؤالين.' : 'Two starts a few ayat apart are not two questions.'} />
        <NumberBox ar={ar} label={ar ? 'نصف قطر الجوار (أجزاء)' : 'Neighbourhood radius (juz)'} value={value.neighborhoodJuzRadius || 0} min={0} max={30} onChange={v => patch({ neighborhoodJuzRadius: v })}
          hint={ar ? 'صفر = بلا اعتبار. واحد = لا سؤالان من الجزء نفسه ما وُجد بديل. اثنان = يُباعَد بجزءٍ بينهما.' : '0 = off. 1 = no two questions from the same juz when an alternative exists. 2 = keep a juz between them.'} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Toggle ar={ar} checked={value.noRepeatWithinParticipant} onChange={v => patch({ noRepeatWithinParticipant: v })}
          label={ar ? 'لا يُعاد الموضع للمتسابق نفسه أبدًا' : 'Never return a locus to the same participant'} />
        <Toggle ar={ar} checked={value.roomAware} onChange={v => patch({ roomAware: v })} label={ar ? 'تجنّب إعادة الاستعمال في القاعة نفسها' : 'Avoid reuse inside the same hall'} />
        <Toggle ar={ar} checked={value.dayAware} onChange={v => patch({ dayAware: v })} label={ar ? 'تجنّب إعادة الاستعمال في اليوم نفسه' : 'Avoid reuse on the same day'} />
      </div>

      <div className="rounded-2xl border border-[#cddbd3] bg-[#F7FAF8] p-4">
        <h3 className="inline-flex items-center gap-2 text-sm font-black text-[#214C40]"><Target className="h-4 w-4" />{ar ? 'ما الذي يلتزم به المحرك؟' : 'What the engine guarantees'}</h3>
        <ul className="mt-2 space-y-1.5 text-[11px] leading-6 text-[#3c4541]">
          <li><strong>{ar ? 'قاطع:' : 'MUST:'}</strong> {ar ? 'داخل نطاق المتسابق، وبروايته، ومن منطقته، ومعتمدًا، وبلا تكرار داخل نموذجه.' : 'Inside the participant range and reading, from its zone, approved, and never repeated inside one model.'}</li>
          <li><strong>{ar ? 'مفضَّل:' : 'PREFER:'}</strong> {ar ? 'تنوّع السور، والمباعدة الزمنية، وأقل انكشاف، وحماية المواضع النادرة للقادمين — ويُسجَّل كل تنازل عنها بسببه.' : 'Surah diversity, separation, low exposure and protecting scarce loci — every relaxation is recorded with its reason.'}</li>
        </ul>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-[#efeee8] pt-4">
        {draft && <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>{ar ? 'تراجع' : 'Revert'}</Button>}
        <Button size="sm" disabled={!draft} onClick={() => { store.setCategoryRepeatPolicy(category.id, value); setDraft(null); }}>{ar ? 'حفظ السياسة' : 'Save policy'}</Button>
      </div>
    </div>
  );
};

const DemandTab: React.FC<{ store: Store; ar: boolean }> = ({ store, ar }) => {
  const [analysis, setAnalysis] = useState<DemandAnalysis | null>(null);
  const [failed, setFailed] = useState(false);
  const signature = `${store.participants.length}:${store.participantScopes.length}:${store.competition.categories.length}`;
  useEffect(() => {
    let alive = true;
    setFailed(false);
    store.scopeDemandAnalysis().then(result => { if (alive) setAnalysis(result); }).catch(error => {
      if (alive) setFailed(true);
      console.error('MIZAN demand analysis failed:', error);
    });
    return () => { alive = false; };
  }, [signature]);
  return (
    <div className="space-y-5">
      <SectionHead ar={ar} kicker={ar ? 'ازدحام التسجيل' : 'REGISTRATION PRESSURE'} title={ar ? 'أين سيقع الضغط يوم المسابقة؟' : 'Where will the pressure fall?'}
        hint={ar ? 'لا تُعرض هنا أسماء ولا بيانات شخصية — أعداد وضغوط فقط.' : 'No names or personal data appear here — only counts and pressures.'} />
      {failed
        ? <p role="alert" className="rounded-xl bg-[#F6E7E7] px-3.5 py-3 text-[11px] font-bold text-[#7A2E2E]">{ar ? 'تعذّر حساب الازدحام. راجع نطاقات الفئات ثم افتح هذه الشاشة مرة أخرى.' : 'The demand map could not be computed. Check the category ranges and reopen this screen.'}</p>
        : analysis
          ? <ScopeHeatMap analysis={analysis} arabic={ar} />
          : <div role="status" className="rounded-2xl border border-[#e4e2da] bg-white p-10 text-center text-[11px] font-bold text-[#696f6b]">{ar ? 'جارٍ حساب الازدحام…' : 'Computing demand…'}</div>}
    </div>
  );
};

const SimulationTab: React.FC<{ store: Store; ar: boolean }> = ({ store, ar }) => {
  const policy = getCompetitionPolicy(store.competition);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const history = store.scopeSimulations as ScopeSimulationRecord[];
  const defaults: WhatIfState = {
    participantCount: Math.max(1, store.participants.filter(p => p.competitionId === store.competition.id && !['rejected', 'draft'].includes(p.status)).length),
    questionCount: resolveQuestionCount(store.competition.categories[0], policy),
    poolMultiplier: 1,
    repeatMode: categoryRepeatPolicy(store.competition.categories[0], policy).mode,
    minimumParticipantGap: categoryRepeatPolicy(store.competition.categories[0], policy).minimumParticipantGap || 0,
  };
  const run = (state: WhatIfState) => {
    setBusy(true); setError(null);
    void (async () => {
      try {
        const outcome = await store.runScopeSimulation({ ...state, label: ar ? `محاكاة ${state.participantCount} متسابقًا` : `${state.participantCount}-participant run` });
        if (!outcome.ok) setError(ar ? 'لا يوجد متسابقون ولا فئات بنطاق صالح لتشغيل المحاكاة عليها.' : 'There is nothing with a valid range to simulate.');
      } catch (e) {
        setError(ar ? 'تعذّر تشغيل المحاكاة. راجع نطاقات الفئات ثم أعد المحاولة.' : 'The simulation could not run. Check the category ranges and try again.');
        console.error('MIZAN scope simulation failed:', e);
      } finally { setBusy(false); }
    })();
  };
  return <ScopeSimulationStudio arabic={ar} latest={history[0]} history={history} defaults={defaults} busy={busy} error={error} onRun={run} />;
};

const ReadinessTab: React.FC<{ store: Store; ar: boolean; onNavigate: (tab: Tab) => void }> = ({ store, ar, onNavigate }) => {
  const { confirm, confirmDialog } = useConfirm(ar);
  const [runtimeHealth, setRuntimeHealth] = useState<MizanRuntimeHealth>();
  const [runtimeChecking, setRuntimeChecking] = useState(false);
  const [sealError, setSealError] = useState<string | null>(null);
  const refreshRuntime = async () => {
    setRuntimeChecking(true);
    try { setRuntimeHealth(await fetchRuntimeHealth()); } finally { setRuntimeChecking(false); }
  };
  useEffect(() => { void refreshRuntime(); }, []);
  const escrowOverride = runtimeHealth?.source === 'server' ? runtimeHealth.secureQuestionRuntimeConfigured : undefined;
  const readiness = useMemo(
    () => store.getScopeReadiness(escrowOverride),
    [store.competition.categories, store.participantScopes.length, store.participants.length, store.questionModels.length, store.questionQuarantines.length, escrowOverride],
  );
  const impact = store.scopeSealImpact();
  const fixTab: Record<string, Tab> = { category_scope: 'scope', selection_rules: 'scope', zones: 'distribution', question_policy: 'policy', participant_scopes: 'scope', pool: 'demand', models: 'models', seal: 'readiness' };

  const seal = async () => {
    if (!(await confirm({
      title: ar ? 'تجميد إعداد محرك النطاق' : 'Freeze the scope engine configuration',
      body: ar
        ? 'يُقفل بعدها نطاق كل فئة ونطاق كل متسابق معتمد، فلا يستطيع أحد تغييرهما دون أثر. وأي تعديل لاحق ينشئ نسخة جديدة، ويُبطل النماذج المبنية على النسخة القديمة، ويُظهر لك كم متسابقًا تأثر.'
        : 'Every category range and every approved participant range is locked. A later change creates a new version, invalidates models built on the old one, and shows you how many participants were affected.',
      confirmLabel: ar ? 'تجميد الإعداد' : 'Freeze configuration',
    }))) return;
    const result = await store.sealScopeEngine(undefined, escrowOverride);
    setSealError(result.ok ? null : (ar ? 'لا يمكن التجميد قبل معالجة المشكلات الحرجة أعلاه.' : 'Freezing is blocked until the critical issues above are resolved.'));
  };

  return (
    <div className="space-y-5">
      {confirmDialog}
      <div className={`rounded-2xl border p-5 ${readiness.ready ? 'border-[#cddbd3] bg-[#F7FAF8]' : 'border-[#e0c6c1] bg-[#F9F0EE]'}`} role="status">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className={`inline-flex items-center gap-2 text-lg font-black ${readiness.ready ? 'text-[#214C40]' : 'text-[#8a3f34]'}`}>
              {readiness.ready ? <ShieldCheck className="h-5 w-5" /> : <CircleAlert className="h-5 w-5" />}
              {readiness.ready
                ? (ar ? `جاهز — ${readiness.passed} من ${readiness.checks.length} فحصًا ناجحًا` : `Ready — ${readiness.passed} of ${readiness.checks.length} checks passed`)
                : (ar ? `غير جاهز — ${readiness.critical} ${readiness.critical === 1 ? 'مشكلة حرجة' : 'مشكلات حرجة'}` : `Not ready — ${readiness.critical} critical issues`)}
            </h2>
            <p className="mt-1 text-[11px] text-[#5b6460]">{ar ? 'المحرك لا يسمح بتشغيل مسابقة رسمية وفيها مشكلة حرجة.' : 'An official competition cannot run with a critical issue open.'}</p>
          </div>
          <Button onClick={() => void seal()} disabled={!readiness.ready} icon={<LockKeyhole className="h-4 w-4" />}>{ar ? 'تجميد الإعداد' : 'Freeze configuration'}</Button>
        </div>
        {sealError && <p role="alert" className="mt-3 rounded-xl bg-[#F6E7E7] px-3 py-2 text-[11px] font-bold text-[#7A2E2E]">{sealError}</p>}
      </div>

      {runtimeHealth && runtimeHealth.source !== 'server' && (
        <div className="rounded-xl border border-[#e6d9c2] bg-[#FBF7F0] px-3 py-2 text-[10px] font-bold leading-5 text-[#7a5a2f]">
          {ar ? 'تعذّر التحقق من قدرات الخادم الآن؛ لن يعتبر ميزان الحجز الخادمي جاهزًا اعتمادًا على حالة جهاز المحكّم فقط.' : 'Server capabilities could not be verified. Mizan will not mark escrow ready based only on a judge device state.'}
        </div>
      )}

      <ul className="space-y-2">
        {readiness.checks.map(check => (
          <li key={check.id} className={`rounded-2xl border p-4 ${check.severity === 'critical' ? 'border-[#e0c6c1] bg-[#F9F0EE]' : check.severity === 'warning' ? 'border-[#e6d9c2] bg-[#FBF7F0]' : check.severity === 'recommendation' ? 'border-[#dfe6ea] bg-[#F4F7F9]' : 'border-[#e4e2da] bg-white'}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="inline-flex items-center gap-2 text-sm font-black text-[#24302b]">
                  {check.severity === 'passed' ? <CheckCircle2 className="h-4 w-4 text-[#214C40]" /> : check.severity === 'critical' ? <AlertTriangle className="h-4 w-4 text-[#8a3f34]" /> : <CircleAlert className="h-4 w-4 text-[#7d5e34]" />}
                  {ar ? check.titleAr : check.titleEn}
                </h3>
                <p className="mt-1.5 text-[11px] leading-6 text-[#4f5752]">{ar ? check.detailAr : check.detailEn}</p>
              </div>
              {check.severity !== 'passed' && check.fix !== 'none' && (
                check.id === 'escrow'
                  ? <Button size="sm" variant="outline" disabled={runtimeChecking} icon={<ChevronLeft className="h-4 w-4" />} onClick={() => void refreshRuntime()}>{runtimeChecking ? (ar ? 'جارٍ الفحص…' : 'Checking…') : (ar ? 'إعادة فحص الخادم' : 'Recheck server')}</Button>
                  : <Button size="sm" variant="outline" icon={<ChevronLeft className="h-4 w-4" />} onClick={() => onNavigate(fixTab[check.fix] || 'scope')}>{ar ? 'إصلاح' : 'Fix'}</Button>
              )}
            </div>
          </li>
        ))}
      </ul>

      {impact.sealed && (
        <div className="rounded-2xl border border-[#e4e2da] bg-white p-4">
          <h3 className="inline-flex items-center gap-2 text-sm font-black"><ListChecks className="h-4 w-4" />{ar ? 'أثر التعديل بعد التجميد' : 'Impact of changes since the freeze'}</h3>
          {impact.requiresResimulation ? (
            <ul className="mt-2 space-y-1 text-[11px] leading-6 text-[#7a5a2f]">
              <li>{ar ? `${impact.affectedParticipants} متسابقًا تغيّر نطاقه.` : `${impact.affectedParticipants} participants changed range.`}</li>
              <li>{ar ? `${impact.invalidModels} نموذجًا صار غير صالح.` : `${impact.invalidModels} models became invalid.`}</li>
              {impact.changedCategories.length > 0 && <li>{ar ? `فئات تغيّرت: ${impact.changedCategories.join('، ')}` : `Changed categories: ${impact.changedCategories.join(', ')}`}</li>}
              <li className="font-black">{ar ? 'يُنصح بإعادة المحاكاة قبل التشغيل.' : 'Re-run the simulation before going live.'}</li>
            </ul>
          ) : (
            <p className="mt-2 text-[11px] text-[#214C40]">{ar ? 'لم يتغيّر شيء منذ التجميد.' : 'Nothing has changed since the freeze.'}</p>
          )}
        </div>
      )}
    </div>
  );
};

const ModeCard: React.FC<{ active: boolean; ar: boolean; title: string; body: string; onClick: () => void }> = ({ active, title, body, onClick }) => (
  <button type="button" onClick={onClick} aria-pressed={active}
    className={`rounded-2xl border p-4 text-start transition ${active ? 'border-[#214C40] bg-[#E7EEE9]' : 'border-[#dcdad2] bg-white hover:bg-[#f7f5ef]'}`}>
    <div className="flex items-center gap-2">
      <span className={`grid h-5 w-5 place-items-center rounded-full border-2 ${active ? 'border-[#214C40] bg-[#214C40]' : 'border-[#c6c4bc]'}`}>
        {active && <span className="h-2 w-2 rounded-full bg-white" />}
      </span>
      <span className="text-sm font-black text-[#24302b]">{title}</span>
    </div>
    <p className="mt-2 text-[11px] leading-6 text-[#5b6460]">{body}</p>
  </button>
);

const NumberBox: React.FC<{ ar: boolean; label: string; value: number; min: number; max: number; step?: number; hint?: string; compact?: boolean; onChange: (value: number) => void }> = ({ label, value, min, max, step = 1, hint, compact, onChange }) => (
  <label className={`block min-w-0 ${compact ? 'w-28' : ''}`}>
    <span className="block text-[10px] font-black tracking-[.1em] text-[#696f6b]">{label}</span>
    <div className="mizan-control mt-1 flex items-center">
      <button type="button" className="mizan-step-btn" aria-label="-" onClick={() => onChange(Math.max(min, value - step))}>−</button>
      <input type="number" inputMode="numeric" min={min} max={max} value={value}
        onChange={e => onChange(Math.max(min, Math.min(max, Number(e.target.value) || min)))}
        className="min-w-0 flex-1 border-0 bg-transparent text-center text-sm font-black tabular-nums outline-none" />
      <button type="button" className="mizan-step-btn" aria-label="+" onClick={() => onChange(Math.min(max, value + step))}>+</button>
    </div>
    {hint && <span className="mt-1 block text-[9px] leading-4 text-[#696f6b]">{hint}</span>}
  </label>
);

const Toggle: React.FC<{ ar: boolean; checked: boolean; label: string; onChange: (value: boolean) => void }> = ({ checked, label, onChange }) => (
  <label className="inline-flex min-h-11 cursor-pointer items-center gap-2.5 rounded-xl border border-[#e4e2da] bg-white px-3 py-2">
    <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="h-4 w-4 shrink-0 accent-[#214C40]" />
    <span className="text-[11px] font-bold leading-5 text-[#4f5752]">{label}</span>
  </label>
);
