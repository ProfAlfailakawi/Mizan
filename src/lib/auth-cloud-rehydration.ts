import type { Competition, Role } from '../types';
import { auth, getFirestoreClient } from './firebase';
import { persistDurableCompetitionSnapshot } from './cloud-session-durability';
import type { AppStoreState } from './store-state';

const CONFIG_WRITERS: Role[] = ['super_admin', 'org_admin', 'comp_admin'];

export interface AuthScopeIdentity {
  id: string;
  role: Role;
  organizationId: string;
  operatorId?: string;
  competitionId?: string;
}

export interface PreparedCloudScope {
  selectedCompetitionId: string;
  competitions: Competition[];
  updatedAt?: string;
}

type CloudCompetition = { competition: Competition; updatedAt?: string };

const realCompetition = (competition: Competition | undefined | null) =>
  !!competition?.id && competition.id !== 'comp-pending-setup' && competition.organizationId !== 'org-pending-setup';

function newestFirst(a: CloudCompetition, b: CloudCompetition) {
  const at = Date.parse(a.updatedAt || a.competition.updatedAt || '') || 0;
  const bt = Date.parse(b.updatedAt || b.competition.updatedAt || '') || 0;
  return bt - at;
}

/**
 * Resolve the authoritative competition scope before normal Firestore listeners are attached.
 * No cloud payload is copied into browser storage here: the store applies the verified scope in
 * memory and its existing redacted snapshot path remains the only client-storage writer.
 */
export async function prepareAuthenticatedCloudScope(
  identity: AuthScopeIdentity,
  liveState: AppStoreState,
): Promise<PreparedCloudScope | null> {
  if (!auth.currentUser || identity.operatorId || identity.role === 'super_admin' || !identity.organizationId) return null;

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

  // useAppStore() also exposes actions; JSON cloning deliberately keeps only serializable state.
  const base = JSON.parse(JSON.stringify(liveState)) as AppStoreState;
  const localCurrent = base.competition?.organizationId === identity.organizationId ? base.competition : undefined;

  // Repair the old logout race on next login, but only for the same authenticated user and only
  // when this browser's configuration is newer than the authoritative root document.
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

  if (!cloudRows.length) return null;

  let selected: CloudCompetition | undefined;
  if (identity.competitionId) selected = cloudRows.find(row => row.competition.id === identity.competitionId);
  else if (localCurrent && realCompetition(localCurrent)) selected = cloudRows.find(row => row.competition.id === localCurrent.id);
  selected ||= cloudRows.find(row => realCompetition(row.competition)) || cloudRows[0];
  if (!selected) return null;

  return {
    selectedCompetitionId: selected.competition.id,
    competitions: [
      selected.competition,
      ...cloudRows.map(row => row.competition).filter(c => c.id !== selected!.competition.id),
    ],
    updatedAt: selected.updatedAt || selected.competition.updatedAt,
  };
}
