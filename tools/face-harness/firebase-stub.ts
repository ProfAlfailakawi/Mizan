/*
 * بديلُ الهويّة في المِشْحَن — ولا يدخل بناءَ الإنتاج بحال.
 *
 * فالشاشةُ تطلب رمزًا قبل كلّ طلب، والمِشْحَنُ يشغّلها بلا مسابقةٍ ولا حساب. فيُعطى
 * رمزًا صوريًّا يقبله خادمُ المِشْحَن وحدَه. وهذا الملفُّ يُربط بـ`vite.config` الخاصّ
 * بالمِشْحَن فقط: ولا يُشار إليه من `src/` بحرف.
 *
 * وهو **يحلّ محلّ `src/lib/firebase.ts` كلِّه** لا بعضِه: كلُّ اسمٍ تستورده شيفرةُ
 * `src/` من تلك الوحدة يجب أن يجده هنا، وإلا سقطت الحزمةُ عند الاستيراد قبل أن يُرسم
 * شيء — وقد وقع ذلك حين صار `store.ts` في سلسلة استيراد الشاشة فطلب
 * `getFirestoreClient`، فسقط `qa:face-listens` بمهلةٍ لا تدلّ على السبب.
 * `tests/harness-firebase-stub.test.ts` يشتقّ المطلوبَ من استيرادات `src/` نفسِها، فلا
 * تُحفظ هنا قائمةٌ تشيخ.
 */
import type * as RealFirebase from '../../src/lib/firebase';

export const auth = {
  currentUser: {
    uid: 'harness-participant',
    getIdToken: async () => 'harness-token',
  },
};
export const db = null as unknown;

/*
 * لا Firestore في المِشْحَن، ولا مسارٌ منه يُراد أن يُمسّ: الشاشةُ تكلّم خادمَ المِشْحَن
 * بـ`fetch`. فإن وصل إليه استدعاءٌ فهو خطأٌ يجب أن يُسمع لا أن يُبتلع — يرفض بسببٍ
 * مقروء بدل أن يُعيد عميلًا مزيَّفًا يُنجح كتابةً لم تقع.
 *
 * والتوقيعُ مربوطٌ بالحقيقيّ نوعًا: إن تغيّر هناك سقط `npm run lint` هنا.
 */
export const getFirestoreClient: typeof RealFirebase.getFirestoreClient = () =>
  Promise.reject(new Error('HARNESS_NO_FIRESTORE: المِشْحَن بلا Firestore — هذا الاستدعاءُ لا ينبغي أن يقع.'));

export default { auth, db, getFirestoreClient };
