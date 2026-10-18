import test from 'node:test';
import assert from 'node:assert/strict';
import { auditEntityLabel } from '../src/lib/ui-language';

test('audit entity labels never leak snake_case tokens in the Arabic UI', () => {
  assert.equal(auditEntityLabel('subscription_term', true), 'فترة اشتراك');
  assert.equal(auditEntityLabel('some_new_entity', true), 'some new entity');
  assert.equal(auditEntityLabel('subscription_term', false), 'subscription_term');
  assert.equal(auditEntityLabel(undefined, true), '—');
});
