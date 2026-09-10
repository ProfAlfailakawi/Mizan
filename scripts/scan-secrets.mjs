import fs from 'node:fs';import path from 'node:path';
const roots=['src','tests','public','.'];
const ignore=new Set(['node_modules','.git','dist','bun.lock','package-lock.json','MIZAN-completion-beyond-final-2026-09-02.zip']);
import { CREDENTIAL_PATTERNS } from './secret-patterns.mjs';
/* القائمة مشتركة مع source-audit: نسختان باليد تفترقان، وقد افترقتا فعلًا. */
const patterns=CREDENTIAL_PATTERNS;
const files=[];function walk(p){if(!fs.existsSync(p))return;const st=fs.statSync(p);if(st.isDirectory()){for(const n of fs.readdirSync(p)){if(ignore.has(n))continue;walk(path.join(p,n))}}else files.push(p)}
for(const root of roots){if(root==='.' ){for(const n of ['firebase-applet-config.json','.env.example','package.json','server.ts'])walk(n)}else walk(root)}
let found=0;for(const f of new Set(files)){let text;try{text=fs.readFileSync(f,'utf8')}catch{continue}for(const p of patterns){p.re.lastIndex=0;if(p.re.test(text)){console.error(`Secret scan failed: ${p.name} detected in ${f}`);found++}}}
if(found)process.exit(1);console.log('Secret scan passed: no known credential patterns found.');
