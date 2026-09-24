"""
الخدمةُ من طرفها إلى طرفها — بنموذجٍ مزيّفٍ «يسمع» خطأً معلومًا.

كلُّ ما عدا الشبكة العصبية حقيقيّ: طلبُ HTTP، وفكُّ الصوت بـffmpeg، وقصُّ المقاطع، وبناءُ
المرجع، وتفسيرُ الخطأ بالمكتبة، وإسنادُه إلى كلمة الوجه. فإن مرّ هذا وبقي النموذجُ وحده،
فالنموذجُ وحده ما يُقاس في النشر.
"""
import base64
import io
import json
import os
import sys
import unittest
import wave

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("MIZAN_MUAALEM_MODEL", "fake/model")

import app as service  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from quran_transcript import MoshafAttributes, quran_phonetizer  # noqa: E402

NUH_16 = "وَجَعَلَ ٱلۡقَمَرَ فِيهِنَّ نُورٗا وَجَعَلَ ٱلشَّمۡسَ سِرَاجٗا".split()


def wav_bytes(seconds: float) -> bytes:
    t = np.linspace(0, seconds, int(16000 * seconds), endpoint=False)
    pcm = (0.2 * np.sin(2 * np.pi * 220 * t) * 32767).astype("<i2")
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(16000)
        w.writeframes(pcm.tobytes())
    return buf.getvalue()


class Unit:
    def __init__(self, text, probs):
        self.text, self.probs = text, probs


class Out:
    def __init__(self, text, conf=0.93):
        self.phonemes = Unit(text, [conf] * max(1, len(text)))


class FakeModel:
    """يسمع المرجعَ نفسَه — إلا ما يُطلب أن يُخطئ فيه."""

    def __init__(self, mutate=lambda p: p, conf=0.93):
        self.mutate, self.conf, self.calls = mutate, conf, []

    def __call__(self, waves, refs, sampling_rate):
        self.calls.append([len(w) for w in waves])
        return [Out(self.mutate(r.phonemes), self.conf) for r in refs]


def segment(**over):
    base = {"id": "71:16", "surah": 71, "ayah": 16, "startMs": 200, "endMs": 3800,
            "ayahWords": NUH_16, "wordIndices": [40 + i for i in range(7)], "from": 0, "to": 6}
    base.update(over)
    return base


class Service(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(service.app)

    def post(self, model, segments, reading="hafs", seconds=4.0):
        service.state["model"], service.state["version"] = model, "fake@test"
        body = {"reading": reading, "audio": base64.b64encode(wav_bytes(seconds)).decode(), "segments": segments}
        return self.client.post("/analyse", content=json.dumps(body))

    def tearDown(self):
        service.state["model"] = None

    def test_a_vowel_error_comes_back_on_the_face_word(self):
        model = FakeModel(lambda p: p.replace("وَجَعَلَ", "وَجُعَلَ", 1))
        r = self.post(model, [segment()])
        self.assertEqual(r.status_code, 200, r.text)
        seg = r.json()["segments"][0]
        self.assertEqual(seg["status"], "ok")
        self.assertEqual(len(seg["findings"]), 1)
        f = seg["findings"][0]
        self.assertEqual((f["wordIndex"], f["kind"]), (40, "tashkeel"))
        self.assertEqual(f["messageAr"], "الجيم: حركتُها فتحة، وسُمعت ضمّة.")
        # المقطعُ قُصّ من الصوت بزمنه: ٣٫٦ ثانية.
        self.assertEqual(model.calls, [[int(3.8 * 16000) - int(0.2 * 16000)]])

    def test_clean_reading_returns_no_findings(self):
        r = self.post(FakeModel(), [segment()])
        self.assertEqual(r.json()["segments"][0], {"id": "71:16", "status": "ok", "findings": [], "confidence": 0.93})

    def test_low_confidence_is_withheld_not_guessed(self):
        r = self.post(FakeModel(lambda p: p.replace("وَجَعَلَ", "وَجُعَلَ", 1), conf=0.3), [segment()])
        seg = r.json()["segments"][0]
        self.assertEqual((seg["status"], seg["reason"], seg["findings"]), ("unclear", "LOW_CONFIDENCE", []))

    def test_other_readings_are_refused(self):
        self.assertEqual(self.post(FakeModel(), [segment()], reading="warsh").status_code, 409)

    def test_a_segment_past_the_audio_is_skipped(self):
        r = self.post(FakeModel(), [segment(startMs=9000, endMs=9900)], seconds=2.0)
        self.assertEqual(r.json()["segments"][0]["reason"], "AUDIO_TOO_SHORT")

    def test_invalid_segments_are_rejected(self):
        self.assertEqual(self.post(FakeModel(), [segment(to=12)]).status_code, 400)
        self.assertEqual(self.post(FakeModel(), []).status_code, 400)

    def test_loading_model_answers_503(self):
        service.state["model"] = None
        body = {"reading": "hafs", "audio": "", "segments": [segment()]}
        self.assertEqual(self.client.post("/analyse", content=json.dumps(body)).status_code, 503)
        self.assertEqual(self.client.get("/health").status_code, 503)

    def test_reference_is_built_from_the_segment_words_only(self):
        seen = []

        class Spy(FakeModel):
            def __call__(self, waves, refs, sampling_rate):
                seen.extend(r.phonemes for r in refs)
                return super().__call__(waves, refs, sampling_rate)

        self.post(Spy(), [segment(**{"from": 4, "to": 6})])
        m = MoshafAttributes(rewaya="hafs", madd_monfasel_len=4, madd_mottasel_len=4, madd_mottasel_waqf=4, madd_aared_len=4)
        from quran_transcript import Aya
        tail = " ".join(Aya(71, 16).get().uthmani_words[4:7])  # «وَجَعَلَ ٱلشَّمْسَ سِرَاجًۭا» بنصّ المكتبة نفسه
        expected = quran_phonetizer(tail, m, remove_spaces=True).phonemes
        self.assertEqual(seen, [expected])



class Startup(unittest.TestCase):
    """النموذجُ المخبوز يجهز قبل أوّل طلب؛ وغيرُ المخبوز يُنزَّل في الخلفية والصحّةُ تقول «أُحمّل»."""

    def setUp(self):
        self.original = service._load_once
        self.threads = []
        self.original_load_model = service.load_model
        service.load_model = lambda: self.threads.append("started")
        service.state.update(model=None, version=None, error=None)

    def tearDown(self):
        service._load_once = self.original
        service.load_model = self.original_load_model
        service.state.update(model=None, version=None, error=None)

    def test_a_baked_model_is_ready_before_the_first_request(self):
        calls = []

        def baked(local_only=False):
            calls.append(local_only)
            service.state.update(model=FakeModel(), version="baked@1", error=None)

        service._load_once = baked
        with TestClient(service.app) as client:
            self.assertEqual(client.get("/health").status_code, 200)
        self.assertEqual(calls, [True], "loaded from disk only, during startup")
        self.assertEqual(self.threads, [], "no background download when the image carries the model")

    def test_an_image_without_the_model_downloads_in_the_background(self):
        def missing(local_only=False):
            raise OSError("not cached")

        service._load_once = missing
        with TestClient(service.app) as client:
            r = client.get("/health")
            self.assertEqual(r.status_code, 503)
            self.assertEqual(r.json()["status"], "loading")
        self.assertEqual(self.threads, ["started"])

if __name__ == "__main__":
    unittest.main()
