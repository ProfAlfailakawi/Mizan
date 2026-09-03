import path from 'node:path';

export const KFGQPC_ROOT_DOMAIN='qurancomplex.gov.sa';
export const KFGQPC_OFFICIAL_ENTRYPOINTS={
  main:'https://qurancomplex.gov.sa/',
  developer:'https://qurancomplex.gov.sa/en/techquran/dev/',
  audioCatalog:'https://qc-dev.qurancomplex.gov.sa/quran-audios/',
  fonts:'https://fonts.qurancomplex.gov.sa/',
  downloads:'https://download.qurancomplex.gov.sa/',
  digitalMushaf:'https://dm.qurancomplex.gov.sa/'
} as const;

export function isOfficialKfgqpcHostname(hostname:string){
  const h=String(hostname||'').toLowerCase().replace(/\.$/,'');
  return h===KFGQPC_ROOT_DOMAIN||h.endsWith(`.${KFGQPC_ROOT_DOMAIN}`);
}

export function isOfficialKfgqpcUrl(value:string){
  try{const u=new URL(value);return u.protocol==='https:'&&isOfficialKfgqpcHostname(u.hostname)}catch{return false}
}

export function assertOfficialKfgqpcUrl(value:string){
  if(!isOfficialKfgqpcUrl(value))throw new Error('KFGQPC_SOURCE_URL_NOT_OFFICIAL');
  return new URL(value).toString();
}

export function resolveOfficialKfgqpcUrl(href:string,base:string){
  let url:string;try{url=new URL(href,base).toString()}catch{throw new Error('KFGQPC_SOURCE_URL_INVALID')}
  return assertOfficialKfgqpcUrl(url);
}

export function safeArchiveEntry(name:string){
  const n=String(name||'').replace(/\\/g,'/');
  if(!n||n.startsWith('/')||n.includes('\0'))return false;
  const parts=n.split('/');
  if(parts.includes('..'))return false;
  const normalized=path.posix.normalize(n);
  return normalized===n||normalized===n.replace(/^\.\//,'');
}

export const SURAH_AYAH_COUNTS=[
  7,286,200,176,120,165,206,75,129,109,123,111,43,52,99,128,111,110,98,135,
  112,78,118,64,77,227,93,88,69,60,34,30,73,54,45,83,182,88,75,85,54,53,
  89,59,37,35,38,29,18,45,60,49,62,55,78,96,29,22,24,13,14,11,11,18,12,12,
  30,52,52,44,28,28,20,56,40,31,50,40,46,42,29,19,36,25,22,17,19,26,30,20,
  15,21,11,8,8,19,5,8,8,11,11,8,3,9,5,4,7,3,6,3,5,4,5,6
] as const;

export function isCanonicalAyah(surah:number,ayah:number){
  return Number.isInteger(surah)&&surah>=1&&surah<=114&&Number.isInteger(ayah)&&ayah>=1&&ayah<=SURAH_AYAH_COUNTS[surah-1];
}

export function canonicalAyahKey(surah:number,ayah:number){
  if(!isCanonicalAyah(surah,ayah))throw new Error('INVALID_QURAN_AYAH');
  return `${String(surah).padStart(3,'0')}/${String(ayah).padStart(3,'0')}`;
}
