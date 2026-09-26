import React, { useState } from 'react';
import { CheckCircle2, Clock3, Globe2, LockKeyhole, ShieldCheck, UserRound } from 'lucide-react';
import { IS_DEMO_SESSION, setDemoRole, useAppStore } from '../../lib/store';
import { getCompetitionPolicy } from '../../lib/competition-config';
import { sealFailureLabel, uiToken } from '../../lib/ui-language';
import { Modal } from '../design-system/Modal';
import { Button } from '../design-system/Button';
import { SealMark } from './ResultsDocuments';

/*
 * ختمُ النتائج ونشرُها — كلٌّ في نافذةٍ تقول ما سيقع قبل أن يقع.
 *
 * كان الزرّان يعملان في صمت: «اعتماد الختم» يعود برفضٍ لا يُرى إلا سطرًا صغيرًا، و«نشر»
 * معطّلٌ حتى تُختم كل نتيجة فلا يقول لماذا، وإن ضُغط ورُفض (فصلُ المهامّ: من ختم لا ينشر)
 * لم يُقل شيء. والإجراءان لا رجعة فيهما، فأقلّ ما يستحقّانه أن يُعرض أثرهما وشرطهما
 * ومن يملكهما قبل الضغط، وأن يُقال بعده ما وقع.
 */

type Store = ReturnType<typeof useAppStore>;

/** هل يشترط الختمُ موافقتين الآن؟ الشرط نفسه الذي يطبّقه المخزن — لا ما تقوله السياسة وحدها. */
export const dualSealActive = (store: Store) =>
  getCompetitionPolicy(store.competition).results.requireDualApprovalToSeal && (store.competition.ruleSet?.judgesCountPerPanel ?? 0) >= 2;

