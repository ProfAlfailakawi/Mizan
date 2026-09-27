/*
 * منشئ نموذج التسجيل بلا برمجة: تضيف الجهة حقولها وأقسامها، وتحدّد شروط ظهورها ووجوبها،
 * وسياسة التعديل ورسوم التسجيل (إن أرادت). كل ذلك مخطّطٌ تصريحي يُحفظ في سياسة المسابقة،
 * ويُقيَّم بالمحرّك نفسه في صفحة التسجيل وعلى الخادم.
 */
import React, { useState } from 'react';
import type { RegistrationFieldCondition, RegistrationFieldDefinition, RegistrationPolicy } from '../../types';
import { validateFormSchema } from '../../lib/registration-form';

const TYPES: RegistrationFieldDefinition['type'][] = ['text', 'long_text', 'number', 'date', 'email', 'phone', 'select', 'multi_select', 'country', 'checkbox', 'consent', 'file', 'section'];
const TYPE_LABEL: Record<string, [string, string]> = {
  text: ['نصّ قصير', 'Short text'], long_text: ['نصّ طويل', 'Long text'], number: ['رقم', 'Number'], date: ['تاريخ', 'Date'], email: ['بريد', 'Email'], phone: ['هاتف', 'Phone'],
  select: ['اختيار واحد', 'Select'], multi_select: ['اختيار متعدد', 'Multi-select'], country: ['دولة', 'Country'], checkbox: ['مربّع اختيار', 'Checkbox'],
  consent: ['موافقة', 'Consent'], file: ['مستند', 'File/document'], section: ['قسم إرشادي', 'Information section'],
};
const OPS: RegistrationFieldCondition['operator'][] = ['eq', 'neq', 'lt', 'lte', 'gt', 'gte', 'in', 'not_in', 'exists', 'not_exists', 'contains'];
const OP_LABEL: Record<string, [string, string]> = {
  eq: ['يساوي', 'equals'], neq: ['لا يساوي', 'not equal'], lt: ['أقل من', 'less than'], lte: ['أقل أو يساوي', '≤'], gt: ['أكبر من', 'greater than'], gte: ['أكبر أو يساوي', '≥'],
  in: ['ضمن', 'is one of'], not_in: ['ليس ضمن', 'is not one of'], exists: ['مُدخل', 'is filled'], not_exists: ['فارغ', 'is empty'], contains: ['يحتوي', 'contains'],
};

const newField = (n: number): RegistrationFieldDefinition => ({ id: `custom_${Date.now().toString(36)}_${n}`, labelArabic: 'حقل جديد', labelEnglish: 'New field', type: 'text', required: false, visible: true, custom: true });

const parseValue = (op: RegistrationFieldCondition['operator'], raw: string): RegistrationFieldCondition['value'] => {
  if (op === 'in' || op === 'not_in') return raw.split(',').map(x => x.trim()).filter(Boolean);
  if (['lt', 'lte', 'gt', 'gte'].includes(op)) return Number(raw);
  return raw;
};

