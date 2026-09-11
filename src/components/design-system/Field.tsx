import React from 'react';

/*
 * حقلٌ موسوم ومقياسٌ صغير — كُتبا خمس مرّات وثلاث مرّات في ملفّات الإدارة، بتسمياتٍ
 * وارتفاعاتٍ وألوانٍ تختلف قليلًا في كل مرّة. فرقٌ لا يقصده أحد ويراه الجميع.
 */

/** حقل نصّي موسوم: التسمية فوقه دائمًا، والحقل على مقاس المنصّة الواحد. */
export const Field: React.FC<{ label: string; className?: string } & Record<string, any>> = ({ label, className = '', ...rest }) => (
  <label className="block"><span className="mizan-field-label">{label}</span><input {...rest} className={`mizan-input ${className}`} /></label>
);

/** غلاف موسوم لأي عنصر تحكّم غير النصّ (قائمة، مجموعة أزرار، منطقة إفلات). */
export const FieldBox: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label className="block"><span className="mizan-field-label">{label}</span>{children}</label>
);

/** مقياس صغير: رقمٌ واسمه، في بطاقة هادئة. */
export const Mini: React.FC<{ n: React.ReactNode; t: string; center?: boolean }> = ({ n, t, center }) => (
  <div className={`rounded-xl bg-[#f3f1eb] p-3 ${center ? 'text-center' : ''}`}>
    <div className="text-lg font-black tabular-nums">{n}</div>
    <div className="text-[11px] text-[#656b66] mt-1">{t}</div>
  </div>
);
