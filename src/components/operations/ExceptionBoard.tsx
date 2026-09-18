import React, { useMemo } from 'react';
import { AlertTriangle, Gavel, MonitorX } from 'lucide-react';

/*
 * الحالات الاستثنائية — لوحةٌ تُقرأ بنظرة، لا قائمةُ سطور.
 *
 * كانت ثمانية سطورٍ رماديةٍ متشابهة: نقطةٌ ملوّنة صغيرة، ثم عنوان، ثم وسم. ومدير التشغيل
 * لا يقرأ هذه البطاقة سطرًا سطرًا؛ ينظر إليها ليعرف جوابين في ثانية: **كم عندي، ومن أي
 * نوع؟** ثم ينزل إلى التفصيل إن احتاج.
 *
 * فصارت ثلاثة عدّادات بأنواعها فوق، ثم بطاقاتٌ بأيقونةٍ ولونٍ لكل نوع: حادث (أحمر)،
 * مراجعة تحكيم (ذهبي)، جهاز (أزرق). ولكل بطاقةٍ موضعها ووقتها حين يُعرفان — لأن «انقطاع
 * صوت» بلا قاعةٍ ولا وقتٍ لا يُعمل به.
 */

export type ExceptionKind = 'incident' | 'review' | 'device';

export interface ExceptionItem {
  id: string;
  kind: ExceptionKind;
  title: string;
  /** أين وقعت: رمز اللجنة أو القاعة أو اسم الجهاز. */
  where?: string;
  /** لحظة وقوعها بصيغة ISO، إن عُرفت. */
  at?: string;
  /** شدّتها كما يسمّيها سجلّها. */
  severity?: string;
}

const KIND_STYLE: Record<ExceptionKind, { icon: React.ComponentType<{ className?: string }>; dot: string; tint: string; border: string; ar: string; en: string }> = {
  incident: { icon: AlertTriangle, dot: '#A34D43', tint: '#FBF1EF', border: '#e8d3ce', ar: 'حادث', en: 'Incident' },
  review: { icon: Gavel, dot: '#9B7542', tint: '#FAF4E9', border: '#e7d9bd', ar: 'مراجعة تحكيم', en: 'Review' },
  device: { icon: MonitorX, dot: '#496477', tint: '#EFF3F6', border: '#cfd9e1', ar: 'جهاز', en: 'Device' },
};

const clockOf = (at?: string) => {
  if (!at) return '';
  const t = new Date(at);
  return Number.isFinite(t.getTime()) ? `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}` : '';
};

export const ExceptionBoard: React.FC<{ items: ExceptionItem[]; ar: boolean; severityLabel?: (value: string) => string }> = ({ items, ar, severityLabel }) => {
  const counts = useMemo(() => ({
    incident: items.filter(x => x.kind === 'incident').length,
    review: items.filter(x => x.kind === 'review').length,
    device: items.filter(x => x.kind === 'device').length,
  }), [items]);
  if (!items.length) return null;

  return (
    <section className="mizan-surface overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e5e3dc] px-5 py-4">
        <div>
          <div className="mizan-kicker">{ar ? 'الحالات الاستثنائية' : 'EXCEPTIONS'}</div>
          <h2 className="mt-0.5 text-sm font-black">{ar ? 'ما يحتاج قرارًا الآن' : 'What needs a decision now'}</h2>
        </div>
        {/* العدّادات بأنواعها: الجواب الأول قبل النزول إلى التفصيل. */}
        <div className="flex items-center gap-2">
          {(Object.keys(KIND_STYLE) as ExceptionKind[]).filter(k => counts[k] > 0).map(kind => {
            const style = KIND_STYLE[kind];
            const Icon = style.icon;
            return (
              <span key={kind} className="inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[11px] font-black" style={{ background: style.tint, color: style.dot }}>
                <Icon className="h-3.5 w-3.5" />
                <span className="tabular-nums">{counts[kind]}</span>
                <span className="font-bold opacity-80">{ar ? style.ar : style.en}</span>
              </span>
            );
          })}
        </div>
      </header>

      <ul className="grid gap-2 p-4 sm:grid-cols-2 sm:px-5">
        {items.slice(0, 8).map(item => {
          const style = KIND_STYLE[item.kind];
          const Icon = style.icon;
          const time = clockOf(item.at);
          return (
            <li key={`${item.kind}-${item.id}`} className="flex items-start gap-3 rounded-2xl border p-3.5" style={{ borderColor: style.border, background: style.tint }}>
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/80" style={{ color: style.dot }}><Icon className="h-4 w-4" /></span>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-black leading-5 text-[#2c322e]">{item.title}</div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] font-bold text-[#6b706c]">
                  <span>{ar ? style.ar : style.en}</span>
                  {item.where && <><span aria-hidden="true">·</span><span>{item.where}</span></>}
                  {time && <><span aria-hidden="true">·</span><span className="tabular-nums" dir="ltr">{time}</span></>}
                  {item.severity && <><span aria-hidden="true">·</span><span>{severityLabel ? severityLabel(item.severity) : item.severity}</span></>}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {items.length > 8 && (
        <p className="border-t border-[#eeece5] px-5 py-2.5 text-[10px] font-bold text-[#696f6b]">
          {ar ? `و${items.length - 8} حالة أخرى.` : `And ${items.length - 8} more.`}
        </p>
      )}
    </section>
  );
};

export default ExceptionBoard;
