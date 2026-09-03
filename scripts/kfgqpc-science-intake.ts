#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {isOfficialKfgqpcUrl} from '../server/kfgqpc-acquisition-policy';

const args=process.argv.slice(2);const value=(k:string)=>{const i=args.indexOf(k);return i>=0?args[i+1]:undefined};
const root=path.resolve(value('--root')||'.mizan-ingest');const reportDir=path.join(root,'reports');fs.mkdirSync(reportDir,{recursive:true});
const TARGETS=['tajweed','tafsir','ghareeb'] as const;
const MAX_FILES=5000;
const hash=(p:string)=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const textExt=new Set(['.json','.csv','.tsv','.txt','.xml','.html','.htm','.sql']);
function walk(dir:string,out:string[]=[]){if(!fs.existsSync(dir))return out;for(const name of fs.readdirSync(dir)){const p=path.join(dir,name),st=fs.statSync(p);if(st.isSymbolicLink())throw new Error('SCIENCE_INTAKE_SYMLINK_FORBIDDEN');if(st.isDirectory())walk(p,out);else out.push(p);if(out.length>MAX_FILES)throw new Error('SCIENCE_INTAKE_FILE_LIMIT_EXCEEDED')}return out}
function sample(p:string){const ext=path.extname(p).toLowerCase();if(!textExt.has(ext))return undefined;const fd=fs.openSync(p,'r');try{const b=Buffer.alloc(Math.min(4096,fs.statSync(p).size));fs.readSync(fd,b,0,b.length,0);return b.toString('utf8').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'').slice(0,1200)}finally{fs.closeSync(fd)}}
function inspect(id:string){const dir=path.join(root,id),metaFile=path.join(dir,'source.json'),payload=path.join(dir,'payload');if(!fs.existsSync(metaFile))return {id,state:'WAITING_OFFICIAL_SOURCE',files:[]};const meta=JSON.parse(fs.readFileSync(metaFile,'utf8'));const url=String(meta.directUrl||meta.sourceUrl||'');if(url&&!isOfficialKfgqpcUrl(url))throw new Error(`SCIENCE_INTAKE_NON_OFFICIAL_SOURCE:${id}`);if(!fs.existsSync(payload)||!walk(payload,[]).length)return {id,state:'WAITING_OFFICIAL_SOURCE',sourceUrl:url,files:[]};const files=walk(payload,[]).sort().map(p=>({relativePath:path.relative(payload,p).replace(/\\/g,'/'),bytes:fs.statSync(p).size,sha256:hash(p),extension:path.extname(p).toLowerCase(),sample:sample(p)}));return {id,state:'OFFICIAL_BYTES_PRESENT_NEEDS_SEMANTIC_MAPPING',sourceUrl:url,downloadedAt:meta.downloadedAt||'',officialChecksumVerified:meta.officialChecksumVerified===true,files}}
const datasets=TARGETS.map(inspect);const report={protocol:'MIZAN-KFGQPC-SCIENCE-INTAKE-1',generatedAt:new Date().toISOString(),authority:'KFGQPC',policy:{semanticInference:'FORBIDDEN',automaticPromotionToVerifiedOccurrences:false,note:'Inventory only. Official bytes are profiled and hashed; Tajweed/Waqf semantics are not invented from filenames or prose.'},datasets};
fs.writeFileSync(path.join(reportDir,'science-intake.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});
console.log(JSON.stringify({protocol:report.protocol,datasets:datasets.map(x=>({id:x.id,state:x.state,fileCount:x.files.length}))},null,2));
