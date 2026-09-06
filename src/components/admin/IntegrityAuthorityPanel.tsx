import React, {useCallback, useEffect, useState} from 'react';
import {CheckCircle2, Clock3, KeyRound, Lock, ShieldAlert} from 'lucide-react';
import {Badge} from '../design-system/Badge';
import {Button} from '../design-system/Button';
import {Ratio} from '../design-system/Ratio';
import {EmptyState} from '../design-system/EmptyState';
import {
  approveQuorum, authorityFailureText, commitFairDraw, executeQuorum,
  listFairDrawCommitments, listQuorum, revealFairDraw, succeeded,
  type FairDrawCommitmentView, type QuorumView,
} from '../../lib/integrity-authority-client';

/*
 * سلطة النزاهة كما يراها المسؤول.
 *
 * ما يُعرض هنا يأتي من الخادم وحده. وهذا هو الفرق كله: اللوحة القديمة كانت تعرض حالةً يملكها
 * الجهاز نفسه، فكانت تُطمئن صاحبها على ما كتبه هو. أما هذه فتعرض ما لا يستطيع هذا الجهاز
 * تغييره.
 *
 * ولذلك تعذّر الوصول إلى الخادم لا يُترجم هنا لوحةً فارغة هادئة، بل قولًا صريحًا بأن السلطة
 * غائبة: فراغٌ صامت في شاشة نزاهة يُقرأ «كل شيء سليم».
 */

