import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/index.css';
import { OfficialMushafSurface } from '../../src/components/judge/OfficialMushafSurface';

/*
 * سطحُ المصحف في قمرة المحكّم — كما يُركَّب في `JudgeOS` (الورقة، والعمود، والجانب).
 * السؤالُ والتتبّعُ من عنوان الصفحة: ?surah=10&start=98&end=104&rawi=حفص
 * والتتبّعُ يُحقن من خارج الصفحة: window.__track({ayah, wordIndex}).
 */
const q = new URLSearchParams(location.search);
const question = {
  surahNumber: Number(q.get('surah') || 10), startAyah: Number(q.get('start') || 98), endAyah: Number(q.get('end') || 104),
  qiraah: q.get('qiraah') || 'عاصم', rawi: q.get('rawi') || 'حفص', surahNameArabic: q.get('name') || 'يونس',
};

const App = () => {
  const [tracking, setTracking] = useState<any>(null);
  useEffect(() => {
    (window as any).__track = (t: any) => setTracking(t ? { alignmentState: 'LOCKED', surah: question.surahNumber, ...t } : null);
  }, []);
  return (
    <div className="mizan-judge-os" style={{ ['--mizan-judge-top' as string]: '0px' }}>
      <div className="mizan-judge-page">
        <div className="mizan-judge-paper" style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '12px 16px' }}>
          <div className="min-h-0 flex-1 flex flex-col"><OfficialMushafSurface question={question as any} ar tracking={tracking} /></div>
        </div>
      </div>
      <aside style={{ background: '#1d2823' }} />
    </div>
  );
};
createRoot(document.getElementById('root')!).render(<App />);
