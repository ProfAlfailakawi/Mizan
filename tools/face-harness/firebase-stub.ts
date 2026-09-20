/*
 * بديلُ الهويّة في المِشْحَن — ولا يدخل بناءَ الإنتاج بحال.
 *
 * فالشاشةُ تطلب رمزًا قبل كلّ طلب، والمِشْحَنُ يشغّلها بلا مسابقةٍ ولا حساب. فيُعطى
 * رمزًا صوريًّا يقبله خادمُ المِشْحَن وحدَه. وهذا الملفُّ يُربط بـ`vite.config` الخاصّ
 * بالمِشْحَن فقط: ولا يُشار إليه من `src/` بحرف.
 */
export const auth = {
  currentUser: {
    uid: 'harness-participant',
    getIdToken: async () => 'harness-token',
  },
};
export const db = null as unknown;
export default { auth, db };
