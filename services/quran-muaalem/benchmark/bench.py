"""
قياسُ «المعلّم» — على تلاوات كبار القرّاء، بالمسار الذي يسمع به الطلاب حرفًا حرفًا.

سؤالان لا يجيب عنهما اختبارٌ بنموذجٍ مزيّف، ويجيب عنهما هذا:

١) **الإنذارُ الكاذب**: قارئٌ متقنٌ يقرأ صوابًا — كم كلمةً يقول المعلّمُ فيها «سُمع كذا»؟
   تُؤخذ تلاواتُ كبار القرّاء آيةً آية (كلُّ آيةٍ ملفّ)، وتُمرَّر كما تُمرَّر تلاوةُ الطالب.
   وكلُّ ملاحظةٍ عليها إمّا خطأٌ كاذب، وإمّا وجهٌ لا يطابق مسطرةَ المعلّم (قصرُ المنفصل من
   طريق الطيّبة مثلًا) — والتقريرُ يفصّلها قاعدةً قاعدة ويعرض أمثلتها لتراها اللجنة.

٢) **الكشف**: حين يخطئ القارئ فعلًا — أيراه المعلّم؟ ولا تلاوةَ خاطئةً عند كبار القرّاء،
   فيُصنع الخطأُ من القرآن نفسه: آيتان متشابهتان لا تختلفان إلا في كلمةٍ واحدة (بحرفٍ أو
   بحركة — «تعملون/يعملون»)، فتُعطى تلاوةُ الأولى ومرجعُ الثانية. فالقارئُ «أخطأ» في تلك
   الكلمة وحدها، والمنتظَرُ أن يُشار إليها هي — لا إلى غيرها.

والمسارُ مسارُ الخدمة نفسُه: `app.analyse_segments` (قصُّ المقطع، وبناءُ المرجع، والحكمُ،
والسكوتُ عند الشكّ). فما يُقاس هنا هو ما يسمعه الطالب، لا تقريبٌ له.

    python benchmark/bench.py --out report.json [--ayat 60] [--pairs 120] [--seed mizan]

الصوتُ يُنزَّل إلى مجلّدٍ مؤقّت ولا يُحفظ في المستودع، والتقريرُ أرقامٌ وأمثلةٌ نصّيّة لا صوت.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import random
import subprocess
import sys
import tempfile
import time
import urllib.request
from dataclasses import dataclass, field
from typing import Callable, Iterable, Optional

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

from analysis import ANALYSIS_VERSION, is_word, skeleton  # noqa: E402

PROTOCOL = "MIZAN-MUAALEM-BENCH-1"
SAMPLE_RATE = 16_000
MAX_SEGMENT_MS = 19_500  # حدُّ المقطع في الخدمة ٢٠ ثانية
GAP = np.zeros(int(0.3 * SAMPLE_RATE), dtype=np.float32)

#: شروطُ فتح المعلّم للطلاب — تُقرأ في التقرير ويقرؤها الخادم (بوّابة `open`).
GATES = {
    "falseAlarmRateMax": 0.005,    # أقلُّ من ملاحظةٍ كاذبةٍ لكلّ ٢٠٠ كلمةٍ صحيحة
    "unclearRateMax": 0.15,        # «لم يتّضح» في تلاوةٍ واضحة
    "substitutionRecallMin": 0.80, # يرى ٨٠٪ من الكلمات المبدَّلة (بحرفٍ أو بكلمة)
    "minWords": 5_000,             # حجمُ العيّنة الأدنى ليُعتدّ بالرقم
    "minSubstitutions": 100,
}


def wilson(k: int, n: int, z: float = 1.96) -> tuple[float, float]:
    """فترةُ ثقة ٩٥٪ لنسبة — أصدقُ من «ك/ن ± خطأ» حين تصغر النسبةُ أو العيّنة."""
    if n <= 0:
        return (0.0, 1.0)
    p = k / n
    denom = 1 + z * z / n
    centre = (p + z * z / (2 * n)) / denom
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / denom
    return (max(0.0, centre - half), min(1.0, centre + half))


# ── النصّ ───────────────────────────────────────────────────────────────────

def quran_words() -> Iterable[tuple[int, int, list[str]]]:
    """كلماتُ كلّ آيةٍ في مصحف المكتبة (حفص) — ٦٢٣٦ آية."""
    from quran_transcript import Aya

    for surah in range(1, 115):
        count = Aya(surah, 1).get().num_ayat_in_sura
        for ayah in range(1, count + 1):
            yield surah, ayah, list(Aya(surah, ayah).get().uthmani_words)


def sample_ayat(corpus: list[tuple[int, int, list[str]]], n: int, seed: str, min_words: int = 3, max_words: int = 22) -> list[tuple[int, int, list[str]]]:
    """عيّنةٌ حتميّةٌ موزّعةٌ على المصحف كلّه — لا على أوّله: يُقسم المصحفُ نطاقاتٍ ويُؤخذ من كلٍّ."""
    eligible = [x for x in corpus if min_words <= sum(1 for w in x[2] if is_word(w)) <= max_words]
    if n >= len(eligible):
        return eligible
    rng = random.Random(f"{seed}:ayat")
    band = len(eligible) / n
    return [eligible[min(len(eligible) - 1, int(k * band + rng.random() * band))] for k in range(n)]


@dataclass
class Pair:
    """آيتان لا تختلفان إلا في كلمةٍ واحدة: تلاوةُ `heard` تُقابَل بمرجع `reference`."""

    heard: tuple[int, int]
    reference: tuple[int, int]
    reference_words: list[str]
    position: int
    kind: str  # 'letters' (حرفٌ أو حرفان) | 'word' (كلمةٌ أخرى) | 'harakat' (حركةٌ وحدها)
    heard_word: str
    reference_word: str


def _edit(a: str, b: str) -> int:
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


def find_pairs(corpus: Iterable[tuple[int, int, list[str]]], n: int, seed: str,
               phonetic: Optional[Callable[[list[str]], str]] = None) -> list[Pair]:
    """أزواجُ المتشابهات بكلمةٍ واحدة: يُحجب كلُّ موضعٍ بدوره، فما اتّفق نصُّه بعد الحجب اختلف فيه وحده.

    ولا يُعدّ زوجًا إلا ما **يُنطق** مختلفًا (`phonetic`: الرسمُ الصوتيّ للآية كلّها بمسطرة
    المعلّم نفسه). فـ«ظَلَّامٍ/ظَلَّـٰمٍ» رسمان لنطقٍ واحد، و«بِهَـٰدِي/بِهَـٰدِ» يُحذف ياؤهما
    وصلًا — ومحاسبةُ المعلّم على ما لا يُسمع ظلمٌ للقياس.

    ويُترك:
      ـ ما وقع في آخر كلمةٍ من الآية: المعلّمُ يسكت عن آخر المقطع عمدًا (الوقفُ والوصلُ مجهولان).
      ـ الحركةُ وحدها في أوّل الآية: شدّةُ «مَّا» أوّلَ الآية أثرُ إدغامٍ مع ما قبلها، لا تُقرأ ابتداءً.
    """
    corpus = list(corpus)
    buckets: dict[tuple, list[tuple[int, int, list[str]]]] = {}
    for surah, ayah, words in corpus:
        spoken = [i for i, w in enumerate(words) if is_word(w)]
        for i in spoken[:-1]:
            key = (len(words), i, tuple(w if k != i else "*" for k, w in enumerate(words)))
            buckets.setdefault(key, []).append((surah, ayah, words))
    candidates: list[Pair] = []
    seen: set[tuple] = set()
    for (count, i, _), group in buckets.items():
        if len(group) < 2:
            continue
        for a in group:
            for b in group:
                if a is b or a[2][i] == b[2][i] or (a[0], a[1], b[0], b[1]) in seen:
                    continue
                seen.add((a[0], a[1], b[0], b[1]))
                sa, sb = skeleton(a[2][i]), skeleton(b[2][i])
                if sa == sb:
                    if i == 0:
                        continue
                    kind = "harakat"
                else:
                    kind = "letters" if _edit(sa, sb) <= 2 else "word"
                candidates.append(Pair((a[0], a[1]), (b[0], b[1]), list(b[2]), i, kind, a[2][i], b[2][i]))
    if phonetic is not None:
        memo: dict[tuple[int, int], str] = {}
        lookup = {(s, a): w for s, a, w in corpus}

        def sound(key: tuple[int, int]) -> str:
            if key not in memo:
                memo[key] = phonetic(lookup[key])
            return memo[key]

        candidates = [p for p in candidates if sound(p.heard) != sound(p.reference)]
    candidates.sort(key=lambda p: (p.heard, p.reference))
    rng = random.Random(f"{seed}:pairs")
    rng.shuffle(candidates)
    # الحركاتُ نادرةٌ فيُحجز لها ثلثُ العيّنة، والباقي للحروف والكلمات — فلا يغلب نوعٌ على نوع.
    harakat = [p for p in candidates if p.kind == "harakat"][: n // 3]
    rest = [p for p in candidates if p.kind != "harakat"][: n - len(harakat)]
    return harakat + rest


def hafs_phonetic() -> Callable[[list[str]], str]:
    """الرسمُ الصوتيّ للآية بمسطرة المعلّم نفسها (حفص، مدودُ الخدمة)."""
    from quran_transcript import MoshafAttributes, quran_phonetizer

    moshaf = MoshafAttributes(rewaya="hafs", madd_monfasel_len=4, madd_mottasel_len=4, madd_mottasel_waqf=4, madd_aared_len=4)
    return lambda words: quran_phonetizer(" ".join(words), moshaf, remove_spaces=True).phonemes


# ── الصوت ───────────────────────────────────────────────────────────────────

def ayah_url(base: str, folder: str, surah: int, ayah: int) -> str:
    return f"{base.rstrip('/')}/{folder}/{surah:03d}{ayah:03d}.mp3"


def fetch(url: str, cache: str, tries: int = 3) -> Optional[bytes]:
    path = os.path.join(cache, url.replace("://", "_").replace("/", "_"))
    if os.path.exists(path):
        with open(path, "rb") as fh:
            return fh.read()
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "mizan-muaalem-benchmark/1"})
            with urllib.request.urlopen(req, timeout=30) as r:
                data = r.read()
            with open(path, "wb") as fh:
                fh.write(data)
            return data
        except urllib.error.HTTPError as exc:
            if exc.code == 404:
                return None
        except Exception:
            pass
        time.sleep(1.5 * (attempt + 1))
    return None


def decode(data: bytes) -> Optional[np.ndarray]:
    proc = subprocess.run(
        ["ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-i", "pipe:0",
         "-f", "f32le", "-ac", "1", "-ar", str(SAMPLE_RATE), "pipe:1"],
        input=data, capture_output=True, timeout=60,
    )
    if proc.returncode != 0 or not proc.stdout:
        return None
    return np.frombuffer(proc.stdout, dtype=np.float32)


# ── القياس ──────────────────────────────────────────────────────────────────

@dataclass
class Item:
    """آيةٌ مسموعةٌ ومرجعُها — والفرقُ المقصودُ إن كان."""

    reciter: str
    surah: int
    ayah: int
    words: list[str]  # كلماتُ المرجع (تُعطى وجهًا)
    wave: np.ndarray
    expected: Optional[int] = None  # موضعُ الكلمة المبدَّلة (أزواجُ المتشابهات)
    kind: Optional[str] = None
    heard: Optional[tuple[int, int]] = None
    note: str = ""


def segment_of(item: Item, start_ms: int, uid: str) -> dict:
    spoken = [i for i, w in enumerate(item.words) if is_word(w)]
    end_ms = start_ms + int(len(item.wave) * 1000 / SAMPLE_RATE)
    return {
        "id": uid, "surah": item.surah, "ayah": item.ayah, "startMs": start_ms, "endMs": end_ms,
        "ayahWords": item.words, "wordIndices": list(range(len(item.words))),
        "from": spoken[0], "to": spoken[-1],
    }


def analyse(items: list[Item], model, analyse_segments: Callable, chunk: int = 8) -> list[dict]:
    """يمرّر الآياتِ كما يمرّر وجهَ الطالب: صوتٌ واحدٌ متّصل ومقاطعُ بأزمنتها."""
    verdicts: list[dict] = []
    for k in range(0, len(items), chunk):
        group = items[k : k + chunk]
        parts, segments, cursor = [], [], 0
        for j, item in enumerate(group):
            segments.append(segment_of(item, int(cursor * 1000 / SAMPLE_RATE), f"{k + j}"))
            parts.extend([item.wave, GAP])
            cursor += len(item.wave) + len(GAP)
        wave = np.concatenate(parts) if parts else np.zeros(0, dtype=np.float32)
        out = {v["id"]: v for v in analyse_segments(wave, segments, model)}
        verdicts.extend(out.get(f"{k + j}", {"status": "skipped", "reason": "NO_VERDICT", "findings": []}) for j in range(len(group)))
    return verdicts


@dataclass
class Tally:
    items: int = 0
    words: int = 0
    flagged: int = 0
    unclear: int = 0
    skipped: int = 0
    by_kind: dict = field(default_factory=dict)
    by_rule: dict = field(default_factory=dict)
    #: أطوالُ المدود المسموعة لكلّ قاعدة ({القاعدة: {الطول: العدد}}) — يُعرف بها القارئُ الذي يقصر
    #: المنفصلَ من طريق الطيّبة بالأرقام، لا بالظنّ.
    madd_lengths: dict = field(default_factory=dict)
    examples: list = field(default_factory=list)
    #: لكلّ آيةٍ صحيحةٍ حُكم عليها: ملاحظاتُها بثقتها — يُبنى منها جدولُ حدّ الثقة (`confidence_sweep`).
    raw: list = field(default_factory=list)


def score_correct(items: list[Item], verdicts: list[dict], tally: Tally, per_reciter: dict, examples: int = 40) -> None:
    for item, v in zip(items, verdicts):
        r = per_reciter.setdefault(item.reciter, Tally())
        for t in (tally, r):
            t.items += 1
        if v["status"] == "unclear":
            tally.unclear += 1; r.unclear += 1
            continue
        if v["status"] != "ok":
            tally.skipped += 1; r.skipped += 1
            continue
        words = sum(1 for w in item.words if is_word(w))
        flagged = {f["wordIndex"] for f in v.get("findings", [])}
        tally.raw.append([(f["wordIndex"], f["kind"], f.get("confidence")) for f in v.get("findings", [])])
        for t in (tally, r):
            t.words += words
            t.flagged += len(flagged)
        for f in v.get("findings", []):
            tally.by_kind[f["kind"]] = tally.by_kind.get(f["kind"], 0) + 1
            rule = f.get("ruleAr") or f["kind"]
            for t in (tally, r):
                t.by_rule[rule] = t.by_rule.get(rule, 0) + 1
                if f.get("predictedLen") is not None:
                    lengths = t.madd_lengths.setdefault(rule, {})
                    key = str(f["predictedLen"])
                    lengths[key] = lengths.get(key, 0) + 1
            if len(tally.examples) < examples:
                tally.examples.append({"reciter": item.reciter, "ayah": f"{item.surah}:{item.ayah}",
                                       "word": item.words[f["wordIndex"]] if 0 <= f["wordIndex"] < len(item.words) else "",
                                       "kind": f["kind"], "messageAr": f.get("messageAr", "")})


@dataclass
class Recall:
    items: int = 0
    detected: int = 0
    unclear: int = 0
    skipped: int = 0
    collateral: int = 0
    by_type: dict = field(default_factory=dict)
    examples: list = field(default_factory=list)
    #: لكلّ زوجٍ حُكم عليه: موضعُ الزلّة، وملاحظاتُ الآية بثقتها.
    raw: list = field(default_factory=list)


def score_pairs(items: list[Item], verdicts: list[dict], rec: Recall, examples: int = 30) -> None:
    for item, v in zip(items, verdicts):
        t = rec.by_type.setdefault(item.kind, {"items": 0, "detected": 0, "unclear": 0, "skipped": 0})
        # كلُّ زلّةٍ في المقام: ما تخطّاه المحرّكُ (بلا مرجع، أو تعذّر الشرح، أو بلا حكم) فاتَه،
        # ولا يُحذف من العدّ — وإلا اجتاز محرّكٌ الشرطَ بمئة زلّةٍ سهلة وتخطّى الصعبةَ كلَّها.
        rec.items += 1; t["items"] += 1
        if v["status"] != "ok" and v["status"] != "unclear":
            rec.skipped += 1; t["skipped"] += 1
            continue
        if v["status"] == "unclear":
            rec.unclear += 1; t["unclear"] += 1
            continue
        flagged = {f["wordIndex"] for f in v.get("findings", [])}
        rec.raw.append((item.expected, [(f["wordIndex"], f["kind"], f.get("confidence")) for f in v.get("findings", [])]))
        hit = item.expected in flagged
        if hit:
            rec.detected += 1; t["detected"] += 1
        rec.collateral += len(flagged - {item.expected})
        if len(rec.examples) < examples:
            rec.examples.append({"reciter": item.reciter, "heard": f"{item.heard[0]}:{item.heard[1]}",
                                 "reference": f"{item.surah}:{item.ayah}", "word": item.note,
                                 "type": item.kind, "detected": hit,
                                 "messages": [f.get("messageAr", "") for f in v.get("findings", []) if f["wordIndex"] == item.expected]})


CONFIDENCE_STEPS = (0.0, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95)


def confidence_sweep(correct: "Tally", recall: "Recall", words: int, pairs: int) -> dict:
    """
    ماذا لو سُكت عن كلّ ملاحظةٍ ثقتُها دون حدٍّ ما؟ — لكلّ نوعٍ (letter/tashkeel/tajweed) ولها جميعًا.

    يُحسب من الملاحظات نفسِها التي خرجت في هذا القياس، فيُختار الحدُّ بالأرقام: كم ينزل الإنذارُ
    الكاذب، وكم يُفقد من الكشف. والملاحظةُ بلا ثقةٍ (حذفٌ، أو تعذّر حسابها) تبقى كما هي.
    """
    out: dict = {}
    for kind in ("letter", "tashkeel", "tajweed", "all"):
        rows = []
        for step in CONFIDENCE_STEPS:
            def kept(f):
                _, k, c = f
                return not ((kind == "all" or k == kind) and c is not None and c < step)
            false = sum(len({f[0] for f in item if kept(f)}) for item in correct.raw)
            hits = sum(1 for expected, fs in recall.raw if expected in {f[0] for f in fs if kept(f)})
            rows.append({"min": step, "falseAlarm": rate(false, words)["rate"], "recall": rate(hits, pairs)["rate"]})
        out[kind] = rows
    return out


def rate(k: int, n: int) -> dict:
    lo, hi = wilson(k, n)
    return {"k": k, "n": n, "rate": (k / n) if n else None, "ci95": [round(lo, 5), round(hi, 5)]}


def build_report(*, model: str, seed: str, reciters: list[dict], correct: Tally, per_reciter: dict, recall: Recall,
                 missing: dict, started: float) -> dict:
    fa = rate(correct.flagged, correct.words)
    # «لم يُراجَع» = ما لم يتّضح وما تُخطّي معًا، من كلّ الآيات — فالتخطّي لا يُجمِّل النسبة.
    unclear = rate(correct.unclear + correct.skipped, correct.items)
    substitution_recall = rate(recall.detected, recall.items)
    gates = {
        "falseAlarmRate": fa["rate"] is not None and fa["rate"] <= GATES["falseAlarmRateMax"],
        "unclearRate": unclear["rate"] is not None and unclear["rate"] <= GATES["unclearRateMax"],
        "substitutionRecall": substitution_recall["rate"] is not None and substitution_recall["rate"] >= GATES["substitutionRecallMin"],
        "sampleWords": correct.words >= GATES["minWords"],
        "sampleSubstitutions": recall.items >= GATES["minSubstitutions"],
    }
    return {
        "protocol": PROTOCOL, "reading": "hafs", "model": model, "analysisVersion": ANALYSIS_VERSION, "seed": seed,
        "measuredAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "durationSeconds": round(time.time() - started),
        "thresholds": GATES, "gates": gates, "passes": all(gates.values()),
        # للاختيار لا للاجتياز: الشروطُ أعلاه تُقاس بالمعلّم كما هو، لا بحدٍّ مفترض.
        "confidenceSweep": confidence_sweep(correct, recall, correct.words, recall.items),
        "correct": {"items": correct.items, "words": correct.words, "flaggedWords": correct.flagged,
                    "falseAlarm": fa, "unclear": unclear, "skipped": correct.skipped,
                    "byKind": correct.by_kind, "byRule": dict(sorted(correct.by_rule.items(), key=lambda x: -x[1])),
                    "examples": correct.examples},
        "substitutions": {"items": recall.items, "detected": recall.detected, "recall": rate(recall.detected, recall.items),
                          "unclear": recall.unclear, "skipped": recall.skipped, "collateralFlags": recall.collateral,
                          "byType": {k: {**v, "recall": rate(v["detected"], v["items"])} for k, v in recall.by_type.items()},
                          "examples": recall.examples},
        "reciters": [{"id": r["id"], "nameAr": r["nameAr"], "style": r.get("style"),
                      "items": per_reciter.get(r["id"], Tally()).items,
                      "words": per_reciter.get(r["id"], Tally()).words,
                      "flaggedWords": per_reciter.get(r["id"], Tally()).flagged,
                      "unclear": per_reciter.get(r["id"], Tally()).unclear,
                      "byRule": dict(sorted(per_reciter.get(r["id"], Tally()).by_rule.items(), key=lambda x: -x[1])),
                      "maddLengths": per_reciter.get(r["id"], Tally()).madd_lengths,
                      "missingFiles": missing.get(r["id"], 0)} for r in reciters],
        "caveats": [
            "النموذجُ دُرِّب على تلاواتِ قرّاءٍ متقنين من الشبكة، فقد يكون سمع بعضَ هؤلاء في تدريبه: رقمُ الإنذار الكاذب هنا قد يكون أحسنَ مما يلقاه الطلاب.",
            "الكشفُ يُقاس بتبديلِ كلمةٍ بين آيتين متشابهتين (حرفٌ أو حركة) — لا يقيس المدودَ والغنّةَ الناقصةَ ولا أخطاءَ المتعلّمين الحقيقيّة؛ تلك تحتاج تلاواتٍ معلومةَ الأخطاء.",
            "المعلّمُ على طريق الشاطبية: قارئٌ يقصر المنفصلَ (من طريق الطيّبة) تُحسب عليه ملاحظةُ مدّ — تُرى في «byRule».",
        ],
    }


TYPE_AR = {"letters": "بحرفٍ أو حرفين", "word": "بكلمةٍ أخرى (زلّةُ متشابه)", "harakat": "بحركةٍ وحدها"}


def markdown(report: dict) -> str:
    c, s = report["correct"], report["substitutions"]
    pct = lambda r: "—" if r["rate"] is None else f"{100 * r['rate']:.2f}% (٩٥٪: {100 * r['ci95'][0]:.2f}–{100 * r['ci95'][1]:.2f})"
    lines = [
        f"## قياسُ «المعلّم» — {'✅ يجتاز' if report['passes'] else '⛔ لا يجتاز'} شروطَ الفتح",
        "",
        f"- النموذج: `{report['model']}` · القواعد: `{report['analysisVersion']}` · البذرة: `{report['seed']}` · {report['measuredAt']}",
        f"- **الإنذارُ الكاذب** على تلاوات كبار القرّاء: {c['flaggedWords']} من {c['words']} كلمة = {pct(c['falseAlarm'])} — الحدّ {100 * report['thresholds']['falseAlarmRateMax']:.2f}%",
        f"- **لم يتّضح**: {pct(c['unclear'])} — الحدّ {100 * report['thresholds']['unclearRateMax']:.0f}%",
        f"- **الكشف** (كلمةٌ مبدَّلة بين متشابهتين): {pct(s['recall'])} — الحدّ {100 * report['thresholds']['substitutionRecallMin']:.0f}%",
    ]
    for k, v in s["byType"].items():
        lines.append(f"  - {TYPE_AR.get(k, k)}: {pct(v['recall'])}")
    lines += ["", "| القارئ | آيات | كلمات | ملاحظات كاذبة | لم يتّضح | ملفاتٌ غائبة | أكثرُ القواعد | أطوالُ المنفصل المسموعة |",
              "|---|---|---|---|---|---|---|---|"]
    for r in report["reciters"]:
        top = " · ".join(f"{k} {v}" for k, v in list(r.get("byRule", {}).items())[:3])
        munfasil = r.get("maddLengths", {}).get("المد المنفصل", {})
        lengths = " · ".join(f"{k}ح×{v}" for k, v in sorted(munfasil.items(), key=lambda x: int(x[0])))
        lines.append(f"| {r['nameAr']} | {r['items']} | {r['words']} | {r['flaggedWords']} | {r['unclear']} | {r['missingFiles']} | {top} | {lengths} |")
    sweep = report.get("confidenceSweep", {})
    if sweep:
        lines += ["", "**لو سُكت عمّا ثقتُه دون الحدّ** (للاختيار — الشروطُ أعلاه بالمعلّم كما هو):", "",
                  "| النوع | " + " | ".join(f"≥{r['min']}" for r in sweep["all"]) + " |",
                  "|---|" + "---|" * len(sweep["all"])]
        for kind, rows in sweep.items():
            cell = lambda r: "—" if r["falseAlarm"] is None else f"{100 * r['falseAlarm']:.2f}% / {100 * (r['recall'] or 0):.1f}%"  # noqa: E731
            lines.append(f"| {kind} (إنذار/كشف) | " + " | ".join(cell(r) for r in rows) + " |")
    if c["byRule"]:
        lines += ["", "**الملاحظاتُ على التلاوات الصحيحة بحسب القاعدة:** " + " · ".join(f"{k}: {v}" for k, v in list(c["byRule"].items())[:10])]
    lines += ["", "**حدود:**"] + [f"- {x}" for x in report["caveats"]]
    return "\n".join(lines)


def main(argv: Optional[list[str]] = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--reciters", default=os.path.join(HERE, "reciters.json"))
    ap.add_argument("--only", default="", help="معرّفاتُ قرّاءٍ مفصولةٌ بفواصل")
    ap.add_argument("--ayat", type=int, default=60, help="آياتٌ لكلّ قارئ")
    ap.add_argument("--pairs", type=int, default=120, help="أزواجُ متشابهاتٍ لكلّ قارئٍ من قرّاء الكشف")
    ap.add_argument("--pair-reciters", type=int, default=4)
    ap.add_argument("--seed", default="mizan")
    ap.add_argument("--out", default="muaalem-benchmark.json")
    ap.add_argument("--markdown", default="")
    ap.add_argument("--cache", default="")
    args = ap.parse_args(argv)

    import app as service  # نموذجُ الخدمة ومسارُها نفسُهما

    started = time.time()
    manifest = json.load(open(args.reciters, encoding="utf-8"))
    reciters = [r for r in manifest["reciters"] if not args.only or r["id"] in args.only.split(",")]
    cache = args.cache or tempfile.mkdtemp(prefix="muaalem-bench-")
    os.makedirs(cache, exist_ok=True)

    print(f"loading model {service.MODEL_ID} …", flush=True)
    service._load_once()
    model = service.state["model"]

    corpus = list(quran_words())
    ayat = sample_ayat(corpus, args.ayat, args.seed)
    pairs = find_pairs(corpus, args.pairs, args.seed, phonetic=hafs_phonetic())
    print(f"{len(ayat)} ayat per reciter · {len(pairs)} substitution pairs", flush=True)

    correct, per_reciter, recall, missing = Tally(), {}, Recall(), {}

    def audio(r: dict, s: int, a: int) -> Optional[np.ndarray]:
        data = fetch(ayah_url(r.get("base", manifest["base"]), r["folder"], s, a), cache)
        wave = decode(data) if data else None
        if wave is None:
            missing[r["id"]] = missing.get(r["id"], 0) + 1
            return None
        return wave if len(wave) * 1000 / SAMPLE_RATE <= MAX_SEGMENT_MS else None

    def write(final: bool) -> str:
        """يُكتب التقريرُ بعد كلّ قارئ: فإن انقضت مهلةُ العدّاء بقي ما قيس — موسومًا «جزئيًّا» لا يفتح بابًا."""
        report = build_report(model=str(service.state["version"] or service.MODEL_ID), seed=args.seed, reciters=reciters,
                              correct=correct, per_reciter=per_reciter, recall=recall, missing=missing, started=started)
        if not final:
            report["status"] = "PARTIAL"
            report["passes"] = False
        with open(args.out, "w", encoding="utf-8") as fh:
            json.dump(report, fh, ensure_ascii=False, indent=2)
        md = markdown(report)
        if args.markdown:
            with open(args.markdown, "w", encoding="utf-8") as fh:
                fh.write(md + "\n")
        return md

    # الالتقاطُ أوّلًا — هو السؤالُ الأصعب — ثم الإنذارُ الكاذب قارئًا قارئًا.
    for r in [x for x in reciters if x.get("pairs", True)][: args.pair_reciters]:
        items = []
        for p in pairs:
            w = audio(r, *p.heard)
            if w is not None:
                items.append(Item(r["id"], p.reference[0], p.reference[1], p.reference_words, w,
                                  expected=p.position, kind=p.kind, heard=p.heard, note=f"{p.heard_word} ← {p.reference_word}"))
        if items:
            score_pairs(items, analyse(items, model, service.analyse_segments), recall)
            print(f"  pairs {r['id']}: {len(items)} items · detected so far {recall.detected}/{recall.items}", flush=True)
            write(final=False)

    for r in reciters:
        items = [Item(r["id"], s, a, words, w) for s, a, words in ayat if (w := audio(r, s, a)) is not None]
        if not items:
            print(f"  {r['id']}: no audio reachable — skipped", flush=True)
            continue
        verdicts = analyse(items, model, service.analyse_segments)
        score_correct(items, verdicts, correct, per_reciter)
        t = per_reciter[r["id"]]
        print(f"  {r['id']}: {t.items} ayat · {t.words} words · {t.flagged} flagged · {t.unclear} unclear · {time.time() - started:.0f}s", flush=True)
        write(final=False)

    md = write(final=True)
    print(md, flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
