# MIZAN — Final GitHub repair package

الأساس الذي تم فحصه قبل بناء هذه الحزمة:
main @ 393ae1819f06aa4ec6010c04febf32db8530aa3d

سبب بقاء CI على 464/465:
ملفات الهوية والـPortal والاختبارات دخلت إلى GitHub، وكذلك APPLY_ALL_MIZAN_NOTES.py،
لكن ناتج تطبيق السكربت على الملفات الكبيرة لم يُحفَظ في commit.

ما تغير في هذه الحزمة:
- تضم الملفات الوظيفية السابقة نفسها بمساراتها الأصلية.
- تضيف workflow آلياً يعمل عند رفع الحزمة إلى main.
- الـworkflow يشغّل patcher ثم lint/tests/source-audit/Arabic-audit/build.
- لا يعمل commit إلا إذا نجحت جميع الفحوص.
- عند النجاح يحفظ الملفات الكبيرة الفعلية الناتجة في main ثم يطلب تشغيل ci.yml على HEAD الجديد.
- لا يحتاج المستخدم لتنفيذ أمر محلي.

لا يوجد wrapper folder داخل ZIP.
