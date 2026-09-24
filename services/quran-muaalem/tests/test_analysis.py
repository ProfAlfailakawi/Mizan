"""
اختباراتُ منطق المعلّم — على المكتبة الحقيقية وآياتٍ حقيقية، بلا نموذج.

المسموعُ يُصنع هنا بتعديل الرسم الصوتيّ المرجعيّ تعديلًا معلومًا (حركةٌ تُبدَّل، مدٌّ يُطال،
شدّةٌ تُسقط)، فيُعرف الجوابُ الصحيح قبل السؤال — ويُقاس أنّ الملاحظةَ وقعت على الكلمة
الصحيحة، بالصياغة الصحيحة، وأنّ ما يجيزه حفص لا يُخطَّأ.
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from quran_transcript import Aya, MoshafAttributes, explain_error, quran_phonetizer  # noqa: E402

from analysis import (  # noqa: E402
    Segment, build_reference, drop_pausal, judge, map_words, parse_segment, settle, skeleton,
)

MOSHAF = MoshafAttributes(rewaya="hafs", madd_monfasel_len=4, madd_mottasel_len=4, madd_mottasel_waqf=4, madd_aared_len=4)


def face_segment(surah, ayah, words, start=None, end=None, base_index=100):
    return Segment(
        id="s", surah=surah, ayah=ayah, start_ms=0, end_ms=5000,
        ayah_words=words, word_indices=[base_index + i for i in range(len(words))],
        start=0 if start is None else start, end=len(words) - 1 if end is None else end,
    )


def run(segment, mutate):
    lib = Aya(segment.surah, segment.ayah).get().uthmani_words
    ref = build_reference(segment, lib)
    ph = quran_phonetizer(ref.uthmani, MOSHAF, remove_spaces=True)
    pred = mutate(ph.phonemes)
    errors = explain_error(uthmani_text=ref.uthmani, ref_ph_text=ph.phonemes, predicted_ph_text=pred, mappings=ph.mappings)
    return [judge(e, len(ph.phonemes), segment, ref.uthmani, ref.lib_to_face) for e in errors]


# ٧١:١٦ كما في وجه الطالب (رسم المجمع)
NUH_16 = "وَجَعَلَ ٱلۡقَمَرَ فِيهِنَّ نُورٗا وَجَعَلَ ٱلشَّمۡسَ سِرَاجٗا".split()


class WordMapping(unittest.TestCase):
    def test_same_count_maps_one_to_one(self):
        lib = Aya(71, 16).get().uthmani_words
        self.assertEqual(map_words(lib, NUH_16), list(range(7)))

    def test_hizb_symbol_is_not_a_word(self):
        lib = Aya(2, 26).get().uthmani_words
        face = ["۞"] + [w for w in lib]
        self.assertEqual(map_words(lib, face)[0], 1, "the first recited word is after ۞")

    def test_library_split_words_map_back_to_one_face_word(self):
        # ١٥:٧ — المكتبة: «لَّوْ | مَا»، والوجه: «لَّوۡمَا»
        lib = Aya(15, 7).get().uthmani_words
        face = "لَّوۡمَا تَأۡتِينَا بِٱلۡمَلَٰٓئِكَةِ إِن كُنتَ مِنَ ٱلصَّٰدِقِينَ".split()
        self.assertEqual(map_words(lib, face)[:3], [0, 0, 1])

    def test_skeleton_ignores_rasm_variants(self):
        self.assertEqual(skeleton("ٱلصَّٰدِقِينَ"), skeleton("ٱلصَّـٰدِقِينَ"))


class Judging(unittest.TestCase):
    def test_vowel_error_lands_on_its_word_in_plain_arabic(self):
        f = [x for x in run(face_segment(71, 16, NUH_16), lambda p: p.replace("وَجَعَلَ", "وَجُعَلَ", 1)) if x]
        self.assertEqual(len(f), 1)
        self.assertEqual((f[0].word_index, f[0].kind), (100, "tashkeel"))
        self.assertEqual(f[0].message_ar, "الجيم: حركتُها فتحة، وسُمعت ضمّة.")

    def test_dropped_shadda_with_ghunna_is_named(self):
        f = [x for x in run(face_segment(71, 16, NUH_16), lambda p: p.replace("ننننَ", "نَ", 1)) if x]
        self.assertEqual(len(f), 1)
        self.assertEqual(f[0].word_index, 102)
        self.assertIn("غنّة", f[0].message_ar)

    def test_overlong_natural_madd_is_flagged_with_counts(self):
        f = [x for x in run(face_segment(71, 16, NUH_16), lambda p: p.replace("فِۦۦهِ", "فِۦۦۦۦۦهِ", 1)) if x]
        self.assertEqual(len(f), 1)
        self.assertEqual((f[0].kind, f[0].expected_len, f[0].predicted_len), ("tajweed", 2, 5))
        self.assertIn("المد الطبيعي", f[0].message_ar)

    def test_what_hafs_allows_is_not_marked_wrong(self):
        # ٢:٤ «بِمَآ أُنزِلَ» مدٌّ منفصل: المرجع ٤، وخمسُ حركاتٍ جائزةٌ لحفص.
        lib = Aya(2, 4).get().uthmani_words
        seg = face_segment(2, 4, lib)
        ph = quran_phonetizer(" ".join(lib), MOSHAF, remove_spaces=True).phonemes
        self.assertIn("مَاااا", ph)
        five = [x for x in run(seg, lambda p: p.replace("مَاااا", "مَااااا", 1)) if x]
        self.assertEqual(five, [], "five counts of munfasil are valid in Hafs")
        two = [x for x in run(seg, lambda p: p.replace("مَاااا", "مَاا", 1)) if x]
        self.assertEqual(len(two), 1)
        self.assertEqual(two[0].kind, "tajweed")

    def test_the_segment_end_is_not_judged(self):
        # آخرُ الآية يُبنى مرجعُه على الوقف، ومن وصل قرأه على غيره — فلا يُحكم عليه.
        f = [x for x in run(face_segment(71, 16, NUH_16), lambda p: p[:-2] + "ن") if x]
        self.assertEqual(f, [])

    def test_a_segment_from_mid_ayah_does_not_judge_its_opening(self):
        seg = face_segment(71, 16, NUH_16, start=4)
        f = [x for x in run(seg, lambda p: "ءِ" + p[2:] if p.startswith("وَ") else p) if x]
        self.assertEqual(f, [])

    def test_clean_recitation_yields_nothing(self):
        self.assertEqual([x for x in run(face_segment(71, 16, NUH_16), lambda p: p) if x], [])


class Settling(unittest.TestCase):
    def test_low_confidence_withholds_everything(self):
        v = settle(face_segment(71, 16, NUH_16), [], 0.3, 7)
        self.assertEqual((v.status, v.reason), ("unclear", "LOW_CONFIDENCE"))

    def test_too_many_differences_means_the_segment_was_not_understood(self):
        seg = face_segment(71, 16, NUH_16)
        broken = run(seg, lambda p: "".join(ch if ch not in "َُِ" else "ُ" for ch in p))
        v = settle(seg, broken, 0.9, 7)
        self.assertEqual(v.status, "unclear")

    def test_duplicates_are_folded(self):
        seg = face_segment(71, 16, NUH_16)
        f = [x for x in run(seg, lambda p: p.replace("وَجَعَلَ", "وَجُعَلَ", 1)) if x]
        v = settle(seg, f + f, 0.9, 7)
        self.assertEqual(len(v.findings), 1)


class Parsing(unittest.TestCase):
    def test_rejects_inconsistent_segments(self):
        good = {"id": "a", "surah": 71, "ayah": 16, "startMs": 0, "endMs": 4000, "ayahWords": NUH_16, "wordIndices": list(range(7)), "from": 0, "to": 6}
        self.assertEqual(parse_segment(good, 0).end, 6)
        for bad in (dict(good, to=9), dict(good, wordIndices=[1]), dict(good, endMs=40000), dict(good, surah=200), {"surah": 1}):
            with self.assertRaises(ValueError):
                parse_segment(bad, 0)



class SlipsOfTheSimilar(unittest.TestCase):
    """زلّاتُ المتشابه بالزيادة — تُقال على كلمتها، والنَّفَسُ لا يُقال.

    يُقرأ نصُّ آيةٍ ويُقابَل بمرجع أختها التي لا تختلف عنها إلا بحرفٍ زائد (من المصحف نفسه)،
    فالرسمُ الصوتيّ المسموع هنا صحيحٌ تمامًا — والمقيسُ الحكمُ وحده.
    """

    def verdict(self, heard: tuple[int, int], reference: tuple[int, int]):
        from quran_transcript import Aya, MoshafAttributes, explain_error, quran_phonetizer
        from analysis import Segment, build_reference, judge

        moshaf = MoshafAttributes(rewaya="hafs", madd_monfasel_len=4, madd_mottasel_len=4, madd_mottasel_waqf=4, madd_aared_len=4)
        ref_words = Aya(*reference).get().uthmani_words
        heard_words = Aya(*heard).get().uthmani_words
        seg = Segment("x", reference[0], reference[1], 0, 5000, ref_words, list(range(len(ref_words))), 0, len(ref_words) - 1)
        ref = build_reference(seg, ref_words)
        ph = quran_phonetizer(ref.uthmani, moshaf, remove_spaces=True)
        got = quran_phonetizer(" ".join(heard_words), moshaf, remove_spaces=True).phonemes
        errors = explain_error(uthmani_text=ref.uthmani, ref_ph_text=ph.phonemes, predicted_ph_text=got, mappings=ph.mappings)
        return [f for f in (judge(e, len(ph.phonemes), seg, ref.uthmani, ref.lib_to_face) for e in errors) if f]

    def test_a_suffix_added_to_a_word_is_said_on_that_word(self):
        # «وَتَرَكۡنَا عَلَيۡهِمَا» (٣٧:١١٩) مكان «وَتَرَكۡنَا عَلَيۡهِ» (٣٧:١٢٩)
        found = self.verdict((37, 119), (37, 129))
        self.assertEqual([f.word_index for f in found], [1])
        self.assertIn("الميم", found[0].message_ar)

    def test_a_prefix_waw_is_said_on_the_word_it_joins(self):
        # «وَإِنَّ ٱللَّهَ» (١٩:٣٦) مكان «إِنَّ ٱللَّهَ» (٣:٥١)
        found = self.verdict((19, 36), (3, 51))
        self.assertEqual([f.word_index for f in found], [0])

    def test_waw_before_hamzat_wasl_at_the_ayah_start_is_a_slip_not_wasl(self):
        # «وَٱلۡحَمۡدُ لِلَّهِ» (٣٧:١٨٢) مكان «ٱلۡحَمۡدُ لِلَّهِ» (١:٢)
        found = self.verdict((37, 182), (1, 2))
        self.assertEqual([f.word_index for f in found], [0])

    def test_breath_and_bare_vowels_are_not_letters(self):
        from analysis import proclitic, real_insert

        for noise in ("ه", "ء", "َ", "اا", "هُ"):
            self.assertFalse(real_insert(noise), noise)
        for letter in ("وَ", "فَ", "مَ", "م", "ذَ"):
            self.assertTrue(real_insert(letter), letter)
        self.assertTrue(proclitic("وَ"))
        self.assertTrue(proclitic("فَ"))
        self.assertFalse(proclitic("مَ"))
        self.assertFalse(proclitic("مَا"))


if __name__ == "__main__":
    unittest.main()


class PauseTest(unittest.TestCase):
    """الوقفُ على أيّ كلمةٍ جائز: تسكينُ آخرها وسقوطُ الإدغام بعدها ليسا لحنًا.

    وهي أكثرُ ما عُدّ على كبار القرّاء في القياس (MIZAN-MUAALEM-BENCH-1): «نَفْسِهِۦ» و«ٱللَّهُ»
    و«حَقًّۭا وَهُوَ» — قرّاءٌ وقفوا فحُسب الوقفُ عليهم.
    """

    @staticmethod
    def phonetize(text):
        return quran_phonetizer(text, MOSHAF, remove_spaces=True)

    @staticmethod
    def explain(u, r, p, mp):
        return explain_error(uthmani_text=u, ref_ph_text=r, predicted_ph_text=p, mappings=mp)

    def run_case(self, surah, ayah, pause_after=None, edit=None):
        words = Aya(surah, ayah).get().uthmani_words
        full = " ".join(words)
        ref = self.phonetize(full)
        heard = ref.phonemes
        if pause_after is not None:
            heard = self.phonetize(" ".join(words[:pause_after])).phonemes + self.phonetize(" ".join(words[pause_after:])).phonemes
        if edit:
            heard = edit(heard)
        errors = self.explain(full, ref.phonemes, heard, ref.mappings)
        return errors, drop_pausal(errors, words, heard, self.phonetize, self.explain)

    def test_pausing_after_a_word_is_not_a_mistake(self):
        for surah, ayah, word in [(4, 111, "نفسه"), (31, 9, "حقا"), (53, 30, "العلم"), (61, 13, "قريب")]:
            words = Aya(surah, ayah).get().uthmani_words
            at = [skeleton(w) for w in words].index(skeleton(word))
            errors, kept = self.run_case(surah, ayah, pause_after=at + 1)
            self.assertTrue(errors, f"{surah}:{ayah} the continuous reference flags the pause")
            self.assertEqual(kept, [], f"{surah}:{ayah} a pause after «{word}» is excused")

    def test_a_real_mistake_survives_a_pause(self):
        # «يَكْسِبُهُۥ» بفتح الباء — لحنٌ في وسط الكلمة، والقارئ وقف بعد «نَفْسِهِۦ».
        _, kept = self.run_case(4, 111, pause_after=7, edit=lambda p: p.replace("يَكسِبُهُ", "يَكسِبَهُ", 1))
        self.assertEqual([(k.expected_ph, k.preditected_ph) for k in kept], [("بُ", "بَ")])

    def test_a_wrong_vowel_at_a_word_end_is_not_a_pause(self):
        # الوقفُ يُسكّن ولا يُبدّل: «نَفْسِهُۥ» بالضمّ خطأٌ يبقى.
        errors, kept = self.run_case(4, 111, edit=lambda p: p.replace("نَفسِهِۦۦ", "نَفسِهُۥۥ", 1))
        self.assertTrue(kept)
        self.assertEqual(len(kept), len(errors))
