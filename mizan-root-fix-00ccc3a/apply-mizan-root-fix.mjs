import fs from 'node:fs';
import path from 'node:path';

const root = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
const read = p => fs.readFileSync(path.join(root,p),'utf8');
const write = (p,s) => fs.writeFileSync(path.join(root,p),s);
const assert = (cond,msg)=>{ if(!cond) throw new Error(msg); };
const replaceOnce=(src,from,to,label)=>{ const i=src.indexOf(from); assert(i>=0,`لم أجد موضع الإصلاح: ${label}`); assert(src.indexOf(from,i+1)<0,`وجدت أكثر من موضع غير متوقع: ${label}`); return src.slice(0,i)+to+src.slice(i+from.length); };

// 1) CI: don't turn an earlier test failure into a second artifact failure.
{
  const f='.github/workflows/ci.yml'; let s=read(f);
  s=s.replace(/(\- name: حفظ سجل Docker عند الفشل\n\s*)if: failure\(\)/,`$1if: \${{ failure() && hashFiles('docker-build.log') != '' }}`);
  s=s.replace(/(name: cloud-run-docker-build-\$\{\{ github\.sha \}\}\n\s*path: docker-build\.log\n\s*)if-no-files-found: error/,`$1if-no-files-found: ignore`);
  assert(s.includes("hashFiles('docker-build.log') != ''"),'تعذر إصلاح شرط docker-build.log');
  write(f,s);
}

// 2) Firestore REST: add an atomic mixed upsert/delete commit primitive.
{
  const f='server/firestore-rest.ts'; let s=read(f);
  if(!s.includes('commitAtomically(')) {
    const anchor='  async createAtomically(';
    const i=s.indexOf(anchor); assert(i>=0,'لم أجد createAtomically في FirestoreRestRepository');
    const method=`  async commitAtomically(input: { upserts?: Array<{ path: string; data: Record<string, unknown> }>; deletes?: string[] }) {\n    const writes = [\n      ...(input.upserts || []).map(({ path, data }) => ({ update: { name: this.name(path), fields: encodeFields(data) } })),\n      ...(input.deletes || []).map((docPath) => ({ delete: this.name(docPath) })),\n    ];\n    if (!writes.length) return;\n    await this.request(':commit', { method: 'POST', body: JSON.stringify({ writes }) });\n  }\n\n`;
    s=s.slice(0,i)+method+s.slice(i);
    write(f,s);
  }
}

