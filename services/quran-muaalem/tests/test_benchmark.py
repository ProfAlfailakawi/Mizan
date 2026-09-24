"""
أداةُ القياس (`benchmark/bench.py`) — بلا شبكةٍ ولا نموذج: الأزواجُ، والعدّ، والبوّابات.
"""
import json
import os
import sys
import unittest

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
sys.path.insert(0, os.path.join(ROOT, "benchmark"))
os.environ.setdefault("MIZAN_MUAALEM_MODEL", "fake/model")

import bench  # noqa: E402
from analysis import skeleton  # noqa: E402


class Pairs(unittest.TestCase):
    """تُصنع الأخطاءُ من القرآن نفسه — ولا يُعدّ خطأً ما لا يُسمع مختلفًا."""

    CORPUS = [
        (1, 1, ["قَالَ", "هُودٌ", "يَٰقَوۡمِ", "ٱعۡبُدُواْ"]),
        (1, 2, ["قَالَ", "لُوطٌ", "يَٰقَوۡمِ", "ٱعۡبُدُواْ"]),        # حرفٌ مبدَّل في الوسط
        (2, 1, ["وَمَا", "رَبُّكَ", "بِظَلَّامٖ", "لِّلۡعَبِيدِ"]),
        (2, 2, ["وَمَا", "رَبُّكَ", "بِظَلَّـٰمٖ", "لِّلۡعَبِيدِ"]),  # رسمان لنطقٍ واحد
        (3, 1, ["وَهُوَ", "ٱلۡعَزِيزُ", "ٱلۡحَكِيمُ"]),
        (3, 2, ["وَهُوَ", "ٱلۡعَزِيزُ", "ٱلۡعَلِيمُ"]),              # الفرقُ في آخر كلمة
        (4, 1, ["مَا", "تَسۡبِقُ", "مِنۡ", "أُمَّةٍ"]),
        (4, 2, ["مَّا", "تَسۡبِقُ", "مِنۡ", "أُمَّةٍ"]),              # شدّةُ أوّلِ الآية
        (5, 1, ["فَإِذَا", "جَآءَ", "أَمۡرُنَا", "نَجَّيۡنَا"]),
        (5, 2, ["فَإِذَا", "ٱلۡتَقَى", "أَمۡرُنَا", "نَجَّيۡنَا"]),   # كلمةٌ أخرى
    ]

    @staticmethod
    def phonetic(words):
        # نطقٌ مبسَّط: الألفُ الخنجريّة ألف، ثم الهيكلُ والشدّة — «ظلام/ظلـٰم» يتّحدان، و«ما/مّا» يفترقان.
        return " ".join(skeleton(w.replace("ـٰ", "ا").replace("ٰ", "ا")) + ("ّ" if "ّ" in w else "") for w in words)

    def test_only_heard_differences_away_from_the_last_word(self):
        pairs = bench.find_pairs(self.CORPUS, 100, "t", phonetic=self.phonetic)
        found = {(p.heard, p.reference, p.position, p.kind) for p in pairs}
        self.assertIn(((1, 1), (1, 2), 1, "letters"), found)
        self.assertIn(((1, 2), (1, 1), 1, "letters"), found)
        self.assertIn(((5, 1), (5, 2), 1, "word"), found)
        heard = {p.heard for p in pairs}
        self.assertNotIn((2, 1), heard, "written differently, pronounced the same")
        self.assertNotIn((3, 1), heard, "the Teacher is silent on the last word by design")
        self.assertNotIn((4, 1), heard, "a shadda at the ayah start is idgham with the previous ayah")

    def test_the_sample_is_deterministic(self):
        a = bench.find_pairs(self.CORPUS, 3, "seed", phonetic=self.phonetic)
        b = bench.find_pairs(self.CORPUS, 3, "seed", phonetic=self.phonetic)
        self.assertEqual([(p.heard, p.reference) for p in a], [(p.heard, p.reference) for p in b])
        self.assertEqual(len(a), 3)


class Counting(unittest.TestCase):
    def test_wilson_interval(self):
        lo, hi = bench.wilson(0, 5000)
        self.assertEqual(lo, 0.0)
        self.assertLess(hi, 0.001)
        lo, hi = bench.wilson(25, 5000)
        self.assertLess(lo, 0.005)
        self.assertGreater(hi, 0.005)
        self.assertEqual(bench.wilson(0, 0), (0.0, 1.0))

    def test_the_real_service_path_scores_a_slip_and_a_clean_reading(self):
        """الصوتُ مزيّف، والمسارُ كلُّه حقيقيّ: قصُّ المقاطع، والمرجع، والحكم، والعدّ."""
        import app as service
        from quran_transcript import Aya

        ph = bench.hafs_phonetic()
        heard = {}

        class Unit:
            def __init__(self, text):
                self.text, self.probs = text, [0.95] * max(1, len(text))

        class Out:
            def __init__(self, text):
                self.phonemes = Unit(text)

        class Hears:
            def __call__(self, waves, refs, sampling_rate):
                return [Out(heard[min(heard, key=lambda n: abs(n - len(w)))]) for w in waves]

        words = lambda s, a: list(Aya(s, a).get().uthmani_words)  # noqa: E731
        slip = bench.Item("t", 37, 129, words(37, 129), np.full(32_000, 0.01, np.float32), expected=1, kind="letters", heard=(37, 119), note="عليهما ← عليه")
        heard[32_000] = ph(words(37, 119))
        clean = bench.Item("t", 71, 16, words(71, 16), np.full(48_000, 0.01, np.float32))
        heard[48_000] = ph(words(71, 16))

        recall = bench.Recall()
        bench.score_pairs([slip], bench.analyse([slip], Hears(), service.analyse_segments), recall)
        self.assertEqual((recall.items, recall.detected, recall.collateral), (1, 1, 0))

        tally = bench.Tally()
        bench.score_correct([clean], bench.analyse([clean], Hears(), service.analyse_segments), tally, {})
        self.assertEqual((tally.items, tally.flagged), (1, 0))
        self.assertEqual(tally.words, 7)

    def test_a_small_sample_never_opens_the_gate(self):
        tally = bench.Tally(items=10, words=100, flagged=0)
        recall = bench.Recall(items=10, detected=10, by_type={"letters": {"items": 10, "detected": 10, "unclear": 0}})
        report = bench.build_report(model="m", seed="s", reciters=[{"id": "a", "nameAr": "أ"}], correct=tally,
                                    per_reciter={}, recall=recall, missing={}, started=0)
        self.assertFalse(report["passes"])
        self.assertFalse(report["gates"]["sampleWords"])
        self.assertTrue(report["gates"]["falseAlarmRate"])
        self.assertIn("لا يجتاز", bench.markdown(report))
        json.dumps(report, ensure_ascii=False)

    def test_the_reciter_manifest_is_well_formed(self):
        manifest = json.load(open(os.path.join(ROOT, "benchmark", "reciters.json"), encoding="utf-8"))
        self.assertTrue(manifest["base"].startswith("https://"))
        ids = [r["id"] for r in manifest["reciters"]]
        self.assertEqual(len(ids), len(set(ids)))
        self.assertGreaterEqual(len(ids), 12)
        for r in manifest["reciters"]:
            self.assertTrue(r["folder"] and r["nameAr"] and r["why"], r)


if __name__ == "__main__":
    unittest.main()
