import test from 'node:test';
import assert from 'node:assert/strict';
import { directRunAppTarget, retiredHostTarget } from '../server/retired-hosts';

const BASE = 'dr-alfailakawi.com';

test('the old marketing and admin hosts forward to the web.app site', () => {
  assert.equal(retiredHostTarget('mizan.dr-alfailakawi.com', BASE, '/legal/terms'), 'https://mizan-quran.web.app/legal/terms');
  assert.equal(retiredHostTarget('MIZAN.dr-alfailakawi.com:443', BASE, '/'), 'https://mizan-quran.web.app/');
  assert.equal(retiredHostTarget('admin.dr-alfailakawi.com', BASE, '/'), 'https://mizan-quran.web.app/admin');
  assert.equal(retiredHostTarget('admin.dr-alfailakawi.com', BASE, '/x?y=1'), 'https://mizan-quran.web.app/admin/x?y=1');
});

test('tenants, the web.app hosts and an unset base domain are never redirected', () => {
  for (const h of ['alfailakawi.dr-alfailakawi.com', 'mizan-quran.web.app', 'mizan-f2ce3.web.app', 'localhost', '']) {
    assert.equal(retiredHostTarget(h, BASE, '/'), null);
  }
  assert.equal(retiredHostTarget('mizan.dr-alfailakawi.com', '', '/'), null);
});

test('a direct visit to the run.app address forwards, a proxied one does not', () => {
  const to = 'https://mizan-quran.web.app';
  assert.equal(directRunAppTarget('mizan-jaqsk44ouq-ww.a.run.app', '', to, '/x?y=1'), 'https://mizan-quran.web.app/x?y=1');
  // Hosting and the Cloudflare Worker always send the original host; that must never loop
  assert.equal(directRunAppTarget('mizan-jaqsk44ouq-ww.a.run.app', 'mizan-quran.web.app', to, '/'), null);
  assert.equal(directRunAppTarget('mizan-jaqsk44ouq-ww.a.run.app', '', '', '/'), null);
  assert.equal(directRunAppTarget('localhost', '', to, '/'), null);
});