// 3) Server endpoint: rotate route tokens server-side; raw tokens are returned once and never stored.
{
  const f='server.ts'; let s=read(f);
  if(!s.includes('/journey-access/reissue')) {
    const anchor="app.delete('/api/competitions/:competitionId'";
    const i=s.indexOf(anchor); assert(i>=0,'لم أجد مسار حذف المسابقة لإدراج endpoint قبله');
    const block=`app.post('/api/competitions/:competitionId/participants/:participantId/journey-access/reissue', async (req, res) => {\n  try {\n    const actor = await requireGovernanceRoles(req, ['super_admin', 'org_admin', 'comp_admin']);\n    const competitionId = String(req.params.competitionId || '');\n    const participantId = String(req.params.participantId || '');\n    const safe = /^[A-Za-z0-9_-]{1,160}$/;\n    if (!safe.test(competitionId) || !safe.test(participantId)) return res.status(400).json({ error: 'invalid_id' });\n    if (!firestoreRepository) return res.status(503).json({ error: 'firestore_unavailable' });\n\n    const organizationId = String((actor as any).organizationId || (actor as any).orgId || '');\n    if (!safe.test(organizationId)) return res.status(403).json({ error: 'organization_scope_required' });\n    const actorCompetitionId = String((actor as any).competitionId || '');\n    if ((actor as any).role === 'comp_admin' && actorCompetitionId && actorCompetitionId !== competitionId) return res.status(403).json({ error: 'competition_scope_mismatch' });\n\n    const participantPath = \`settings/active/organizations/\${organizationId}/competitions/\${competitionId}/participants/\${participantId}\`;\n    const participant = await firestoreRepository.get(participantPath);\n    if (!participant) return res.status(404).json({ error: 'participant_not_found' });\n\n    const makeToken = (audience: 'journey' | 'guardian') => \`mz_\${audience}_\${crypto.randomBytes(32).toString('base64url')}\`;\n    const digest = (value: string) => crypto.createHash('sha256').update(value).digest('hex');\n    const journeyAccessToken = makeToken('journey');\n    const guardianAccessToken = makeToken('guardian');\n    const journeyAccessTokenHash = digest(journeyAccessToken);\n    const guardianAccessTokenHash = digest(guardianAccessToken);\n    const oldJourneyHash = String((participant as any).journeyAccessTokenHash || '');\n    const oldGuardianHash = String((participant as any).guardianAccessTokenHash || '');\n\n    const cloneOrFallback = async (oldHash: string, audience: 'journey' | 'guardian') => {\n      const old = oldHash ? await firestoreRepository.get(\`public_journeys/\${oldHash}\`) : null;\n      return old || { organizationId, competitionId, participantId, audience, active: true };\n    };\n    const [journeyPublic, guardianPublic] = await Promise.all([cloneOrFallback(oldJourneyHash, 'journey'), cloneOrFallback(oldGuardianHash, 'guardian')]);\n    const updatedParticipant = {\n      ...(participant as Record<string, unknown>),\n      journeyAccessTokenHash, guardianAccessTokenHash,\n      journeyAccessReissuedAt: new Date().toISOString(),\n    };\n    delete (updatedParticipant as any).journeyAccessToken;\n    delete (updatedParticipant as any).guardianAccessToken;\n\n    await firestoreRepository.commitAtomically({\n      upserts: [\n        { path: participantPath, data: updatedParticipant },\n        { path: \`public_journeys/\${journeyAccessTokenHash}\`, data: { ...(journeyPublic as any), organizationId, competitionId, participantId, audience: 'journey', active: true } },\n        { path: \`public_journeys/\${guardianAccessTokenHash}\`, data: { ...(guardianPublic as any), organizationId, competitionId, participantId, audience: 'guardian', active: true } },\n      ],\n      deletes: [oldJourneyHash, oldGuardianHash].filter(Boolean).filter((h) => h !== journeyAccessTokenHash && h !== guardianAccessTokenHash).map((h) => \`public_journeys/\${h}\`),\n    });\n\n    return res.json({ journeyAccessToken, guardianAccessToken });\n  } catch (error) {\n    console.error('journey-access reissue failed', error);\n    return res.status(500).json({ error: 'journey_access_reissue_failed' });\n  }\n});\n\n`;
    s=s.slice(0,i)+block+s.slice(i); write(f,s);
  }
}

// 4) Client store: explicit reissue API; preserve conservative ensure behavior.
{
  const f='src/lib/store.ts'; let s=read(f);
  if(!s.includes('reissueParticipantJourneyAccess')) {
    const anchor='const prepareJourneyAccessBatch=async()=>';
    const i=s.indexOf(anchor); assert(i>=0,'لم أجد prepareJourneyAccessBatch');
    const fn=`const reissueParticipantJourneyAccess=async(participantId:string)=>{\n  const idx=globalState.participants.findIndex(p=>p.id===participantId&&p.competitionId===globalState.competition.id);\n  if(idx<0||!auth.currentUser||globalState.isOffline)return null;\n  try{\n    const idToken=await auth.currentUser.getIdToken();\n    const response=await fetch(\`/api/competitions/\${encodeURIComponent(globalState.competition.id)}/participants/\${encodeURIComponent(participantId)}/journey-access/reissue\`,{method:'POST',headers:{Authorization:\`Bearer \${idToken}\`,'Content-Type':'application/json'}});\n    if(!response.ok)return null;\n    const body=await response.json() as {journeyAccessToken?:string;guardianAccessToken?:string};\n    if(!/^mz_journey_[A-Za-z0-9_-]+$/.test(body.journeyAccessToken||'')||!/^mz_guardian_[A-Za-z0-9_-]+$/.test(body.guardianAccessToken||''))return null;\n    const next={...globalState.participants[idx],journeyAccessToken:body.journeyAccessToken!,guardianAccessToken:body.guardianAccessToken!,journeyAccessTokenHash:await sha256(body.journeyAccessToken!),guardianAccessTokenHash:await sha256(body.guardianAccessToken!)};\n    globalState.participants[idx]=next;\n    notify();\n    return next;\n  }catch{return null}\n};\n`;
    s=s.slice(0,i)+fn+s.slice(i);
    // expose alongside existing methods by inserting next to ensureParticipantJourneyAccess occurrence in returned API object where possible.
    const exportAnchor = s.includes('ensureParticipantJourneyAccess, prepareJourneyAccessBatch')
      ? 'ensureParticipantJourneyAccess, prepareJourneyAccessBatch'
      : 'ensureParticipantJourneyAccess,prepareJourneyAccessBatch';
    assert(s.includes(exportAnchor),'لم أجد تصدير دوال journey access في store');
    const replacement = exportAnchor.includes(' ')
      ? 'ensureParticipantJourneyAccess, reissueParticipantJourneyAccess, prepareJourneyAccessBatch'
      : 'ensureParticipantJourneyAccess,reissueParticipantJourneyAccess,prepareJourneyAccessBatch';
    s=s.replace(exportAnchor, replacement);
    write(f,s);
  }
}

