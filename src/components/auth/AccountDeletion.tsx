import React, { useState } from 'react';
import { EmailAuthProvider, deleteUser, reauthenticateWithCredential } from 'firebase/auth';
import { Trash2, UserRound } from 'lucide-react';
import { auth } from '../../lib/firebase';
import { useAppStore, IS_DEMO_SESSION } from '../../lib/store';
import { durableSignOut } from '../../lib/cloud-session-durability';
import { accountDeletionErrorText, deleteOwnAccount, type AccountDeletionDeps } from '../../lib/account-deletion';
import { Modal } from '../design-system/Modal';

/*
 * «حسابي» ← «حذف حسابي»: نقرتان من أي شاشة بعد الدخول (App Store 5.1.1(v)).
 * الزر في الترويسة بجانب زر الخروج، وفي شريط شاشة البث كذلك. يعمل كما هو في المتصفح وفي تطبيق iOS.
 */

const firebaseDeps = (): AccountDeletionDeps => ({
  async reauthWithPassword(password) {
    const user = auth.currentUser; if (!user) throw new Error('NO_USER');
    if (!user.email || !user.providerData.some(p => p.providerId === 'password')) throw new Error('NO_PASSWORD_PROVIDER');
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
  },
  async freshToken() { const user = auth.currentUser; if (!user) throw new Error('NO_USER'); return user.getIdToken(true); },
  async requestServerDeletion(token) {
    const r = await fetch('/api/identity/me/delete', { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ confirm: 'DELETE_MY_ACCOUNT' }), cache: 'no-store' });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  },
  async deleteAuthUserOnClient() { const user = auth.currentUser; if (!user) return; await deleteUser(user); },
  async signOut() { await durableSignOut(); },
});

export const DELETION_SCOPE_AR = [
  'يُحذف: حساب الدخول نفسه، وبريدك واسمك من سجل الهويات، وأسماء أجهزتك وجلساتك، وطلبات تغيير كلمة المرور، ودعواتك، وإشعاراتك الشخصية.',
  'يُسحب فورًا: كل صلاحياتك في الجهات والمسابقات، ولن تستطيع الدخول بهذا الحساب بعد الآن.',
  'يُحفظ مُجهَّلًا: سجل التدقيق وسجلات المسابقات (التحكيم والنتائج والاعتراضات والشهادات) تبقى لأنها أدلة نزاهة تملكها الجهة المنظِّمة، لكنها تبقى بمعرّف مبهم لا يدل على اسمك ولا بريدك.',
  'لا يمكن التراجع عن الحذف. وإن احتجت الدخول لاحقًا فاطلب دعوة جديدة من جهتك.',
];
const DELETION_SCOPE_EN = [
  'Deleted: your sign-in account, your email and name in the identity registry, device names and sessions, password-reset requests, invitations and personal notifications.',
  'Revoked immediately: all your access to organisations and competitions; you will no longer be able to sign in with this account.',
  'Kept anonymised: the audit trail and competition records (judging, results, appeals, certificates) are integrity evidence owned by the organiser; they remain under an opaque identifier that no longer shows your name or email.',
  'This cannot be undone. If you need access later, ask your organisation for a new invitation.',
];

type Step = 'MENU' | 'CONFIRM' | 'PASSWORD' | 'WORKING' | 'DONE';

export const AccountButton: React.FC<{ className?: string; label?: boolean }> = ({ className, label }) => {
  const { language } = useAppStore(); const ar = language === 'ar';
  const [open, setOpen] = useState(false);
  const title = ar ? 'حسابي' : 'My account';
  return <>
    <button type="button" onClick={() => setOpen(true)} title={title} aria-label={title} data-testid="account-menu-button" className={className || 'w-11 h-11 grid place-items-center rounded-xl hover:bg-[#efede7] text-[color:var(--muted)] shrink-0'}><UserRound className="w-4 h-4" />{label && <span className="ms-1 text-[11px] font-black">{title}</span>}</button>
    {open && <AccountPanel onClose={() => setOpen(false)} />}
  </>;
};