const mmss = (ms: number) => {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

/*
 * أسماء الإجراءات تصل من الخادم بمعرّفاتها. عرضها كما هي يضع `results_seal` في شاشة عربية
 * أمام مسؤول لا مطوّر؛ فتُترجم المعروفة منها، ويبقى غيرها كما هو بدل أن يُخفى.
 */
const ACTION_AR: Record<string, string> = {
  results_seal: 'ختم النتائج', ceremony_reveal: 'كشف الحفل',
  question_release: 'إطلاق الأسئلة', appeal_decision: 'قرار الطعن', result_publication: 'نشر النتائج',
};
/** البصمة الكاملة لا تُقرأ ولا تسع السطر؛ يُعرض طرفاها ويبقى الوسط مطويًّا بعلامة صريحة. */
const shortHash = (v: string) => {
  const hex = v.replace(/^SHA256:/, '');
  return hex.length > 26 ? `SHA256:${hex.slice(0, 12)}…${hex.slice(-8)}` : v;
};

const statusTone = (status: QuorumView['status']): 'emerald' | 'amber' | 'rose' | 'neutral' =>
  status === 'executed' ? 'emerald' : status === 'ready' ? 'amber' : status === 'expired' || status === 'cancelled' ? 'rose' : 'neutral';

export const IntegrityAuthorityPanel: React.FC<{competitionId: string; currentUserId: string; ar: boolean}> = ({competitionId, currentUserId, ar}) => {
  const [actions, setActions] = useState<QuorumView[]>([]);
  const [commitments, setCommitments] = useState<FairDrawCommitmentView[]>([]);
  const [unavailable, setUnavailable] = useState('');
  const [busy, setBusy] = useState('');
  const [revealed, setRevealed] = useState<Record<string, {seed: string; separationMs: number}>>({});

  const load = useCallback(async () => {
    const [q, c] = await Promise.all([listQuorum(competitionId), listFairDrawCommitments(competitionId)]);
    if (!succeeded(q)) { setUnavailable(authorityFailureText(q.failure, ar)); setActions([]); setCommitments([]); return }
    setUnavailable('');
    setActions(q.value.actions || []);
    setCommitments(succeeded(c) ? c.value.commitments || [] : []);
  }, [competitionId, ar]);

  useEffect(() => { void load() }, [load]);

  const act = async (key: string, run: () => Promise<{ok: boolean}>) => {
    setBusy(key);
    try { await run(); await load() } finally { setBusy('') }
  };

  return (
    <section className="mizan-surface overflow-hidden">
      <header className="flex items-start gap-3 border-b border-[#e5e1d7] bg-[#f7f4ec] p-5 sm:p-6">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[#E7EEE9] text-[#214C40]"><KeyRound className="h-5 w-5" /></span>
        <div className="min-w-0">
          <div className="mizan-kicker">{ar ? 'سلطة النزاهة' : 'INTEGRITY AUTHORITY'}</div>
          <h2 className="mt-1 text-lg font-black">{ar ? 'محفوظة على الخادم، لا في هذا الجهاز' : 'Held on the server, not on this device'}</h2>
          <p className="mt-2 max-w-2xl text-[11px] leading-5 text-[#636864]">
            {ar
              ? 'الموافقات وبذور القرعة تُحفظ وتُفرَض على الخادم بهوية مُصدَّقة. ما يظهر هنا لا يستطيع هذا المتصفح تغييره.'
              : 'Approvals and draw seeds are held and enforced on the server under an authenticated identity. Nothing shown here can be changed from this browser.'}
          </p>
        </div>
      </header>

      {unavailable ? (
        <div className="flex items-start gap-3 bg-[#F8EFED] px-5 py-4 sm:px-6">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-[#9a4b42]" />
          <p className="text-[11px] font-bold leading-5 text-[#9a4b42]">{unavailable}</p>
        </div>
      ) : (
        <div className="space-y-6 p-5 sm:p-6">
          <div>
            <div className="text-[9px] font-black tracking-[.14em] text-[#6b706c]">{ar ? 'إجراءات تتطلّب نصابًا' : 'ACTIONS REQUIRING A QUORUM'}</div>
            {!actions.length ? (
              <div className="mt-2"><EmptyState icon={Lock} title={ar ? 'لا إجراء مفتوح' : 'No open action'} body={ar ? 'يظهر هنا كل إجراء يحتاج سلطتين مستقلتين.' : 'Every action needing two independent authorities appears here.'} /></div>
            ) : (
              <ul className="mt-2 space-y-2">
                {actions.map((q) => {
                  const mine = q.approvals.some((a) => a.actorId === currentUserId);
                  const needed = q.minimumApprovals || q.requiredRoleGroups.length;
                  return (
                    <li key={q.id} className="rounded-2xl border border-[#e5e2da] bg-[#fffefb] p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-xs font-black">{ar ? (ACTION_AR[q.action] || q.action) : q.action}</div>
                          <div className="mt-1 text-[10px] text-[#646965]">
                            {ar ? 'اعتمادات مستقلة ' : 'Independent approvals '}
                            <Ratio value={q.approvals.length} of={needed} label={ar ? `${q.approvals.length} من ${needed} اعتمادات` : `${q.approvals.length} of ${needed} approvals`} />
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {/* الطالب لا يُنفِّذ طلبه: الفصل مفروض على الخادم، ويُقال هنا حتى لا يُقرأ الزر عطلًا. */}
                          {q.status === 'ready' && q.requestedBy !== currentUserId && (
                            <Button size="sm" variant="outline" loading={busy === q.id} onClick={() => void act(q.id, () => executeQuorum(q.id))}>{ar ? 'تنفيذ' : 'Execute'}</Button>
                          )}
                          {q.status === 'pending' && !mine && (
                            <Button size="sm" loading={busy === q.id} onClick={() => void act(q.id, () => approveQuorum(q.id))}>{ar ? 'اعتماد' : 'Approve'}</Button>
                          )}
                          {mine && q.status !== 'executed' && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-black text-[#214C40]"><CheckCircle2 className="h-3.5 w-3.5" />{ar ? 'اعتمدتُه' : 'You approved'}</span>
                          )}
                          <Badge variant={statusTone(q.status)}>{q.status}</Badge>
                        </div>
                      </div>
                      {q.status === 'ready' && q.requestedBy === currentUserId && (
                        <p className="mt-3 text-[10px] leading-5 text-[#8a6738]">{ar ? 'طلبتَ هذا الإجراء، فلا تُنفّذه بنفسك — يُنفّذه صاحب سلطة أخرى.' : 'You requested this action, so another authority must execute it.'}</p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-[9px] font-black tracking-[.14em] text-[#6b706c]">{ar ? 'التزامات القرعة' : 'DRAW COMMITMENTS'}</div>
              <Button size="sm" variant="ghost" loading={busy === 'commit'}
                onClick={() => void act('commit', () => commitFairDraw({competitionId, participantId: 'pending-assignment', constraintHash: 'pending'}))}>
                {ar ? 'التزام جديد' : 'New commitment'}
              </Button>
            </div>
            <p className="mt-2 text-[10px] leading-5 text-[#646965]">
              {ar
                ? 'البذرة تُولَّد عند الخادم ولا تخرج منه. يُنشر التزامها الآن، ويُكشف عنها لاحقًا — والمدّة بين اللحظتين هي ما يُثبت أن الالتزام سبق معرفة النتيجة.'
                : 'The seed is generated on the server and never leaves it. Its commitment is published now and revealed later — the gap between the two is what shows the commitment preceded knowing the outcome.'}
            </p>
            {!commitments.length ? (
              <div className="mt-2"><EmptyState icon={Clock3} title={ar ? 'لا التزام بعد' : 'No commitment yet'} body={ar ? 'كل قرعة تبدأ بالتزام منشور قبل سحبها.' : 'Every draw begins with a commitment published before it is drawn.'} /></div>
            ) : (
              <ul className="mt-3 divide-y divide-[#eceae3]">
                {commitments.map((c) => {
                  const shown = revealed[c.id];
                  return (
                    <li key={c.id} className="py-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="mizan-proof-code" dir="ltr" title={c.seedCommitmentHash}>{shortHash(c.seedCommitmentHash)}</div>
                          <div className="mt-1 text-[10px] text-[#646965]" dir="ltr">{new Date(c.committedAt).toLocaleString()}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          {c.status === 'COMMITTED'
                            ? <Button size="sm" variant="outline" icon={<KeyRound className="h-3.5 w-3.5" />} loading={busy === c.id}
                                onClick={() => void act(c.id, async () => {
                                  const out = await revealFairDraw(c.id, c.constraintHash);
                                  if (succeeded(out)) setRevealed((r) => ({...r, [c.id]: {seed: out.value.seed, separationMs: out.value.separationMs}}));
                                  return out;
                                })}>{ar ? 'كشف' : 'Reveal'}</Button>
                            : <Badge variant="emerald">{ar ? 'مكشوفة' : 'revealed'}</Badge>}
                        </div>
                      </div>
                      {shown && (
                        <div className="mt-2 rounded-2xl bg-[#f5f3ed] px-4 py-3">
                          <div className="mizan-proof-code break-all" dir="ltr">{shown.seed}</div>
                          <div className="mt-1 text-[9px] text-[#6b706c]">{ar ? 'البذرة كاملة — تُنسخ للتحقّق المستقل.' : 'Full seed — copy it for independent verification.'}</div>
                          <div className="mt-1 text-[10px] font-black text-[#214C40]">
                            {ar ? 'فاصل الالتزام عن الكشف: ' : 'Commit-to-reveal gap: '}<span dir="ltr">{mmss(shown.separationMs)}</span>
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
};
