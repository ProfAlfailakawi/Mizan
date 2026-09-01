import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import config from '../../firebase-applet-config.json';

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
export const db = config.firestoreDatabaseId && config.firestoreDatabaseId !== '(default)'
  ? getFirestore(app, config.firestoreDatabaseId)
  : getFirestore(app);
export const auth = getAuth(app);
