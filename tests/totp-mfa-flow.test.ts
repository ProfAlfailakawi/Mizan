import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createQrMatrix } from '../src/components/design-system/RealQRCode';

const source=(path:string)=>fs.readFileSync(path,'utf8');

test('QR encoder keeps compact passes and supports local TOTP otpauth payloads',()=>{
 assert.equal(createQrMatrix('MZ1|A-104').length,33);
 const totp='otpauth://totp/MIZAN:owner%40example.com?secret=ABCDEFGHIJKLMNOPQRSTUVWX234567&issuer=MIZAN&algorithm=SHA1&digits=6&period=30';
 assert.ok(new TextEncoder().encode(totp).length>78);
 assert.ok(new TextEncoder().encode(totp).length<=134);
 assert.equal(createQrMatrix(totp).length,41);
 assert.throws(()=>createQrMatrix('x'.repeat(135)),/exceeds 134/);
});

test('owner can enroll TOTP from the MFA-required bootstrap without external QR services',()=>{
 const security=source('src/components/auth/TotpSecurity.tsx');
 const app=source('src/App.tsx');
 assert.match(security,/multiFactor\(active\)\.getSession\(\)/);
 assert.match(security,/TotpMultiFactorGenerator\.generateSecret/);
 assert.match(security,/assertionForEnrollment/);
 assert.match(security,/reauthenticateWithCredential/);
 assert.match(security,/generateQrCodeUrl\(active\.email\|\|active\.uid,'MIZAN'\)/);
 assert.match(security,/<RealQRCode value=\{uri\}/);
 assert.doesNotMatch(security,/api\.qrserver|chart\.google|quickchart/i);
 assert.match(app,/accessError==='MFA_REQUIRED'.*<TotpSecurity bootstrap\/>/s);
});

test('password login resolves the enrolled TOTP second-factor challenge',()=>{
 const auth=source('src/components/auth/AuthPortal.tsx');
 assert.match(auth,/auth\/multi-factor-auth-required/);
 assert.match(auth,/getMultiFactorResolver/);
 assert.match(auth,/assertionForSignIn/);
 assert.match(auth,/resolveSignIn/);
 assert.match(auth,/Authenticator/);
});

test('Super Admin console exposes account security state after protected sign-in',()=>{
 const portals=source('src/components/admin/RolePortals.tsx');
 const start=portals.indexOf('export const SuperAdminConsole');
 const end=portals.indexOf('export const OrganizationHome',start);
 assert.ok(start>=0&&end>start);
 assert.match(portals.slice(start,end),/<TotpSecurityCard\/>/);
});
