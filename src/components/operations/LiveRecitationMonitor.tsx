import React, { useEffect, useState } from 'react';
import { Mic2, MicOff, RadioTower } from 'lucide-react';
import { liveRecitationRows, type LiveRecitationRow } from '../../lib/live-recitation';
import type { Committee, Participant } from '../../types';

/*
 * «التلاوة الجارية» في غرفة العمليات.
 *
 * تقرأ الحالةَ نفسَها التي يقرؤها بقيّةُ المركز — لا مصدرَ ثانيًا يفترق عنها — وتعرض
 * ما هو مقيس: أيُّ لجنةٍ تختبر الآن، وبأيّ كود، ومنذ متى، وهل صوتُها سليم.
 *
 * ولا درجةَ فيها ولا «وفاق»: الدرجةُ سرٌّ حتى تُعلن، وعرضُها هنا يجعل من يمرّ بالغرفة
 * يعرف نتيجةَ من لم تُعلن نتيجتُه. والزمنُ يمشي هنا من ساعة المتصفّح على لحظةِ دخولٍ
 * مسجَّلة — لا عدّادَ مستقلًّا يبدأ مع فتح الشاشة فيكذب على من فتحها متأخّرًا.
 */

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

export const LiveRecitationMonitor: React.FC<{
  ar: boolean;
  committees: readonly Committee[];
  participants: readonly Participant[];
  /*
   * ساعةٌ تُحقن — للقياس وحده.
   *
   * اللوحةُ تقرأ `Date.now()` كلَّ ثانية، فتصييرُها يعطي رقمًا مختلفًا في كلّ تشغيل ولا
   * يُقاس. فتقبل ساعةً صريحةً حين تُعطى، وتبقى حيّةً في الإنتاج حين لا تُعطى.
   */
  now?: number;
}> = ({ ar, committees, participants, now: fixedNow }) => {
  const [ticking, setTicking] = useState(() => Date.now());
  useEffect(() => {
    if (fixedNow !== undefined) return;
    const id = window.setInterval(() => setTicking(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [fixedNow]);
  const rows = liveRecitationRows(committees, participants, fixedNow ?? ticking);

  return (
    <section className="mizan-surface p-5" aria-label={ar ? 'التلاوة الجارية' : 'Live recitation'}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-[#E7EEE9] text-[#214C40]"><RadioTower className="h-4 w-4" /></span>
          <div>
            <div className="text-sm font-black">{ar ? 'التلاوة الجارية' : 'Live recitation'}</div>
            <div className="text-[10px] font-bold text-[#656b66]">{ar ? 'غرفة العمليات وحدها — ولا يُعرض هنا رقمٌ لم يُعلن' : 'Operations only — nothing unannounced is shown'}</div>
          </div>
        </div>
        <span className="text-[10px] font-black tabular-nums text-[#5f6663]" data-live-count={rows.length}>
          {ar ? `${rows.length} لجنةً تختبر الآن` : `${rows.length} panels testing`}
        </span>
      </div>

      {rows.length === 0
        ? <p className="mt-4 rounded-2xl bg-[#f4f2ec] p-4 text-[11px] font-bold leading-6 text-[#5b6460]">
            {ar ? 'لا لجنةَ تختبر الآن. تظهر هنا كلُّ جلسةٍ جاريةٍ لحظةَ بدئها.' : 'No panel is testing. Every running session appears here as it starts.'}
          </p>
        : <ul className="mt-4 space-y-2">
            {rows.map(row => <LiveRow key={row.committeeId} row={row} ar={ar} />)}
          </ul>}
    </section>
  );
};

const LiveRow: React.FC<{ row: LiveRecitationRow; ar: boolean }> = ({ row, ar }) => (
  <li data-committee={row.committeeId} className="flex flex-wrap items-center gap-3 rounded-2xl border border-[#e4e2da] bg-white px-3.5 py-3">
    <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden="true">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#2F6555] opacity-70" />
      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#2F6555]" />
    </span>
    <span className="min-w-0 flex-1 truncate text-xs font-black text-[#39423d]">
      {(ar ? row.committeeNameArabic : undefined) || row.committeeName}
    </span>
    <span dir="ltr" className="shrink-0 rounded-lg bg-[#f1efe9] px-2.5 py-1 font-mono text-[11px] font-black text-[#4b534e]">{row.participantCode}</span>
    <span dir="ltr" className="shrink-0 text-[11px] font-black tabular-nums text-[#5f6663]" data-elapsed={row.elapsedSeconds ?? ''}>
      {row.elapsedSeconds === undefined ? '—' : clock(row.elapsedSeconds)}
    </span>
    <span
      className={`inline-flex shrink-0 items-center gap-1 text-[10px] font-black ${row.audioOk ? 'text-[#2F6555]' : 'text-[#8a5a2b]'}`}
      title={row.audioOk ? (ar ? 'مدخل الصوت مثبَت' : 'Audio input verified') : (ar ? 'لم تُثبت سلامة مدخل الصوت لهذه اللجنة' : 'Audio input not verified for this panel')}
    >
      {row.audioOk ? <Mic2 className="h-3.5 w-3.5" /> : <MicOff className="h-3.5 w-3.5" />}
      {row.audioOk ? (ar ? 'الصوت' : 'audio') : (ar ? 'صوتٌ غير مثبَت' : 'unverified')}
    </span>
  </li>
);
