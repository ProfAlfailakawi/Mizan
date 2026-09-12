import React, { useState } from 'react';
import { MonitorDot, Copy, Check } from 'lucide-react';
import { useAppStore } from '../../lib/store';
import { useBoardPublisherStatus } from '../../lib/use-board-publisher';
import { describePublisherRole } from '../../lib/board-lease';
import { Badge } from '../design-system/Badge';

/*
 * شاشات القاعة: من ينشرها، وكيف تُفتح.
 *
 * أمران كانا مفقودين معًا.
 *
 * الأول: **الروابط تُكتب باليد.** لا شيء في المنصّة يولّد `#board?comp=…&panel=C7` — فيُملى
 * على المشرف حرفًا حرفًا أمام عشر شاشات، وخطأٌ في كودٍ واحد يعطي شاشةً بيضاء لا تقول شيئًا.
 *
 * والثاني: **النشر بلا وجه.** كان معلّقًا بتبويبٍ واحد، فإغلاقه يوقف كل الشاشات، ولا أحد
 * في غرفة العمليات يعرف أن السبب عنده. صار التناوب تلقائيًّا بين أجهزة الإدارة الحاضرة،
 * ويبقى أن يُقال لمن يقف أمام الجهاز أين موقعه منه.
 */

export const HallScreenPublisher: React.FC = () => {
  const s = useAppStore();
  const ar = s.language === 'ar';
  const status = useBoardPublisherStatus();
  const [copied, setCopied] = useState('');

  if (status.role === 'INELIGIBLE') return null;

  const committees = s.committees.filter(c => c.competitionId === s.competition.id);
  const base = `${window.location.origin}${window.location.pathname}`;
  const hallLink = `${base}#board?comp=${encodeURIComponent(s.competition.id)}&view=hall`;
  const panelLink = (code: string) => `${base}#board?comp=${encodeURIComponent(s.competition.id)}&panel=${encodeURIComponent(code)}`;

  const copy = async (key: string, url: string) => {
    try { await navigator.clipboard.writeText(url); setCopied(key); setTimeout(() => setCopied(''), 2000) }
    catch { /* متصفّحٌ يمنع الحافظة: الرابط معروضٌ كاملًا فيُنسخ يدويًّا. */ }
  };

  const leading = status.role === 'LEADER';

  return <section className="mizan-surface p-5 sm:p-6">
    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        <span className="w-11 h-11 rounded-xl bg-[#E7EEE9] text-[#214C40] grid place-items-center"><MonitorDot className="w-5 h-5" /></span>
        <div>
          <div className="mizan-kicker">{ar ? 'شاشات القاعة' : 'HALL SCREENS'}</div>
          <h2 className="font-black mt-1">{ar ? 'افتح الشاشات، واعرف من ينشرها' : 'Open the screens, and see who publishes them'}</h2>
          <p className="text-[11px] text-[#646965] mt-2 max-w-2xl leading-5">
            {ar
              ? 'الشاشة تفتح رابطها ولا تسجّل دخولًا ولا تقرأ سجلّ المتسابقين: تعرض إسقاطًا بالأكواد وحدها ينشره جهاز إدارة. وأجهزة الإدارة تتناوب النشر تلقائيًّا، فإغلاق أحدها لا يُطفئ القاعة.'
              : 'A screen opens its link with no sign-in and no access to the roster: it shows a codes-only projection published by an admin device. Admin devices hand the publishing over automatically, so closing one does not darken the hall.'}
          </p>
        </div>
      </div>
      <Badge variant={leading ? 'emerald' : 'neutral'}>{leading ? (ar ? 'ينشر من هنا' : 'Publishing here') : (ar ? 'احتياط جاهز' : 'Standby')}</Badge>
    </div>

    {/* المحاسبة: من يقف أمام هذا الجهاز يستحقّ أن يعرف أن عشر شاشاتٍ معلّقة به. */}
    <div className={`mt-4 rounded-2xl px-4 py-3 text-[11px] font-bold leading-5 ${leading ? 'bg-[#E7EEE9] text-[#214C40]' : 'bg-[#f1efe9] text-[#4a4f4b]'}`}>
      {describePublisherRole(status, ar)}
    </div>

    <div className="mt-4 space-y-2">
      <LinkRow
        label={ar ? 'شاشة القاعة العامة — كل اللجان' : 'Public hall screen — every panel'}
        url={hallLink} ar={ar} copied={copied === 'hall'} onCopy={() => void copy('hall', hallLink)} />
      {committees.map(c => <LinkRow
        key={c.id}
        label={ar ? `شاشة اللجنة ${c.code}` : `Panel screen ${c.code}`}
        url={panelLink(c.code)} ar={ar} copied={copied === c.id} onCopy={() => void copy(c.id, panelLink(c.code))} />)}
      {!committees.length && <div className="rounded-xl bg-[#f1efe9] px-4 py-3 text-[11px] text-[#646965]">
        {ar ? 'لا لجان بعد — شاشة القاعة وحدها متاحة.' : 'No panels yet — only the hall screen is available.'}
      </div>}
    </div>

    {/* الشاشة تُقفل بالإيماءة والرمز من داخلها؛ يُقال هنا لئلّا يُبحث عنه في الممرّ. */}
    <p className="text-[10px] text-[#646965] mt-3 leading-5">
      {ar
        ? 'افتح الرابط على الشاشة ثم اقفلها من زرّ القفل داخلها، فلا يخرج منها مارّ. والشاشة تعلن عمر ما تعرضه من نفسها إن تأخّر.'
        : 'Open the link on the screen, then lock it from the lock button inside it so no passer-by can exit. Each screen reports the age of what it shows if it falls behind.'}
    </p>
  </section>;
};

const LinkRow: React.FC<{ label: string; url: string; ar: boolean; copied: boolean; onCopy: () => void }> = ({ label, url, ar, copied, onCopy }) => (
  <div className="rounded-2xl border border-[#dfddd6] px-4 py-3 flex flex-wrap items-center justify-between gap-3">
    <span className="min-w-0">
      <span className="block text-xs font-black">{label}</span>
      <span className="block mizan-proof-code text-[10px] text-[#646965] mt-0.5 truncate" dir="ltr">{url}</span>
    </span>
    <button
      type="button"
      onClick={onCopy}
      className="shrink-0 inline-flex items-center gap-1.5 rounded-xl bg-[#f1efe9] hover:bg-[#e7e4dc] px-3 py-2 text-[11px] font-black text-[#171b18]"
    >
      {copied ? <Check className="w-3.5 h-3.5" aria-hidden /> : <Copy className="w-3.5 h-3.5" aria-hidden />}
      {copied ? (ar ? 'نُسخ' : 'Copied') : (ar ? 'انسخ الرابط' : 'Copy link')}
    </button>
  </div>
);
