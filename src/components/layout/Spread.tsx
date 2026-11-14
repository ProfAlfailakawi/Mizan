import React from 'react';

/*
 * صفحتا الكتاب — للشاشة الداخلية في iPhone Duo (عرضٌ فقط).
 *
 * المطويّ المفتوح (669×867 كتابًا طوليًّا، 951×585 عرضيًّا) كان يرسم صفحة الهاتف نفسها
 * ممدودةً على الشاشتين، فيقع خطّ الطيّ وسط البطاقات والأزرار. هنا تُقسَّم الصفحة إلى ورقتين:
 *
 *   - ورقة العمل (`mz-leaf-a`): المهمة نفسها — الطابور، القائمة، النتيجة. وهي اليمنى في العربية.
 *   - ورقة السياق (`mz-leaf-b`): أين أنا — العنوان، الهوية، التبويبات، الملخّص. وهي اليسرى.
 *
 * ما يذهب إلى ورقة السياق يُعلَّم بـ `data-duo="aside"`، فمكان العنصر ثابتٌ مهما ظهر غيره أو
 * غاب، ومفتاحه (من `Children.toArray`) ثابتٌ كذلك: لا يُعاد تركيب شيءٍ عند تغيّر الحجم أو الحالة.
 *
 * والتخطيط نفسه CSS فقط (`src/index.css`، قسم «صفحتا الكتاب»): خارج مقاس الشاشة الداخلية تبقى
 * الورقتان كتلتين متتاليتين بالتباعد نفسه (`space-y-*` يُنقل إليهما)، فلا يتغيّر بكسلٌ في الهاتف
 * ولا في الحاسوب، وتبديل المقاس لا يُعيد رسم شجرة React أبدًا.
 */
const asideOf = (node: React.ReactNode) =>
  React.isValidElement(node) && (node.props as Record<string, unknown>)['data-duo'] === 'aside';

export const Spread: React.FC<{ className?: string; as?: 'div' | 'main' | 'section'; children: React.ReactNode; [attr: string]: unknown }> = ({ className = '', as = 'div', children, ...rest }: { className?: string; as?: 'div' | 'main' | 'section'; children: React.ReactNode; [attr: string]: unknown }) => {
  const Root = as as unknown as React.ElementType;
  const items = React.Children.toArray(children);
  const aside = items.filter(asideOf);
  const main = items.filter(node => !asideOf(node));
  /* التباعد بين البطاقات يبقى كما هو: كلّ ورقة تحمل `space-y` الذي كان على الجذر. */
  const space = className.split(/\s+/).filter(c => /^(sm:|md:)?space-y-/.test(c)).join(' ');
  /* الترتيب المكدّس (الهاتف والحاسوب) يبقى ترتيب المصدر: ورقة السياق تسبق إن كانت عناصرها في
     أوّل الصفحة، وتلحق إن كانت في آخرها. والعناصر المعلَّمة متجاورةٌ في كل صفحة تستعمل هذا المكوّن. */
  const asideFirst = items.length > 0 && asideOf(items[0]);
  const leafB = <div key="b" className={`mz-leaf mz-leaf-b ${space}`}>{aside}</div>;
  const leafA = <div key="a" className={`mz-leaf mz-leaf-a ${space}`}>{main}</div>;
  return <Root className={`mz-spread ${className}`} {...rest}>{asideFirst ? [leafB, leafA] : [leafA, leafB]}</Root>;
};
