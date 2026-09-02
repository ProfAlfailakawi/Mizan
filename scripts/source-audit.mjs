import fs from 'node:fs';
import path from 'node:path';

const roots=['src','tests','scripts','server.ts','firestore.rules','.env.example'];
const files=[];
for(const root of roots){
 if(!fs.existsSync(root)) continue;
 const stat=fs.statSync(root);
 if(stat.isFile()) files.push(root);
 else walk(root);
}
function walk(dir){for(const name of fs.readdirSync(dir)){if(['node_modules','dist','.git'].includes(name))continue;const p=path.join(dir,name);const st=fs.statSync(p);if(st.isDirectory())walk(p);else if(/\.(ts|tsx|js|mjs|css|md|rules|example)$/.test(p))files.push(p)}}
const forbidden=[
 {name:'unfinished marker',re:/\b(TODO|FIXME|HACK)\b/i},
 {name:'placeholder copy',re:/\b(lorem ipsum|coming soon|not implemented|fake success)\b/i},
 {name:'Google API key',re:/AIza[0-9A-Za-z_-]{20,}/},
 {name:'OpenAI-style secret',re:/\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}/},
 {name:'private key material',re:/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/}
];
const violations=[];
for(const file of files){
 if(file.endsWith('source-audit.mjs')) continue;
 const text=fs.readFileSync(file,'utf8');
 for(const rule of forbidden){
  const m=text.match(rule.re); if(m) violations.push(`${rule.name}: ${file}`);
 }
}
if(violations.length){console.error('Source audit failed:\n'+violations.map(v=>' - '+v).join('\n'));process.exit(1)}
console.log(`Source audit passed: ${files.length} files checked; no unfinished markers or embedded secret patterns.`);
