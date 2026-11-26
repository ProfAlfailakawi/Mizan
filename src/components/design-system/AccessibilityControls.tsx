import React from 'react';
import type { useAppStore } from '../../lib/store';

/*
 * عناصر «الإتاحة الهادئة» — مصدرٌ واحد.
 *
 * كانت داخل تبويب «ما بعد» في طبقة المؤسسات (لمالك المنصة وحده). نُقلت كما هي إلى هنا
 * ليستعملها ذلك التبويب وزرّ الإتاحة في الترويسة معًا، فلا تتفرّع نسختان: المنطق نفسه
 * (`updateAccessibilityProfile` لملف المستخدم الحالي) والأزرار نفسها.
 */

const Choice=({active,onClick,title}:{active:boolean;onClick:()=>void;title:string})=><button onClick={onClick} className={`min-h-14 rounded-xl border px-4 text-start text-xs font-black flex items-center justify-between ${active?'bg-[var(--emerald-soft)] border-[#9db5ab] text-[color:var(--emerald)]':'bg-white border-[#dedcd5]'}`}><span>{title}</span><span className={`w-3 h-3 rounded-full ${active?'bg-[var(--emerald-2)]':'bg-[#d2d0c9]'}`}/></button>;

export const AccessibilityChoices=({s,ar,className=''}:{s:ReturnType<typeof useAppStore>;ar:boolean;className?:string})=>{const profile=s.accessibilityProfiles.find(x=>x.userId===s.currentUser.id)||{textScale:'normal' as const,touchScale:'normal' as const,contrast:'system' as const,motion:'system' as const,audioCues:false};return <div className={`grid sm:grid-cols-2 gap-2 ${className}`}><Choice active={profile.textScale==='large'} onClick={()=>s.updateAccessibilityProfile({textScale:profile.textScale==='large'?'normal':'large'})} title={ar?'نص أكبر':'Larger text'}/><Choice active={profile.touchScale==='xl'} onClick={()=>s.updateAccessibilityProfile({touchScale:profile.touchScale==='xl'?'normal':'xl'})} title={ar?'لمس أكبر':'Larger touch'}/><Choice active={profile.contrast==='high'} onClick={()=>s.updateAccessibilityProfile({contrast:profile.contrast==='high'?'system':'high'})} title={ar?'تباين أعلى':'High contrast'}/><Choice active={profile.motion==='reduced'} onClick={()=>s.updateAccessibilityProfile({motion:profile.motion==='reduced'?'system':'reduced'})} title={ar?'حركة أقل':'Reduced motion'}/></div>};
