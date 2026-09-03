import { useEffect, useState } from 'react';
import { getIdTokenResult, onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebase';
import { useAppStore } from './store';
import { Role } from '../types';

/**
 * MIZAN authentication + identity-governance gate.
 *
 * This hook was extracted verbatim (in behaviour) from a single ~200-word inline handler in
 * App.tsx. Nothing about the security model changed — it was made readable so a future team,
 * or an external security review, can audit each decision without parsing one dense line:
 *
 *   1. Firebase proves *who* the account is (a verified ID token).
 *   2. The server identity-governance endpoint decides *what* they may do (role, org, competition).
 *      Signed Firebase custom claims remain a supported fallback for legacy deployments.
 *   3. A privileged role opened on another sensitive device is refused (session conflict).
 *   4. Sensitive roles must satisfy MFA (a second factor) unless explicitly disabled.
 *
 * The hook never invents authority: any missing/insufficient signal resolves to an
 * accessError and a signed-out state rather than a silent grant.
 */

/** Roles MIZAN will admit into an authenticated session. */
const ALLOWED_ROLES: Role[] = [
  'super_admin', 'org_admin', 'comp_admin', 'scientific_admin', 'head_judge', 'judge',
  'ops_manager', 'exception_host', 'delegation_manager', 'participant', 'broadcast_operator',
  'auditor', 'guardian', 'support_agent',
];

/** Roles that can influence a high-stakes competition and therefore require MFA. */
const SENSITIVE_ROLES: Role[] = [
  'super_admin', 'org_admin', 'comp_admin', 'scientific_admin', 'head_judge', 'judge', 'auditor',
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
  competitionId?: string;
  serverManaged: boolean;
}

/** A stable per-device id so identity governance can detect concurrent privileged sessions. */
function deviceIdentity(): string {
  let deviceId = localStorage.getItem('mizan_device_identity');
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    localStorage.setItem('mizan_device_identity', deviceId);
  }
  return deviceId;
}

/**
 * Ask the server identity-governance service to resolve this token into a scoped identity.
 * Returns the resolved identity, or a specific access error the caller must surface.
 * The endpoint is optional: legacy deployments without it keep working on signed claims,
 * which is why a network/parse failure falls through to the claim-based path.
 */
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

    if (me.status === 409 && (body as { code?: string }).code === 'PRIVILEGED_SESSION_CONFLICT') {
      return { error: 'PRIVILEGED_SESSION_CONFLICT' };
    }
    if (me.ok && (body as { identity?: unknown }).identity) {
      const identity = (body as { identity: Record<string, unknown> }).identity;
      return {
        identity: {
          role: String(identity.role || '') as Role,
          organizationId: String(identity.organizationId || ''),
          competitionId: identity.competitionId ? String(identity.competitionId) : undefined,
          serverManaged: !!(body as { managed?: boolean }).managed,
        },
      };
    }
    if (me.status === 404 && !fallback.role) {
      return { error: 'ACCOUNT_NOT_PROVISIONED' };
    }
  } catch {
    // Identity governance endpoint is optional for legacy deployments; signed Firebase
    // claims remain supported, so we fall through to the claim-based identity below.
  }
  return { identity: fallback };
}

export function useMizanAuth(requireAuth: boolean) {
  const { applyAuthenticatedIdentity } = useAppStore();
  const [signedIn, setSignedIn] = useState(!requireAuth);
  const [authReady, setAuthReady] = useState(!requireAuth);
  const [accessError, setAccessError] = useState<MizanAccessError>('');
  const [activationToken, setActivationToken] = useState('');
  const [activationMessage, setActivationMessage] = useState('');

  useEffect(() => {
    if (!requireAuth) return;

    return onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setSignedIn(false);
        setAuthReady(true);
        return;
      }

      try {
        const token = await getIdTokenResult(user, true);

        // Start from signed claims, then let the server governance service refine them.
        const claimIdentity: ResolvedIdentity = {
          role: String(token.claims.role || '') as Role,
          organizationId: String(token.claims.org_id || ''),
          competitionId: token.claims.competition_id ? String(token.claims.competition_id) : undefined,
          serverManaged: false,
        };
        const resolved = await resolveServerIdentity(token.token, claimIdentity);
        if ('error' in resolved) {
          setAccessError(resolved.error);
          setSignedIn(false);
          setAuthReady(true);
          return;
        }
        const { role, organizationId, competitionId, serverManaged } = resolved.identity;

        if (!ALLOWED_ROLES.includes(role) || !organizationId) {
          setAccessError('ACCOUNT_CLAIMS_REQUIRED');
          setSignedIn(false);
          setAuthReady(true);
          return;
        }

        // MFA gate for sensitive roles (Firebase reports a completed second factor on the claim).
        const firebaseClaim = token.claims.firebase as Record<string, unknown> | undefined;
        const secondFactor = !!firebaseClaim?.sign_in_second_factor;
        const mfaRequired = import.meta.env.VITE_REQUIRE_MFA_FOR_SENSITIVE !== 'false';
        if (mfaRequired && SENSITIVE_ROLES.includes(role) && !secondFactor) {
          setAccessError('MFA_REQUIRED');
          setSignedIn(false);
          setAuthReady(true);
          return;
        }

        applyAuthenticatedIdentity({
          id: user.uid,
          email: user.email || '',
          name: user.displayName || user.email || user.uid,
          role,
          organizationId,
          competitionId,
          mfaEnabled: secondFactor,
          identityAssurance: serverManaged ? 'firebase_managed' : 'firebase',
        });
        setAccessError('');
        setSignedIn(true);
      } catch {
        setAccessError('IDENTITY_TOKEN_ERROR');
        setSignedIn(false);
      } finally {
        setAuthReady(true);
      }
    });
  }, [requireAuth]);

  /** Bind an unprovisioned but verified Firebase account to a one-time invitation token. */
  const activateAccount = async () => {
    const user = auth.currentUser;
    if (!user || !activationToken.trim()) return;
    setActivationMessage('');
    try {
      const token = await user.getIdToken(true);
      const response = await fetch('/api/identity/activate', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ activationToken: activationToken.trim() }),
      });
      const body = await response.json().catch(() => ({} as Record<string, unknown>));
      if (!response.ok) {
        setActivationMessage(String((body as { code?: string }).code || 'ACTIVATION_FAILED'));
        return;
      }
      setActivationMessage('ACTIVATED');
      setActivationToken('');
      window.location.reload();
    } catch {
      setActivationMessage('ACTIVATION_FAILED');
    }
  };

  return {
    signedIn,
    authReady,
    accessError,
    activationToken,
    setActivationToken,
    activationMessage,
    activateAccount,
  };
}
