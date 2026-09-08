import React, { useState, useEffect } from 'react';
import {
  Mic,
  Scale,
  Sparkles,
  ShieldCheck,
  Award,
  Radio,
  Clock,
  Volume2,
  CheckCircle2,
  AlertTriangle,
  Play,
  RotateCcw,
  Check,
  Binary,
} from 'lucide-react';

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
    { word: 'الْعَالَمِينَ', tajweed: 'مد عارض ٤ حركات', state: 'pending' },
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
    <div className="rounded-[26px] p-5 sm:p-7 border border-[#2F6555]/25 bg-gradient-to-b from-[#16241F] to-[#101A16] text-[#F4F1E8] shadow-2xl relative overflow-hidden">
      {/* وميض خلفي تعبيري */}
      <div className="absolute -top-24 -left-24 w-60 h-60 bg-[#2F6555]/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -right-24 w-60 h-60 bg-[#B98B4E]/15 rounded-full blur-3xl pointer-events-none" />

      {/* الشريط العلوي للإنفوجرافيك */}
      <div className="flex items-center justify-between border-b border-white/10 pb-4">
        <div className="flex items-center gap-3">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#34D399] opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-[#10B981]" />
          </span>
          <div className="text-xs font-black tracking-wide text-[#E8CB93] flex items-center gap-1.5">
            <Radio size={14} className="animate-pulse text-[#34D399]" />
            محاكاة تلاوة حية · القاعة الرئيسية
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className="px-3 py-1 rounded-lg text-[11px] font-bold border border-white/15 bg-white/5 hover:bg-white/10 transition flex items-center gap-1.5"
            aria-label={isPlaying ? 'إيقاف مؤقت' : 'تشغيل'}
          >
            {isPlaying ? (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-[#E8CB93]" />
                مباشر
              </>
            ) : (
              <>
                <Play size={10} className="text-[#34D399]" />
                تشغيل
              </>
            )}
          </button>
        </div>
      </div>

      {/* لوحة الكلمات ومتابعة التجويد */}
      <div className="my-6">
        <div className="text-[11px] font-bold text-[#A9B6AE] mb-2 flex items-center justify-between">
          <span>نص التلاوة اللحظي</span>
          <span className="text-[#B98B4E]">رواية حفص عن عاصم</span>
        </div>

        <div className="p-4 rounded-2xl bg-black/25 border border-white/10 flex flex-wrap items-center justify-center gap-3 sm:gap-4 font-quran text-2xl sm:text-3xl" dir="rtl">
          {tokens.map((t, idx) => {
            const isActive = idx === activeToken;
            const isDone = idx < activeToken;
            return (
              <div
                key={t.word}
                className={`relative px-4 py-2 rounded-xl transition-all duration-500 flex flex-col items-center ${
                  isActive
                    ? 'bg-[#2F6555] text-[#F4F1E8] scale-105 shadow-lg shadow-[#2F6555]/40 border border-[#34D399]/50'
                    : isDone
                    ? 'text-[#A9B6AE] opacity-90'
                    : 'text-white/40'
                }`}
              >
                <span>{t.word}</span>
                <span
                  className={`text-[9px] font-arabic font-normal mt-1 px-1.5 py-0.5 rounded ${
                    isActive ? 'bg-[#16241F] text-[#E8CB93]' : 'text-transparent'
                  }`}
                >
                  {t.tajweed}
                </span>
                {isActive && (
                  <span className="absolute -top-1.5 right-1/2 translate-x-1/2 w-2 h-2 rounded-full bg-[#E8CB93] animate-ping" />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* المؤشرات الرسومية المتحركة السفلية */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
        {/* مؤشر الصوت والتردد */}
        <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10">
          <div className="flex items-center justify-between text-[11px] text-[#A9B6AE] font-bold">
            <span className="flex items-center gap-1"><Mic size={12} className="text-[#34D399]" /> سلامة الصوت</span>
            <span className="text-[#34D399]">99%</span>
          </div>
          <div className="mt-2.5 flex items-end gap-1 h-6">
            {[40, 75, 100, 60, 85, 95, 50, 80].map((h, i) => (
              <div
                key={i}
                className="flex-1 bg-[#2F6555] rounded-full transition-all duration-300"
                style={{
                  height: isPlaying ? `${((h + pulse * 12) % 70) + 30}%` : `${h * 0.5}%`,
                  backgroundColor: i === 3 ? '#E8CB93' : undefined,
                }}
              />
            ))}
          </div>
        </div>

        {/* مؤشر المدود الحركي */}
        <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10">
          <div className="flex items-center justify-between text-[11px] text-[#A9B6AE] font-bold">
            <span className="flex items-center gap-1"><Clock size={12} className="text-[#E8CB93]" /> ميزان المدود</span>
            <span className="text-[#E8CB93]">٤ حركات</span>
          </div>
          <div className="mt-3 relative w-full bg-white/10 h-2 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-[#2F6555] to-[#E8CB93] rounded-full transition-all duration-700"
              style={{ width: isPlaying ? (activeToken === 3 ? '92%' : '75%') : '50%' }}
            />
          </div>
          <div className="text-[10px] text-[#656b66] mt-1 text-center font-mono">2.1s · بالنبض</div>
        </div>

        {/* مؤشر توافق المحكمين */}
        <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10">
          <div className="flex items-center justify-between text-[11px] text-[#A9B6AE] font-bold">
            <span className="flex items-center gap-1"><Scale size={12} className="text-[#38BDF8]" /> وفاق اللجنة</span>
            <span className="text-[#38BDF8]">100%</span>
          </div>
          <div className="mt-2 flex justify-center gap-1.5">
            {['لجنة ١', 'لجنة ٢', 'لجنة ٣'].map((l, i) => (
              <div
                key={l}
                className="w-7 h-7 rounded-lg bg-[#2F6555]/40 border border-[#34D399]/30 grid place-items-center text-[10px] font-bold text-[#E8CB93]"
                title={l}
              >
                ✓
              </div>
            ))}
          </div>
        </div>

        {/* النتيجة والختم الفوري */}
        <div className="p-3 rounded-xl bg-gradient-to-br from-[#2F6555]/40 to-transparent border border-[#34D399]/30 text-center">
          <div className="text-[10px] text-[#A9B6AE] font-bold">الدرجة المعتمدة</div>
          <div className="text-2xl font-black font-display text-[#E8CB93] mt-0.5">{judgeScore.toFixed(1)}</div>
          <div className="text-[9px] text-[#34D399] font-mono flex items-center justify-center gap-1 mt-0.5">
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
    <div className="rounded-[28px] bg-white border border-[#DFDED7] p-6 sm:p-8 shadow-sm">
      {/* شريط المحطات - Tabs مصممة كإنفوجرافيك تسلسلي */}
      <div className="flex items-center justify-between gap-2 overflow-x-auto pb-3 mb-6 border-b border-[#DFDED7]">
        {stations.map((s, idx) => {
          const isSelected = selectedStation === idx;
          return (
            <button
              key={s.id}
              onClick={() => setSelectedStation(idx)}
              className={`flex-1 min-w-[120px] py-3 px-3 rounded-2xl transition-all text-center flex flex-col items-center gap-1.5 ${
                isSelected
                  ? 'bg-[#214C40] text-white shadow-md'
                  : 'bg-[#F7F5EF] text-[#696F6B] hover:bg-[#E7EEE9]'
              }`}
            >
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${isSelected ? 'bg-white/20 text-[#E8CB93]' : 'bg-black/5 text-[#696F6B]'}`}>
                المرحلة ٠{idx + 1}
              </span>
              <span className="text-xs font-extrabold">{s.title}</span>
            </button>
          );
        })}
      </div>

      {/* المقارنة البصرية للمحطة المحددة */}
      <div className="grid md:grid-cols-2 gap-5 items-stretch">
        {/* الطريقة التقليدية (قبل ميزان) */}
        <div className="rounded-2xl p-5 bg-[#F9F7F4] border border-[#E5E0D8] relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-bold text-[#A34D43] bg-[#F4E6E3] px-3 py-1 rounded-full flex items-center gap-1">
              <AlertTriangle size={13} /> في المسابقات السابقة
            </span>
            <span className="text-[11px] text-[#656b66] line-through">طريقة ورقية</span>
          </div>

          <div className="my-3">
            <h3 className="text-base font-black text-[#696F6B] line-through">{curr.traditional.badge}</h3>
            <p className="text-xs text-[#656b66] mt-2 leading-6">{curr.traditional.detail}</p>
          </div>

          <div className="mt-4 pt-3 border-t border-[#E5E0D8] text-[11px] text-[#A34D43] font-bold flex items-center gap-1.5">
            <span>⚠️ عبء تشغيلي وتأخر متكرر</span>
          </div>
        </div>

        {/* مع منظومة ميزان */}
        <div className="rounded-2xl p-5 bg-[#E7EEE9] border-2 border-[#2F6555] relative overflow-hidden flex flex-col justify-between shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-bold text-[#214C40] bg-white px-3 py-1 rounded-full flex items-center gap-1 shadow-sm">
              <CheckCircle2 size={13} className="text-[#2F6555]" /> مع منظومة ميزان
            </span>
            <span className="text-[11px] font-black text-[#2F6555] bg-[#34D399]/20 px-2 py-0.5 rounded">
              {curr.metric}
            </span>
          </div>

          <div className="my-3">
            <h3 className="text-base font-black text-[#171B18] flex items-center gap-2">
              <Sparkles size={16} className="text-[#B98B4E]" /> {curr.mizan.badge}
            </h3>
            <p className="text-xs text-[#214C40] mt-2 leading-6 font-medium">{curr.mizan.detail}</p>
          </div>

          <div className="mt-4 pt-3 border-t border-[#2F6555]/20 text-[11px] text-[#214C40] font-black flex items-center gap-1.5">
            <ShieldCheck size={14} className="text-[#2F6555]" />
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
    <div className="rounded-[28px] bg-[#11211B] text-white p-6 sm:p-8 border border-white/10 shadow-xl">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <div className="text-[11px] font-black text-[#E8CB93] tracking-widest uppercase">
            البنية التحتية والنزاهة
          </div>
          <h3 className="text-xl sm:text-2xl font-black text-[#F4F1E8] mt-1">
            {activeTab === 'isolation' ? 'عزل كامل لكل جهة في بيئتها' : 'سلسلة الختم الرقمي لكل قرار'}
          </h3>
        </div>

        <div className="flex items-center gap-1.5 bg-white/5 p-1 rounded-xl border border-white/10">
          <button
            onClick={() => setActiveTab('isolation')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
              activeTab === 'isolation' ? 'bg-[#2F6555] text-white shadow' : 'text-[#A9B6AE] hover:text-white'
            }`}
          >
            نطاق وعزل الجهات
          </button>
          <button
            onClick={() => setActiveTab('chain')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
              activeTab === 'chain' ? 'bg-[#2F6555] text-white shadow' : 'text-[#A9B6AE] hover:text-white'
            }`}
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
              domain: 'awqaf.gov.kw',
              name: 'وزارة الأوقاف',
              db: 'قاعدة بيانات مشفرة مستقلة',
              active: true,
            },
            {
              domain: 'maknoon.org.sa',
              name: 'جمعية مكنون',
              db: 'سجلات ولجان خاصة بالجمعية',
              active: false,
            },
            {
              domain: 'quran-dubai.ae',
              name: 'جائزة دبي للقرآن',
              db: 'هوية وبوابة مرشحين منفصلة',
              active: false,
            },
          ].map((org, i) => (
            <div
              key={org.domain}
              className={`rounded-2xl p-5 border transition-all duration-300 relative ${
                i === 0
                  ? 'bg-gradient-to-b from-[#16241F] to-[#11211B] border-[#2F6555] ring-1 ring-[#34D399]/40'
                  : 'bg-white/[0.02] border-white/10 opacity-75 hover:opacity-100'
              }`}
            >
              <div className="flex items-center justify-between text-[11px] mb-3">
                <span className="font-mono text-[#E8CB93] font-bold">{org.domain}</span>
                <span className="inline-flex items-center gap-1 text-[10px] text-[#34D399]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#34D399]" /> آمن ومستقل
                </span>
              </div>
              <div className="text-base font-black text-[#F4F1E8]">{org.name}</div>
              <div className="text-xs text-[#A9B6AE] mt-2">{org.db}</div>

              <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between text-[10px] text-[#656b66]">
                <span>عزل كامل ١٠٠٪</span>
                <span className="font-mono">Zero Cross-Access</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* رسم توضيحي لسلسلة النزاهة */
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { step: '١. التلاوة', icon: Mic, title: 'إثبات الصوت', desc: 'تسجيل الوقف والتردد لحظياً' },
            { step: '٢. التقييم', icon: Scale, title: 'إدخال اللجان', desc: 'تطابق درجات مستقل' },
            { step: '٣. التشفير', icon: Binary, title: 'الختم الرقمي', desc: 'توليد بصمة SHA مشفرة' },
            { step: '٤. الشهادة', icon: Award, title: 'رمز التحقق', desc: 'سجل لا يقبل التعديل أبداً' },
          ].map((s, idx) => (
            <div key={s.step} className="rounded-2xl p-4 bg-white/[0.03] border border-white/10 text-center relative flex flex-col items-center">
              <div className="w-10 h-10 rounded-xl bg-[#2F6555]/30 text-[#E8CB93] grid place-items-center mb-2">
                <s.icon size={18} />
              </div>
              <div className="text-[10px] font-mono text-[#656b66]">{s.step}</div>
              <div className="text-sm font-black text-[#F4F1E8] mt-1">{s.title}</div>
              <div className="text-[11px] text-[#A9B6AE] mt-1">{s.desc}</div>
              {idx < 3 && (
                <div className="hidden sm:block absolute -left-2 top-1/2 -translate-y-1/2 text-white/20 text-xs">
                  ←
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
