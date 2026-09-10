import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { sendHeartbeat } from '../../lib/ops-heartbeat';
import { STORAGE_KEY } from '../../lib/store-state';

/*
 * الشاشة البيضاء.
 *
 * لم يكن في التطبيق حارس أخطاء واحد. فأي استثناء أثناء الرسم يُسقط الشجرة كلها إلى فراغ
 * أبيض: لا رسالة للمستخدم، ولا أثر لمن يصلح. والأسوأ أن العطل غالبًا يأتي من الحالة المحفوظة
 * على الجهاز، فيتكرر مع كل إعادة تحميل ولا ينجو منه إلا من يفتح نافذة خفية — وهو ما لا
 * يخطر لمستخدم عادي، ولا يجوز أن يكون هو الحل.
 *
 * هذا الحارس يقلب ذلك إلى ثلاثة أشياء:
 *   1. رسالة عربية تقول إن العطل في هذا الجهاز لا في حسابه، وتُطمئنه أن عمله المرفوع سليم.
 *   2. زرّ يمسح الحالة المحلية ويعيد التحميل — وهو ما تفعله النافذة الخفية، بلا نافذة خفية.
 *   3. نبضة إلى لوحة المالك: العطل يصل إلى من يصلحه بدل أن يموت عند شاشة صاحبه.
 */

/* المفتاح يُستورد ولا يُنسخ: زرُّ تعافٍ يمسح مفتاحًا غير الذي يكتبه المخزن لا يُعافي شيئًا. */
const STORAGE_KEYS = [STORAGE_KEY];

interface State { error: Error | null }
interface Props { children?: React.ReactNode }

class Boundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    // السجل أولًا: إن تعذّر الإبلاغ يبقى الأثر في المتصفح لمن يفتح الطرفية.
    console.error('MIZAN render failure:', error, info?.componentStack);
    /* رمز العطل ونطاقه فقط — لا بيانات مستخدم. وفشل الإبلاغ لا يُفشل شاشة العطل نفسها. */
    void sendHeartbeat({
      subjectId: 'render-failure',
      status: 'DEGRADED',
      meta: { errorCode: 'RENDER_CRASH', message: String(error?.message || '').slice(0, 200) },
    }).catch(() => {});
  }

  private recover = () => {
    /* هذا ما تفعله النافذة الخفية: تبدأ بذاكرة نظيفة. لا يُمسّ شيء على الخادم. */
    for (const key of STORAGE_KEYS) { try { localStorage.removeItem(key) } catch { /* متصفح يمنع التخزين */ } }
    try { sessionStorage.clear() } catch { /* لا يمنع إعادة التحميل */ }
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div dir="rtl" className="min-h-screen grid place-items-center bg-[#f7f5ef] p-5 font-arabic">
        <div className="mizan-surface max-w-lg w-full p-8 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#F6E7E7] text-[#7A2E2E]">
            <AlertTriangle className="h-7 w-7" />
          </div>
          <h1 className="mt-5 text-xl font-black text-[#20241f]">تعذّر عرض الشاشة على هذا الجهاز</h1>
          <p className="mt-3 text-sm leading-7 text-[#5b625d]">
            العطل في النسخة المحفوظة على هذا المتصفح، لا في حسابك ولا في بياناتك.
            كل ما رُفع إلى الخادم سليم، ويظهر كما هو عند الدخول من جهاز آخر.
          </p>
          <button
            onClick={this.recover}
            className="mt-6 w-full rounded-2xl bg-[#214C40] px-6 py-3 text-sm font-black text-white"
          >
            مسح بيانات هذا الجهاز وإعادة التحميل
          </button>
          <p className="mt-3 text-[11px] leading-5 text-[#6b716c]">
            لن يُحذف شيء من حسابك. سيُطلب منك تسجيل الدخول من جديد فقط.
          </p>
          <p className="mt-4 text-[10px] text-[#656b66]" dir="ltr">{String(this.state.error?.message || '').slice(0, 160)}</p>
        </div>
      </div>
    );
  }
}

/*
 * المشروع بلا @types/react، فأنواع React فيه لا تعبّر عن `children` لمكوّن صنفي — يسقط ذلك
 * على أي حارس أخطاء مهما كُتب، وقد تحققت منه بمكوّن صنفي مصغّر يسقط بالخطأ نفسه. وإضافة
 * حزمة الأنواع الآن تمسّ 558 ملفًا وسط عطل قائم، فالتحويل محصور في هذا السطر وحده بدل
 * نثره في مواضع الاستعمال.
 */
export const AppErrorBoundary = Boundary as unknown as React.FC<{ children?: React.ReactNode }>;
