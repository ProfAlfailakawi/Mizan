import test from 'node:test';
import assert from 'node:assert/strict';
import { demoCommercialResponse, demoCommercialWrite } from '../src/data/demo-commercial';

const invoices = () => (demoCommercialResponse('/api/saas/owner/dashboard') as { billing: { invoices: { id: string; status: string; note?: string }[] } }).billing.invoices;

test('simulated manual invoice appears as open, then can be marked paid (memory only)', () => {
  const before = invoices().length;
  const out = demoCommercialWrite('/api/saas/owner/invoices', { method: 'POST', body: JSON.stringify({ subjectType: 'organization', subjectId: 'org-demo-mizan', amountMinor: 15000, currency: 'KWD', note: 'رسوم اختبار' }) }) as { invoice: { id: string } };
  assert.equal(invoices().length, before + 1);
  assert.equal(invoices().find(i => i.id === out.invoice.id)?.status, 'open');
  demoCommercialWrite(`/api/saas/owner/invoices/${out.invoice.id}/pay`, { method: 'POST', body: JSON.stringify({ method: 'manual' }) });
  assert.equal(invoices().find(i => i.id === out.invoice.id)?.status, 'paid');
});
