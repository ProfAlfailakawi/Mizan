import type {Competition,CompetitionPolicy,IntegrationConfig,DeviceRecord,JudgeProfile,Committee,QuranSourceManifestRecord,BackupRecord} from '../types';

export type PreflightStatus='ready'|'warning'|'blocker';
export interface PreflightCheck {id:string;labelAr:string;labelEn:string;consequenceAr:string;consequenceEn:string;status:PreflightStatus;fix:'competition_dna'|'scientific'|'field'|'integrations'|'backup'|'none'}

export function buildPreflight(input:{competition:Competition;policy:CompetitionPolicy;integrations:IntegrationConfig[];devices:DeviceRecord[];judges:JudgeProfile[];committees:Committee[];quranSources:QuranSourceManifestRecord[];backups:BackupRecord[];isOffline:boolean}){
 const {competition:c,policy:p,integrations,devices,judges,committees,quranSources,backups,isOffline}=input;
 const live=c.status==='live';
 const configured=(kind:IntegrationConfig['kind'])=>integrations.some(i=>i.kind===kind&&i.enabled&&i.status==='configured');
 const check=(id:string,ok:boolean,warning:boolean,labelAr:string,labelEn:string,consequenceAr:string,consequenceEn:string,fix:PreflightCheck['fix']):PreflightCheck=>({id,labelAr,labelEn,consequenceAr,consequenceEn,status:ok?'ready':warning?'warning':'blocker',fix});
 const readyJudges=judges.filter(j=>j.isReady);
 const approvedSources=quranSources.filter(s=>s.status==='approved');
 const gateNeeded=p.operations.kioskCheckIn;
 const waitingRole=devices.some(d=>d.role==='Waiting Display'&&d.status!=='revoked'&&d.status!=='disabled');
 const gateRole=devices.some(d=>['Gate','Kiosk'].includes(d.role||'')&&d.status!=='revoked'&&d.status!=='disabled');
 const audioOk=committees.length>0&&committees.every(x=>x.audioInputOk);
 const notifyStage=p.workflow.some(w=>w.id==='notify'&&w.enabled);
 const anyExternalNotify=(['email','sms','whatsapp'] as const).some(configured);
 const checks:PreflightCheck[]=[
  check('policy',!!p.version,false,'لائحة المسابقة','Competition policy','لا يمكن تشغيل مسابقة بلا نسخة قواعد محددة.','A competition cannot run without a defined policy version.','competition_dna'),
  check('registration',p.registration.fields.some(f=>f.visible&&f.required),!live,'التسجيل','Registration','قد تصل طلبات ناقصة أو غير قابلة للتحقق.','Registrations may arrive without required verifiable data.','competition_dna'),
  check('categories',c.categories.length>0,false,'الفئات','Categories','لا يمكن توجيه أو تحكيم المشاركين.','Participants cannot be routed or judged.','competition_dna'),
  check('quran_source',approvedSources.length>0,!live,'مصدر القرآن','Quran source','البيانات التطويرية لا تُعامل كمصدر قرآني معتمد. يحتاج اعتماد السلطة العلمية.','Development fixtures must not masquerade as certified Quran data. Scientific authority approval is required.','none'),
  check('fairdraw',p.questions.questionsPerParticipant>0&&p.questions.difficultyTolerance>=0,false,'FairDraw','FairDraw','السحب لا يملك قيودًا صالحة.','The draw has invalid fairness constraints.','competition_dna'),
  check('judging',c.ruleSet.criteria.length>0&&c.ruleSet.judgesCountPerPanel>0,false,'التحكيم','Judging','لا يمكن حساب نتيجة قابلة لإعادة الإنتاج.','A reproducible score cannot be calculated.','competition_dna'),
  check('judges',readyJudges.length>=Math.max(1,c.ruleSet.judgesCountPerPanel),!live,'المحكمون','Judges','عدد المحكمين الجاهزين أقل من الحد المطلوب للجنة.','Ready judges are below the panel requirement.','field'),
  check('committees',committees.some(x=>x.status!=='offline'),!live,'اللجان','Committees','لا توجد لجنة متاحة لاستقبال جلسة.','No committee is available to receive a session.','field'),
  check('gate',!gateNeeded||gateRole,!live,'البوابة','Gate','الحضور الذاتي مفعّل دون جهاز بوابة معيّن.','Self check-in is enabled without an assigned Gate device.','field'),
  check('waiting_display',waitingRole,true,'شاشة الانتظار','Waiting display','التشغيل ممكن، لكن الاستدعاء المرئي غير مهيأ.','Operations can continue, but visual calls are not assigned.','field'),
  check('network',!isOffline||p.operations.offlineContinuity,!live,'الاستمرارية','Continuity','الانقطاع قد يوقف المسار الأساسي.','A network interruption may stop core flow.','field'),
  check('audio',audioOk,!live,'الصوت','Audio','قد تبدأ لجنة دون مسار صوت موثوق.','A committee may start without a healthy audio path.','field'),
  check('notifications',!notifyStage||anyExternalNotify,true,'الإشعارات','Notifications','القنوات الخارجية لن تُرسل دون مزود حقيقي؛ in-app يبقى متاحًا.','External channels will not deliver without a real provider; in-app remains available.','integrations'),
  check('results',!!p.results.visibility,false,'سياسة النتائج','Result policy','لا توجد سياسة واضحة لوقت ظهور النتائج.','There is no explicit result publication policy.','competition_dna'),
  check('appeals',!p.appeals.enabled||p.appeals.windowHours>0,false,'الاعتراضات','Appeals','نافذة الاعتراض غير صالحة.','The appeal window is invalid.','competition_dna'),
  check('certificates',!p.certificates.enabled||!!p.certificates.issueFor,false,'الشهادات','Certificates','لا توجد قاعدة إصدار واضحة.','Certificate issuance has no defined rule.','competition_dna'),
  check('privacy',p.privacy.audioRetentionDays>0&&p.privacy.documentRetentionDays>0,false,'الخصوصية والاحتفاظ','Privacy & retention','الاحتفاظ بالبيانات غير محدد.','Data retention is undefined.','competition_dna'),
  check('backup',backups.some(b=>b.competitionId===c.id&&b.status==='ready'),!live,'النسخ الاحتياطي','Backup','لا توجد نقطة استعادة موثقة لهذه المسابقة.','No verified restore point exists for this competition.','backup'),
  check('emergency',p.operations.exceptionDesk,true,'خطة الاستثناء','Emergency path','الحالات غير الطبيعية تحتاج مسارًا بشريًا واضحًا.','Exceptional cases need a defined human path.','competition_dna'),
  check('identity',!p.registration.requireIdentityVerification||configured('identity'),!live,'الهوية','Identity','التحقق الخارجي مطلوب في اللائحة لكنه غير متصل.','External identity verification is required by policy but not connected.','integrations')
 ];
 const blocker=checks.filter(x=>x.status==='blocker').length, warning=checks.filter(x=>x.status==='warning').length, ready=checks.length-blocker-warning;
 const score=Math.round(((ready+warning*.55)/checks.length)*100);
 return {score,checks,blocker,warning,ready,status:blocker?'blocker':warning?'warning':'ready' as PreflightStatus};
}

