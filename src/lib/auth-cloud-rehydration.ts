import type { Competition, Role } from '../types';
import { auth, getFirestoreClient } from './firebase';
import { persistDurableCompetitionSnapshot, readDurableLocalSnapshot, writeDurableLocalSnapshot } from './cloud-session-durability';
import type { AppStoreState } from './store-state';

const CONFIG_WRITERS: Role[] = ['super_admin', 'org_admin', 'comp_admin'];

export interface AuthScopeIdentity {
  id: string;
  role: Role;
  organizationId: string;
  operatorId?: string;
  competitionId?: string;
}

type CloudCompetition = { competition: Competition; updatedAt?: string };

const realCompetition = (competition: Competition | undefined | null) =>
  !!competition?.id && competition.id !== 'comp-pending-setup' && competition.organizationId !== 'org-pending-setup';

function newestFirst(a: CloudCompetition, b: CloudCompetition) {
  const at = Date.parse(a.updatedAt || a.competition.updatedAt || '') || 0;
  const bt = Date.parse(b.updatedAt || b.competition.updatedAt || '') || 0;
  return bt - at;
}

function sameIdSet(a: Competition[], b: Competition[]) {
  const left = [...new Set(a.map(c => c.id))].sort();
  const right = [...new Set(b.map(c => c.id))].sort();
  return left.length === right.length && left.every((id, i) => id === right[i]);
}

/**
 * Discover the authoritative competition scope before the authenticated app mounts its listeners.
 *
 * Previously applyAuthenticatedIdentity() could only choose from competitions already present in
 * that browser's localStorage. After logout, a clean browser (or a browser whose local snapshot
 * pointed at another competition) therefore subscribed to `comp-pending-setup` and showed no
 * categories or registrations even though Firestore had them. This bootstrap resolves the exact
 * cloud scope, stores it locally, and asks for one reload before the normal store subscriptions run.
 */
export async function prepareAuthenticatedCloudScope(
  identity: AuthScopeIdentity,
  liveState: AppStoreState,
): Promise<'ready' | 'reload'> {
  if (!auth.currentUser || identity.operatorId || identity.role === 'super_admin' || !identity.organizationId) return 'ready';

  const { db, doc, getDoc, collection } = await getFirestoreClient();
  const cloudRows: CloudCompetition[] = [];

  if (identity.competitionId) {
    const snap = await getDoc(doc(db, 'organizations', identity.organizationId, 'competitions', identity.competitionId));
    if (snap.exists()) {
      const data = snap.data() as { competition?: Competition; updatedAt?: unknown };
      if (data.competition?.id === identity.competitionId && data.competition.organizationId === identity.organizationId) {
        cloudRows.push({ competition: data.competition, updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : undefined });
      }
    }
  } else if (identity.role === 'org_admin') {
    const { getDocs } = await import('firebase/firestore');
    const snap = await getDocs(collection(db, 'organizations', identity.organizationId, 'competitions'));
    snap.forEach((row) => {
      const data = row.data() as { competition?: Competition; updatedAt?: unknown };
      const competition = data.competition;
      if (!competition || competition.id !== row.id || competition.organizationId !== identity.organizationId) return;
      cloudRows.push({ competition, updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : undefined });
    });
  }

  cloudRows.sort(newestFirst);

  const persisted = readDurableLocalSnapshot();
  // useAppStore() also returns action functions. JSON cloning intentionally keeps only serializable
  // state fields, whereas structuredClone would throw DataCloneError on those functions.
  const base = JSON.parse(JSON.stringify(persisted || liveState)) as AppStoreState;
  const liveScoped = (liveState.competitions || []).filter(c => c.organizationId === identity.organizationId);
  const localCurrent = base.competition?.organizationId === identity.organizationId ? base.competition : undefined;

  // Repair the old logout race on the next login when this is the same user and their local config
  // is newer than the root document. This never overwrites a newer cloud version.
  if (
    localCurrent
    && base.currentUser?.id === identity.id
    && CONFIG_WRITERS.includes(identity.role)
    && (!identity.competitionId || localCurrent.id === identity.competitionId)
  ) {
    const remoteForLocal = cloudRows.find(row => row.competition.id === localCurrent.id);
    const localTime = Date.parse(base.competitionConfigUpdatedAt || localCurrent.updatedAt || '') || 0;
    const remoteTime = Date.parse(remoteForLocal?.updatedAt || remoteForLocal?.competition.updatedAt || '') || 0;
    if (localTime > remoteTime) {
      try {
        const repaired = await persistDurableCompetitionSnapshot(base, identity.role);
        if (repaired) {
          const replacement: CloudCompetition = { competition: localCurrent, updatedAt: base.competitionConfigUpdatedAt };
          const index = cloudRows.findIndex(row => row.competition.id === localCurrent.id);
          if (index >= 0) cloudRows[index] = replacement;
          else cloudRows.push(replacement);
          cloudRows.sort(newestFirst);
        }
      } catch (error) {
        console.warn('MIZAN cloud reconciliation before authenticated bootstrap failed', error);
      }
    }
  }

  if (!cloudRows.length) return 'ready';

  let selected: CloudCompetition | undefined;
  if (identity.competitionId) selected = cloudRows.find(row => row.competition.id === identity.competitionId);
  else if (localCurrent && realCompetition(localCurrent)) selected = cloudRows.find(row => row.competition.id === localCurrent.id);
  selected ||= cloudRows.find(row => realCompetition(row.competition)) || cloudRows[0];
  if (!selected) return 'ready';

  const cloudCompetitions = cloudRows.map(row => row.competition);
  const otherLocal = (base.competitions || []).filter(c => c.organizationId !== identity.organizationId);
  const selectedFirst = [
    selected.competition,
    ...cloudCompetitions.filter(c => c.id !== selected!.competition.id),
  ];

  base.competition = selected.competition;
  base.competitions = [...selectedFirst, ...otherLocal];
  base.competitionConfigUpdatedAt = selected.updatedAt || selected.competition.updatedAt;

  const wrote = writeDurableLocalSnapshot(base);
  if (!wrote) return 'ready';

  // Existing store logic is intentionally kept small and synchronous. Reload once only when the
  // live in-memory scope differs; the next boot hydrates the snapshot above before authentication.
  const liveSelected = identity.competitionId
    ? liveScoped.find(c => c.id === identity.competitionId)
    : liveScoped[0];
  const liveMatches = liveSelected?.id === selected.competition.id && sameIdSet(liveScoped, cloudCompetitions);
  return liveMatches ? 'ready' : 'reload';
}
