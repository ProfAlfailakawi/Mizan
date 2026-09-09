import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(p:string)=>fs.readFileSync(p,'utf8');

test('new organization action always starts a clean create flow',()=>{
  const src=read('src/components/admin/SaaSWorkspace.tsx');
  assert.match(src,/setEditingOrg\(null\);setOrgOpen\(false\);setCreateOpen\(true\)/);
  assert.match(src,/إدارة الدخول والصلاحيات/);
  assert.match(src,/IdentityGovernance operatorId=\{accessOperator\.id\}/);
});

test('operator identities route to their dedicated workspace and carry operatorId',()=>{
  const app=read('src/App.tsx');
  const auth=read('src/lib/useMizanAuth.ts');
  const types=read('src/types/index.ts');
  assert.match(app,/case 'operator_owner': case 'operator_admin': return <OperatorWorkspace\/>/);
  assert.match(auth,/operatorId:/);
  assert.match(types,/operatorId\?: string/);
});

test('committee setup synchronizes governed judge names and uses a clean number control',()=>{
  const src=read('src/components/admin/CompetitionOverview.tsx');
  const css=read('src/index.css');
  assert.match(src,/\/api\/identity\/governance/);
  assert.match(src,/syncAuthorizedJudgeProfiles/);
  assert.match(src,/إخفاء هوية المتسابق عن المحكم/);
  assert.match(src,/إعدادات تحكيم متقدمة/);
  assert.match(src,/aria-label=\{`إنقاص \$\{label\}`\}/);
  assert.match(src,/aria-label=\{`زيادة \$\{label\}`\}/);
  assert.match(css,/mizan-number-input::-webkit-outer-spin-button/);
});

test('registration uses one comprehensive consent instead of four separate checkboxes',()=>{
  const src=read('src/components/public/RegistrationFlow.tsx');
  assert.match(src,/consentAccepted/);
  assert.match(src,/أوافق على شروط المشاركة وسياسة الخصوصية/);
  assert.doesNotMatch(src,/termsAccepted|privacyAccepted|audioAccepted|aiAccepted/);
});

test('public competition page removes share buttons and the technical verification badge',()=>{
  const src=read('src/components/public/CompetitionLanding.tsx');
  assert.doesNotMatch(src,/إرسال الرابط عبر واتساب|نسخ الرابط|معتمدة وموثقة|سجل المسابقة محمي وموثّق داخل ميزان/);
  assert.doesNotMatch(src,/handleShareWhatsApp|handleCopyLink/);
});

test('long QR values fail safely instead of crashing the whole app',()=>{
  const src=read('src/components/design-system/RealQRCode.tsx');
  assert.match(src,/try\{return \{matrix:createQrMatrix\(value\),error:false\}\}catch/);
  assert.match(src,/تعذّر رسم الرمز لهذا الرابط الطويل/);
});

test('notification center is global, tabbed, searchable and send-capable',()=>{
  const header=read('src/components/layout/Header.tsx');
  const center=read('src/components/layout/NotificationCenter.tsx');
  const server=read('server.ts');
  assert.match(header,/<NotificationCenter\/>/);
  for(const token of ['الكل','غير المقروء','رسائل الإدارة','النظام','المسابقات','الدعوات والصلاحيات','الدعم'])assert.match(center,new RegExp(token));
  assert.match(center,/إرسال إشعار/);
  assert.match(center,/تعليم الكل كمقروء/);
  assert.match(server,/app\.post\('\/api\/notifications'/);
  assert.match(server,/CROSS_OPERATOR_ACCESS_BLOCKED/);
  assert.match(server,/CROSS_TENANT_ACCESS_BLOCKED/);
});
