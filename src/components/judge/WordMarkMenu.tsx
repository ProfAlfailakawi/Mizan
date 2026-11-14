import React, { useEffect, useRef } from 'react';

/*
 * قائمة تسجيل الخطأ على الكلمة التي ضغط عليها المحكّم.
 *
 * تظهر من أسفل الشاشة لأن الإصبع كان على النصّ في الأعلى، وتعرض الكلمةَ نفسها كبيرةً
 * ليتأكّد المحكّم أن اللمسة وقعت على ما قصده قبل أن يُخصم شيءٌ من درجة متسابق. وأزرارها هي
 * إجراءات التحكيم المفعّلة في المسابقة نفسها (لا قائمةٌ ثابتة)، بخصمها المكتوب على كل زر.
 */

export interface WordMarkAction {
  id: string;
  eventType: string;
  shortArabic: string;
  shortEnglish: string;
  penalty: number;
}

export interface WordMarkTarget { surah: number; ayah: number; word: number; text: string }

export const WordMarkMenu: React.FC<{
  ar: boolean;
  target: WordMarkTarget;
  actions: WordMarkAction[];
  onPick: (action: WordMarkAction) => void;
  onClose: () => void;
}> = ({ ar, target, actions, onPick, onClose }) => {
  const first = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    first.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/35" onClick={onClose} data-word-mark-menu>
      <div
        role="dialog" aria-modal="true" aria-label={ar ? 'تسجيل خطأ على كلمة' : 'Mark a mistake on a word'}
        className="w-full max-w-lg rounded-t-3xl bg-[#fdfbf5] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-[0_-18px_55px_rgba(25,39,33,.25)]"
        onClick={e => e.stopPropagation()}
      >
        <div className="text-center">
          <div className="text-[11px] font-black text-[#656a66]">
            {ar ? `الآية ${target.ayah} · الكلمة ${target.word}` : `Ayah ${target.ayah} · word ${target.word}`}
          </div>
          <div className="font-quran mt-1 text-4xl leading-[1.8] text-[#202622]" dir="rtl" lang="ar">{target.text}</div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {actions.map((a, i) => (
            <button
              key={a.id} ref={i === 0 ? first : undefined} type="button"
              onClick={() => onPick(a)}
              className="min-h-12 rounded-2xl border border-[#d9d4c6] bg-white px-3 py-2 text-sm font-black text-[#202622] active:bg-[#efe4c6]"
            >
              <span>{ar ? a.shortArabic : a.shortEnglish}</span>
              {a.penalty > 0 && <span className="ms-2 text-[11px] font-bold text-[#8a3b32] tabular-nums" dir="ltr">−{a.penalty}</span>}
            </button>
          ))}
        </div>
        <button type="button" onClick={onClose} className="mt-3 min-h-11 w-full rounded-2xl text-sm font-black text-[#656a66]">
          {ar ? 'إلغاء' : 'Cancel'}
        </button>
      </div>
    </div>
  );
};

export default WordMarkMenu;