const ConditionEditor: React.FC<{ ar: boolean; title: string; value: RegistrationFieldCondition[] | undefined; fieldIds: { id: string; label: string }[]; onChange: (v: RegistrationFieldCondition[] | undefined) => void }> = ({ ar, title, value, fieldIds, onChange }) => {
  const list = value || [];
  const set = (i: number, c: Partial<RegistrationFieldCondition>) => onChange(list.map((x, j) => j === i ? { ...x, ...c } : x));
  return <fieldset className="rounded-xl border border-[#e5e3dc] p-3">
    <legend className="px-1 text-[11px] font-black text-[#606662]">{title}</legend>
    {list.map((c, i) => <div key={i} className="mb-2 flex flex-wrap items-center gap-2 text-xs">
      <select aria-label={ar ? 'الحقل' : 'Field'} className="mizan-input !min-h-9 max-w-[12rem] text-xs" value={c.field} onChange={e => set(i, { field: e.target.value })}>
        <option value="age">{ar ? 'العمر (محسوب)' : 'Age (derived)'}</option>
        {fieldIds.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
      </select>
      <select aria-label={ar ? 'العملية' : 'Operator'} className="mizan-input !min-h-9 max-w-[9rem] text-xs" value={c.operator} onChange={e => set(i, { operator: e.target.value as RegistrationFieldCondition['operator'], value: parseValue(e.target.value as RegistrationFieldCondition['operator'], String(Array.isArray(c.value) ? c.value.join(',') : c.value ?? '')) })}>
        {OPS.map(o => <option key={o} value={o}>{OP_LABEL[o][ar ? 0 : 1]}</option>)}
      </select>
      {!['exists', 'not_exists'].includes(c.operator) && <input aria-label={ar ? 'القيمة' : 'Value'} className="mizan-input !min-h-9 max-w-[10rem] text-xs" value={Array.isArray(c.value) ? c.value.join(',') : String(c.value ?? '')} onChange={e => set(i, { value: parseValue(c.operator, e.target.value) })} />}
      <button type="button" className="text-[#A34D43] font-bold" onClick={() => { const next = list.filter((_, j) => j !== i); onChange(next.length ? next : undefined); }}>{ar ? 'حذف' : 'Remove'}</button>
    </div>)}
    <button type="button" className="text-xs font-bold text-[#214C40] underline" onClick={() => onChange([...list, { field: 'age', operator: 'lt', value: 12 }])}>{ar ? '+ شرط' : '+ Condition'}</button>
  </fieldset>;
};

export const RegistrationFormBuilder: React.FC<{ ar: boolean; registration: RegistrationPolicy; onChange: (mutate: (r: RegistrationPolicy) => void) => void }> = ({ ar, registration, onChange }) => {
  const [openId, setOpenId] = useState('');
  const customs = registration.fields.filter(f => f.custom);
  const refs = registration.fields.filter(f => f.type !== 'section').map(f => ({ id: f.id, label: ar ? f.labelArabic : f.labelEnglish }));
  const problems = validateFormSchema(registration.fields);
  const update = (id: string, patch: Partial<RegistrationFieldDefinition>) => onChange(r => { const f = r.fields.find(x => x.id === id); if (f) Object.assign(f, patch); });
  const move = (id: string, dir: -1 | 1) => onChange(r => { const i = r.fields.findIndex(x => x.id === id); const j = i + dir; if (i < 0 || j < 0 || j >= r.fields.length) return; [r.fields[i], r.fields[j]] = [r.fields[j], r.fields[i]]; });
  return <div className="space-y-3">
    <div className="flex items-center justify-between"><div className="text-xs font-black text-[#606662]">{ar ? 'حقول مخصّصة وشروط' : 'Custom fields & conditions'}</div>
      <button type="button" className="rounded-full border border-[#214C40]/25 px-3 py-1.5 text-xs font-bold text-[#214C40]" onClick={() => { const f = newField(customs.length); onChange(r => { r.fields.push(f); }); setOpenId(f.id); }}>{ar ? '+ إضافة حقل' : '+ Add field'}</button></div>
    {problems.length > 0 && <div role="alert" className="rounded-xl bg-[#F4E6E3] p-2 text-[11px] font-bold text-[#87483f]">{problems.join(' · ')}</div>}
    <ul className="space-y-2">{customs.map(f => <li key={f.id} className="rounded-xl border border-[#e5e3dc] bg-white">
      <div className="flex flex-wrap items-center gap-2 p-3">
        <button type="button" aria-expanded={openId === f.id} className="flex-1 text-start text-sm font-bold" onClick={() => setOpenId(openId === f.id ? '' : f.id)}>{ar ? f.labelArabic : f.labelEnglish} <span className="text-[11px] font-normal text-[#6a706c]">· {TYPE_LABEL[f.type][ar ? 0 : 1]}{f.required ? (ar ? ' · مطلوب' : ' · required') : ''}{f.visibleWhen?.length ? (ar ? ' · مشروط' : ' · conditional') : ''}</span></button>
        <button type="button" aria-label={ar ? 'أعلى' : 'Move up'} className="px-2 text-xs" onClick={() => move(f.id, -1)}>↑</button>
        <button type="button" aria-label={ar ? 'أسفل' : 'Move down'} className="px-2 text-xs" onClick={() => move(f.id, 1)}>↓</button>
        <button type="button" className="px-2 text-xs font-bold text-[#A34D43]" onClick={() => onChange(r => { r.fields = r.fields.filter(x => x.id !== f.id); })}>{ar ? 'حذف' : 'Delete'}</button>
      </div>
      {openId === f.id && <div className="grid gap-3 border-t border-[#e5e3dc] p-3 sm:grid-cols-2">
        <label className="text-xs font-bold">{ar ? 'التسمية بالعربية' : 'Arabic label'}<input className="mizan-input mt-1 text-sm" value={f.labelArabic} onChange={e => update(f.id, { labelArabic: e.target.value })} /></label>
        <label className="text-xs font-bold">{ar ? 'التسمية بالإنجليزية' : 'English label'}<input className="mizan-input mt-1 text-sm" dir="ltr" value={f.labelEnglish} onChange={e => update(f.id, { labelEnglish: e.target.value })} /></label>
        <label className="text-xs font-bold">{ar ? 'النوع' : 'Type'}<select className="mizan-input mt-1 text-sm" value={f.type} onChange={e => update(f.id, { type: e.target.value as RegistrationFieldDefinition['type'] })}>{TYPES.map(t => <option key={t} value={t}>{TYPE_LABEL[t][ar ? 0 : 1]}</option>)}</select></label>
        <label className="flex items-center gap-2 text-xs font-bold"><input type="checkbox" checked={f.required} onChange={e => update(f.id, { required: e.target.checked })} />{ar ? 'مطلوب دائمًا' : 'Always required'}</label>
        <label className="text-xs font-bold sm:col-span-2">{ar ? 'نص إرشادي' : 'Help text'}<input className="mizan-input mt-1 text-sm" value={(ar ? f.helpArabic : f.helpEnglish) || ''} onChange={e => update(f.id, ar ? { helpArabic: e.target.value } : { helpEnglish: e.target.value })} /></label>
        {(f.type === 'select' || f.type === 'multi_select') && <label className="text-xs font-bold sm:col-span-2">{ar ? 'الخيارات (سطر لكل خيار: القيمة|العربية|الإنجليزية)' : 'Options (one per line: value|Arabic|English)'}<textarea className="mizan-input mt-1 min-h-24 text-sm" dir="ltr" value={(f.options || []).map(o => `${o.value}|${o.labelArabic}|${o.labelEnglish}`).join('\n')} onChange={e => update(f.id, { options: e.target.value.split('\n').map(l => l.split('|')).filter(p => p[0]?.trim()).map(([value, a, en]) => ({ value: value.trim(), labelArabic: (a || value).trim(), labelEnglish: (en || value).trim() })) })} /></label>}
        {f.type === 'number' && <><label className="text-xs font-bold">{ar ? 'الحدّ الأدنى' : 'Min'}<input type="number" className="mizan-input mt-1 text-sm" value={f.min ?? ''} onChange={e => update(f.id, { min: e.target.value === '' ? undefined : Number(e.target.value) })} /></label><label className="text-xs font-bold">{ar ? 'الحدّ الأعلى' : 'Max'}<input type="number" className="mizan-input mt-1 text-sm" value={f.max ?? ''} onChange={e => update(f.id, { max: e.target.value === '' ? undefined : Number(e.target.value) })} /></label></>}
        {(f.type === 'text' || f.type === 'long_text') && <label className="text-xs font-bold">{ar ? 'أقصى طول' : 'Max length'}<input type="number" className="mizan-input mt-1 text-sm" value={f.maxLength ?? ''} onChange={e => update(f.id, { maxLength: e.target.value === '' ? undefined : Number(e.target.value) })} /></label>}
        <div className="sm:col-span-2"><ConditionEditor ar={ar} title={ar ? 'يظهر فقط إذا' : 'Show only if'} value={f.visibleWhen} fieldIds={refs.filter(r => r.id !== f.id)} onChange={v => update(f.id, { visibleWhen: v })} /></div>
        {f.type !== 'section' && <div className="sm:col-span-2"><ConditionEditor ar={ar} title={ar ? 'يصير مطلوبًا إذا' : 'Required if'} value={f.requiredWhen} fieldIds={refs.filter(r => r.id !== f.id)} onChange={v => update(f.id, { requiredWhen: v })} /></div>}
      </div>}
    </li>)}</ul>
    <div className="grid gap-3 rounded-xl border border-[#e5e3dc] p-3 sm:grid-cols-2">
      <label className="text-xs font-bold">{ar ? 'تعديل التسجيل بعد إرساله' : 'Editing after submission'}
        <select className="mizan-input mt-1 text-sm" value={registration.editPolicy || 'until_deadline'} onChange={e => onChange(r => { r.editPolicy = e.target.value as RegistrationPolicy['editPolicy']; })}>
          <option value="until_deadline">{ar ? 'مسموح حتى إغلاق التسجيل' : 'Allowed until registration closes'}</option>
          <option value="never">{ar ? 'غير مسموح' : 'Not allowed'}</option>
        </select></label>
      <label className="text-xs font-bold">{ar ? 'رسوم التسجيل (تفرضها الجهة — اتركها فارغة للمجاني)' : 'Registration fee set by the organization (empty = free)'}
        <div className="mt-1 flex gap-2"><input inputMode="decimal" className="mizan-input text-sm" dir="ltr" value={registration.fee ? String(registration.fee.amountMinor / 100) : ''} onChange={e => { const v = e.target.value.replace(/[^0-9.]/g, ''); onChange(r => { r.fee = v ? { amountMinor: Math.round(Number(v) * 100), currency: r.fee?.currency || 'KWD', refundable: r.fee?.refundable ?? false } : undefined; }); }} />
          <input aria-label={ar ? 'العملة' : 'Currency'} maxLength={3} className="mizan-input w-20 text-sm" dir="ltr" value={registration.fee?.currency || ''} onChange={e => onChange(r => { if (r.fee) r.fee.currency = e.target.value.toUpperCase(); })} /></div>
        <span className="mt-1 block font-normal text-[#6a706c]">{ar ? 'تُسجَّل حالة الدفع لكل متسابق (معلّق/مدفوع/مسترد/معفى). لا توجد بوابة دفع مربوطة، فالتحصيل يُسجَّل يدويًا.' : 'Payment status is tracked per participant. No payment gateway is connected; collection is recorded manually.'}</span></label>
    </div>
  </div>;
};
