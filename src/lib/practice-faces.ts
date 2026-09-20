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

export interface PracticeFaceSummary {
  page: number; surahStart: number; ayahStart: number; surahEnd: number; ayahEnd: number; ayahCount: number;
}
export interface PracticeFaceCatalogue { rawiId: string; supportsFaces: boolean; wholeFaces: number; faces: PracticeFaceSummary[] }
export interface PracticeFaceWord { index: number; text: string; surah: number; ayah: number; ayahWordIndex: number; endsAyah: boolean }
export interface PracticeFacePage {
  rawiId: string; page: number; surahStart: number; ayahStart: number; surahEnd: number; ayahEnd: number;
  words: PracticeFaceWord[]; surahs: number[];
}

async function getJson<T>(url: string): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new Error('IDENTITY_REQUIRED');
  const token = await user.getIdToken();
  const response = await fetch(url, { headers: { authorization: `Bearer ${token}`, accept: 'application/json' }, cache: 'no-store' });
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
export async function fetchPracticeFaceCatalogue(deliveryKey: string, scope?: unknown): Promise<PracticeFaceCatalogue> {
  const user = auth.currentUser;
  if (!user) throw new Error('IDENTITY_REQUIRED');
  const token = await user.getIdToken();
  const response = await fetch(`/api/quran/practice/faces?reading=${encodeURIComponent(deliveryKey)}`, {
    method: 'POST', cache: 'no-store',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ scope: scope ?? null }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String((body as { code?: string }).code || `HTTP_${response.status}`));
  return body as PracticeFaceCatalogue;
}

export const fetchPracticeFace = (deliveryKey: string, page: number) =>
  getJson<PracticeFacePage>(`/api/quran/practice/face?reading=${encodeURIComponent(deliveryKey)}&page=${page}`);
