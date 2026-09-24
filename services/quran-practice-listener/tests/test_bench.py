"""اختبارُ أداة القياس نفسها — بنموذجٍ مزيّفٍ يسمع النصَّ الصحيح في وقته، فيُعرف الجوابُ قبل السؤال."""
import os
import sys
import unittest
from types import SimpleNamespace

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(HERE), 'benchmark'))
sys.path.insert(0, os.path.dirname(HERE))

import bench  # noqa: E402

AYAT = [
    {'surah': 55, 'ayah': 1, 'text': 'الرحمن'},
    {'surah': 55, 'ayah': 2, 'text': 'علم القران'},
    {'surah': 55, 'ayah': 3, 'text': 'خلق الانسان'},
    {'surah': 55, 'ayah': 4, 'text': 'علمه البيان'},
    {'surah': 55, 'ayah': 13, 'text': 'فباي الاء ربكما تكذبان'},
    {'surah': 55, 'ayah': 14, 'text': 'خلق الانسان من صلصال كالفخار'},
    {'surah': 55, 'ayah': 16, 'text': 'فباي الاء ربكما تكذبان'},
]


class TruthModel:
    """«يسمع» الكلماتِ التي انتهت داخل المقطع المعطى — بتوقيتها الحقيقيّ."""

    def __init__(self, words, ends, audio_len_s):
        self.words, self.ends, self.total = words, ends, audio_len_s
        self.calls = []

    def transcribe(self, audio, word_timestamps=False, **_):
        # المقاطعُ في الأداة تبدأ من موضعٍ يُستنتج من طولها وآخرِ نداء: يُمرَّر عبر `self.window`.
        start, head = self.window
        dur = len(audio) / bench.SR
        out = []
        for w, e in zip(self.words, self.ends):
            s = e - 0.3
            rel_s, rel_e = s - start + head, e - start + head
            if rel_s >= head - 0.01 and rel_e <= dur + 1e-6:
                out.append(SimpleNamespace(word=' ' + w, start=rel_s, end=rel_e, probability=0.99))
        text = ' '.join(x.word.strip() for x in out)
        return [SimpleNamespace(text=text, words=out if word_timestamps else None)], None


class Bench(unittest.TestCase):
    def test_rhythm_is_read_from_the_page(self):
        rh = bench.rhythm()
        self.assertEqual(set(rh), {'chunkMs', 'windowChunks', 'edgeHoldMs'})
        self.assertGreater(rh['chunkMs'], rh['edgeHoldMs'])

    def test_word_times_split_each_ayah_by_letters(self):
        ends = bench.word_times(AYAT[:2], [1.0, 2.0])
        self.assertEqual(len(ends), 3)
        self.assertAlmostEqual(ends[0], 1.0)
        self.assertAlmostEqual(ends[-1], 3.0)

    def test_frontier_follows_in_order_and_ignores_a_far_single_word(self):
        exp = bench.norm(' '.join(a['text'] for a in AYAT)).split()
        self.assertEqual(bench.follow_frontier(exp, exp[:5]), 4)
        # كلمةٌ واحدةٌ مطابِقةٌ بعيدًا لا تسحب الجبهة.
        self.assertEqual(bench.follow_frontier(exp, exp[:2] + [exp[15]]), 1)

    def test_a_perfect_listener_reveals_nothing_early(self):
        expected = [w for a in AYAT for w in bench.norm(a['text']).split()]
        dur = 1.6
        ends = bench.word_times(AYAT, [dur] * len(AYAT))
        audio = np.zeros(int(bench.SR * dur * len(AYAT)), dtype=np.float32)
        model = TruthModel(expected, ends, dur * len(AYAT))
        rh = bench.rhythm()
        chunk_s = rh['chunkMs'] / 1000
        original = model.transcribe
        state = {'i': 0, 'listen': True}

        def transcribe(audio_in, word_timestamps=False, **kw):
            # النداءان بالترتيب لكلّ مقطع: الموضعُ (المقطع) ثم الكلمات (النافذة) — والترويسةُ مقصوصةٌ منهما.
            i = state['i']
            if state['listen']:
                state['listen'] = False
                model.window = (i * chunk_s, 0.0)  # بلا ترويسة: after_header
                return original(audio_in, word_timestamps=word_timestamps, **kw)
            state['listen'] = True
            first = max(0, i - (rh['windowChunks'] - 1))
            model.window = (first * chunk_s, 0.0)
            state['i'] += 1
            return original(audio_in, word_timestamps=True, **kw)

        model.transcribe = transcribe
        out = bench.simulate(model, AYAT, audio, ends, rh)
        self.assertEqual(out['aheadEvents'], 0)
        self.assertEqual(out['revealed'], out['words'])
        self.assertLess(max(out['lags']), chunk_s + rh['edgeHoldMs'] / 1000 + 0.5)


if __name__ == '__main__':
    unittest.main()
