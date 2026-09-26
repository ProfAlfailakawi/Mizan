import { signOut } from 'firebase/auth';
import type { Role } from '../types';
import { configWriteAllowed } from './cloud-authority';
import { auth, getFirestoreClient } from './firebase';
import { STORAGE_KEY, type AppStoreState } from './store-state';

const CONFIG_WRITERS: Role[] = ['super_admin', 'org_admin', 'comp_admin'];

export function readDurableLocalSnapshot(): AppStoreState | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AppStoreState;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Persist the latest competition configuration synchronously with an explicit user action.
 *
 * Normal UI updates are deliberately debounced in store.ts. A sign-out must not race that timer:
 * Firebase removes the credential immediately, so a category edited milliseconds before logout
 * used to remain only in the browser while the UI still reported the edit as successful.
 *
 * The local snapshot is written synchronously by the existing store path, therefore it is the
 * safest source for this final pre-signout write. We retain the same optimistic-concurrency rule
 * used by the store and verify the authoritative Firestore document before allowing sign-out to
 * continue.
 */
export async function persistDurableCompetitionSnapshot(
  snapshot: AppStoreState | null = readDurableLocalSnapshot(),
  roleOverride?: Role,
): Promise<boolean> {
  const user = auth.currentUser;
  if (!snapshot || !user) return false;

  const role = roleOverride || snapshot.currentUser?.role;
  if (!role || !CONFIG_WRITERS.includes(role)) return true;

  const competition = snapshot.competition;
  const organizationId = String(competition?.organizationId || '');
  const competitionId = String(competition?.id || '');
  if (!organizationId || !competitionId || organizationId === 'org-pending-setup') return false;

  const updatedAt = snapshot.competitionConfigUpdatedAt || competition.updatedAt || new Date().toISOString();
  const localUpdatedAt = Date.parse(updatedAt) || 0;
  const { db, doc, getDoc, setDoc } = await getFirestoreClient();
  const ref = doc(db, 'organizations', organizationId, 'competitions', competitionId);

  const current = await getDoc(ref).catch(() => null);
  const currentData = current?.exists() ? current.data() as { updatedAt?: unknown } : null;
  const remoteUpdatedAt = typeof currentData?.updatedAt === 'string' ? (Date.parse(currentData.updatedAt) || 0) : 0;

  // Never overwrite another device's newer configuration while trying to log out.
  if (!configWriteAllowed(remoteUpdatedAt, localUpdatedAt)) return false;

  const configuration = {
    competition,
    judges: snapshot.judges || [],
    emergencyFrozen: !!snapshot.emergencyFrozen,
    updatedAt,
  };
  await setDoc(ref, configuration, { merge: true });

  // Keep the anonymous registration projection aligned when registration has already been opened.
  if (competitionId !== 'comp-pending-setup' && !['draft', 'configured'].includes(competition.status)) {
    await setDoc(doc(db, 'public_competitions', competitionId), {
      organizationId,
      competition,
      updatedAt,
    }, { merge: true });
  }

  const verification = await getDoc(ref);
  if (!verification.exists()) return false;
  const verified = verification.data() as { updatedAt?: unknown; competition?: { id?: unknown; organizationId?: unknown } };
  return verified.updatedAt === updatedAt
    && verified.competition?.id === competitionId
    && verified.competition?.organizationId === organizationId;
}

/*
 * زرّ الخروج «لا يعمل أحيانًا» لأن الخروج كان ينتظر وعدين لا سقف لهما: الدفع الأخير إلى
 * Firestore (و`getDoc` بلا شبكة ينتظر الخادم إلى ما لا نهاية) ثم `signOut`. فإذا تعلّق
 * أحدهما لم تأتِ `finally` ولا إعادة التحميل، وبقي المستخدم داخل الجلسة بلا أثر. والنقر
 * المكرّر كان يطلق سلاسل متوازية. الآن لكل خطوة سقف زمني، والخروج يحدث دائمًا.
 */
const FLUSH_BUDGET_MS = 4000;
const SIGN_OUT_BUDGET_MS = 3000;
const withinBudget = <T,>(work: Promise<T>, ms: number): Promise<T | undefined> =>
  Promise.race([work, new Promise<undefined>(resolve => setTimeout(() => resolve(undefined), ms))]);

/** Sign out only after the latest editable competition state has reached Firestore (bounded). */
export async function durableSignOut(): Promise<void> {
  try {
    await withinBudget(persistDurableCompetitionSnapshot(), FLUSH_BUDGET_MS);
  } catch (error) {
    // Sign-out must remain available even during a cloud outage. The existing redacted local
    // snapshot stays intact, and the next authenticated bootstrap will reconcile it if needed.
    console.error('MIZAN final cloud flush before sign-out failed', error);
  }
  const done = await withinBudget(signOut(auth).then(() => true), SIGN_OUT_BUDGET_MS);
  /* خروجٌ تعلّق لا يُحسب خروجًا: يُمحى الاعتماد المحفوظ بيدنا، وإلا أعاد التحميلُ الجلسةَ نفسها. */
  if (!done || auth.currentUser) await clearPersistedAuth();
}

/** يمحو اعتماد Firebase المحفوظ في المتصفح (التخزين المحلي وقاعدة IndexedDB) — بسقف زمني. */
export async function clearPersistedAuth(): Promise<void> {
  for (const store of [globalThis.localStorage, globalThis.sessionStorage]) {
    try { if (!store) continue; for (const key of Object.keys(store)) if (key.startsWith('firebase:')) store.removeItem(key); } catch { /* تخزينٌ محجوب */ }
  }
  if (typeof indexedDB === 'undefined') return;
  await withinBudget(new Promise<void>(resolve => {
    try { const req = indexedDB.deleteDatabase('firebaseLocalStorageDb'); req.onsuccess = req.onerror = req.onblocked = () => resolve(); } catch { resolve(); }
  }), 1500);
}

let signingOut = false;
/** المخرج الوحيد لكل أزرار الخروج: مرة واحدة، بسقف زمني، ثم إعادة تحميل مهما حدث. */
export function signOutAndReload(): void {
  if (signingOut) return;
  signingOut = true;
  void durableSignOut().catch(error => console.error('MIZAN sign-out failed', error)).finally(() => window.location.reload());
}
