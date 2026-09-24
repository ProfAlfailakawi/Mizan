"""
منطقُ «المعلّم القرآني» في ميزان — بلا نموذج ولا صوت.

كلُّ ما يُقرِّر هنا نصٌّ وأرقام: كيف يُبنى النصُّ المرجعيُّ لمقطعٍ من آية، وكيف يُسنَد الخطأُ
إلى كلمةٍ بعينها في وجه الطالب، ومتى يُسكت عن خطأٍ لأنّ الحكمَ فيه غيرُ مأمون، وكيف تُقال
الملاحظةُ بعربيّةٍ يفهمها الطالب لا بالرسم الصوتيّ. فيُختبر كلُّه بلا نموذجٍ ولا شبكة
(`tests/test_analysis.py`)، والنموذجُ في `app.py` لا يزيد على أن يُعطي الفونيمات المسموعة.

مصدرُ القواعد: مكتبة quran-transcript (MIT) — `quran_phonetizer` يبني الرسمَ الصوتيّ للنصّ
العثمانيّ بقواعد حفص، و`explain_error` يقابل المسموعَ بالمرجع فيصنّف كلَّ فرقٍ:
«tashkeel» (حركة/شدّة)، أو «tajweed» (مدٌّ، غنّة، قلقلة…)، أو «normal» (حرف).
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Iterable, Optional

#: نسخةُ قواعد الحكم. تُرفع كلّما تغيّر ما يُقال أو ما يُسكت عنه — فتقريرُ القياس يحملها،
#: وبوّابةُ الفتح في ميزان لا تقبل تقريرًا قاس قواعدَ غيرَ التي تعمل.
ANALYSIS_VERSION = "2026-09-24.4"

# ── الحروف ─────────────────────────────────────────────────────────────────

#: حرفٌ عربيّ (ومنه همزةُ الوصل ٱ). ما لا حرفَ فيه (۞، علاماتُ الوقف) ليس كلمةً تُتلى.
LETTER = re.compile(r"[ء-غف-يٱ-ۓ]")
_DIACRITICS = re.compile(r"[ؐ-ًؚ-ٰٟۖ-ۭـ]")
_UNIFY = str.maketrans({"أ": "ا", "إ": "ا", "آ": "ا", "ٱ": "ا", "ى": "ي", "ؤ": "و", "ئ": "ي", "ة": "ه"})


def skeleton(word: str) -> str:
    """هيكلُ الكلمة: حروفُها الأصليّة بلا حركاتٍ ولا حروفٍ صغيرة، وبهمزٍ موحَّد.

    يُقابَل به رسمان عثمانيّان لا يتطابقان حرفًا حرفًا (رسمُ المجمع ورسمُ المكتبة يختلفان
    في المدّة الصغيرة والتطويل) — فتُحسب المواضعُ على ما يشتركان فيه.
    """
    base = _DIACRITICS.sub("", word).translate(_UNIFY)
    return "".join(ch for ch in base if LETTER.match(ch))


def is_word(token: str) -> bool:
    return bool(LETTER.search(token))


def map_words(lib_words: list[str], face_words: list[str]) -> list[int]:
    """لكلّ كلمةٍ من كلمات المكتبة: موضعُ الكلمة المقابلة في آية الوجه.

    لا يُعتمد على تساوي العدد: ثلاثُ آياتٍ في المصحف تُقسم فيها كلمةٌ في المكتبة كلمتين
    («لَّوۡمَا»، «مَالِيَ»، «وَمَالِيَ»)، ورمزُ الحزب «۞» كلمةٌ في الوجه ولا يُتلى. فتُحسب
    لكلّ كلمةٍ بدايتُها في سلسلة الحروف، وتُسند إلى الكلمة التي تحوي تلك البداية في الوجه.
    """
    face_skel = [skeleton(w) if is_word(w) else "" for w in face_words]
    lib_skel = [skeleton(w) for w in lib_words]
    total_face = sum(len(s) for s in face_skel) or 1
    total_lib = sum(len(s) for s in lib_skel) or 1
    face_starts: list[tuple[float, float, int]] = []
    acc = 0
    for i, s in enumerate(face_skel):
        if s:
            face_starts.append((acc / total_face, (acc + len(s)) / total_face, i))
        acc += len(s)
    out: list[int] = []
    acc = 0
    for s in lib_skel:
        mid = (acc + len(s) / 2) / total_lib  # منتصفُ الكلمة أثبتُ من طرفها
        acc += len(s)
        pos = next((i for a, b, i in face_starts if a <= mid < b), face_starts[-1][2] if face_starts else 0)
        out.append(pos)
    return out


# ── المقاطع ────────────────────────────────────────────────────────────────

@dataclass
class Segment:
    """مقطعٌ صوتيّ من آيةٍ واحدة، وكلماتُه من وجه الطالب.

    `ayah_words` كلماتُ الآية كلُّها كما في الوجه (ومنها ۞)، و`word_indices` فهارسُها في
    الوجه. والمقطعُ يغطّي `ayah_words[start:end+1]`.
    """

    id: str
    surah: int
    ayah: int
    start_ms: int
    end_ms: int
    ayah_words: list[str]
    word_indices: list[int]
    start: int
    end: int

    @property
    def opens_ayah(self) -> bool:
        return not any(is_word(w) for w in self.ayah_words[: self.start])

    @property
    def closes_ayah(self) -> bool:
        return not any(is_word(w) for w in self.ayah_words[self.end + 1 :])


@dataclass
class Reference:
    """النصُّ المرجعيّ لمقطع: كلماتُ المكتبة التي تقابله، ومن أيّ كلمةٍ في الوجه كلٌّ منها."""

    uthmani: str
    lib_to_face: list[int]  # لكلّ كلمةٍ في `uthmani`: فهرسُ كلمة الوجه


class ReferenceError(ValueError):
    pass


def build_reference(segment: Segment, lib_words: list[str]) -> Reference:
    positions = map_words(lib_words, segment.ayah_words)
    chosen = [k for k, p in enumerate(positions) if segment.start <= p <= segment.end]
    if not chosen:
        raise ReferenceError("SEGMENT_HAS_NO_WORDS")
    first, last = chosen[0], chosen[-1]
    words = lib_words[first : last + 1]
    return Reference(
        uthmani=" ".join(words),
        lib_to_face=[segment.word_indices[positions[k]] for k in range(first, last + 1)],
    )


# ── الحكم على الخطأ ─────────────────────────────────────────────────────────

#: نطاقُ ما يصحّ في رواية حفص من طريق الشاطبية (بالحركات)، مع هامشِ حركةٍ لدقّة العدّ الآليّ.
#: فالمرجعُ الآليُّ يضع رقمًا واحدًا لكلّ مدّ، والرواية تجيز نطاقًا — فلا يُخطَّأ من مدَّ
#: المنفصلَ خمسًا ولا من قصر العارضَ حركتين.
MADD_ALLOWED: dict[str, tuple[int, int]] = {
    "NormalMaddRule": (2, 3),          # الطبيعي حركتان
    "MonfaselMaddRule": (3, 6),        # ٤–٥
    "MottaselMaddRule": (3, 6),        # ٤–٥
    "MottaselMaddPauseRule": (3, 7),   # ٤–٦ وقفًا
    "LazemMaddRule": (5, 8),           # ست حركات
    "AaredMaddRule": (2, 7),           # ٢ أو ٤ أو ٦
    "LeenMaddRule": (0, 7),            # ٢–٦ وقفًا، ويُقصر وصلًا
}
#: الغنّةُ ومدُّ النون والميم المشدّدتين: تُعدّ ناقصةً إذا لم يبلغ نصفَ مقدارها.
GHUNNA_RULES = {"Ghonnah", "MoshaddadOrModghamNoonRule"}

LETTER_NAMES = {
    "ء": "الهمزة", "ب": "الباء", "ت": "التاء", "ث": "الثاء", "ج": "الجيم", "ح": "الحاء",
    "خ": "الخاء", "د": "الدال", "ذ": "الذال", "ر": "الراء", "ز": "الزاي", "س": "السين",
    "ش": "الشين", "ص": "الصاد", "ض": "الضاد", "ط": "الطاء", "ظ": "الظاء", "ع": "العين",
    "غ": "الغين", "ف": "الفاء", "ق": "القاف", "ك": "الكاف", "ل": "اللام", "م": "الميم",
    "ن": "النون", "ه": "الهاء", "و": "الواو", "ي": "الياء", "ا": "الألف",
    "ۦ": "مدّ الياء", "ۥ": "مدّ الواو", "ٲ": "الهمزة المسهّلة", "ں": "النون المخفاة",
    "۾": "الميم المخفاة", "ڇ": "القلقلة",
}
VOWEL_NAMES = {"َ": "فتحة", "ُ": "ضمّة", "ِ": "كسرة", "۪": "إمالة", "ؙ": "ضمّة مختلسة"}
VOWELS = set(VOWEL_NAMES)
MADD_LETTERS = {"ا", "ۦ", "ۥ", "ـ"}


def _vowel(group: str) -> Optional[str]:
    return group[-1] if group and group[-1] in VOWELS else None


def _base(group: str) -> str:
    return group[0] if group else ""


def _repeats(group: str) -> int:
    base = _base(group)
    n = 0
    for ch in group:
        if ch == base:
            n += 1
        else:
            break
    return n


@dataclass
class Finding:
    """ملاحظةٌ واحدةٌ على كلمةٍ واحدة — كما تُعرض للطالب."""

    word_index: int
    kind: str  # 'tashkeel' | 'tajweed' | 'letter'
    speech: str  # 'replace' | 'delete' | 'insert'
    message_ar: str
    message_en: str
    rule_ar: Optional[str] = None
    expected_len: Optional[int] = None
    predicted_len: Optional[int] = None
    #: ثقةُ النموذج بأضعف فونيمٍ في المسموع الذي بُني عليه الحكم (0–1) — تُجمع في القياس
    #: ليُختار حدُّها من الأرقام؛ ولا تصل الطالب (الخادمُ لا ينقلها).
    confidence: Optional[float] = None

    def to_json(self) -> dict:
        out = {
            "wordIndex": self.word_index, "kind": self.kind, "speech": self.speech,
            "messageAr": self.message_ar, "messageEn": self.message_en,
        }
        if self.rule_ar:
            out["ruleAr"] = self.rule_ar
        if self.expected_len is not None:
            out["expectedLen"] = self.expected_len
        if self.predicted_len is not None:
            out["predictedLen"] = self.predicted_len
        if self.confidence is not None:
            out["confidence"] = round(self.confidence, 3)
        return out


def _rule_class(rule) -> str:
    return type(rule).__name__


def _rule_ar(rule) -> str:
    try:
        return str(rule.name.ar) or _rule_class(rule)
    except Exception:
        return _rule_class(rule)


def _tashkeel_message(expected: str, heard: str) -> tuple[str, str]:
    letter = LETTER_NAMES.get(_base(expected), "الحرف")
    exp_v, got_v = _vowel(expected), _vowel(heard)
    exp_n, got_n = _repeats(expected), _repeats(heard)
    base = _base(expected)
    if exp_n >= 2 and got_n < exp_n and _base(heard) == base:
        if base in {"ن", "م"}:
            return (f"{letter} مشدّدةٌ بغنّة، وسُمعت دون شدّةٍ ولا غنّة كاملة.",
                    "A doubled, nasalised letter was heard without its full shadda and ghunna.")
        return (f"{letter} مشدّدة، وسُمعت دون شدّة.", "A doubled letter was heard without its shadda.")
    if exp_v and got_v and exp_v != got_v:
        return (f"{letter}: حركتُها {VOWEL_NAMES[exp_v]}، وسُمعت {VOWEL_NAMES[got_v]}.",
                f"The letter's vowel is {VOWEL_NAMES[exp_v]} but {VOWEL_NAMES[got_v]} was heard.")
    if exp_v and not got_v:
        return (f"{letter} متحرّكةٌ بـ{VOWEL_NAMES[exp_v]}، وسُمعت ساكنة.",
                "A vowelled letter was heard with sukun.")
    if not exp_v and got_v:
        return (f"{letter} ساكنة، وسُمعت محرّكةً بـ{VOWEL_NAMES[got_v]}.",
                "A letter with sukun was heard vowelled.")
    return (f"شكلُ {letter} على غير ما في المصحف.", "The letter's vowelling differs from the Mushaf.")


#: الزيادةُ تُقال حين يكون المسموعُ حرفًا حقيقيًّا. فالنَّفَسُ ونقرةُ الميكروفون تُسمعان همزةً أو
#: هاءً أو حركةً مجرّدة، ولا تُسمعان واوًا ولا فاءً ولا ميمًا. وزيادةُ حرفٍ حقيقيّ هي زلّةُ
#: المتشابه الأشهر: «وَإِنَّ» مكان «إِنَّ»، و«فَوَيۡلٞ» مكان «وَيۡلٞ»، و«عَلَيۡهِمَا» مكان «عَلَيۡهِ».
INSERT_NOISE = {"ء", "ه", "ڇ"}


def _inserted_letters(heard: str) -> list[str]:
    return [ch for ch in heard if ch in LETTER_NAMES and ch not in INSERT_NOISE and ch not in MADD_LETTERS]


def real_insert(heard: str) -> bool:
    """أزيادةٌ مسموعةٌ حرفًا لا نَفَسًا؟ حرفٌ صامتٌ حقيقيّ، في مقطعٍ قصير (حرفٌ أو كلمةٌ قصيرة)."""
    return bool(_inserted_letters(heard)) and len(heard) <= 10


#: حروفُ السوابق: تلتصق بالكلمة التي بعدها («وَ»، «فَ»، «بِ»، «لِ»، «كَ»، «سَ»).
PROCLITICS = {"و", "ف", "ب", "ل", "ك", "س"}


def proclitic(heard: str) -> bool:
    """أهي سابقةٌ (حرفٌ واحدٌ من السوابق بحركته)؟ فتُنسب إلى الكلمة التي بعدها لا التي قبلها."""
    letters = _inserted_letters(heard)
    return len(letters) == 1 and letters[0] in PROCLITICS and len(heard) <= 3


def _letter_message(expected: str, heard: str, speech: str) -> tuple[str, str]:
    exp_l = LETTER_NAMES.get(_base(expected), "حرف")
    if speech == "insert":
        letters = _inserted_letters(heard)
        got = LETTER_NAMES.get(letters[0], "حرف") if letters else "حرف"
        return (f"سُمع حرفٌ زائد: {got}.", "An extra letter was heard.")
    if speech == "delete" or not heard:
        return (f"لم تُسمع {exp_l}.", "A letter was not heard.")
    got_l = LETTER_NAMES.get(_base(heard), "حرفٌ آخر")
    return (f"سُمعت {got_l} مكان {exp_l}.", "A different letter was heard in its place.")


def judge(error, reference_len: int, segment: Segment, uthmani: str, lib_to_face: list[int]) -> Optional[Finding]:
    """يحوّل خطأً من `explain_error` إلى ملاحظةٍ للطالب — أو يسكت عنه إن لم يُؤمَن الحكم.

    يُسكت عن:
      ـ الزيادة (insert) التي لا حرفَ حقيقيًّا فيها: نَفَسٌ أو نقرةٌ أو حركةٌ مجرّدة. أمّا حرفٌ
        صامتٌ زائد («وَ» قبل «إِنَّ») فزلّةُ متشابهٍ تُقال (`real_insert`).
      ـ آخرِ مجموعةٍ في المقطع: المرجعُ يبنيها على الوقف، ومن وصل الآيةَ بما بعدها قرأها
        على الوصل — فالحكمُ فيها بين الوجهين ظلم.
      ـ أوّلِ مجموعةٍ حين لا يبدأ المقطعُ بأوّل الآية أو يبدأ بهمزة وصل: البدءُ من وسط الكلام
        يُسقط همزةَ الوصل صوابًا.
      ـ المدِّ الذي يقع في نطاق ما يجيزه حفص (`MADD_ALLOWED`) ولو خالف رقمَ المرجع.
    """
    ph_start, ph_end = error.ph_pos
    speech = error.speech_error_type
    noisy_insert = speech == "insert" and not real_insert(error.preditected_ph or "")
    if speech == "insert" and error.error_type == "normal" and noisy_insert:
        return None
    if ph_end >= reference_len:
        return None
    heard_ph = error.preditected_ph or ""
    if ph_start == 0:
        if not segment.opens_ayah or noisy_insert:
            return None
        # همزةُ الوصل أوّلَ المقطع تسقط وصلًا فلا يُحكم على سقوطها؛ أمّا «وَ» أو «فَ» زيدت قبلها
        # («وَٱلۡحَمۡدُ» مكان «ٱلۡحَمۡدُ») فزلّةٌ لا يصنعها الوصل، فتُقال.
        if uthmani.startswith("ٱ") and not (speech in ("insert", "replace") and proclitic(heard_ph) and _inserted_letters(heard_ph)[0] in {"و", "ف"}):
            return None

    lib_word = uthmani[: error.uthmani_pos[0]].count(" ")
    # الزيادةُ عند حدّ كلمتين تُحسب على التي بعدها؛ وهي لِما قبلها إلا أن تكون سابقة:
    # «مَا» في «عَلَيۡهِمَا» لاحقةٌ بـ«عَلَيۡهِ»، و«وَ» في «وَٱلۡحَمۡدُ» سابقةٌ لـ«ٱلۡحَمۡدُ».
    at = error.uthmani_pos[0]
    if speech == "insert" and lib_word > 0 and 0 < at <= len(uthmani) and uthmani[at - 1] == " " and not proclitic(heard_ph):
        lib_word -= 1
    lib_word = max(0, min(lib_word, len(lib_to_face) - 1))
    word_index = lib_to_face[lib_word]
    expected, heard = error.expected_ph or "", heard_ph

    if error.error_type == "tajweed":
        rules = list(error.ref_tajweed_rules or [])
        rule = rules[0] if rules else None
        name = _rule_class(rule) if rule else ""
        rule_ar = _rule_ar(rule) if rule else "حكم التجويد"
        if error.missing_tajweed_rules:
            return Finding(word_index, "tajweed", speech, f"لم تظهر {rule_ar}.",
                           f"{name or 'The tajweed rule'} was not heard.", rule_ar)
        exp_len, got_len = error.expected_len, error.predicted_len
        if exp_len is not None and got_len is not None:
            if name in MADD_ALLOWED:
                lo, hi = MADD_ALLOWED[name]
                if lo <= got_len <= hi:
                    return None
                return Finding(word_index, "tajweed", speech,
                               f"{rule_ar}: مقدارُه {exp_len} حركات، وسُمع نحو {got_len}.",
                               f"{name}: expected about {exp_len} counts, heard about {got_len}.",
                               rule_ar, exp_len, got_len)
            if name in GHUNNA_RULES:
                if got_len * 2 >= exp_len:
                    return None
                return Finding(word_index, "tajweed", speech, f"{rule_ar} ناقصة.",
                               "The ghunna was cut short.", rule_ar, exp_len, got_len)
            if got_len == exp_len:
                return None
            return Finding(word_index, "tajweed", speech,
                           f"{rule_ar}: المطلوب {exp_len}، وسُمع {got_len}.",
                           f"{name}: expected {exp_len}, heard {got_len}.", rule_ar, exp_len, got_len)
        if speech == "delete":
            return Finding(word_index, "tajweed", speech, f"لم يُسمع موضعُ {rule_ar}.",
                           "A tajweed position was not heard.", rule_ar)
        return Finding(word_index, "tajweed", speech, f"{rule_ar} على غير وجهها.",
                       "The tajweed rule was not applied as written.", rule_ar)

    if error.error_type == "tashkeel":
        ar, en = _tashkeel_message(expected, heard)
        return Finding(word_index, "tashkeel", speech, ar, en)

    ar, en = _letter_message(expected, heard, speech)
    return Finding(word_index, "letter", speech, ar, en)


def _word_of(uthmani: str, error) -> int:
    """رقمُ الكلمة (في نصّ المكتبة) التي يقع فيها الخطأ."""
    return uthmani[: error.uthmani_pos[0]].count(" ")


def paused_reference(words: list[str], boundary: int, phonetize) -> tuple[str, list]:
    """مرجعُ من وقف بعد الكلمة `boundary - 1` ثمّ ابتدأ بما بعدها — بالنصّ نفسِه والمواضع نفسِها.

    فالوقفُ جائزٌ على أيّ كلمة: يُسكَّن آخرُها، ويسقط ما بعدها من إدغامٍ أو إخفاءٍ بين الكلمتين،
    ويُنطق همزُ الوصل عند الابتداء. والمرجعُ المتّصلُ يعدّ ذلك كلَّه خطأً.
    """
    from dataclasses import replace

    first = phonetize(" ".join(words[:boundary]))
    second = phonetize(" ".join(words[boundary:]))
    shift = len(first.phonemes)
    space = replace(first.mappings[0], pos=(shift, shift), tajweed_rules=None, deleted=True)
    moved = [replace(mp, pos=(mp.pos[0] + shift, mp.pos[1] + shift)) for mp in second.mappings]
    return first.phonemes + second.phonemes, list(first.mappings) + [space] + moved


def drop_pausal(errors: list, words: list[str], predicted: str, phonetize, explain) -> list:
    """يُسقط ما يفسّره **وقفٌ** على حدّ الكلمة تفسيرًا تامًّا.

    لكلّ كلمةٍ فيها خطأ: يُجرَّب الوقفُ بعدها ثمّ قبلها. فإن طابق المسموعُ الكلمةَ كلَّها على
    ذلك الوقف (لا خطأ فيها البتّة) فما عُدّ عليها أثرُ وقفٍ لا لحن — فيُسقط كلُّه. وإن بقي فيها
    خطأٌ على الوجهين بقيت أخطاؤها كما هي: الوقفُ لا يُعذر به خطأٌ في وسط الكلمة.

    (والكلمةُ الأولى والأخيرة لا حدَّ لهما داخل المقطع، فتبقى لقواعد `judge`.)
    """
    if not errors:
        return errors
    uthmani = " ".join(words)
    flagged = sorted({_word_of(uthmani, e) for e in errors})
    cache: dict[int, set[int]] = {}

    def troubled(boundary: int) -> set[int]:
        if boundary not in cache:
            try:
                ref_ph, mappings = paused_reference(words, boundary, phonetize)
                cache[boundary] = {_word_of(uthmani, e) for e in explain(uthmani, ref_ph, predicted, mappings)}
            except Exception:
                cache[boundary] = set(range(len(words)))  # لم يُبنَ المرجع: لا يُعذر شيء
        return cache[boundary]

    excused = set()
    for word in flagged:
        for boundary in (word + 1, word):
            if 0 < boundary < len(words) and word not in troubled(boundary):
                excused.add(word)
                break
    return [e for e in errors if _word_of(uthmani, e) not in excused]


def heard_confidence(ref_ph: str, predicted: str, probs) -> dict[int, float]:
    """ثقةُ النموذج بما سُمع مكانَ كلّ مجموعةٍ في المرجع: {بدايةُ المجموعة في المرجع: أدنى ثقة}.

    يُعاد بناءُ المحاذاة **بدوالّ المكتبة نفسِها** التي يحاذي بها `explain_error` (مجموعاتُ
    الفونيمات، ومحاذاةُ أوّل حرفٍ من كلٍّ منها)، فتقع الثقةُ على المسموع الذي بُني عليه الخطأ
    بعينه. والثقةُ لكلّ حرفٍ من المسموع إن طابق عددُها عددَ حروفه؛ وإلا لم تُحسب (قاموسٌ فارغ).
    """
    try:
        values = probs.tolist() if hasattr(probs, "tolist") else list(probs or [])
    except Exception:
        return {}
    if len(values) != len(predicted):
        return {}
    from quran_transcript.phonetics.error_explainer import align_phonemes_groups, chunck_phonemes

    ref_groups, pred_groups = chunck_phonemes(ref_ph), chunck_phonemes(predicted)
    ref_starts, pred_starts, at = [], [], 0
    for g in ref_groups:
        ref_starts.append(at); at += len(g)
    at = 0
    for g in pred_groups:
        pred_starts.append(at); at += len(g)
    out: dict[int, float] = {}
    for a in align_phonemes_groups(ref_groups, pred_groups):
        if a.op_type == "insert" or a.ref_idx >= len(ref_groups) or a.pred_idx >= len(pred_groups):
            continue
        start = pred_starts[a.pred_idx]
        chunk = values[start:start + len(pred_groups[a.pred_idx])]
        if chunk:
            out[ref_starts[a.ref_idx]] = float(min(chunk))
    return out


@dataclass
class SegmentVerdict:
    id: str
    status: str  # 'ok' | 'unclear' | 'skipped'
    confidence: Optional[float] = None
    findings: list[Finding] = field(default_factory=list)
    reason: Optional[str] = None

    def to_json(self) -> dict:
        out = {"id": self.id, "status": self.status, "findings": [f.to_json() for f in self.findings]}
        if self.confidence is not None:
            out["confidence"] = round(self.confidence, 3)
        if self.reason:
            out["reason"] = self.reason
        return out


#: متوسّطُ ثقة الفونيمات دونه لا يُحكم: الصوتُ لم يبلغ المحرّكَ واضحًا.
MIN_SEGMENT_CONFIDENCE = 0.55


def settle(segment: Segment, findings: Iterable[Optional[Finding]], confidence: Optional[float], word_count: int) -> SegmentVerdict:
    """يجمع ملاحظات المقطع، ويُسقطها كلَّها إن دلّ عددُها أو الثقةُ على أنّ المقطع لم يُفهم.

    فكثرةُ الأخطاء في آيةٍ واحدة أدلُّ على أنّ الصوتَ قُصَّ في غير موضعه أو أنّ القارئَ تلا
    غيرَها — منها على أنّه أخطأ في ثلث كلماتها. والصمتُ هنا خيرٌ من قائمةِ أخطاءٍ كاذبة.
    """
    if confidence is not None and confidence < MIN_SEGMENT_CONFIDENCE:
        return SegmentVerdict(segment.id, "unclear", confidence, reason="LOW_CONFIDENCE")
    kept: list[Finding] = []
    seen: set[tuple[int, str, str]] = set()
    for f in findings:
        if f is None:
            continue
        key = (f.word_index, f.kind, f.message_ar)
        if key in seen:
            continue
        seen.add(key)
        kept.append(f)
    if len(kept) > max(6, int(0.4 * max(1, word_count))):
        return SegmentVerdict(segment.id, "unclear", confidence, reason="TOO_MANY_DIFFERENCES")
    return SegmentVerdict(segment.id, "ok", confidence, kept)


def parse_segment(raw: dict, index: int) -> Segment:
    """يقرأ مقطعًا من الطلب ولا يصدّق منه شيئًا بلا فحص."""
    try:
        words = [str(w) for w in raw["ayahWords"]]
        indices = [int(i) for i in raw["wordIndices"]]
        seg = Segment(
            id=str(raw.get("id", index))[:40], surah=int(raw["surah"]), ayah=int(raw["ayah"]),
            start_ms=int(raw["startMs"]), end_ms=int(raw["endMs"]),
            ayah_words=words, word_indices=indices, start=int(raw["from"]), end=int(raw["to"]),
        )
    except (KeyError, TypeError, ValueError) as exc:
        raise ReferenceError("SEGMENT_INVALID") from exc
    if not (1 <= seg.surah <= 114 and seg.ayah >= 1):
        raise ReferenceError("SEGMENT_INVALID")
    if len(words) != len(indices) or not (0 <= seg.start <= seg.end < len(words)):
        raise ReferenceError("SEGMENT_INVALID")
    if not (0 <= seg.start_ms < seg.end_ms) or seg.end_ms - seg.start_ms > 20_000:
        raise ReferenceError("SEGMENT_INVALID")
    return seg