export const AccountPanel: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { language, currentUser } = useAppStore(); const ar = language === 'ar';
  const [step, setStep] = useState<Step>('MENU'); const [password, setPassword] = useState(''); const [error, setError] = useState('');
  const email = auth.currentUser?.email || '';
  const usesPassword = Boolean(auth.currentUser?.providerData.some(p => p.providerId === 'password'));

  const run = async (withPassword?: string) => {
    setError(''); setStep('WORKING');
    const outcome = await deleteOwnAccount(firebaseDeps(), withPassword);
    if (outcome.status === 'DONE') { setPassword(''); setStep('DONE'); return; }
    if (outcome.status === 'NEEDS_PASSWORD') {
      setStep('PASSWORD');
      if (outcome.wrongPassword) setError(ar ? 'كلمة المرور غير صحيحة.' : 'Incorrect password.');
      else if (!usesPassword) setError(accountDeletionErrorText('NO_PASSWORD_PROVIDER', ar));
      return;
    }
    setStep('CONFIRM'); setError(accountDeletionErrorText(outcome.code, ar));
  };

  const finish = () => { onClose(); window.location.reload(); };
  const scope = ar ? DELETION_SCOPE_AR : DELETION_SCOPE_EN;

  return <Modal isOpen onClose={step === 'WORKING' ? () => {} : (step === 'DONE' ? finish : onClose)} title={ar ? 'حسابي' : 'My account'} subtitle={[currentUser.nameArabic || currentUser.name, email].filter(Boolean).join(' · ')} maxWidth="md">
    <div dir={ar ? 'rtl' : 'ltr'} className="space-y-4 text-sm">
      {step === 'MENU' && <>
        {IS_DEMO_SESSION
          ? <p className="text-xs text-[color:var(--muted)] leading-6">{ar ? 'هذه بيئة تجريبية بلا حساب حقيقي؛ لا يوجد ما يُحذف. الخروج يمحو البيئة التجريبية كلها.' : 'This is a demo sandbox with no real account; nothing to delete. Exiting erases the sandbox.'}</p>
          : <button type="button" onClick={() => setStep('CONFIRM')} data-testid="delete-account-start" className="w-full min-h-11 rounded-xl border border-[#e3cfca] bg-[#F9F0EE] text-[#8a4f45] font-black text-sm flex items-center justify-center gap-2 hover:bg-[var(--danger-soft)]"><Trash2 className="w-4 h-4" />{ar ? 'حذف حسابي' : 'Delete my account'}</button>}
      </>}
      {(step === 'CONFIRM' || step === 'PASSWORD' || step === 'WORKING') && <div className="space-y-3" data-testid="delete-account-confirm">
        <h3 className="font-black text-[#8a4f45]">{ar ? 'هل تريد حذف حسابك نهائيًا؟' : 'Permanently delete your account?'}</h3>
        <ul className="list-disc ps-5 space-y-1.5 text-xs leading-6 text-[#3f4742]">{scope.map(line => <li key={line}>{line}</li>)}</ul>
        {step === 'PASSWORD' && usesPassword && <label className="block space-y-1.5">
          <span className="text-xs font-bold">{ar ? 'لأمان حسابك، أعد إدخال كلمة المرور للتأكيد' : 'For your security, re-enter your password to confirm'}</span>
          <input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} className="w-full min-h-11 rounded-xl border border-[#DFDED7] px-3" dir="ltr" />
        </label>}
        {error && <p role="alert" className="text-xs font-bold text-[#8a4f45] leading-6">{error}</p>}
        <div className="flex gap-2">
          <button type="button" disabled={step === 'WORKING'} onClick={() => { setStep('MENU'); setPassword(''); setError(''); }} className="flex-1 min-h-11 rounded-xl border border-[#DFDED7] font-black text-xs">{ar ? 'إلغاء' : 'Cancel'}</button>
          <button type="button" data-testid="delete-account-confirm-button" disabled={step === 'WORKING' || (step === 'PASSWORD' && (!usesPassword || !password))} aria-busy={step === 'WORKING'} onClick={() => void run(step === 'PASSWORD' ? password : undefined)} className="flex-1 min-h-11 rounded-xl bg-[#8a4f45] text-white font-black text-xs disabled:opacity-50">{step === 'WORKING' ? (ar ? 'جارٍ الحذف…' : 'Deleting…') : (ar ? 'نعم، احذف حسابي نهائيًا' : 'Yes, delete permanently')}</button>
        </div>
      </div>}
      {step === 'DONE' && <div role="status" className="space-y-3">
        <p className="font-bold leading-7">{ar ? 'حُذف حسابك ومُحيت بياناتك الشخصية، وأُنهيت جلستك على هذا الجهاز.' : 'Your account was deleted, your personal data erased, and you were signed out on this device.'}</p>
        <button type="button" onClick={finish} className="w-full min-h-11 rounded-xl bg-[var(--emerald-2)] text-white font-black text-sm">{ar ? 'تم' : 'Done'}</button>
      </div>}
    </div>
  </Modal>;
};
