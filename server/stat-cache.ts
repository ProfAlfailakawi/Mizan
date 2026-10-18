import fs from 'node:fs';

/*
 * ذاكرة مؤقتة لملف JSON محليّ تُبطَل بتغيّر بصمة الملف (inode + الحجم + وقت التعديل).
 *
 * الكتابة في هذا المشروع ذرّية بإعادة تسمية ملف مؤقت، فيتغيّر الـinode مع كل كتابة، ولا تُقدَّم نسخةٌ قديمة.
 * تُستعمل للقراءات التي لا تعدّل الحالة فقط: كانت كل طلبٍ موثَّق يقرأ ويحلّل ملفات بحجم ميغابايتات مرتين أو ثلاثًا،
 * فيختنق الخادم تحت حمل قاعة. المرجَع المُعاد مشترك: لا يجوز تعديله.
 */
export class StatCachedJson<T> {
  private sig = '';
  private value: T | undefined;
  constructor(private readonly file: string, private readonly parse: (raw: string) => T) {}
  get(): T {
    const st = fs.statSync(this.file);
    const sig = `${st.ino}:${st.size}:${st.mtimeMs}`;
    if (sig === this.sig && this.value !== undefined) return this.value;
    const value = this.parse(fs.readFileSync(this.file, 'utf8'));
    this.sig = sig; this.value = value;
    return value;
  }
  invalidate() { this.sig = ''; this.value = undefined; }
}
