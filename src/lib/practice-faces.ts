/*
 * وجوهُ المصحف في يد الطالب — طلبُها من الخادم، وذاكرةُ محاولاته عنده هو.
 *
 * وموضعُ الذاكرة قرارٌ لا تفصيل: تاريخُ المحاولات يُحفظ **في جهاز الطالب وحده**، ولا
 * يُرفع ولا يُكتب في سجلّ. وذلك التزامٌ بما عليه التمرينُ في هذه المنظومة أصلًا: لا
 * يُسجَّل صوته، ولا يصل اللجنةَ منه شيء، ولا يمسّ درجته بحرف. ولو رُفع تاريخُ تعثّره
 * إلى خادمٍ لصار سجلًّا عن حفظه يُسأل عنه، وهو ما لم يأذن به.
 *
 * ولذلك أيضًا لا يُوعَد بحفظٍ أبديّ: من مسح بيانات متصفّحه ذهبت ذاكرتُه، ويُقال له ذلك
 * ولا يُدَّعى غيره.
 */

import { auth } from './firebase';
import type { JourneyPracticeAuth } from './quran-intelligence';

export interface PracticeFaceSummary {
  page: number; surahStart: number; ayahStart: number; surahEnd: number; ayahEnd: number; ayahCount: number;
}
export interface PracticeFaceCatalogue { rawiId: string; supportsFaces: boolean; wholeFaces: number; faces: PracticeFaceSummary[] }
export interface PracticeFaceWord { index: number; text: string; surah: number; ayah: number; ayahWordIndex: number; endsAyah: boolean }
export interface PracticeFacePage {
  rawiId: string; page: number; surahStart: number; ayahStart: number; surahEnd: number; ayahEnd: number;
  words: PracticeFaceWord[]; surahs: number[];
}

const journeyHeaders=(access:JourneyPracticeAuth)=>({
  'x-mizan-competition-id':access.competitionId,
  'x-mizan-journey-key':access.key,
});

async function getJson<T>(url: string, access?:JourneyPracticeAuth): Promise<T> {
  const headers:Record<string,string>={accept:'application/json'};
  if(access)Object.assign(headers,journeyHeaders(access));
  else{
    const user = auth.currentUser;
    if (!user) throw new Error('IDENTITY_REQUIRED');
    headers.authorization = `Bearer ${await user.getIdToken()}`;
  }
  const response = await fetch(url, { headers, cache: 'no-store' });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String((body as { code?: string }).code || `HTTP_${response.status}`));
  return body as T;
}

/*
 * النطاقُ يُرسل إلى الخادم ليحصر الوجوه هناك — حيث الترقيمُ وجسرُه.
 *
 * ولا يُحصر في المتصفّح: فالنطاق مكتوبٌ بالترقيم القانونيّ، وحزمةُ الرواية مرقّمةٌ
 * بترقيمها هي، والحكمُ على إحداهما بمسطرة الأخرى هو الخطأ الذي لا يُغتفر هنا.
 */
export async function fetchPracticeFaceCatalogue(deliveryKey: string, scope?: unknown, access?:JourneyPracticeAuth): Promise<PracticeFaceCatalogue> {
  const headers:Record<string,string>={'content-type':'application/json',accept:'application/json'};
  let url=`/api/quran/practice/faces?reading=${encodeURIComponent(deliveryKey)}`;
  if(access){url=`/api/public/journeys/practice/faces?reading=${encodeURIComponent(deliveryKey)}`;Object.assign(headers,journeyHeaders(access));}
  else{
    const user = auth.currentUser;
    if (!user) throw new Error('IDENTITY_REQUIRED');
    headers.authorization = `Bearer ${await user.getIdToken()}`;
  }
  const response = await fetch(url, {
    method: 'POST', cache: 'no-store', headers,
    /* المسار العام يتحقق من النطاق المخزّن في الخادم ولا يثق بنطاقٍ يرسله المتصفح. */
    body: JSON.stringify({ scope: access ? null : (scope ?? null) }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String((body as { code?: string }).code || `HTTP_${response.status}`));
  return body as PracticeFaceCatalogue;
}

export const fetchPracticeFace = (deliveryKey: string, page: number, access?:JourneyPracticeAuth) =>
  getJson<PracticeFacePage>(`${access?'/api/public/journeys/practice/face':'/api/quran/practice/face'}?reading=${encodeURIComponent(deliveryKey)}&page=${page}`, access);