// 5) Admin UI: if token is intentionally absent locally, ask before invalidating old QR and reissue.
{
  const f='src/components/admin/CompetitionOverview.tsx'; let s=read(f);
  const old=`const openPass=async(id:string)=>{setPassBusy(true);setPassError('');const p=await store.ensureParticipantJourneyAccess(id);if(p)setPass(p);else setPassError(ar?'تعذر نشر البطاقة؛ لم نعرض رمزًا غير صالح. تحقق من الاتصال وأعد المحاولة.':'The pass could not be published, so no dead QR was shown.');setPassBusy(false)}`;
  if(s.includes(old)) {
    const neo=`const openPass=async(id:string)=>{setPassBusy(true);setPassError('');let p=await store.ensureParticipantJourneyAccess(id);if(!p){const ok=window.confirm(ar?'رمز الرحلة الأصلي غير متاح على هذا الجهاز. إعادة الإصدار ستبطل QR السابق فورًا. هل تريد إعادة إصدار QR وفتح البطاقة؟':'The original journey token is unavailable on this device. Reissuing will invalidate the previous QR immediately. Reissue and open the pass?');if(ok)p=await store.reissueParticipantJourneyAccess(id)}if(p)setPass(p);else setPassError(ar?'تعذر إصدار البطاقة. تحقق من الاتصال والصلاحيات ثم أعد المحاولة.':'The pass could not be issued. Check connectivity and permissions, then retry.');setPassBusy(false)}`;
    s=s.replace(old,neo); write(f,s);
  } else {
    assert(s.includes('reissueParticipantJourneyAccess') || s.includes('const openPass=async'),'صيغة openPass الحالية غير متوقعة؛ أوقفنا التعديل بدل تخمينه');
    if(!s.includes('reissueParticipantJourneyAccess')) throw new Error('يلزم تحديث يدوي لـ openPass لأن تنسيق الملف تغيّر عن commit 00ccc3a');
  }
}

// 6) Add regression guard for root causes.
{
  const f='tests/journey-card-reissue-regression.test.ts';
  if(!fs.existsSync(path.join(root,f))) write(f,`import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport fs from 'node:fs';\n\nconst read=(p:string)=>fs.readFileSync(p,'utf8');\n\ntest('CI only uploads docker log when it exists',()=>{const s=read('.github/workflows/ci.yml');assert.match(s,/hashFiles\\('docker-build\\.log'\\) != ''/);assert.match(s,/if-no-files-found: ignore/)});\ntest('server provides authenticated journey reissue route and atomic rotation',()=>{const s=read('server.ts');assert.match(s,/journey-access\\/reissue/);assert.match(s,/requireGovernanceRoles/);assert.match(s,/commitAtomically/);assert.match(s,/delete \\(updatedParticipant as any\\)\\.journeyAccessToken/)});\ntest('client exposes explicit reissue and UI warns that old QR is invalidated',()=>{const store=read('src/lib/store.ts');const ui=read('src/components/admin/CompetitionOverview.tsx');assert.match(store,/reissueParticipantJourneyAccess/);assert.match(ui,/ستبطل QR السابق/)});\n`);
}

console.log('تم تطبيق إصلاح Mizan الجذري. شغّل: npm run lint && npm test && npm run build');
