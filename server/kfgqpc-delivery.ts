import fs from 'fs';
import path from 'path';

export type KfgqpcDeliveryKind='mushaf-page'|'audio-ayah'|'font';
export type KfgqpcDeliverySource='LOCAL'|'R2'|'NONE';

export interface KfgqpcStorageBudgetItem{key:string;labelArabic:string;bytes:number;note:string}
export interface KfgqpcStorageBudget{freeTierBytes:number;plannedBytes:number;remainingBytes:number;utilization:number;items:KfgqpcStorageBudgetItem[];assumptions:string[]}

const MB=1024*1024,GB=1024*1024*1024;

// Conservative delivery budget. Original print/vector masters are deliberately excluded
// from R2 free-tier storage and should remain in the offline source archive.
export function kfgqpcFreeTierBudget():KfgqpcStorageBudget{
  const items:KfgqpcStorageBudgetItem[]=[
    {key:'audio-hafs-muaiqly',labelArabic:'حفص · ماهر المعيقلي',bytes:724.25*MB,note:'official ayah audio package'},
    {key:'audio-shubah-hudhaifi',labelArabic:'شعبة · علي الحذيفي',bytes:722*MB,note:'official ayah audio package'},
    {key:'audio-qalun-hudhaifi',labelArabic:'قالون · علي الحذيفي',bytes:760.66*MB,note:'official ayah audio package'},
    {key:'audio-susi-siddiqi',labelArabic:'السوسي · عثمان الصديقي',bytes:3.25*GB,note:'official ayah audio package'},
    {key:'quran-developer-data',labelArabic:'حزم النص والعلوم القرآنية',bytes:83*MB,note:'developer packages + tafsir/ghareeb/tajweed allowance'},
    {key:'mushaf-delivery-hafs',labelArabic:'صفحات مصحف المدينة · نسخة ويب محسنة',bytes:180*MB,note:'delivery allowance; 604 pages with headroom for WebP/AVIF and manifest'}
  ];
  const freeTierBytes=10*GB,plannedBytes=Math.round(items.reduce((n,x)=>n+x.bytes,0));
  return {freeTierBytes,plannedBytes,remainingBytes:Math.max(0,freeTierBytes-plannedBytes),utilization:plannedBytes/freeTierBytes,items,assumptions:[
    'R2 Standard free tier budget only; source/vector masters are stored offline and are not counted.',
    'One selected official reciter per supported narration; duplicate Hafs reciters are not stored.',
    'Mushaf page allowance is a delivery target, not a claim about the official master package size.',
    'Al-Duri audio and Warsh audio are excluded until exact downloadable bytes/mapping are verified.'
  ]};
}

const safe=(v:string)=>/^[a-zA-Z0-9._-]{1,120}$/.test(v);
const cleanBase=(v:string)=>v.replace(/\/+$/,'');
const contentType=(file:string)=>file.endsWith('.webp')?'image/webp':file.endsWith('.avif')?'image/avif':file.endsWith('.png')?'image/png':file.endsWith('.svg')?'image/svg+xml':file.endsWith('.mp3')?'audio/mpeg':file.endsWith('.m4a')?'audio/mp4':file.endsWith('.woff2')?'font/woff2':file.endsWith('.ttf')?'font/ttf':'application/octet-stream';

export class KfgqpcDeliveryRepository{
  constructor(private readonly options:{pageRoot?:string;fontRoot?:string;audioRoot?:string;r2BaseUrl?:string;r2BearerToken?:string}){}

  status(){const budget=kfgqpcFreeTierBudget();return {protocol:'MIZAN-KFGQPC-DELIVERY-1',deliverySource:this.options.r2BaseUrl?'R2':(this.options.pageRoot||this.options.audioRoot||this.options.fontRoot)?'LOCAL':'NONE',r2Configured:!!this.options.r2BaseUrl,localPageRootConfigured:!!this.options.pageRoot,localAudioRootConfigured:!!this.options.audioRoot,localFontRootConfigured:!!this.options.fontRoot,budget}}

  private localFile(root:string|undefined,segments:string[],exts:string[]){if(!root)return null;if(segments.some(x=>!safe(x)))return null;const base=path.resolve(root),stem=path.resolve(root,...segments);if(!stem.startsWith(base+path.sep)&&stem!==base)return null;for(const ext of exts){const file=`${stem}.${ext}`;if(fs.existsSync(file)&&fs.statSync(file).isFile())return {file,type:contentType(file)}}return null}

  private async remote(relativeCandidates:string[]){const base=this.options.r2BaseUrl;if(!base)return null;for(const relative of relativeCandidates){if(relative.split('/').some(x=>!safe(x)))continue;const url=`${cleanBase(base)}/${relative}`;const headers:Record<string,string>={};if(this.options.r2BearerToken)headers.Authorization=`Bearer ${this.options.r2BearerToken}`;let r:Response;try{r=await fetch(url,{headers,redirect:'error'})}catch{continue}if(r.ok&&r.body)return {response:r,type:r.headers.get('content-type')||contentType(relative),source:'R2' as const};if(r.status!==404)continue}return null}

  async page(packageId:string,page:number){if(!safe(packageId)||!Number.isInteger(page)||page<1||page>700)return null;const local=this.localFile(this.options.pageRoot,[packageId,String(page)],['avif','webp','png','svg']);if(local)return {source:'LOCAL' as const,...local};const remote=await this.remote([`mushaf/${packageId}/pages/${page}.avif`,`mushaf/${packageId}/pages/${page}.webp`,`mushaf/${packageId}/pages/${page}.png`,`mushaf/${packageId}/pages/${page}.svg`]);return remote}

  async ayahAudio(readingId:string,surah:number,ayah:number){if(!safe(readingId)||!Number.isInteger(surah)||surah<1||surah>114||!Number.isInteger(ayah)||ayah<1||ayah>400)return null;const local=this.localFile(this.options.audioRoot,[readingId,String(surah),String(ayah)],['mp3','m4a']);if(local)return {source:'LOCAL' as const,...local};return this.remote([`audio/${readingId}/ayah/${surah}/${ayah}.mp3`,`audio/${readingId}/ayah/${surah}/${ayah}.m4a`])}

  async font(fontId:string){if(!safe(fontId))return null;const local=this.localFile(this.options.fontRoot,[fontId],['woff2','ttf']);if(local)return {source:'LOCAL' as const,...local};return this.remote([`fonts/${fontId}.woff2`,`fonts/${fontId}.ttf`])}
}
