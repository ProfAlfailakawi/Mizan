export * from '../../shared/input-validation';
import {normalizeArabicText,normalizeEmail,normalizeLatinText,normalizePhone,toAsciiDigits} from '../../shared/input-validation';

/** One capture-phase guard covers typing and paste across the app without fighting React state. */
export function installInputNormalization(){
 if(typeof document==='undefined'||document.documentElement.dataset.mizanInputGuard==='1')return;
 document.documentElement.dataset.mizanInputGuard='1';
 document.addEventListener('input',event=>{
  const el=event.target;if(!(el instanceof HTMLInputElement||el instanceof HTMLTextAreaElement)||el.type==='password')return;
  const kind=el.dataset.mizanKind||'';let next=toAsciiDigits(el.value);
  if(kind==='arabic'||el.lang==='ar')next=normalizeArabicText(next);
  else if(kind==='latin'||el.lang==='en')next=normalizeLatinText(next);
  else if(el instanceof HTMLInputElement&&el.type==='tel')next=normalizePhone(next);
  else if(el instanceof HTMLInputElement&&el.type==='email')next=normalizeEmail(next);
  if(next!==el.value)el.value=next;
 },true);
 document.addEventListener('focusin',event=>{const el=event.target;if(!(el instanceof HTMLInputElement))return;if(['email','url','tel','number'].includes(el.type))el.dir='ltr'},true);
}
