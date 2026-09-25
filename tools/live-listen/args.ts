/*
 * وسائطُ الأداة: كلُّ قيمةٍ بعد اسمها، ولا يُقبل اسمٌ لا تعرفه الأداة.
 *
 * فخٌّ قِيس في ٢٥ سبتمبر ٢٠٢٦: zsh لا يقسم `${5:+--base $5}`، فوصل «--base http://…» وسيطًا
 * واحدًا اسمُه «base http://…»، فأُهمل بصمت، وقاست جولاتٌ سُمّيت «قبل» و«بعد» الإنتاجَ نفسه.
 * فالاسمُ المجهول يوقف الجولة قبل أن تبدأ، ولا يصير قياسًا لغير ما سُمّي.
 */
export function parseArgs(argv: readonly string[], known: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const key = arg.startsWith('--') ? arg.slice(2) : null;
    if (key === null || !known.includes(key)) {
      const joined = /\s/.test(arg) ? ' — it holds a space: the shell passed «--name value» as one word' : '';
      throw new Error(`UNKNOWN_ARG «${arg}»${joined}. Known: ${known.map(k => `--${k}`).join(' ')}`);
    }
    const next = argv[i + 1];
    out[key] = next !== undefined && !next.startsWith('--') ? (i += 1, next) : 'true';
  }
  return out;
}
