/*
 * علامات الوقف في نصّ مجمع الملك فهد — جدول واحد للخادم والمتصفّح.
 *
 * كان هذا الجدول يعيش داخل مشتقّ الوقف على الخادم وحده، فبقيت معانيه بعيدة عن أي سطح
 * يقرؤه إنسان غير المحكّم. ومن احتاجها في المتصفّح كان أمامه أن يكتب جدولًا ثانيًا —
 * وجدولان لنفس العلامات يفترقان عند أول تصحيح، فتقرأ شاشتان معنيين مختلفين لعلامة واحدة.
 *
 * المعاني دلالات مضبوطة تقابل ما هو مطبوع في المصحف، لا اجتهاد ولا اشتقاق: المصدر يبقى
 * حزمة مجمع الملك فهد. والمسح أدناه يقرأ العلامات من النصّ المعتمد نفسه، فلا يُفترض وجود
 * علامة لم تَرِد فيه.
 */

export interface KfgqpcWaqfSymbol {
  symbol: string;
  codePoint: string;
  labelArabic: string;
  officialMeaning: string;
  category: 'WAQF_LAZIM' | 'NO_STOP' | 'WAQF_JAIZ' | 'WASL_PREFERRED' | 'WAQF_PREFERRED' | 'MUANAQAH' | 'SAKTAH';
}

export const KFGQPC_WAQF_REGISTRY_VERSION = 'KFGQPC-MADINAH-WAQF-SYMBOLS-1';

export const KFGQPC_WAQF_SYMBOLS: readonly KfgqpcWaqfSymbol[] = [
  { symbol: 'ۘ', codePoint: 'U+06D8', labelArabic: 'م', officialMeaning: 'وقف لازم', category: 'WAQF_LAZIM' },
  { symbol: 'ۙ', codePoint: 'U+06D9', labelArabic: 'لا', officialMeaning: 'لا وقف', category: 'NO_STOP' },
  { symbol: 'ۚ', codePoint: 'U+06DA', labelArabic: 'ج', officialMeaning: 'وقف جائز', category: 'WAQF_JAIZ' },
  { symbol: 'ۖ', codePoint: 'U+06D6', labelArabic: 'صلى', officialMeaning: 'الوصل أولى', category: 'WASL_PREFERRED' },
  { symbol: 'ۗ', codePoint: 'U+06D7', labelArabic: 'قلى', officialMeaning: 'الوقف أولى', category: 'WAQF_PREFERRED' },
  { symbol: 'ۛ', codePoint: 'U+06DB', labelArabic: '∴', officialMeaning: 'وقف التعانق', category: 'MUANAQAH' },
  { symbol: 'ۜ', codePoint: 'U+06DC', labelArabic: 'س', officialMeaning: 'سكتة', category: 'SAKTAH' },
] as const;

const BY_CHAR = new Map(KFGQPC_WAQF_SYMBOLS.map(x => [x.symbol, x]));

export interface WaqfSymbolHit extends KfgqpcWaqfSymbol {
  /** ترتيب العلامة بنقاط الترميز داخل الآية، لا بوحدات UTF-16. */
  codePointOffset: number;
}

/** علامات الوقف الواردة في نصّ آية معتمد، بترتيب ورودها. */
export function scanWaqfSymbols(text: string): WaqfSymbolHit[] {
  const out: WaqfSymbolHit[] = [];
  let codePointOffset = 0;
  for (const ch of String(text || '')) {
    const definition = BY_CHAR.get(ch);
    if (definition) out.push({ ...definition, codePointOffset });
    codePointOffset += 1;
  }
  return out;
}

/** العلامات المميّزة في الآية، مرّة واحدة لكل علامة وبترتيب أول ورود. */
export function distinctWaqfSymbols(text: string): KfgqpcWaqfSymbol[] {
  const seen = new Set<string>();
  const out: KfgqpcWaqfSymbol[] = [];
  for (const hit of scanWaqfSymbols(text)) {
    if (seen.has(hit.codePoint)) continue;
    seen.add(hit.codePoint);
    out.push({ symbol: hit.symbol, codePoint: hit.codePoint, labelArabic: hit.labelArabic, officialMeaning: hit.officialMeaning, category: hit.category });
  }
  return out;
}
