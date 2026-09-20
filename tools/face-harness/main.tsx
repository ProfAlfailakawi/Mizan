import React from 'react';
import { createRoot } from 'react-dom/client';
import { MushafListens } from '../../src/components/participant/MushafListens';
import { fullQuranScope } from '../../src/lib/quran-scope';

/*
 * مِشْحَنُ الشاشة — يُشغّل `MushafListens` نفسَها في متصفّحٍ حقيقيّ بميكروفونٍ حقيقيّ.
 *
 * والعيوبُ السبعةُ التي وُجدت في هذه الشاشة كانت كلُّها **زمنيّة**: تعليقٌ، وترتيبُ
 * وصول، وانتقالٌ بين وجهين وطلبٌ في الطريق. ولا يكشفها بناءٌ ولا تصييرٌ إلى نصّ: تكشفها
 * تلاوةٌ تجري على شبكةٍ تتلكّأ. فهذا المشحنُ يُجريها.
 *
 * وهو خارجَ `src/` عمدًا، ولا يُبنى مع الإنتاج.
 */

/* مسارُ الصوت يُسجَّل ليُقاس إطلاقُ الميكروفون من خارج الصفحة. */
const streams: MediaStream[] = [];
const realGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
navigator.mediaDevices.getUserMedia = async (constraints?: MediaStreamConstraints) => {
  const stream = await realGetUserMedia(constraints);
  streams.push(stream);
  return stream;
};
(window as unknown as { __mizanStreams: () => { index: number; live: number; total: number }[] }).__mizanStreams =
  () => streams.map((s, index) => ({
    index,
    live: s.getTracks().filter(t => t.readyState === 'live').length,
    total: s.getTracks().length,
  }));

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <MushafListens
      ar
      scope={fullQuranScope()}
      deliveryReading="hafs"
      listening={{ reading: 'hafs', sourcePackageId: 'kfgqpc-hafs-uthmanic-v13' }}
      owner="harness-participant"
    />
  </React.StrictMode>,
);