export function simulateRuleEffects(input:{competition:Competition;judges:number;minimumScore:number;focusCriterionId?:string;focusWeight?:number;sampleSize?:number}){
 const {competition:c}=input; const n=Math.max(20,Math.min(1000,input.sampleSize||120));
 const criteria=c.ruleSet.criteria.map(x=>({...x,weight:x.id===input.focusCriterionId&&input.focusWeight!=null?input.focusWeight:x.weight}));
 const totalWeight=criteria.reduce((a,x)=>a+Math.max(0,x.weight),0)||1;
 const rows=Array.from({length:n},(_,i)=>{
   const components=criteria.map((x,j)=>{const normalized=(Math.sin((i+1)*(j+3)*1.73)+1)/2;const score=x.maxScore*(.68+.3*normalized);return {id:x.id,score,weighted:score*(Math.max(0,x.weight)/totalWeight)};});
   const raw=components.reduce((a,x)=>a+x.weighted,0); const max=criteria.reduce((a,x)=>a+x.maxScore*(Math.max(0,x.weight)/totalWeight),0)||100;
   const normalized=Math.round((raw/max*100)*4)/4; return {score:normalized,components};
 });
 const ties=Object.values(rows.reduce<Record<string,number>>((m,r)=>{const k=r.score.toFixed(2);m[k]=(m[k]||0)+1;return m},{})).filter(v=>v>1).reduce((a,v)=>a+v,0);
 const qualified=rows.filter(r=>r.score>=input.minimumScore).length;
 const focus=criteria.find(x=>x.id===input.focusCriterionId); const influence=focus?Math.round((Math.max(0,focus.weight)/totalWeight)*1000)/10:0;
 return {sampleSize:n,ties,qualified,qualificationRate:Math.round(qualified/n*1000)/10,judges:Math.max(1,input.judges),dropExtremes:c.ruleSet.dropExtremes&&input.judges>=3,focusInfluencePercent:influence,synthetic:true as const};
}
