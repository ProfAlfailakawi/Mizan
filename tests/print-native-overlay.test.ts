import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PRINT_HOST_ID, PRINT_OVERLAY_CSS, printInPage } from '../src/lib/printInPage';

const src = fs.readFileSync('src/components/admin/ResultsDocuments.tsx', 'utf8');
const fn = src.slice(src.indexOf('export function printDocument'), src.indexOf('export function downloadFile'));

test('native: printDocument branches to the in-page overlay before any iframe is created', () => {
  const nativeAt = fn.indexOf('isAppleNativeShell()');
  assert.ok(nativeAt > 0 && nativeAt < fn.indexOf("createElement('iframe')"));
  assert.match(fn, /printInPage\(html\)/);
});

test('browser: hidden-iframe path is intact', () => {
  assert.match(fn, /createElement\('iframe'\)/);
  assert.match(fn, /frame\.contentWindow\?\.print\(\)/);
  assert.match(fn, /fonts\?\.ready/);
});

test('print CSS hides every other body child and the toolbar when printing', () => {
  assert.match(PRINT_OVERLAY_CSS, /@media print\{/);
  assert.ok(PRINT_OVERLAY_CSS.includes(`body > *:not(#${PRINT_HOST_ID}){display:none !important}`));
  assert.match(PRINT_OVERLAY_CSS, /\.mz-print-bar\{display:none !important\}/);
});

test('printInPage mounts an overlay with print/close buttons and prints the page', () => {
  const g = globalThis as any;
  const made: any[] = [];
  const mkEl = (tag: string): any => {
    const el: any = { tag, children: [] as any[], attrs: {}, listeners: {} as any, style: {},
      setAttribute(k: string, v: string) { this.attrs[k] = v; },
      addEventListener(t: string, f: any) { this.listeners[t] = f; },
      append(...c: any[]) { this.children.push(...c); }, appendChild(c: any) { this.children.push(c); },
      remove() { this.removed = true; }, attachShadow() { return (this.shadow = {}); } };
    made.push(el); return el;
  };
  const head = mkEl('head'), body = mkEl('body');
  let printed = 0;
  const prev = { document: g.document, window: g.window, setTimeout: g.setTimeout };
  g.document = { createElement: mkEl, getElementById: () => null, head, body };
  g.window = { print: () => { printed++; }, addEventListener() {} };
  g.setTimeout = (f: () => void) => { f(); return 0; };
  try {
    printInPage('<style>p{color:red}</style><p>x</p>');
    const host = made.find(e => e.attrs.id === undefined && e.id === PRINT_HOST_ID);
    assert.ok(host, 'overlay host appended');
    assert.ok(body.children.includes(host));
    const shadowHost = made.find(e => e.shadow);
    assert.equal(shadowHost.shadow.innerHTML, '<style>p{color:red}</style><p>x</p>');
    const buttons = made.filter(e => e.tag === 'button');
    assert.deepEqual(buttons.map(b => b.textContent), ['طباعة', 'إغلاق']);
    assert.equal(printed, 1);
    buttons[1].listeners.click();
    assert.equal(host.removed, true);
  } finally { g.document = prev.document; g.window = prev.window; g.setTimeout = prev.setTimeout; }
});
