/*
 * الوثيقتان اللتان يوقّع عليهما المتسابق — تُخدَمان من ميزان نفسِه.
 *
 * كان الرابطُ يُنتظر من خارج النظام: يستضيف المالكُ الوثيقتين في مكانٍ ما، ويضع عنوانَه
 * في `MIZAN_LEGAL_*_URL`. وذلك يُنشئ **نسختين من الحقيقة**: نصًّا في المستودع ونصًّا على
 * الرابط، ولا شيءَ يمنع أن يفترقا. فيوقّع المتسابق على ما في الرابط، ويُسجَّل له رقمُ
 * النسخة الذي في المستودع، ويُقرأ الأثرُ بعد سنةٍ شاهدًا على نصٍّ لم يره أحد.
 *
 * فصار المصدرُ واحدًا: **يُقرأ الملفُّ الملتزَم نفسُه** ويُعرض، ويُقرأ منه رقمُ النسخة
 * وتاريخُ السريان والناشر. فما يراه الموقِّع وما يُسجَّل في أثره من ملفٍّ واحد بالضرورة،
 * لا بانضباطٍ بشريّ.
 *
 * **ويفشل مغلقًا.** ملفٌّ غائبٌ أو رأسٌ لا يُقرأ ⇒ لا صفحة: رمزٌ باسمه و503. ولا يُعرض
 * نصٌّ بلا نسخةٍ ولا تاريخ — فصفحةٌ كتلك تبدو وثيقةً وهي ليست بوثيقة.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import type { LegalDocumentKind } from '../src/lib/legal-documents';

/** اسمُ ملفّ كلّ وثيقة. والمسارُ يُشتقّ، فلا يُكتب اسمٌ في موضعين. */
const FILENAMES: Record<LegalDocumentKind, string> = {
  terms: 'TERMS-AR.md',
  privacy: 'PRIVACY-AR.md',
};

const TITLES: Record<LegalDocumentKind, string> = {
  terms: 'شروط المشاركة',
  privacy: 'سياسة الخصوصية',
};

/*
 * صورةُ التشغيل تنسخ `dist` وحدَها (انظر `Dockerfile`)، فلا وجودَ لـ`docs/` هناك.
 * وخطوةُ البناء تنسخ الوثيقتين إلى `dist/legal`. فيُبحث في الموضعين: موضعِ الإنتاج
 * أوّلًا ثم موضعِ المستودع، ويُذكر ما بُحث فيه عند الإخفاق كي لا يُخمَّن السبب.
 */
export function legalDocumentDirectories(root = process.cwd()): string[] {
  return [join(root, 'dist', 'legal'), join(root, 'legal'), join(root, 'docs', 'legal')];
}

export class LegalPublicationError extends Error {
  constructor(readonly code: string, message: string) { super(message); this.name = 'LegalPublicationError'; }
}

