import React, { useState, useEffect } from 'react';
import {
  Mic,
  Scale,
  Sparkles,
  ShieldCheck,
  Award,
  Radio,
  Pause,
  Clock,
  Volume2,
  CheckCircle2,
  AlertTriangle,
  Play,
  RotateCcw,
  Check,
  Binary,
  ArrowLeft,
} from 'lucide-react';
import { DnaIconTile } from '../dna/DnaKit';

/*
 * إنفوجرافيك تفاعلي متحرك لـ MarketingSite:
 * يعتمد على الحد الأدنى من الكلمات، ومقاييس بصرية تعبيرية متحركة، وأيقونات ورسوم حية
 * تحاكي تجربة نبض التحكيم والنزاهة وعزل البيانات.
 */

/* ── ١. إنفوجرافيك مسار التحكيم المباشر الذكي (Live Judging Simulation) ── */
export const LiveJudgingSimulator: React.FC = () => {
  const [activeToken, setActiveToken] = useState(2);
  const [isPlaying, setIsPlaying] = useState(true);
  const [judgeScore, setJudgeScore] = useState(98.5);
  const [pulse, setPulse] = useState(0);

  const tokens = [
    { word: 'الْحَمْدُ', tajweed: 'إظهار', state: 'perfect' },
    { word: 'لِلَّهِ', tajweed: 'ترقيق اللام', state: 'perfect' },
    { word: 'رَبِّ', tajweed: 'تشديد الراء', state: 'active' },
    { word: 'الْعَالَمِينَ', tajweed: 'مد عارض 4 حركات', state: 'pending' },
  ];

  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setActiveToken((prev) => {
        const next = (prev + 1) % tokens.length;
        setPulse((p) => p + 1);
        if (next === 3) setJudgeScore(98.0);
        else if (next === 0) setJudgeScore(98.5);
        return next;
      });
    }, 2400);
    return () => clearInterval(interval);
  }, [isPlaying]);

  return (
    <div className="dna-surface p-5 sm:p-7 relative overflow-hidden" style={{ color: 'var(--ink)' }}>

      {/* الشريط العلوي للإنفوجرافيك */}
      <div className="flex items-center justify-between pb-4" style={{ borderBottom: '1px dashed var(--line)' }}>
        <div className="flex items-center gap-3">
          <DnaIconTile icon={<Radio size={16} strokeWidth={1.6} />} tone="accent" size="sm" />
          <div>
            <div className="text-[13px] font-black mizan-title">محاكاة تلاوة · عيّنة توضيحية</div>
            <div className="text-[11px] font-medium mizan-muted">أرقامٌ للتوضيح، لا بثٌّ حيّ</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className="dna-btn text-[11px] font-bold flex items-center gap-1.5"
            aria-label={isPlaying ? 'إيقاف مؤقت' : 'تشغيل'}
          >
            {isPlaying ? (
              <>
                <Pause size={12} strokeWidth={1.6} />
                إيقاف
              </>
            ) : (
              <>
                <Play size={12} strokeWidth={1.6} />
                تشغيل
              </>
            )}
          </button>
        </div>
      </div>

      {/* لوحة الكلمات ومتابعة التجويد */}
      <div className="my-6">
        <div className="text-[11px] font-medium mizan-muted mb-2 flex items-center justify-between">
          <span>نص التلاوة اللحظي</span>
          <span style={{ color: 'var(--amber)' }}>رواية حفص عن عاصم</span>
        </div>

        <div className="p-4 rounded-2xl flex flex-wrap items-center justify-center gap-3 sm:gap-4 font-quran text-2xl sm:text-3xl" style={{ background: 'var(--canvas)', border: '1px solid var(--line)' }} dir="rtl">
          {tokens.map((t, idx) => {
            const isActive = idx === activeToken;
            const isDone = idx < activeToken;
            return (
              <div
                key={t.word}
                className={`relative px-4 py-2 rounded-xl transition-all duration-500 flex flex-col items-center ${
                  isActive
                    ? 'bg-[var(--emerald)] text-[var(--surface)] shadow-sm'
                    : isDone
                    ? 'text-[var(--ink)]'
                    : 'text-[var(--muted)] opacity-60'
                }`}
              >
                <span>{t.word}</span>
                <span
                  className={`text-[9px] font-arabic font-normal mt-1 px-1.5 py-0.5 rounded ${
                    isActive ? 'bg-[var(--surface)] text-[var(--emerald)]' : 'text-transparent'
                  }`}
                >
                  {t.tajweed}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* المؤشرات الرسومية المتحركة السفلية */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
        {/* مؤشر الصوت والتردد */}
        <div className="p-3 rounded-2xl" style={{ background: 'var(--canvas)', border: '1px solid var(--line)' }}>
          <div className="flex items-center justify-between text-[11px] mizan-muted font-medium">
            <span className="flex items-center gap-1"><Mic size={12} strokeWidth={1.6} style={{ color: 'var(--emerald)' }} /> سلامة الصوت</span>
            <span style={{ color: 'var(--emerald)' }}>99%</span>
          </div>
          <div className="mt-2.5 flex items-end gap-1 h-6">
            {[40, 75, 100, 60, 85, 95, 50, 80].map((h, i) => (
              <div
                key={i}
                className="flex-1 rounded-full transition-all duration-300"
                style={{
                  height: isPlaying ? `${((h + pulse * 12) % 70) + 30}%` : `${h * 0.5}%`,
                  backgroundColor: i === 3 ? 'var(--gold)' : 'var(--emerald-2)',
                }}
              />
            ))}
          </div>
        </div>

        {/* مؤشر المدود الحركي */}
        <div className="p-3 rounded-2xl" style={{ background: 'var(--canvas)', border: '1px solid var(--line)' }}>
          <div className="flex items-center justify-between text-[11px] mizan-muted font-medium">
            <span className="flex items-center gap-1"><Clock size={12} strokeWidth={1.6} style={{ color: 'var(--amber)' }} /> ميزان المدود</span>
            <span style={{ color: 'var(--amber)' }}>4 حركات</span>
          </div>
          <div className="mt-3 relative w-full h-2 rounded-full overflow-hidden" style={{ background: 'var(--line)' }}>
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ background: 'var(--emerald-2)', width: isPlaying ? (activeToken === 3 ? '92%' : '75%') : '50%' }}
            />
          </div>
          <div className="text-[10px] mizan-muted mt-1 text-center font-mono">2.1s · بالنبض</div>
        </div>

        {/* مؤشر توافق المحكمين */}
        <div className="p-3 rounded-2xl" style={{ background: 'var(--canvas)', border: '1px solid var(--line)' }}>
          <div className="flex items-center justify-between text-[11px] mizan-muted font-medium">
            <span className="flex items-center gap-1"><Scale size={12} strokeWidth={1.6} style={{ color: 'var(--blue)' }} /> وفاق اللجنة</span>
            <span style={{ color: 'var(--blue)' }}>100%</span>
          </div>
          <div className="mt-2 flex justify-center gap-1.5">
            {['لجنة 1', 'لجنة 2', 'لجنة 3'].map((l, i) => (
              <div
                key={l}
                className="w-7 h-7 rounded-full grid place-items-center"
                style={{ background: 'var(--emerald-soft)', color: 'var(--emerald)' }}
                title={l}
              >
                <Check size={13} strokeWidth={1.8} aria-label={l} />
              </div>
            ))}
          </div>
        </div>

        {/* النتيجة والختم الفوري */}
        <div className="p-3 rounded-2xl text-center" style={{ background: 'var(--emerald-soft)', border: '1px solid var(--line)' }}>
          <div className="text-[10px] mizan-muted font-medium">درجة العيّنة</div>
          <div className="text-2xl font-black font-display text-[var(--emerald)] mt-0.5">{judgeScore.toFixed(1)}</div>
          <div className="text-[9px] text-[var(--emerald-2)] font-mono flex items-center justify-center gap-1 mt-0.5">
            <ShieldCheck size={11} /> مختومة بسلسلة
          </div>
        </div>
      </div>
    </div>
  );
};

/* ── ٢. إنفوجرافيك المقارنة البصرية التفاعلية: قبل وبعد ميزان ── */
export const InteractiveEvolutionFlow: React.FC = () => {
  const [selectedStation, setSelectedStation] = useState(2);

  const stations = [
    {
      id: 0,
      title: 'استقبال القاعة',
      traditional: { badge: 'كشف ورقي وطابور', detail: 'تأكيد الحضور يدوي وتأخر في انطلاق الجلسات' },
      mizan: { badge: 'مسح ضوئي ذكي', detail: 'دخول خلال 3 ثوانٍ وتوجيه فوري للقاعة المخصصة' },
      metric: 'وفر 90% من الوقت',
    },
    {
      id: 1,
      title: 'استمارة التسجيل',
      traditional: { badge: 'ملفات ونماذج ورقية', detail: 'فرز متعب وأخطاء في بيانات الروايات والحفظ' },
      mizan: { badge: 'رابط مباشر معتمد', detail: 'تحقق لحظي من الشروط والأهلية قبل القبول' },
      metric: 'صفر أوراق مفقودة',
    },
    {
      id: 2,
      title: 'لجنة التحكيم',
      traditional: { badge: 'أوراق تصحيح وشطب', detail: 'تفاوت المعايير وصعوبة تعديل أو مراجعة الخطأ' },
      mizan: { badge: 'شاشة المحكم الذكية', detail: 'درجة معلنة، وتحديد مواضع المتشابهات بلمسة واحدة' },
      metric: 'دقة تحكيم مطلقة',
    },
    {
      id: 3,
      title: 'الفرز والنتائج',
      traditional: { badge: 'ليلة فرز يدوية', detail: 'حسابات مطولة واحتمال خطأ في جمع الدرجات' },
      mizan: { badge: 'اعتماد فوري مشفّر', detail: 'الترتيب جاهز عند آخر حرف يُتلى مع نصاب معتمد' },
      metric: 'إعلان فوري بنقرة',
    },
    {
      id: 4,
      title: 'الشهادات والتكريم',
      traditional: { badge: 'طباعة وتواقيع يدوية', detail: 'صعوبة التحقق من صحة الدرجة لاحقاً' },
      mizan: { badge: 'ختم رقمي قابل للإثبات', detail: 'رمز استجابة دائم يمكن لأي جهة في العالم التحقق منه' },
      metric: 'موثوقية دائمة',
    },
  ];

  const curr = stations[selectedStation];

  return (
    <div className="rounded-[28px] bg-white border border-[var(--line)] p-6 sm:p-8 shadow-sm">
      {/* شريط المحطات - Tabs مصممة كإنفوجرافيك تسلسلي */}
      <div className="flex items-center justify-between gap-2 overflow-x-auto pb-3 mb-6 border-b border-[var(--line)]">
        {stations.map((s, idx) => {
          const isSelected = selectedStation === idx;
          return (
            <button
              key={s.id}
              onClick={() => setSelectedStation(idx)}
              className={`flex-1 min-w-[120px] py-3 px-3 rounded-2xl transition-all text-center flex flex-col items-center gap-1.5 ${
                isSelected
                  ? 'bg-[var(--emerald)] text-white shadow-md'
                  : 'bg-[var(--canvas)] text-[var(--muted)] hover:bg-[var(--emerald-soft)]'
              }`}
            >
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${isSelected ? 'bg-white/20 text-[var(--gold-light)]' : 'bg-black/5 text-[var(--muted)]'}`}>
                المرحلة 0{idx + 1}
              </span>
              <span className="text-xs font-extrabold">{s.title}</span>
            </button>
          );
        })}
      </div>

      {/* المقارنة البصرية للمحطة المحددة */}
      <div className="grid md:grid-cols-2 gap-5 items-stretch">
        {/* الطريقة التقليدية (قبل ميزان) */}
        <div className="rounded-2xl p-5 bg-[var(--surface-soft)] border border-[var(--line)] relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-bold text-[var(--danger)] bg-[var(--danger-soft)] px-3 py-1 rounded-full flex items-center gap-1">
              <AlertTriangle size={13} strokeWidth={1.6} /> في المسابقات السابقة
            </span>
            <span className="text-[11px] mizan-muted">طريقة ورقية</span>
          </div>

          <div className="my-3">
            <h3 className="text-base font-black mizan-muted">{curr.traditional.badge}</h3>
            <p className="text-xs text-[var(--muted)] mt-2 leading-6">{curr.traditional.detail}</p>
          </div>

          <div className="mt-4 pt-3 border-t border-[var(--line)] text-[11px] text-[var(--danger)] font-bold flex items-center gap-1.5">
            <AlertTriangle size={13} strokeWidth={1.6} />
            <span>عبء تشغيلي وتأخر متكرر</span>
          </div>
        </div>

        {/* مع منظومة ميزان */}
        <div className="rounded-2xl p-5 bg-[var(--emerald-soft)] border-2 border-[var(--emerald-2)] relative overflow-hidden flex flex-col justify-between shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-bold text-[var(--emerald)] bg-white px-3 py-1 rounded-full flex items-center gap-1 shadow-sm">
              <CheckCircle2 size={13} className="text-[var(--emerald-2)]" /> مع منظومة ميزان
            </span>
            <span className="text-[11px] font-black text-[var(--emerald-2)] bg-[var(--surface)] px-2 py-0.5 rounded">
              {curr.metric}
            </span>
          </div>

          <div className="my-3">
            <h3 className="text-base font-black text-[var(--ink)] flex items-center gap-2">
              <Sparkles size={16} className="text-[var(--gold)]" /> {curr.mizan.badge}
            </h3>
            <p className="text-xs text-[var(--emerald)] mt-2 leading-6 font-medium">{curr.mizan.detail}</p>
          </div>

          <div className="mt-4 pt-3 border-t border-[var(--emerald-2)]/20 text-[11px] text-[var(--emerald)] font-black flex items-center gap-1.5">
            <ShieldCheck size={14} className="text-[var(--emerald-2)]" />
            <span>نظام رقمي مؤتمت بالكامل بلا أوراق</span>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ── ٣. إنفوجرافيك معمارية النزاهة وعزل النطاقات (Security & Isolation Visual) ── */
export const SecurityAndArchitectureInfographic: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'isolation' | 'chain'>('isolation');

  return (
    <div className="rounded-[28px] bg-[var(--venue-2)] text-white p-6 sm:p-8 border border-white/10 shadow-xl">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <div className="text-[11px] font-black text-[var(--gold-light)] tracking-widest uppercase">
            البنية التحتية والنزاهة
          </div>
          <h3 className="text-xl sm:text-2xl font-black text-[var(--venue-ink)] mt-1">
            {activeTab === 'isolation' ? 'عزل كامل لكل جهة في بيئتها' : 'سلسلة الختم الرقمي لكل قرار'}
          </h3>
        </div>

        <div className="mizan-tabs mizan-tabs-dark" role="tablist">
          <button
            onClick={() => setActiveTab('isolation')}
            className={`mizan-tab ${activeTab === 'isolation' ? 'is-active' : ''}`}
          >
            نطاق وعزل الجهات
          </button>
          <button
            onClick={() => setActiveTab('chain')}
            className={`mizan-tab ${activeTab === 'chain' ? 'is-active' : ''}`}
          >
            سلسلة النزاهة المتصلة
          </button>
        </div>
      </div>

      {activeTab === 'isolation' ? (
        /* رسم توضيحي لعزل النطاقات */
        <div className="grid md:grid-cols-3 gap-4">
          {[
            {
              domain: 'jiha-a.example',
              name: 'جهة (أ) — مثال',
              db: 'قاعدة بيانات مشفرة مستقلة',
              active: true,
            },
            {
              domain: 'jiha-b.example',
              name: 'جهة (ب) — مثال',
              db: 'سجلات ولجان خاصة بالجمعية',
              active: false,
            },
            {
              domain: 'jiha-c.example',
              name: 'جهة (ج) — مثال',
              db: 'هوية وبوابة مرشحين منفصلة',
              active: false,
            },
          ].map((org, i) => (
            <div
              key={org.domain}
              className={`rounded-2xl p-5 border transition-all duration-300 relative ${
                i === 0
                  ? 'bg-gradient-to-b from-[var(--venue)] to-[var(--venue-2)] border-[var(--emerald-2)] ring-1 ring-[var(--gold-light)]/40'
                  : 'bg-white/[0.02] border-white/10 opacity-75 hover:opacity-100'
              }`}
            >
              <div className="flex items-center justify-between text-[11px] mb-3">
                <span className="font-mono text-[var(--gold-light)] font-bold">{org.domain}</span>
                <span className="inline-flex items-center gap-1 text-[10px] text-[var(--gold-light)]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--gold-light)]" /> آمن ومستقل
                </span>
              </div>
              <div className="text-base font-black text-[var(--venue-ink)]">{org.name}</div>
              <div className="text-xs text-[var(--venue-muted)] mt-2">{org.db}</div>

              <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between text-[10px] text-[var(--venue-faint)]">
                <span>عزل كامل 100%</span>
                <span className="font-mono">Zero Cross-Access</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* رسم توضيحي لسلسلة النزاهة */
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { step: '1. التلاوة', icon: Mic, title: 'إثبات الصوت', desc: 'تسجيل الوقف والتردد لحظياً' },
            { step: '2. التقييم', icon: Scale, title: 'إدخال اللجان', desc: 'تطابق درجات مستقل' },
            { step: '3. التشفير', icon: Binary, title: 'الختم الرقمي', desc: 'توليد بصمة SHA مشفرة' },
            { step: '4. الشهادة', icon: Award, title: 'رمز التحقق', desc: 'سجل لا يقبل التعديل أبداً' },
          ].map((s, idx) => (
            <div key={s.step} className="rounded-2xl p-4 bg-white/[0.03] border border-white/10 text-center relative flex flex-col items-center">
              <div className="w-10 h-10 rounded-xl bg-[var(--emerald-2)]/30 text-[var(--gold-light)] grid place-items-center mb-2">
                <s.icon size={18} strokeWidth={1.6} />
              </div>
              <div className="text-[10px] font-mono text-[var(--venue-faint)]">{s.step}</div>
              <div className="text-sm font-black text-[var(--venue-ink)] mt-1">{s.title}</div>
              <div className="text-[11px] text-[var(--venue-muted)] mt-1">{s.desc}</div>
              {idx < 3 && (
                <div className="hidden sm:block absolute -left-2 top-1/2 -translate-y-1/2 text-white/30" aria-hidden="true">
                  <ArrowLeft size={14} strokeWidth={1.6} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
