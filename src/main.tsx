import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import {ArabicInterfaceGuard} from './components/design-system/ArabicInterfaceGuard';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ArabicInterfaceGuard/>
    <App />
  </StrictMode>,
);

if ('serviceWorker' in navigator && import.meta.env.PROD) { window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{})); }
