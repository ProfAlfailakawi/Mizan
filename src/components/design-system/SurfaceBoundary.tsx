import React from 'react';
import { AlertTriangle } from 'lucide-react';

/*
 * حارس الأخطاء الجذري يمسك كل شيء — ولهذا يمسح كل شيء: استثناءٌ في لوحةٍ استشارية
 * جانبية كان يُسقط شاشة التحكيم كاملة إلى صفحة عطلٍ بيضاء أثناء تلاوة متسابق.
 *
 * هذا حارسٌ موضعي: يعزل اللوحة التي سقطت وحدها، ويُبقي ما حولها يعمل، ويقول للمستخدم
 * إن هذا الجزء وحده تعطّل وإن عمله لم يُمسّ. لا يُستعمل حول جوهر العمل نفسه — رصد
 * الدرجات وحفظها — بل حول ما يُستغنى عنه إن سقط.
 */
interface Props { children?: React.ReactNode; label: string; ar?: boolean }
interface State { failed: boolean }

class Boundary extends React.Component<Props, State> {
  state: State = { failed: false };
  static getDerivedStateFromError(): State { return { failed: true }; }
  componentDidCatch(error: Error) { console.error('MIZAN surface failure:', this.props.label, error); }
  render() {
    if (!this.state.failed) return this.props.children;
    const ar = this.props.ar !== false;
    return (
      <div role="status" className="rounded-2xl border border-[#e5d7d3] bg-[#faf3f1] p-4 flex items-start gap-3">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-[#8b4d44]" />
        <div className="text-[12px] font-bold leading-6 text-[#7a463f]">
          {ar
            ? `تعذّر عرض «${this.props.label}» على هذا الجهاز. بقية الشاشة تعمل، ولم يتأثّر شيء مما رصدته.`
            : `“${this.props.label}” could not be displayed on this device. The rest of the screen works, and nothing you recorded was affected.`}
        </div>
      </div>
    );
  }
}

/* المشروع بلا @types/react، فأنواع المكوّن الصنفي لا تعبّر عن children (انظر AppErrorBoundary). */
export const SurfaceBoundary = Boundary as unknown as React.FC<Props & { children?: React.ReactNode }>;
