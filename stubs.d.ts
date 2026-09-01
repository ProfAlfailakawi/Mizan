
declare namespace React { type ReactNode=any; type FC<P={}>=any; type ComponentType<P={}>=any; type MouseEvent<T=any>=any; type KeyboardEvent<T=any>=any; type ButtonHTMLAttributes<T=any>=any; }
declare namespace JSX { interface IntrinsicAttributes { key?: any } interface IntrinsicElements { [elemName:string]: any } }
declare module 'react' { const React:any; export default React; export const StrictMode:any; export function useState<T=any>(initial?:T|(()=>T)):[T,(value:any)=>void]; export function useEffect(fn:any,deps?:any[]):void; export function useMemo<T=any>(fn:()=>T,deps:any[]):T; export function useRef<T=any>(initial?:T):{current:T}; export function useCallback<T extends (...args:any[])=>any>(fn:T,deps:any[]):T; export type FC<P={}>=any; }
declare module 'react/jsx-runtime' { export const jsx:any; export const jsxs:any; export const Fragment:any; }
declare module 'react-dom/client' { export function createRoot(...args:any[]): any; }
declare module 'lucide-react' {
 export const Activity: any;
 export const AlertTriangle: any;
 export const ArrowLeft: any;
 export const ArrowRight: any;
 export const Award: any;
 export const Baby: any;
 export const BadgeCheck: any;
 export const Bell: any;
 export const Bot: any;
 export const Building2: any;
 export const Cable: any;
 export const CalendarClock: any;
 export const CalendarDays: any;
 export const Check: any;
 export const CheckCircle2: any;
 export const ChevronDown: any;
 export const ChevronLeft: any;
 export const ChevronRight: any;
 export const CircleAlert: any;
 export const CircleDot: any;
 export const Clock3: any;
 export const Copy: any;
 export const CornerDownLeft: any;
 export const Crown: any;
 export const DatabaseBackup: any;
 export const Download: any;
 export const FileCheck2: any;
 export const FileSearch: any;
 export const FileText: any;
 export const FileUp: any;
 export const Fingerprint: any;
 export const Gauge: any;
 export const Gavel: any;
 export const Globe: any;
 export const Globe2: any;
 export const HardDrive: any;
 export const Headphones: any;
 export const KeyRound: any;
 export const Keyboard: any;
 export const Layers3: any;
 export const LayoutDashboard: any;
 export const LifeBuoy: any;
 export const ListChecks: any;
 export const LockKeyhole: any;
 export const Mail: any;
 export const MapPin: any;
 export const Mic: any;
 export const Mic2: any;
 export const MicOff: any;
 export const Microscope: any;
 export const Network: any;
 export const Plane: any;
 export const Play: any;
 export const Plus: any;
 export const Printer: any;
 export const QrCode: any;
 export const Radar: any;
 export const Radio: any;
 export const RadioTower: any;
 export const RefreshCw: any;
 export const RotateCcw: any;
 export const ScanLine: any;
 export const Search: any;
 export const Server: any;
 export const Settings2: any;
 export const ShieldCheck: any;
 export const SkipForward: any;
 export const Sparkles: any;
 export const Stethoscope: any;
 export const Trash2: any;
 export const UserRound: any;
 export const UsersRound: any;
 export const Volume2: any;
 export const WalletCards: any;
 export const WandSparkles: any;
 export const Webhook: any;
 export const Wifi: any;
 export const WifiOff: any;
 export const X: any;
 export const XCircle: any;
}
declare module 'firebase/app' { export const initializeApp:any; export const getApps:any; export const getApp:any; }
declare module 'firebase/firestore' { export const getFirestore:any; export const doc:any; export const setDoc:any; export const onSnapshot:any; }
declare module 'firebase/auth' { export const getAuth:any; export const onAuthStateChanged:any; export const getIdTokenResult:any; export const signOut:any; export const signInWithEmailAndPassword:any; export const sendPasswordResetEmail:any; }
declare module 'express' { const express:any; export default express; export type RequestHandler=any; }
declare module 'path' { const path:any; export default path; }
declare module 'vite' { export const createServer:any; export const defineConfig:any; }
declare module '@tailwindcss/vite' { const x:any; export default x; }
declare module '@vitejs/plugin-react' { const x:any; export default x; }
declare module '@google/genai' { export const GoogleGenAI:any; }
declare module 'motion' { export const motion:any; }
declare var process:any; declare var __dirname:string; declare var Buffer:any;
interface ImportMeta { env:any }

declare module 'crypto' { const crypto:any; export default crypto; }
declare module 'node:test' { const test:any; export default test; }
declare module 'node:assert/strict' { const assert:any; export default assert; }
