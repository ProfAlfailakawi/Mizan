import { useEffect, useState } from 'react';
import { getIdTokenResult, onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebase';
import { useAppStore } from './store';
import { Role } from '../types';

/** Roles MIZAN will admit. Unknown or retired claims fail closed. */
const ALLOWED_ROLES: Role[] = [
  'super_admin', 'org_admin', 'comp_admin', 'head_judge', 'judge',
  'ops_manager', 'exception_host', 'delegation_manager', 'participant', 'broadcast_operator',
  'auditor', 'guardian', 'support_agent',
];
const COMMERCIAL_ROLES: Role[]=['operator_owner','operator_admin','storage_admin','billing_admin','branch_admin'];

/** Platform owner is global; tenant-scoped roles still require a real organization id. */
const PLATFORM_OWNER_ORGANIZATION_ID = '__platform__';

/** Tenant staff MFA is opt-in. Owner MFA follows its dedicated flag when supplied, otherwise the shared bootstrap flag. */
const OPTIONAL_STAFF_MFA_ROLES: Role[] = [
  'operator_owner', 'operator_admin', 'org_admin', 'storage_admin', 'billing_admin', 'branch_admin', 'comp_admin', 'head_judge', 'judge', 'auditor',
];

export type MizanAccessError =
  | ''
  | 'PRIVILEGED_SESSION_CONFLICT'
  | 'ACCOUNT_NOT_PROVISIONED'
  | 'ACCOUNT_CLAIMS_REQUIRED'
  | 'MFA_REQUIRED'
  | 'IDENTITY_TOKEN_ERROR';

interface ResolvedIdentity {
  role: Role;
  organizationId: string;
  operatorId?: string;
  competitionId?: string;
  serverManaged: boolean;
}

function deviceIdentity(): string {
  let deviceId = localStorage.getItem('mizan_device_identity');
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    localStorage.setItem('mizan_device_identity', deviceId);
  }
  return deviceId;
}

/** Accept the compact QR URL (#a=TOKEN), a MZI1 payload, or the raw token as fallback. */
export function normalizeMizanActivationToken(raw: string): string {
  const value = String(raw || '').trim();
  if (!value) return '';
  if (value.startsWith('MZI1|')) return value.slice(5).trim();
  try {
    const url = new URL(value, typeof window === 'undefined' ? 'https://mizan.invalid' : window.location.origin);
    const h = url.hash || '';
    if (h.startsWith('#a=')) return decodeURIComponent(h.slice(3).split('&')[0] || '').trim();
    const q = url.searchParams.get('activationToken') || url.searchParams.get('token');
    if (q) return q.trim();
  } catch { /* raw token */ }
  if (value.startsWith('#a=')) return decodeURIComponent(value.slice(3).split('&')[0] || '').trim();
  return value;
}

export function activationTokenFromLocation(): string {
  if (typeof window === 'undefined') return '';
  return normalizeMizanActivationToken(window.location.hash);
}

async function resolveServerIdentity(
  tokenValue: string,
  fallback: ResolvedIdentity,
): Promise<{ identity: ResolvedIdentity } | { error: MizanAccessError }> {
  try {
    const me = await fetch('/api/identity/me', {
      headers: {
        authorization: `Bearer ${tokenValue}`,
        'x-mizan-device-id': deviceIdentity(),
        'x-mizan-device-name': navigator.userAgent.slice(0, 120),
      },
    });
    const body = await me.json().catch(() => ({} as Record<string, unknown>));
    if (me.status === 409 && (body as { code?: string }).code === 'PRIVILEGED_SESSION_CONFLICT') return { error: 'PRIVILEGED_SESSION_CONFLICT' };
    if (me.ok && (body as { identity?: unknown }).identity) {
      const identity = (body as { identity: Record<string, unknown> }).identity;
      return { identity: {
        role: String(identity.role || '') as Role,
        organizationId: String(identity.organizationId || ''),
        operatorId: identity.operatorId ? String(identity.operatorId) : undefined,
        competitionId: identity.competitionId ? String(identity.competitionId) : undefined,
        serverManaged: !!(body as { managed?: boolean }).managed,
      }};
    }
    if (me.status === 404 && !fallback.role) return { error: 'ACCOUNT_NOT_PROVISIONED' };
  } catch {
    // Legacy claim-only deployments remain supported; authority still fails closed below.
  }
  return { identity: fallback };
}

