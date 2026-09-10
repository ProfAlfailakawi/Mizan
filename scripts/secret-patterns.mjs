/*
 * أنماط بيانات الاعتماد — مصدر واحد لفاحصَين.
 *
 * كان لكل سكربت قائمته: `scan-secrets` يعرف ثلاثة أنماط، و`source-audit` يعرف سبعة، ولا
 * يعلم أحدهما بالآخر. فمرّ رمز GitHub الحديث (`github_pat_…`) من كليهما — الأول لا يعرف
 * رموز GitHub أصلًا، والثاني يعرف الصيغة القديمة (`ghp_…`) وحدها.
 *
 * وهذا هو الخطأ نفسه الذي أسقط خمسة أدوار من مسار النبضة: نسختان مكتوبتان باليد تفترقان
 * بلا أن ينتبه أحد. فالقائمة هنا واحدة، ويستوردها الفاحصان.
 *
 * القاعدة في الإضافة: نمطٌ يصف بيانات اعتماد حقيقية بصيغة يصعب أن تُصادَف في نصٍّ عادي.
 * ما لا يستوفي ذلك يُترك — فإنذارٌ كاذب متكرر يُعوّد المراجعين على تجاهل الفحص كله.
 */
export const CREDENTIAL_PATTERNS = [
  { name: 'Google API key', re: /AIza[0-9A-Za-z_-]{20,}/g },
  { name: 'OpenAI-style secret', re: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}/g },
  /*
   * تُطابَق قواعد الترويسة لا قائمةُ أنواع مكتوبة باليد. النسخة السابقة عدّت الأنواع فأخطأت
   * مرتين: أضافت `PGP PRIVATE KEY` وهي ترويسة لا وجود لها — فأعطت ثقةً كاذبة — وأسقطت
   * الترويسة الحقيقية `PGP PRIVATE KEY BLOCK` وترويسة PKCS#8 المشفّرة `ENCRYPTED PRIVATE KEY`.
   * فكان مفتاحٌ خاص حقيقي يمرّ من الفاحصَين معًا.
   */
  { name: 'private key material', re: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY(?: BLOCK)?-----/g },
  { name: 'AWS access key id', re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { name: 'Google service account key', re: /"private_key_id"\s*:/g },
  { name: 'Slack token', re: /\bxox[abprs]-[A-Za-z0-9-]{10,}/g },
  /*
   * رمزا GitHub: القديم بادئته من حرفين (ghp_/gho_/ghu_/ghs_/ghr_)، والحديث دقيق الصلاحيات
   * بادئته `github_pat_` وجسمه أطول ويحمل شرطة سفلية في وسطه — فلا تكفيه صيغة القديم.
   */
  { name: 'GitHub token', re: /\bgh[pousr]_[A-Za-z0-9]{30,}/g },
  { name: 'GitHub fine-grained token', re: /\bgithub_pat_[A-Za-z0-9_]{20,}/g },
];
