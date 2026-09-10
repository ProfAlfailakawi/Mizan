import React from 'react';
import { Sparkles } from 'lucide-react';

/* عبارة «الذكاء الاصطناعي لا يمس الدرجة» كانت تتكرر بإحدى عشرة صياغة رمادية متفاوتة؛
   صوت بصري واحد يجعلها تُقرأ كضمانة نظام لا كهامش اعتذاري. */
export const AdvisoryNote: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div role="note" className="mizan-advisory"><Sparkles/><span>{children}</span></div>
);