const Step: React.FC<{ done: boolean; title: string; detail: string }> = ({ done, title, detail }) => (
  <li className="flex items-start gap-3 rounded-2xl border border-[#e4e2db] bg-white px-4 py-3">
    {done ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#2F6555]" /> : <Clock3 className="mt-0.5 h-5 w-5 shrink-0 text-[#a39f94]" />}
    <span className="min-w-0"><span className="block text-xs font-black">{title}</span><span className="mt-0.5 block text-xs leading-5 text-[#646965]">{detail}</span></span>
  </li>
);

export const SealDialog: React.FC<{ open: boolean; store: Store; ar: boolean; onClose: () => void }> = ({ open, store, ar, onClose }) => {
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<{ ok: boolean; text: string } | null>(null);
  if (!open) return null;
  const competitionId = store.competition.id;
  const results = store.results.filter(r => r.competitionId === competitionId);
  const sealed = results.filter(r => r.status === 'sealed' || r.status === 'published').length;
  const dual = dualSealActive(store);
  const approvers = store.sealApprovals.filter((a, i, all) => all.findIndex(b => b.actorId === a.actorId) === i);
  const hasHead = approvers.some(a => a.actorRole === 'head_judge');
  const hasAdmin = approvers.some(a => a.actorRole === 'comp_admin' || a.actorRole === 'org_admin');
  const pendingAppeals = store.appeals.filter(a => a.competitionId === competitionId && (a.status === 'submitted' || a.status === 'under_review')).length;
  const role = store.currentUser.role;
  const canSeal = ['head_judge', 'comp_admin', 'org_admin'].includes(role);

  const run = async () => {
    setBusy(true); setOutcome(null);
    try {
      const out = await store.sealResults() as { sealed?: boolean; reason?: string; message?: string; approvals?: number; checksum?: string };
      if (out?.sealed) setOutcome({ ok: true, text: ar ? `خُتمت ${results.length} نتيجة. البصمة ${String(out.checksum || '').slice(0, 16)}…` : `${results.length} results sealed. Digest ${String(out.checksum || '').slice(0, 16)}…` });
      else if (out?.reason === 'independent_quorum_required') setOutcome({ ok: true, text: ar ? `سُجّل اعتمادك (${out.approvals || 1}/2). يكتمل الختم حين يعتمد الطرف الثاني من دورٍ آخر.` : `Your approval is recorded (${out.approvals || 1}/2). Sealing completes when the second role approves.` });
      else setOutcome({ ok: false, text: sealFailureLabel(out, ar) });
    } catch { setOutcome({ ok: false, text: ar ? 'تعذّر الختم. أعد المحاولة.' : 'Sealing failed. Try again.' }); }
    finally { setBusy(false); }
  };

  return <Modal isOpen onClose={onClose} title={dual ? (ar ? 'اعتماد الختم' : 'Seal approval') : (ar ? 'ختم النتائج' : 'Seal results')} subtitle={ar ? 'الختم يثبّت الدرجة والمركز ولا رجعة فيه. بعده تُصدر الشهادات ويمكن النشر.' : 'Sealing freezes score and rank irreversibly; certificates and publication follow.'} maxWidth="xl">
    <div className="flex items-center gap-4 rounded-2xl bg-[#F2F7F4] p-4">
      <SealMark size={64} />
      <div className="min-w-0 flex-1">
        <div className="text-2xl font-black tabular-nums">{sealed}<span className="text-sm text-[#646965]"> / {results.length}</span></div>
        <div className="text-[13px] text-[#646965]">{ar ? 'نتيجة مختومة الآن' : 'results currently sealed'}</div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-white"><span className="block h-full rounded-full bg-gradient-to-l from-[#214C40] to-[#a8834a] transition-all" style={{ width: `${results.length ? Math.round((sealed / results.length) * 100) : 0}%` }} /></div>
      </div>
      {dual && <div className="text-center"><div className="text-3xl font-black tabular-nums text-[#214C40]">{approvers.length}/2</div><div className="text-xs text-[#646965]">{ar ? 'اعتماد' : 'approvals'}</div></div>}
    </div>
    <ol className="mt-4 space-y-2">
      {dual ? <>
        <Step done={hasHead} title={ar ? 'اعتماد رئيس لجنة التحكيم' : 'Head judge approval'} detail={hasHead ? (ar ? `اعتمد ${approvers.find(a => a.actorRole === 'head_judge')?.actorName || ''}` : 'Approved') : (ar ? 'يعتمد من صندوق رئيس اللجنة.' : 'From the head judge inbox.')} />
        <Step done={hasAdmin} title={ar ? 'اعتماد إدارة المسابقة' : 'Competition admin approval'} detail={hasAdmin ? (ar ? 'تمّ.' : 'Done.') : (ar ? 'يعتمد مدير المسابقة أو الجهة من هنا.' : 'Competition or organization admin, from here.')} />
      </> : <Step done={sealed === results.length && results.length > 0} title={ar ? 'ختمٌ بيد من يملكه' : 'Sealed by an authorized role'} detail={ar ? 'لجان هذه المسابقة من محكّمٍ واحد، فيقع الختم باعتمادٍ واحد. ومن يختم لا ينشر: النشر لشخصٍ آخر.' : 'Single-judge panels: one approval seals. Whoever seals cannot publish.'} />}
      <Step done={pendingAppeals === 0} title={ar ? 'لا اعتراضات معلّقة' : 'No pending appeals'} detail={pendingAppeals ? (ar ? `${pendingAppeals} اعتراض ينتظر الحسم — يمكن الختم، لكن الإغلاق ينتظرها.` : `${pendingAppeals} appeals pending.`) : (ar ? 'حُسمت الاعتراضات كلها.' : 'All appeals resolved.')} />
    </ol>
    {outcome && <div role="status" className={`mt-4 rounded-xl p-3 text-xs font-bold leading-5 ${outcome.ok ? 'bg-[#E7EEE9] text-[#214C40]' : 'bg-[#F5EDE2] text-[#7a5a2f]'}`}>{outcome.text}</div>}
    <div className="mt-5 flex flex-wrap items-center gap-2">
      <Button disabled={busy || !canSeal || !results.length} onClick={() => void run()} icon={<LockKeyhole className="h-4 w-4" />}>{busy ? (ar ? 'جارٍ الختم…' : 'Sealing…') : dual ? (ar ? 'سجّل اعتمادي' : 'Record my approval') : (ar ? 'اختم النتائج الآن' : 'Seal now')}</Button>
      {IS_DEMO_SESSION && role !== 'head_judge' && <Button variant="outline" onClick={() => setDemoRole('head_judge')} icon={<UserRound className="h-4 w-4" />}>{ar ? 'اعتمد بصفة رئيس اللجنة' : 'Approve as head judge'}</Button>}
      <Button variant="ghost" onClick={onClose}>{ar ? 'إغلاق' : 'Close'}</Button>
    </div>
    {IS_DEMO_SESSION && <p className="mt-3 text-xs leading-5 text-[#696f6b]">{ar ? 'في بيئة العرض: إن ختمتَ بنفسك فالنشر يحتاج شخصًا آخر (مدير الجهة). وإن ختم رئيسُ اللجنة من صندوقه، نشرتَ أنت من هنا.' : 'Demo: if you seal yourself, another person (organization admin) must publish. If the head judge seals, you can publish from here.'}</p>}
  </Modal>;
};

export const PublishDialog: React.FC<{ open: boolean; store: Store; ar: boolean; onClose: () => void; onSeal: () => void }> = ({ open, store, ar, onClose, onSeal }) => {
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<{ ok: boolean; text: string } | null>(null);
  if (!open) return null;
  const competitionId = store.competition.id;
  const results = store.results.filter(r => r.competitionId === competitionId);
  const unsealed = results.filter(r => r.status !== 'sealed' && r.status !== 'published');
  const published = results.length > 0 && results.every(r => r.status === 'published');
  const sealedBySelf = results.some(r => r.sealMetadata?.sealedById === store.currentUser.id);
  const policy = getCompetitionPolicy(store.competition);
  const byCategory = store.competition.categories.map(c => ({ c, n: results.filter(r => r.categoryId === c.id).length })).filter(x => x.n);

  const run = async () => {
    setBusy(true); setOutcome(null);
    try {
      const ok = await store.publishResults();
      setOutcome(ok ? { ok: true, text: ar ? 'نُشرت النتائج. أُشعر المتسابقون، وصارت الشهادات قابلة للتحقق العام.' : 'Results published. Participants were notified; certificates are publicly verifiable.' }
        : { ok: false, text: sealedBySelf ? (ar ? 'فصلُ المهامّ: أنت من ختم هذه النتائج، فلا تنشرها أنت. ينشرها مدير آخر.' : 'Separation of duties: you sealed these results, so another admin must publish.') : (ar ? 'رُفض النشر. تحقّق من الصلاحية والاتصال ثم أعد المحاولة.' : 'Publication was refused. Check your authority and connection.') });
    } catch { setOutcome({ ok: false, text: ar ? 'تعذّر النشر.' : 'Publication failed.' }); }
    finally { setBusy(false); }
  };

  return <Modal isOpen onClose={onClose} title={ar ? 'نشر النتائج' : 'Publish results'} subtitle={ar ? `الإظهار: ${uiToken(policy.results.visibility, true)}` : `Visibility: ${uiToken(policy.results.visibility, false)}`} maxWidth="xl">
    {published || outcome?.ok
      ? <div className="rounded-3xl bg-gradient-to-b from-[#E7EEE9] to-white p-6 text-center">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[#214C40] text-white"><Globe2 className="h-8 w-8" /></div>
        <div className="mt-4 text-xl font-black">{ar ? 'النتائج منشورة' : 'Results are published'}</div>
        <p className="mt-2 text-xs leading-6 text-[#646965]">{outcome?.text || (ar ? `${results.length} نتيجة منشورة في ${byCategory.length} فئات.` : `${results.length} results across ${byCategory.length} categories.`)}</p>
      </div>
      : <>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-2xl bg-[#f1efe9] p-3"><div className="text-xl font-black">{results.length}</div><div className="text-xs text-[#646965]">{ar ? 'نتيجة' : 'results'}</div></div>
          <div className="rounded-2xl bg-[#f1efe9] p-3"><div className="text-xl font-black">{results.length - unsealed.length}</div><div className="text-xs text-[#646965]">{ar ? 'مختومة' : 'sealed'}</div></div>
          <div className="rounded-2xl bg-[#f1efe9] p-3"><div className="text-xl font-black">{byCategory.length}</div><div className="text-xs text-[#646965]">{ar ? 'فئة' : 'categories'}</div></div>
        </div>
        <ul className="mt-3 divide-y divide-[#ece9e1] rounded-2xl border border-[#e4e2db] bg-white px-4">
          {byCategory.map(({ c, n }) => <li key={c.id} className="flex items-center justify-between py-2 text-xs"><span className="font-bold">{ar ? c.nameArabic : c.name}</span><span className="tabular-nums text-[#646965]">{n}</span></li>)}
        </ul>
        {unsealed.length > 0 && <div className="mt-3 rounded-xl bg-[#F5EDE2] p-3 text-xs font-bold leading-5 text-[#7a5a2f]">{ar ? `${unsealed.length} نتيجة لم تُختم بعد. لا يُنشر إلا ما خُتم كله.` : `${unsealed.length} results are not sealed yet.`}<button type="button" onClick={onSeal} className="ms-2 underline">{ar ? 'اذهب إلى الختم' : 'Go to sealing'}</button></div>}
        {!unsealed.length && sealedBySelf && <div className="mt-3 rounded-xl bg-[#F5EDE2] p-3 text-xs font-bold leading-5 text-[#7a5a2f]">{ar ? 'أنت من ختم هذه النتائج، ومن يختم لا ينشر. ينشرها مدير آخر.' : 'You sealed these results; another admin must publish.'}</div>}
        {outcome && !outcome.ok && <div role="status" className="mt-3 rounded-xl bg-[#F4E6E3] p-3 text-xs font-bold leading-5 text-[#8a473f]">{outcome.text}</div>}
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <Button disabled={busy || unsealed.length > 0 || !results.length} onClick={() => void run()} icon={<ShieldCheck className="h-4 w-4" />}>{busy ? (ar ? 'جارٍ النشر…' : 'Publishing…') : (ar ? 'انشر الآن' : 'Publish now')}</Button>
          {IS_DEMO_SESSION && sealedBySelf && !unsealed.length && <Button variant="outline" onClick={() => { try { window.location.hash = '#manage-competition'; } catch { /* */ } setDemoRole('org_admin'); }} icon={<UserRound className="h-4 w-4" />}>{ar ? 'انشر بصفة مدير الجهة' : 'Publish as organization admin'}</Button>}
          <Button variant="ghost" onClick={onClose}>{ar ? 'إغلاق' : 'Close'}</Button>
        </div>
      </>}
  </Modal>;
};
