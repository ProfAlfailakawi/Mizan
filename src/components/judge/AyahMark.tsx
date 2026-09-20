import React from 'react';

/*
 * فاصلةُ الآية — ما يراه القارئ في المصحف بين آيتين.
 *
 * نصوصُ التسليم تصل بلا علامةِ نهايةِ آية: سلسلةُ إسلام ويب لم تحملها أصلًا، وسلسلةُ
 * المجمّع جُرِّد منها الرقمُ عند تثبيت بايتات المرآة — قِيس ذلك من البايتات المثبَّتة نفسِها
 * لا من ذاكرة. فالنصُّ المخزون آيةٌ آية، وحدُّها معلومٌ بالبنية لا بحرفٍ داخل النصّ.
 *
 * فالفاصلة تُرسم هنا من رقم الآية المعروف، ولا تُقرأ من النصّ ولا تُضاف إليه: نصُّ الآية
 * يبقى كما سُلِّم حرفًا بحرف، والعلامةُ طبقةُ عرضٍ فوقه. وهذا يحفظ المقارنةَ والبحثَ
 * والتتبّعَ الصوتيَّ من أن تصطدم بحرفٍ لم يُسلَّم.
 *
 * ورُسمت شكلًا متّجهًا (SVG) لا محرفًا، لأن `U+06DD` لا يُركِّب الرقمَ إلا في خطوط المصحف
 * الرسمية — فإن لم يُحمَّل الخطّ ظهرت العلامةُ مربّعًا. والشكلُ المتّجه يظهر كما هو في كل
 * خطّ وكل جهاز.
 */

const ARABIC_INDIC = '٠١٢٣٤٥٦٧٨٩';

/** ٤٢ ← 42. يرفض ما ليس عددًا صحيحًا موجبًا بدل أن يطبع «NaN» على وجه المصحف. */
export function arabicIndicDigits(value: number): string {
  if (!Number.isInteger(value) || value < 0) throw new Error(`AYAH_NUMBER_NOT_A_COUNT:${String(value)}`);
  return String(value).replace(/[0-9]/g, d => ARABIC_INDIC[Number(d)]);
}

/** ثماني ورقاتٍ حول قرصٍ أوسط — هيئةُ فاصلةِ الآية في المصاحف المطبوعة. */
const PETALS = Array.from({ length: 8 }, (_, i) => {
  const angle = (i * Math.PI) / 4;
  return { cx: 32 + Math.cos(angle) * 23.5, cy: 32 + Math.sin(angle) * 23.5 };
});

export interface AyahMarkProps {
  /** رقم الآية كما سُلِّم في الحزمة. */
  ayah: number;
  /** الآية الجاري تلاوتها تُلوَّن بلون التتبّع لا بالذهب. */
  active?: boolean;
  ar?: boolean;
}

export const AyahMark: React.FC<AyahMarkProps> = ({ ayah, active = false, ar = true }) => {
  const digits = arabicIndicDigits(ayah);
  const ring = active ? '#2F6555' : '#BE9C55';
  const petal = active ? '#2F6555' : '#C9AE71';
  const disc = active ? '#EDF3EF' : '#FBF6E9';
  return (
    <span
      className="mizan-ayah-mark"
      role="img"
      aria-label={ar ? `نهاية الآية ${digits}` : `End of ayah ${ayah}`}
      data-ayah={ayah}
      data-active={active ? 'true' : undefined}
    >
      <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
        {PETALS.map((p, i) => (
          <circle key={i} cx={p.cx} cy={p.cy} r={5.4} fill={petal} opacity={0.5} />
        ))}
        <circle cx={32} cy={32} r={23.5} fill="none" stroke={ring} strokeWidth={1.1} opacity={0.55} />
        <circle cx={32} cy={32} r={19} fill={disc} stroke={ring} strokeWidth={1.6} />
      </svg>
      <span className="mizan-ayah-mark__n" aria-hidden="true">{digits}</span>
    </span>
  );
};
