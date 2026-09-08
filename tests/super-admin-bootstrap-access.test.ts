import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('super-admin bootstrap remains global and respects the configured MFA switch',()=>{
 const client=fs.readFileSync('src/lib/useMizanAuth.ts','utf8');
 const server=fs.readFileSync('server.ts','utf8');
 assert.match(client,/PLATFORM_OWNER_ORGANIZATION_ID = '__platform__'/);
 assert.match(client,/claimRole === 'super_admin' \? PLATFORM_OWNER_ORGANIZATION_ID/);
 assert.match(server,/role==='super_admin'\?platformOwnerOrganizationId/);
 assert.match(client,/VITE_REQUIRE_MFA_FOR_SENSITIVE === 'true'/);
 assert.match(server,/MIZAN_REQUIRE_MFA_FOR_SENSITIVE==='true'/);
});