export function useMizanAuth(requireAuth: boolean) {
  const { applyAuthenticatedIdentity } = useAppStore();
  const qrTokenAtLoad = activationTokenFromLocation();
  const [signedIn, setSignedIn] = useState(!requireAuth);
  const [authReady, setAuthReady] = useState(!requireAuth);
  const [accessError, setAccessError] = useState<MizanAccessError>('');
  const [activationToken, setActivationTokenState] = useState(qrTokenAtLoad);
  const [activationFromQr] = useState(Boolean(qrTokenAtLoad));
  const [activationMessage, setActivationMessage] = useState('');

  const setActivationToken = (value: string) => setActivationTokenState(normalizeMizanActivationToken(value));

  useEffect(() => {
    if (!requireAuth) return;
    return onAuthStateChanged(auth, async (user) => {
      if (!user) { setSignedIn(false); setAuthReady(true); return; }
      try {
        const token = await getIdTokenResult(user, true);
        const claimRole = String(token.claims.role || '') as Role;
        const claimedOrganizationId = String(token.claims.org_id || '');
        const claimIdentity: ResolvedIdentity = {
          role: claimRole,
          organizationId: claimedOrganizationId || (claimRole === 'super_admin' ? PLATFORM_OWNER_ORGANIZATION_ID : (COMMERCIAL_ROLES.includes(claimRole) && token.claims.operator_id ? `__operator__:${String(token.claims.operator_id)}` : '')),
          operatorId: token.claims.operator_id ? String(token.claims.operator_id) : undefined,
          competitionId: token.claims.competition_id ? String(token.claims.competition_id) : undefined,
          serverManaged: false,
        };
        const resolved = await resolveServerIdentity(token.token, claimIdentity);
        if ('error' in resolved) { setAccessError(resolved.error); setSignedIn(false); setAuthReady(true); return; }
        const { role, organizationId, operatorId, competitionId, serverManaged } = resolved.identity;

        if (![...ALLOWED_ROLES,...COMMERCIAL_ROLES].includes(role) || !organizationId) {
          // Unknown or retired claims must be reassigned; they are never silently remapped.
          setAccessError('ACCOUNT_CLAIMS_REQUIRED'); setSignedIn(false); setAuthReady(true); return;
        }

        const firebaseClaim = token.claims.firebase as Record<string, unknown> | undefined;
        const secondFactor = !!firebaseClaim?.sign_in_second_factor;
        const ownerMfaSetting = import.meta.env.VITE_REQUIRE_MFA_FOR_SUPER_ADMIN;
        const ownerMfaRequired = ownerMfaSetting === undefined
          ? import.meta.env.VITE_REQUIRE_MFA_FOR_SENSITIVE === 'true'
          : ownerMfaSetting === 'true';
        const staffMfaRequired = import.meta.env.VITE_REQUIRE_MFA_FOR_SENSITIVE === 'true';
        const mfaRequired = (role === 'super_admin' && ownerMfaRequired) || (staffMfaRequired && OPTIONAL_STAFF_MFA_ROLES.includes(role));
        if (mfaRequired && !secondFactor) { setAccessError('MFA_REQUIRED'); setSignedIn(false); setAuthReady(true); return; }

        applyAuthenticatedIdentity({
          id: user.uid, email: user.email || '', name: user.displayName || user.email || user.uid,
          role, organizationId, operatorId, competitionId, mfaEnabled: secondFactor,
          identityAssurance: serverManaged ? 'firebase_managed' : 'firebase',
        });
        setAccessError(''); setSignedIn(true);
      } catch { setAccessError('IDENTITY_TOKEN_ERROR'); setSignedIn(false); }
      finally { setAuthReady(true); }
    });
  }, [requireAuth]);

  const activateAccount = async () => {
    const user = auth.currentUser;
    const clean = normalizeMizanActivationToken(activationToken);
    if (!user || !clean || activationMessage === 'ACTIVATING') return;
    setActivationMessage('ACTIVATING');
    try {
      const token = await user.getIdToken(true);
      const response = await fetch('/api/identity/activate', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ activationToken: clean }),
      });
      const body = await response.json().catch(() => ({} as Record<string, unknown>));
      if (!response.ok) { setActivationMessage(String((body as { code?: string }).code || 'ACTIVATION_FAILED')); return; }
      setActivationMessage('ACTIVATED'); setActivationTokenState('');
      /*
       * تجديد الرمز قسرًا قبل إعادة التحميل.
       *
       * قواعد Firestore تقرأ مطالبات الرمز، والخادم كتبها للتوّ. لكن Firebase يخزّن الرمز
       * قرابة ساعة، فإعادة التحميل وحدها تعود بالرمز القديم بلا مطالبات — فيدخل صاحب
       * الحساب مخوَّلًا في ميزان ومرفوضًا في قاعدة البيانات، ولا يفهم لماذا.
       */
      try { await user.getIdToken(true) } catch { /* فشل التجديد لا يمنع الدخول؛ يُصلحه أول تحديث تالٍ */ }
      if (typeof window !== 'undefined' && window.location.hash.startsWith('#a=')) history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
      window.location.reload();
    } catch { setActivationMessage('ACTIVATION_FAILED'); }
  };

  // A QR scan is an explicit activation intent: after the invited person signs in with the matching
  // verified email, bind the one-time invitation automatically instead of making them retype it.
  useEffect(() => {
    if (!requireAuth || !activationFromQr || accessError !== 'ACCOUNT_NOT_PROVISIONED' || !activationToken || activationMessage) return;
    void activateAccount();
  }, [requireAuth, activationFromQr, accessError, activationToken, activationMessage]);

  const takeoverSession = async () => {
    try {
      const user = auth?.currentUser;
      if (!user) { window.location.reload(); return; }
      const token = await user.getIdToken();
      const res = await fetch('/api/identity/session/takeover', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'x-mizan-device-id': deviceIdentity(), 'x-mizan-device-name': navigator.userAgent.slice(0, 120) },
      });
      if (res.ok) { window.location.reload(); return; }
      /* رمزٌ من الخادم لا تعرفه الواجهة كان يُكتب كما هو في حالة المنع، فتسقط الشاشة إلى
         نصّها العام: «الحساب غير مفوض… أكمل التفعيل» — وهي رسالة كاذبة في وجه حسابٍ مفعَّل،
         وتُخفي معها زرّ الاستعادة نفسه. الرموز المجهولة تبقى على حالة التعارض المعروفة كي
         يظل المخرج ظاهرًا. */
      const body = await res.json().catch(() => ({} as Record<string, unknown>));
      const known: MizanAccessError[] = ['ACCOUNT_NOT_PROVISIONED', 'ACCOUNT_CLAIMS_REQUIRED', 'MFA_REQUIRED', 'PRIVILEGED_SESSION_CONFLICT', 'IDENTITY_TOKEN_ERROR'];
      const code = (body as { code?: string }).code as MizanAccessError | undefined;
      setAccessError(code && known.includes(code) ? code : 'PRIVILEGED_SESSION_CONFLICT');
    } catch { /* keep recovery screen */ }
  };

  return { signedIn, authReady, accessError, activationToken, setActivationToken, activationFromQr, activationMessage, activateAccount, takeoverSession };
}
