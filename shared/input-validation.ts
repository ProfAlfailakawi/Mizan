const DIGITS:Record<string,string>={
 '٠':'0','١':'1','٢':'2','٣':'3','٤':'4','٥':'5','٦':'6','٧':'7','٨':'8','٩':'9',
 '۰':'0','۱':'1','۲':'2','۳':'3','۴':'4','۵':'5','۶':'6','۷':'7','۸':'8','۹':'9',
};
export const toAsciiDigits=(value:unknown)=>String(value??'').replace(/[٠-٩۰-۹]/g,d=>DIGITS[d]||d);
export const normalizeSpaces=(value:unknown)=>toAsciiDigits(value).replace(/\s+/g,' ').trim();
export const normalizeEmail=(value:unknown)=>toAsciiDigits(value).trim().replace(/\s+/g,'').toLowerCase();
export const normalizePhone=(value:unknown)=>{
 const raw=toAsciiDigits(value).trim(); const plus=raw.startsWith('+')?'+':'';
 return plus+raw.replace(/[^0-9]/g,'');
};
export const normalizeDomain=(value:unknown)=>toAsciiDigits(value).trim().toLowerCase().replace(/^https?:\/\//i,'').split(/[/?#]/,1)[0].replace(/:\d+$/,'').replace(/\.$/,'');
export const normalizeWebsiteUrl=(value:unknown)=>{
 const raw=toAsciiDigits(value).trim(); if(!raw)return '';
 const candidate=/^https?:\/\//i.test(raw)?raw:`https://${raw}`;
 try{const u=new URL(candidate);if(!['http:','https:'].includes(u.protocol)||!u.hostname)return '';u.username='';u.password='';return u.toString().replace(/\/$/,'')}catch{return ''}
};
export const normalizeArabicText=(value:unknown)=>toAsciiDigits(value).replace(/[A-Za-z]/g,'').replace(/\s{2,}/g,' ');
export const normalizeLatinText=(value:unknown)=>toAsciiDigits(value).replace(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/g,'').replace(/\s{2,}/g,' ');
export const isEmail=(value:unknown)=>/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalizeEmail(value));
export const isDomain=(value:unknown)=>/^(?=.{4,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(normalizeDomain(value));
export const isWebsiteUrl=(value:unknown)=>{const n=normalizeWebsiteUrl(value);if(!n)return false;try{return isDomain(new URL(n).hostname)}catch{return false}};
export const isPhone=(value:unknown)=>/^\+?[0-9]{6,18}$/.test(normalizePhone(value));
export const isArabicText=(value:unknown)=>{const v=normalizeSpaces(value);return !v||(!/[A-Za-z]/.test(v)&&/[\u0600-\u06FF]/.test(v))};
export const isLatinText=(value:unknown)=>{const v=normalizeSpaces(value);return !v||(!/[\u0600-\u06FF]/.test(v)&&/[A-Za-z]/.test(v))};
