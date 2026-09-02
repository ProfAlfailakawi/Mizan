import crypto from 'node:crypto';

export interface LightPackageSpec {
  id:string;
  md5:string;
  sha1:string;
  maxBytes:number;
}

export const KFGQPC_DEV_PAGE='https://qurancomplex.gov.sa/en/techquran/dev/';

export const LIGHT_PACKAGES:LightPackageSpec[]=[
  {id:'hafs',md5:'CF6841AEA5B1D1FD70D032B43FF08278',sha1:'36EA5AB0D7EA1702F17FF43F9B50924CCCD77EBF',maxBytes:64*1024*1024},
  {id:'warsh',md5:'4701E8BBF053098220CF2CF4CDA206A1',sha1:'44ECEA8FEB23817FDC01A8EE2162A6A0CF08CAE7',maxBytes:64*1024*1024},
  {id:'shubah',md5:'5CDA29121BF0D7234E039002E1FBF600',sha1:'8D66BDF0CAB96DC7D1032792C19F77980CA6682A',maxBytes:64*1024*1024},
  {id:'qalun',md5:'964208FF04C8AADD3DDC1BE262D8CFD3',sha1:'81733666BE17742E13C9FA4C7D26D42B1ADC67C8',maxBytes:64*1024*1024},
  {id:'duri-data',md5:'A60BDD18397B3E27E4617478968A35C8',sha1:'8049482F04B4FF1053A7859F96B2B113B9771EFB',maxBytes:64*1024*1024},
  {id:'susi-data',md5:'1BF6023E29B7622A52B6171232C17096',sha1:'E52DBC6D8B43797A8FAA0FD1EC1D8E5000265674',maxBytes:64*1024*1024},
  {id:'tafsir',md5:'5601682965E32F4DD6992C7600FDCCC3',sha1:'5F533113C2F54F32EDED734BB49E6A5837965722',maxBytes:64*1024*1024},
  {id:'ghareeb',md5:'7E22381EEDB152EE7ED6488F2395C6CD',sha1:'055A908C6EC7F06912C33BD00920406C665CC5F9',maxBytes:32*1024*1024},
  {id:'tajweed',md5:'B4A265A810C0CE4A722019791910B67E',sha1:'D2496382FC5E843CCB693B94DD19407EAA174BEA',maxBytes:16*1024*1024}
];

export function isOfficialKfgqpcUrl(value:string){
  try{const u=new URL(value);return u.protocol==='https:'&&(u.hostname==='qurancomplex.gov.sa'||u.hostname.endsWith('.qurancomplex.gov.sa'))}catch{return false}
}

export function extractNearbyOfficialCandidates(html:string,checksum:string,base=KFGQPC_DEV_PAGE){
  const needle=checksum.toLowerCase();const lower=html.toLowerCase();const at=lower.indexOf(needle);if(at<0)return [] as string[];
  const start=Math.max(0,at-9000),end=Math.min(html.length,at+3000),chunk=html.slice(start,end);
  const links:{url:string;distance:number;score:number}[]=[];
  const re=/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;let m:RegExpExecArray|null;
  while((m=re.exec(chunk))){
    let url:string;try{url=new URL(m[1],base).toString()}catch{continue}
    if(!isOfficialKfgqpcUrl(url))continue;
    const text=m[2].replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim().toLowerCase();
    const href=url.toLowerCase();
    const score=(/download|تحميل/.test(text)?4:0)+(/\.(zip|rar|7z)(?:$|\?)/.test(href)?5:0)+(/wp-content|uploads|download/.test(href)?2:0);
    const absolute=start+m.index;links.push({url,distance:Math.abs(at-absolute),score});
  }
  return [...new Map(links.sort((a,b)=>b.score-a.score||a.distance-b.distance).map(x=>[x.url,x])).values()].slice(0,8).map(x=>x.url);
}

export function digestBuffer(data:Buffer){return {md5:crypto.createHash('md5').update(data).digest('hex').toUpperCase(),sha1:crypto.createHash('sha1').update(data).digest('hex').toUpperCase()}}
export function matchesExpected(data:Buffer,spec:Pick<LightPackageSpec,'md5'|'sha1'>){const d=digestBuffer(data);return d.md5===spec.md5.toUpperCase()&&d.sha1===spec.sha1.toUpperCase()}
export function hasZipMagic(data:Buffer){return data.length>=4&&data[0]===0x50&&data[1]===0x4b&&[0x03,0x05,0x07].includes(data[2])&&[0x04,0x06,0x08].includes(data[3])}
