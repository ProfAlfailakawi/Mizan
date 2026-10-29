/*
 * الرمزُ يصل إلى الطالب ووليّ أمره رابطًا في رسالة، فأكثرُ ما يُلصق في الحقل هو الرابطُ كلُّه لا الرمز.
 * كان الرابطُ يُرسل كما هو فيعود «رمز غير صالح» والرمزُ الصحيح داخله. فيُستخرج الرمزُ من أيّ نصٍّ
 * يحمله (رابط، أو سطرٌ من الرسالة)، ويبقى ما سواه كما كُتب.
 */
export const journeyCodeFromInput = (value: string) => {
  const clean = value.trim();
  const embedded = /mz_(?:journey|guardian)_[A-Za-z0-9_-]+/.exec(clean);
  return embedded ? embedded[0] : clean;
};
