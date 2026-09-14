import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(p:string)=>fs.readFileSync(p,'utf8');

test('CI only uploads docker log when it exists',()=>{const s=read('.github/workflows/ci.yml');assert.match(s,/hashFiles\('docker-build\.log'\) != ''/);assert.match(s,/if-no-files-found: ignore/)});
test('server provides authenticated journey reissue route and atomic rotation',()=>{const s=read('server.ts');assert.match(s,/journey-access\/reissue/);assert.match(s,/requireGovernanceRoles/);assert.match(s,/commitAtomically/);assert.match(s,/delete \(updatedParticipant as any\)\.journeyAccessToken/)});
test('client exposes explicit reissue and UI warns that old QR is invalidated',()=>{const store=read('src/lib/store.ts');const ui=read('src/components/admin/CompetitionOverview.tsx');assert.match(store,/reissueParticipantJourneyAccess/);assert.match(ui,/ستبطل QR السابق/)});
