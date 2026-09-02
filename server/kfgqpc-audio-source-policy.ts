export type OfficialAudioState='VERIFIED'|'UNVERIFIED'|'OFFICIAL_AUDIO_UNAVAILABLE';

export interface OfficialAudioProbe {
  id:'audio-duri'|'audio-warsh';
  state:OfficialAudioState;
  catalogUrl:string;
  detailUrl?:string;
  directUrl?:string;
  contentLength?:number;
  reason:string;
  checkedAt:string;
}

const OFFICIAL_HOST_RE=/(^|\.)qurancomplex\.gov\.sa$/i;

export function isOfficialQuranComplexUrl(value:string){
  try { const u=new URL(value); return u.protocol==='https:'&&OFFICIAL_HOST_RE.test(u.hostname); }
  catch { return false; }
}

export function normalizeVisibleText(html:string){
  return html.replace(/<script[\s\S]*?<\/script>/gi,' ')
    .replace(/<style[\s\S]*?<\/style>/gi,' ')
    .replace(/<[^>]+>/g,' ')
    .replace(/&nbsp;|&#160;/g,' ')
    .replace(/&amp;/g,'&')
    .replace(/\s+/g,' ').trim();
}

export function extractOfficialLinks(html:string,baseUrl:string){
  const out:{url:string;text:string}[]=[];
  const re=/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for(let m;(m=re.exec(html));){
    try{
      const url=new URL(m[1],baseUrl).toString();
      if(!isOfficialQuranComplexUrl(url))continue;
      out.push({url,text:normalizeVisibleText(m[2])});
    }catch{}
  }
  return out;
}

export function looksLikeDownload(url:string,text=''){
  const s=`${url} ${text}`.toLowerCase();
  return /\.(zip|7z|rar|tar|gz|mp3|m4a)(?:$|[?#])/.test(s)||/(download|تحميل|ayat|آيات|audio)/i.test(s);
}

export function classifyDuriCandidate(input:{url:string;text?:string;contentLength?:number}){
  if(!isOfficialQuranComplexUrl(input.url))return {ok:false,reason:'NON_OFFICIAL_HOST'};
  const length=input.contentLength||0;
  if(length>0&&length<100*1024*1024)return {ok:false,reason:'IMPLAUSIBLE_AYAH_PACKAGE_SIZE'};
  const hay=`${input.url} ${input.text||''}`;
  if(!/(ayat|ayah|آيات|ايات)/i.test(hay))return {ok:false,reason:'NOT_IDENTIFIED_AS_AYAH_PACKAGE'};
  return {ok:true,reason:'OFFICIAL_AYAH_CANDIDATE'};
}

export function classifyWarshCatalog(catalogHtml:string){
  const text=normalizeVisibleText(catalogHtml);
  if(/ورش/.test(text)||/warsh/i.test(text))return {state:'UNVERIFIED' as OfficialAudioState,reason:'WARSH_APPEARS_IN_CURRENT_CATALOG_REQUIRES_DIRECT_PACKAGE_VERIFICATION'};
  return {state:'OFFICIAL_AUDIO_UNAVAILABLE' as OfficialAudioState,reason:'CURRENT_KFGQPC_DOWNLOADABLE_AUDIO_CATALOG_HAS_NO_WARSH_ENTRY'};
}