export interface PublishedLegalPage {
  kind: LegalDocumentKind;
  title: string;
  publisher: string;
  version: string;
  effectiveDate: string;
  html: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** يقرأ الملفّ من أوّل موضعٍ يوجد فيه، ويرمي باسمِ ما بُحث فيه إن لم يوجد. */
export function readLegalSource(kind: LegalDocumentKind, root = process.cwd()): string {
  const tried = legalDocumentDirectories(root).map(directory => join(directory, FILENAMES[kind]));
  for (const path of tried) if (existsSync(path)) return readFileSync(path, 'utf8');
  throw new LegalPublicationError('LEGAL_DOCUMENT_SOURCE_MISSING',
    `${FILENAMES[kind]} not found. Looked in: ${tried.join(', ')}`);
}

/*
 * الرأسُ يُقرأ من الوثيقة لا يُمرَّر إليها. ولو مُرّر لصار حقلًا ثانيًا يمكن أن يخالف
 * النصّ — وهو العطبُ نفسُه الذي أُنشئ هذا الملفُّ لإغلاقه، منقولًا خطوةً إلى الداخل.
 */
export interface LegalHeader {
  publisher: string;
  version: string;
  effectiveDate: string;
  /** كلُّ حقول الرأس بترتيبها، ليُعرض الرأسُ كما كُتب لا كما أُعيدت صياغتُه. */
  fields: {label: string; value: string}[];
  /** ما بعد الرأس — وهو وحده ما يُعرض نصًّا. */
  body: string;
}

/*
 * الرأسُ يُقرأ من الوثيقة لا يُمرَّر إليها. ولو مُرّر لصار حقلًا ثانيًا يمكن أن يخالف
 * النصّ — وهو العطبُ نفسُه الذي أُنشئ هذا الملفُّ لإغلاقه، منقولًا خطوةً إلى الداخل.
 *
 * ويُقتطع من المتن. فأسطرُ الرأس في Markdown **فقرةٌ واحدة**: يلصقها أيُّ عارضٍ سطرًا
 * متّصلًا — «المتحكّم… السجل التجاري… نسخة الوثيقة… تاريخ السريان…» — وهو ما رأيتُه في
 * أوّل لقطةٍ لهذه الصفحة. فيُعرض حقلًا حقلًا، ولا يُكرَّر بعدها رقمُ النسخة والتاريخ.
 */
export function parseLegalHeader(markdown: string): LegalHeader {
  const lines = markdown.split('\n');
  const separator = lines.findIndex(line => /^---\s*$/.test(line));
  if (separator < 0) {
    throw new LegalPublicationError('LEGAL_DOCUMENT_HEADER_UNREADABLE',
      'the document has no `---` separating its header from its body');
  }
  const fields = lines.slice(0, separator)
    .map(line => /^\*\*(.+?):\*\*\s*(.+?)\s*$/.exec(line))
    .filter((found): found is RegExpExecArray => found !== null)
    .map(found => ({label: found[1], value: found[2]}));

  const valueOf = (labels: string[]) => fields.find(f => labels.includes(f.label))?.value ?? '';
  const publisher = valueOf(['الناشر', 'المتحكّم بالبيانات']);
  const version = valueOf(['نسخة الوثيقة']);
  const effectiveDate = valueOf(['تاريخ السريان']);

  const missing: string[] = [];
  if (!publisher) missing.push('publisher');
  if (!version) missing.push('version');
  if (!ISO_DATE.test(effectiveDate)) missing.push('effectiveDate');
  if (missing.length) {
    throw new LegalPublicationError('LEGAL_DOCUMENT_HEADER_UNREADABLE',
      `the document does not declare: ${missing.join(', ')}`);
  }
  return {publisher, version, effectiveDate, fields, body: lines.slice(separator + 1).join('\n')};
}

const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/*
 * عارضٌ للمجموعة التي تستعملها الوثيقتان فعلًا، لا لـMarkdown كلِّها — ولا تُضاف تبعيةٌ
 * إنتاجية لأجل صفحتين. **والخطرُ أن يتوسّع النصُّ فيخرج عن المجموعة فيُعرض خامًا**، فيقرأ
 * المتسابق `**` و`|` ويظنّها من الوثيقة. فيحرس ذلك `assertRenderable` أدناه ويحرسه اختبار.
 */
/*
 * **قائمةُ منعٍ لا قائمةُ سماح.** كُتبت أوّلَ مرّةٍ سماحًا، وآخرُ بدائلها `\S` — أي
 * «أيُّ سطرٍ يبدأ بحرف». فكانت تسمح بكلّ شيء: جرّبتُها على كتلة ``` فمرّت. وحارسٌ لا
 * يعضّ أسوأ من لا حارس.
 *
 * فصارت تُسمّي ما **لا** يعرفه العارضُ صراحةً. وكلُّ بندٍ هنا بناءٌ من Markdown سيصل
 * القارئَ خامًا لو ظهر: يقرأ `[نصّ](رابط)` أو ``` أو `<div>` كما كُتبت، فيظنّها من
 * الوثيقة. فيُرفض، ويُسمّى السطر.
 */
const UNSUPPORTED: {what: string; pattern: RegExp}[] = [
  {what: 'fenced code', pattern: /^(?:```|~~~)/},
  {what: 'heading deeper than h3', pattern: /^#{4,} /},
  {what: 'image', pattern: /!\[/},
  {what: 'link', pattern: /\[[^\]]*\]\([^)]*\)/},
  {what: 'raw HTML', pattern: /<\/?[a-zA-Z][^>]*>/},
  {what: 'setext heading', pattern: /^(?:={3,}|\*{3,}|___+)\s*$/},
  {what: 'nested list', pattern: /^\s{2,}(?:[-*+]|\d+\.) /},
  {what: 'nested quote', pattern: /^\s*>\s*>/},
  {what: 'strikethrough', pattern: /~~/},
  {what: 'single-asterisk emphasis', pattern: /(?<!\*)\*(?!\*)[^*\n]+\*(?!\*)/},
  {what: 'task list', pattern: /^(?:[-*+]|\d+\.) \[[ xX]\]/},
];

const inline = (text: string) =>
  escapeHtml(text)
    .replace(/\\([*_`|])/g, '$1')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

/** يرمي إن حملت الوثيقةُ بناءً لا يعرفه العارض — فالعرضُ الخام أسوأ من لا عرض. */
export function assertRenderable(markdown: string): void {
  const offenders: string[] = [];
  markdown.split('\n').forEach((line, index) => {
    for (const {what, pattern} of UNSUPPORTED) {
      if (pattern.test(line)) offenders.push(`line ${index + 1}: ${what}`);
    }
  });
  if (offenders.length) {
    throw new LegalPublicationError('LEGAL_DOCUMENT_UNRENDERABLE',
      `unsupported markdown — ${offenders.join('; ')}`);
  }
}

/** Markdown → HTML، للمجموعة المستعملة وحدها. */
export function renderLegalBody(markdown: string): string {
  assertRenderable(markdown);
  const out: string[] = [];
  const lines = markdown.split('\n');
  let list: 'ol' | 'ul' | null = null;
  let quote = false;
  let table: string[][] | null = null;
  let paragraph: string[] = [];

  const closeParagraph = () => { if (paragraph.length) { out.push(`<p>${inline(paragraph.join(' '))}</p>`); paragraph = []; } };
  const closeList = () => { if (list) { out.push(`</${list}>`); list = null; } };
  const closeQuote = () => { if (quote) { out.push('</blockquote>'); quote = false; } };
  const closeTable = () => {
    if (!table) return;
    const [head, ...body] = table;
    out.push('<table><thead><tr>' + head.map(c => `<th>${inline(c)}</th>`).join('') + '</tr></thead><tbody>'
      + body.map(row => '<tr>' + row.map(c => `<td>${inline(c)}</td>`).join('') + '</tr>').join('')
      + '</tbody></table>');
    table = null;
  };
  const closeAll = () => { closeParagraph(); closeList(); closeQuote(); closeTable(); };

  for (const raw of lines) {
    const line = raw.trimEnd();

    if (!line.trim()) { closeAll(); continue; }

    const heading = /^(#{1,3}) (.+)$/.exec(line);
    if (heading) { closeAll(); const level = heading[1].length; out.push(`<h${level}>${inline(heading[2])}</h${level}>`); continue; }

    if (/^---\s*$/.test(line)) { closeAll(); out.push('<hr>'); continue; }

    const cells = /^\|(.+)\|\s*$/.exec(line);
    if (cells) {
      closeParagraph(); closeList(); closeQuote();
      const parts = cells[1].split('|').map(c => c.trim());
      // سطرُ المحاذاة `|---|---|` فاصلٌ لا صفّ.
      if (parts.every(c => /^:?-{3,}:?$/.test(c))) continue;
      (table ||= []).push(parts);
      continue;
    }
    closeTable();

    if (line.startsWith('> ') || line === '>') {
      closeParagraph(); closeList();
      if (!quote) { out.push('<blockquote>'); quote = true; }
      const body = line.slice(2);
      if (body.trim()) paragraph.push(body);
      else closeParagraph();
      continue;
    }
    if (quote && /^\s+\S/.test(raw)) { paragraph.push(line.trim()); continue; }
    closeQuote();

    const ordered = /^(\d+)\. (.+)$/.exec(line);
    const unordered = /^- (.+)$/.exec(line);
    if (ordered || unordered) {
      closeParagraph();
      const wanted = ordered ? 'ol' : 'ul';
      if (list !== wanted) { closeList(); out.push(`<${wanted}>`); list = wanted; }
      out.push(`<li>${inline((ordered ? ordered[2] : unordered![1]))}`);
      continue;
    }

    // سطرُ متابعةٍ داخل عنصرِ قائمة، أو سطرُ فقرةٍ ملفوف.
    paragraph.push(line.trim());
    if (list) { out.push(` ${inline(line.trim())}`); paragraph = []; }
  }
  closeAll();
  return out.join('\n');
}

const PAGE_STYLE = `
:root{color-scheme:light dark;--ink:#16202b;--muted:#5b6b7c;--line:#dde4ea;--bg:#fbfcfd;--accent:#0f766e}
@media(prefers-color-scheme:dark){:root{--ink:#e7edf3;--muted:#9fb0c0;--line:#2b3947;--bg:#111820;--accent:#5eead4}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.85 system-ui,"Segoe UI",Tahoma,sans-serif;padding:24px 16px 72px}
main{max-width:760px;margin:0 auto}
h1{font-size:1.9rem;line-height:1.35;margin:0 0 4px}
h2{font-size:1.25rem;margin:2.2em 0 .6em;padding-top:.6em;border-top:1px solid var(--line)}
h3{font-size:1.05rem;margin:1.6em 0 .4em;color:var(--accent)}
hr{border:0;border-top:1px solid var(--line);margin:2em 0}
p{margin:0 0 1em}
ol,ul{margin:0 0 1em;padding-inline-start:1.4em}
li{margin-bottom:.5em}
blockquote{margin:1.2em 0;padding:.6em 1em;border-inline-start:3px solid var(--accent);background:color-mix(in srgb,var(--accent) 7%,transparent);border-radius:6px}
blockquote p:last-child{margin-bottom:0}
table{width:100%;border-collapse:collapse;margin:1em 0;font-size:.95rem}
th,td{border:1px solid var(--line);padding:.5em .7em;text-align:start;vertical-align:top}
th{background:color-mix(in srgb,var(--accent) 10%,transparent);font-weight:600}
code{background:color-mix(in srgb,var(--muted) 18%,transparent);padding:.1em .35em;border-radius:4px;font-size:.9em}
.stamp{margin:0 0 2.4em;padding:.9em 1.1em;border:1px solid var(--line);border-radius:8px;font-size:.92rem;background:color-mix(in srgb,var(--accent) 4%,transparent)}
.stamp>div{display:flex;gap:.5em;flex-wrap:wrap;margin-bottom:.35em}
.stamp>div:last-child{margin-bottom:0}
.stamp dt{color:var(--muted);margin:0}
.stamp dt::after{content:":"}
.stamp dd{margin:0;font-weight:600}
`.trim();

/** الصفحةُ كاملةً — قائمةٌ بنفسها، بلا طلبٍ خارجيّ واحد، فتُقرأ تحت أضيق سياسةِ محتوى. */
export function renderLegalPage(kind: LegalDocumentKind, markdown: string): PublishedLegalPage {
  const {publisher, version, effectiveDate, fields, body: source} = parseLegalHeader(markdown);
  const title = TITLES[kind];
  const body = renderLegalBody(source);
  const header = fields.map(({label, value}) =>
    `<div><dt>${inline(label)}</dt><dd>${inline(value)}</dd></div>`).join('');
  const html = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} — ${escapeHtml(publisher)}</title>
<meta name="robots" content="index, follow">
<style>${PAGE_STYLE}</style>
</head>
<body>
<main>
<h1>${escapeHtml(title)}</h1>
<dl class="stamp">${header}</dl>
${body}
</main>
</body>
</html>`;
  return {kind, title, publisher, version, effectiveDate, html};
}

/** يقرأ ويعرض — المدخلُ الوحيد الذي يستعمله الخادم. */
export function publishedLegalPage(kind: LegalDocumentKind, root = process.cwd()): PublishedLegalPage {
  return renderLegalPage(kind, readLegalSource(kind, root));
}

/** مساراتُ النشر. مكتوبةٌ هنا مرّةً، وتُقرأ منها البوّابةُ والخادمُ والاختبار. */
export const LEGAL_PUBLICATION_PATHS: Record<LegalDocumentKind, string> = {
  terms: '/legal/terms',
  privacy: '/legal/privacy',
};

export { FILENAMES as LEGAL_DOCUMENT_FILENAMES };
export const legalDocumentRoot = (fromFile: string) => resolve(dirname(fromFile), '..');
