import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=(path:string)=>fs.readFileSync(path,'utf8');

test('notification center modal keeps focus stable while users type and scroll',()=>{
 const dialog=source('src/lib/useDialogBehavior.ts');
 const center=source('src/components/layout/NotificationCenter.tsx');
 const css=source('src/index.css');
 assert.match(dialog,/const onCloseRef = useRef\(onClose\)/);
 assert.match(dialog,/onCloseRef\.current\(\)/);
 assert.doesNotMatch(dialog,/\[open, onClose, ref, lockScroll, autoFocus\]/);
 assert.doesNotMatch(center,/max-h-\[55vh\] space-y-2 overflow-y-auto/);
 assert.match(css,/mizan-dialog-body\{[^}]*overscroll-behavior:contain/);
 assert.match(css,/mizan-dialog-body\{[^}]*touch-action:pan-y/);
});

test('judge specialties are multi-select and derived from competition criteria',()=>{
 const types=source('src/types/index.ts');
 const overview=source('src/components/admin/CompetitionOverview.tsx');
 const judge=source('src/components/judge/JudgeOS.tsx');
 const store=source('src/lib/store.ts');
 assert.match(types,/specialties\?: string\[\]/);
 assert.match(overview,/judgeSpecialtyOptions\(store\.competition\.ruleSet\.criteria,ar\)/);
 assert.match(overview,/toggleJudgeSpecialty/);
 assert.match(store,/updateJudgeSpecialties/);
 assert.match(judge,/judgeSpecialties\(judge\)/);
 // Specialties are resolved per panel: the judge's live view uses the committee-scoped effectiveJudge.
 assert.match(judge,/judgeCanScore\(effectiveJudge,criterion\.assignedJudgeType,policy\.judging\.mode\)/);
 assert.match(overview,/updateCommitteeJudgeSpecialty/);
});
