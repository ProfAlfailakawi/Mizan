import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import { xlsxToCsv, looksLikeXlsx, excelSerialToIsoDate, XlsxReadError } from '../src/lib/xlsx-reader';
import { planParticipantImport } from '../src/lib/participant-import';

/** يبني زيپًا صغيرًا بالصيغة التي يكتبها Excel (deflate لكل ملف). */
function zip(files: Record<string, string>, method: 0 | 8 = 8): Uint8Array {
  const enc = new TextEncoder();
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const nameBuf = Buffer.from(name);
    const raw = Buffer.from(enc.encode(text));
    const data = method === 8 ? deflateRawSync(raw) : raw;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(method, 8);
    local.writeUInt32LE(data.length, 18); local.writeUInt32LE(raw.length, 22); local.writeUInt16LE(nameBuf.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(method, 10);
    central.writeUInt32LE(data.length, 20); central.writeUInt32LE(raw.length, 24); central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf, data);
    centrals.push(central, nameBuf);
    offset += 30 + nameBuf.length + data.length;
  }
  const dir = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(files).length, 8); end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(dir.length, 12); end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...locals, dir, end]));
}

const WORKBOOK = '<workbook xmlns:r="x"><sheets><sheet name="Data" sheetId="1" r:id="rId7"/></sheets></workbook>';
const RELS = '<Relationships><Relationship Id="rId7" Type="t" Target="worksheets/sheet2.xml"/><Relationship Id="rId1" Type="t" Target="worksheets/sheet1.xml"/></Relationships>';
const SHARED = '<sst><si><t>fullName</t></si><si><t>email</t></si><si><t>dateOfBirth</t></si><si><t>categoryId</t></si>'
  + '<si><t>علي &amp; أحمد</t></si><si><r><t>a@</t></r><r><t>b.com</t></r></si><si><t>C,1</t></si></sst>';
const SHEET2 = '<worksheet><sheetData>'
  + '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="s"><v>3</v></c></row>'
  + '<row r="2"><c r="A2" t="s"><v>4</v></c><c r="B2" t="s"><v>5</v></c><c r="C2"><v>38353</v></c><c r="D2" t="s"><v>6</v></c></row>'
  + '<row r="3"><c r="A3" t="inlineStr"><is><t>سارة</t></is></c><c r="C3" t="str"><v>2010-05-04</v></c></row>'
  + '</sheetData></worksheet>';
const SHEET1_DECOY = '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>WRONG</t></is></c></row></sheetData></worksheet>';
const files = {
  'xl/workbook.xml': WORKBOOK, 'xl/_rels/workbook.xml.rels': RELS, 'xl/sharedStrings.xml': SHARED,
  'xl/worksheets/sheet1.xml': SHEET1_DECOY, 'xl/worksheets/sheet2.xml': SHEET2,
};

test('reads the workbook\'s first sheet by relationship, not by file name', async () => {
  const csv = await xlsxToCsv(zip(files));
  assert.ok(!csv.includes('WRONG'));
  assert.equal(csv.split('\n')[0], 'fullName,email,dateOfBirth,categoryId');
});

test('shared strings, entities, rich text, quoting and Arabic survive', async () => {
  const lines = (await xlsxToCsv(zip(files))).split('\n');
  assert.equal(lines[1], 'علي & أحمد,a@b.com,2005-01-01,"C,1"');
  assert.equal(lines[2], 'سارة,,2010-05-04,');
});

test('works with stored (uncompressed) entries too', async () => {
  const csv = await xlsxToCsv(zip(files, 0));
  assert.equal(csv.split('\n').length, 3);
});

test('excel date serials convert; out-of-range ones do not', () => {
  assert.equal(excelSerialToIsoDate(38353), '2005-01-01');
  assert.equal(excelSerialToIsoDate(0), null);
  assert.equal(excelSerialToIsoDate(NaN), null);
});

test('the CSV flows through the real import validator unchanged', async () => {
  const csv = await xlsxToCsv(zip(files));
  const plan = planParticipantImport({
    csv, competition: { id: 'comp', categories: [{ id: 'C,1', code: 'C,1', riwaya: 'حفص عن عاصم' } as any] },
    existingParticipants: [],
  });
  /* الصف الثالث ينقصه بريد وفئة: يُرفض بسببه — أي أن الخط الواحد هو الذي يحكم. */
  assert.ok(plan.errors.some(e => e.row === 3));
  assert.equal(plan.importable, false);
});

test('non-xlsx and damaged input is refused with a named code', async () => {
  await assert.rejects(() => xlsxToCsv(new TextEncoder().encode('a,b,c\n1,2,3\n and some more padding bytes')), (e: any) => e instanceof XlsxReadError && e.code === 'XLSX_NOT_A_ZIP');
  const good = zip(files);
  await assert.rejects(() => xlsxToCsv(good.slice(0, good.length - 30)), (e: any) => e instanceof XlsxReadError);
  await assert.rejects(() => xlsxToCsv(zip({ 'xl/workbook.xml': WORKBOOK })), (e: any) => e.code === 'XLSX_NO_SHEET');
});

test('looksLikeXlsx needs both the extension and the zip signature', () => {
  const pk = new Uint8Array([0x50, 0x4b, 3, 4, 0, 0]);
  assert.equal(looksLikeXlsx('a.xlsx', pk), true);
  assert.equal(looksLikeXlsx('a.csv', pk), false);
  assert.equal(looksLikeXlsx('a.xlsx', new Uint8Array([1, 2, 3, 4, 5])), false);
});
