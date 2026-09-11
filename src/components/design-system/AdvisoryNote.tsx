import React from 'react';
import { Sparkles } from 'lucide-react';

/* عبارة «الذكاء الاصطناعي لا يمس الدرجة» كانت تتكرر بإحدى عشرة صياغة رمادية متفاوتة؛
   صوت بصري واحد يجعلها تُقرأ كضمانة نظام لا كهامش اعتذاري.

   وعلى أسطح القاعة الداكنة كانت الضمانة نفسها تُكتب بالذهب يدويًّا في موضعين — بحجم
   ‎10.5px‎ في أحدهما ولون داخل ‎style‎ في الآخر — لأن الملاحظة لم يكن لها صوتٌ داكن. */
export const AdvisoryNote: React.FC<{ children: React.ReactNode; tone?: 'light' | 'dark'; className?: string }> = ({ children, tone = 'light', className = '' }) => (
  <div role="note" className={`${tone === 'dark' ? 'mizan-advisory mizan-advisory-dark' : 'mizan-advisory'} ${className}`}><Sparkles/><span>{children}</span></div>
);
