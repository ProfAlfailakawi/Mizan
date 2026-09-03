import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import rawConfig from '../../firebase-applet-config.json';

/*
 * firebase-applet-config.json is intentionally committed empty ({}) so that no project
 * identifiers live in the repository — the real values arrive through VITE_* environment
 * variables at build time. TypeScript, however, infers the type from the file's actual
 * contents, so every `config.<field>` read was an error and `npm run check` had been
 * permanently red. Describing the shape once restores the gate and changes no runtime
 * value: each field stays optional, exactly as the empty file implies.
 */
type AppletConfig = Partial<{
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  firestoreDatabaseId: string;
}>;
const config: AppletConfig = rawConfig;

const env=import.meta.env as Record<string,string|undefined>;
const authRequired=env.VITE_REQUIRE_AUTH==='true';
const apiKey=env.VITE_FIREBASE_API_KEY;
if(authRequired&&!apiKey) throw new Error('VITE_FIREBASE_API_KEY is required when production authentication is enabled. Rotate any key that was ever exposed publicly.');

const firebaseConfig = {
  apiKey: apiKey || 'development-only-no-real-key',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || config.authDomain || undefined,
  projectId: env.VITE_FIREBASE_PROJECT_ID || config.projectId,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || config.storageBucket || undefined,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || config.messagingSenderId || undefined,
  appId: env.VITE_FIREBASE_APP_ID || config.appId || 'development-app',
};

export const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);

/*
 * Firestore is loaded on demand, not at module scope.
 *
 * Every Firestore path in the app is already gated on `auth.currentUser`, so demo and
 * local-only sessions never touch the cloud — yet the 132 kB (gzipped) Firestore client
 * was still downloaded, parsed and initialised before the first screen painted. Deferring
 * it removes that cost from everyone who is not signed in, and changes nothing for anyone
 * who is: the first call still awaits a fully initialised client.
 *
 * The promise is cached, so getFirestoreClient() is idempotent and safe to call from any
 * number of call sites and renders.
 */
type FirestoreClient = {
  db: import('firebase/firestore').Firestore;
  doc: typeof import('firebase/firestore')['doc'];
  setDoc: typeof import('firebase/firestore')['setDoc'];
  onSnapshot: typeof import('firebase/firestore')['onSnapshot'];
};

let firestoreClient: Promise<FirestoreClient> | null = null;

export function getFirestoreClient(): Promise<FirestoreClient> {
  if (!firestoreClient) {
    firestoreClient = import('firebase/firestore')
      .then(({ getFirestore, doc, setDoc, onSnapshot }) => ({
        db: config.firestoreDatabaseId && config.firestoreDatabaseId !== '(default)'
          ? getFirestore(app, config.firestoreDatabaseId)
          : getFirestore(app),
        doc, setDoc, onSnapshot,
      }))
      // A failed load must not poison every later attempt (a flaky venue link is normal).
      .catch(err => { firestoreClient = null; throw err; });
  }
  return firestoreClient;
}
