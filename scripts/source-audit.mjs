import fs from 'node:fs';
import path from 'node:path';

/*
 * نطاقان لا نطاق واحد.
 *
 * كان الفحص يمرّ على شجرة المصدر وحدها، فبقيت ملفات النشر — Dockerfile وملفات Cloud Build —
 * خارجه تمامًا. وهي بالضبط المكان الذي تُكتب فيه الأسرار الحقيقية: مفاتيح خدمة، ورموز
 * وصول، وشهادات. أي أن أخطر ملفات المستودع كانت الوحيدة غير المفحوصة.
 *
 * وسبب فصلهما أن قواعدهما تختلف: شجرة المصدر تُمنع فيها علامات العمل الناقص ونصوص الحشو،
 * وملفات النشر لا يعنيها ذلك بل يعنيها السرّ وحده.
 */
const sourceRoots=['src','tests','scripts','server.ts','firestore.rules','.env.example'];
const deploymentRoots=['Dockerfile','.github/workflows'];

/*
 * مفتاح Firebase للويب معرّفٌ علنيّ بطبيعته: يُرسَل إلى كل متصفح داخل الحزمة، وتحميه قواعد
 * Firestore وقيود النطاق لا الإخفاء. فوجوده في ملفات البناء مقصود، ولا يُبلَّغ عنه.
 *
 * لكن المسموح به هو *هذه القيمة بعينها* لا كل ما يشبهها. فأي مفتاح Google آخر يظهر في ملف
 * نشر — مفتاح خريطة، أو مفتاح خدمة، أو مفتاح مسرَّب بالخطأ — يوقف الفحص. وإن دُوِّر المفتاح
 * فسيسقط الفحص حتى تُحدَّث هذه القيمة، وذلك مقصود: التدوير يمسّ هذه الملفات على أي حال،
 * والتنبيه أهون من مرور مفتاح جديد بلا مراجعة.
 */
const PUBLIC_FIREBASE_WEB_KEY='AIzaSyAU13efq58hCJirGDyu9dZf8lzRatbhwcY';

const forbidden=[
 {name:'unfinished marker',re:/\b(TODO|FIXME|HACK)\b/i,scope:'source'},
 {name:'placeholder copy',re:/\b(lorem ipsum|coming soon|not implemented|fake success)\b/i,scope:'source'},
 {name:'Google API key',re:/AIza[0-9A-Za-z_-]{20,}/g,allow:[PUBLIC_FIREBASE_WEB_KEY]},
 {name:'OpenAI-style secret',re:/\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}/g},
 {name:'private key material',re:/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g},
 /* أنماط تخصّ ملفات النشر تحديدًا، وهي أيضًا صحيحة في شجرة المصدر. */
 {name:'AWS access key id',re:/\bAKIA[0-9A-Z]{16}\b/g},
 {name:'Google service account key',re:/"private_key_id"\s*:/g},
 {name:'Slack token',re:/\bxox[abprs]-[A-Za-z0-9-]{10,}/g},
 {name:'GitHub token',re:/\bgh[pousr]_[A-Za-z0-9]{30,}/g},
];

const collect=(roots,extensions)=>{
 const found=[];
 const walk=dir=>{
  for(const name of fs.readdirSync(dir)){
   if(['node_modules','dist','.git'].includes(name))continue;
   const p=path.join(dir,name); const st=fs.statSync(p);
   if(st.isDirectory())walk(p); else if(extensions.test(p))found.push(p);
  }
 };
 for(const root of roots){
  if(!fs.existsSync(root))continue;
  if(fs.statSync(root).isFile())found.push(root); else walk(root);
 }
 return found;
};

const sourceFiles=collect(sourceRoots,/\.(ts|tsx|js|mjs|css|md|rules|example)$/);
/* ملفات Cloud Build تُلتقط بالاسم لأنها في جذر المستودع لا في مجلد. */
const deploymentFiles=[...collect(deploymentRoots,/\.(ya?ml)$/),...fs.readdirSync('.').filter(f=>/^cloudbuild.*\.ya?ml$/.test(f))];

/*
 * حارسٌ لا يفحص شيئًا ويقول «سليم» أسوأ من غياب الحارس: يمرّ في CI باللون الأخضر وهو لم
 * يفتح ملفًا واحدًا. وقع ذلك فعلًا عند تشغيله من مجلد غير جذر المستودع — فالمسارات نسبية،
 * فلا يجد شيئًا، فيُعلن النجاح. العدد الصفري عطلٌ لا نتيجة.
 */
if(!sourceFiles.length||!deploymentFiles.length){
 console.error(`Source audit could not run: found ${sourceFiles.length} source files and ${deploymentFiles.length} deployment manifests. Run it from the repository root.`);
 process.exit(1);
}

const violations=[];
const audit=(file,scope)=>{
 if(file.endsWith('source-audit.mjs'))return;
 const text=fs.readFileSync(file,'utf8');
 for(const rule of forbidden){
  if(rule.scope&&rule.scope!==scope)continue;
  const matches=rule.re.global?[...text.matchAll(rule.re)].map(m=>m[0]):(text.match(rule.re)?[text.match(rule.re)[0]]:[]);
  for(const hit of matches){
   if(rule.allow?.includes(hit))continue;
   violations.push(`${rule.name}: ${file}`);
   break;
  }
 }
};
for(const file of sourceFiles)audit(file,'source');
for(const file of deploymentFiles)audit(file,'deployment');

if(violations.length){console.error('Source audit failed:\n'+[...new Set(violations)].map(v=>' - '+v).join('\n'));process.exit(1)}
console.log(`Source audit passed: ${sourceFiles.length} source files and ${deploymentFiles.length} deployment manifests checked; no unfinished markers or embedded secret patterns.`);
