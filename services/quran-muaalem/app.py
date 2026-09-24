"""
خدمةُ «المعلّم القرآني» في ميزان — كشفُ التشكيل والتجويد بعد التلاوة، للتدريب وحده.

تتلقّى تسجيلَ وجهٍ واحد ومقاطعَه (آيةً آية، بأزمنتها وكلماتها من وجه الطالب)، وتعيد لكلّ
مقطعٍ ملاحظاتٍ على كلماتٍ بعينها: حركةٌ على غير وجهها، شدّةٌ لم تظهر، مدٌّ خرج عن نطاق
حفص، غنّةٌ ناقصة، حرفٌ سُمع مكان حرف.

النموذج: obadx/muaalem-model-v3_2 (Wav2Vec2-BERT، CTC متعدد المستويات، MIT) عبر مكتبة
quran-muaalem. والحكمُ على الخطأ في `analysis.py` — بلا نموذج، ومختبَرٌ على المكتبة نفسها.

ما لا تفعله:
  ـ لا تحفظ صوتًا. يُفكّ في الذاكرة ويُترك.
  ـ لا تكتب درجةً ولا دليلًا. هي مرآةُ تدريب، والحكمُ في المسابقة للبشر.
  ـ لا تقيس غيرَ حفص: الرسمُ الصوتيّ في المكتبة مبنيٌّ على حفص، وقياسُ روايةٍ بمسطرة
    أخرى ظلمٌ لقارئها.
"""
from __future__ import annotations

import asyncio
import base64
import os
import subprocess
import threading
import time
from contextlib import asynccontextmanager
from typing import Optional

import numpy as np
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse

from analysis import (
    ANALYSIS_VERSION, ReferenceError, SegmentVerdict, build_reference, drop_pausal, judge, parse_segment, settle,
)

MODEL_ID = os.getenv("MIZAN_MUAALEM_MODEL", "obadx/muaalem-model-v3_2").strip()
MODEL_REVISION = os.getenv("MIZAN_MUAALEM_REVISION", "").strip() or None
DTYPE_NAME = os.getenv("MIZAN_MUAALEM_DTYPE", "float32").strip()
BATCH = max(1, int(os.getenv("MIZAN_MUAALEM_BATCH", "4")))
MAX_BODY = 12_000_000
MAX_SEGMENTS = 12
SAMPLE_RATE = 16_000

state: dict = {"model": None, "version": None, "error": None, "started": time.time()}
infer_lock = threading.Lock()


def harden_config_class():
    """يحصّن صنفَ إعداد النموذج من عيبين في المكتبة (quran-muaalem 0.2.2) قبل التحميل.

    ١) قيمةٌ افتراضيّةٌ متغيّرة: `level_to_loss_weight={"phonemes": 0.4}` يُعدَّل في المكان
       عند أوّل إنشاء، فكلُّ إنشاءٍ افتراضيٍّ بعده يرث المستويات كلَّها.
    ٢) فحصٌ بلا هامش: 0.4 + 10×0.06 = 1.0000000000000002 بحساب الفاصلة العائمة، فيُرفض
       الإعدادُ نفسُه الذي درّبه أصحابُه.

    وأوزانُ الخسارة لا أثرَ لها في الاستدلال (تُستعمل في التدريب وحده)، فتُنسخ ويُطبَّع ما زاد
    على الواحد بفارقٍ عائم — ولا يُمسّ شيءٌ يغيّر ما يسمعه النموذج.
    """
    from quran_muaalem.modeling import configuration_multi_level_ctc as cm

    cls = cm.Wav2Vec2BertForMultilevelCTCConfig
    if getattr(cls, "_mizan_hardened", False):
        return
    original = cls.__init__

    def __init__(self, *args, level_to_loss_weight=None, **kwargs):
        weights = dict(level_to_loss_weight or {"phonemes": 0.4})
        total = sum(weights.values())
        if 1 < total <= 1 + 1e-6:
            weights = {k: v / total * (1 - 1e-9) for k, v in weights.items()}
        original(self, *args, level_to_loss_weight=weights, **kwargs)

    cls.__init__ = __init__
    cls._mizan_hardened = True


def _load_once(local_only: bool = False):
    harden_config_class()
    import torch
    from huggingface_hub import snapshot_download
    from quran_muaalem import Muaalem

    torch.set_num_threads(max(1, int(os.getenv("MIZAN_CPU_THREADS", str(os.cpu_count() or 2)))))
    if os.path.isdir(MODEL_ID):  # نموذجٌ على القرص (مخبوزٌ في الصورة، أو نموذجُ الاختبار)
        path = MODEL_ID
    else:
        try:
            path = snapshot_download(repo_id=MODEL_ID, revision=MODEL_REVISION, local_files_only=True)
        except Exception:
            if local_only:
                raise
            path = snapshot_download(repo_id=MODEL_ID, revision=MODEL_REVISION)
    dtype = getattr(torch, DTYPE_NAME, torch.float32)
    model = Muaalem(model_name_or_path=path, device="cpu", dtype=dtype)
    commit = os.path.basename(os.path.normpath(path))
    state["model"], state["version"], state["error"] = model, f"{MODEL_ID}@{commit[:12]}", None
    print(f"muaalem ready: {state['version']} dtype={DTYPE_NAME}", flush=True)


def load_model():
    # تعثّرٌ عابرٌ في التنزيل لا يُعطّل الخدمةَ إلى الأبد: تُعاد المحاولة بمهلٍ متزايدة.
    delay = 10
    while state["model"] is None:
        try:
            _load_once()
            return
        except Exception as exc:  # pragma: no cover - يُقاس في النشر
            state["error"] = str(exc)[-600:]
            print(f"muaalem load failed; retrying in {delay}s: {exc}", flush=True)
            time.sleep(delay)
            delay = min(delay * 2, 300)


def load_baked() -> bool:
    """النموذجُ المخبوز في الصورة يُحمَّل قبل أن يُفتح المنفذ — من القرص وحده.

    Cloud Run (بلا `--no-cpu-throttling`) لا يعطي الحاويةَ معالجًا إلا وهي تُقلع أو تخدم طلبًا.
    فخيطٌ خلفيٌّ يحمّل النموذجَ بعد فتح المنفذ يُخنق ولا يتقدّم إلا لحظاتِ الطلبات — وهذا
    النموذجُ نحو ستّمئة مليون معامل: كان سيبقى «يستعدّ» دهرًا. ففي طور الإقلاع يُحمَّل بالمعالج
    كاملًا ومعه `--cpu-boost`، ويمسك Cloud Run أوّلَ طلبٍ حتى يجهز.
    """
    try:
        _load_once(local_only=True)
        return True
    except Exception as exc:  # pragma: no cover - يُقاس في النشر
        print(f"muaalem: no baked model ({exc}); downloading in the background", flush=True)
        return False


@asynccontextmanager
async def lifespan(_app):
    # الصورةُ التي لا نموذجَ فيها تُنزِّله في الخلفية، والصحّةُ تقول «أُحمّل» حتى يجهز.
    if state["model"] is None and not await asyncio.to_thread(load_baked):
        threading.Thread(target=load_model, daemon=True).start()
    yield


app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None, lifespan=lifespan)


@app.get("/health")
def health():
    ready = state["model"] is not None
    body = {
        "status": "ok" if ready else ("retrying" if state["error"] else "loading"),
        "model": state["version"] or MODEL_ID,
        "mode": "PRACTICE_ONLY",
        "reading": "hafs",
        "analysis": ANALYSIS_VERSION,
    }
    return JSONResponse(body, status_code=200 if ready else 503)


def decode_audio(data: bytes) -> np.ndarray:
    """يفكّ أيَّ صيغةٍ يعرفها ffmpeg إلى 16kHz أحاديّ — في الذاكرة، ولا يكتب ملفًّا."""
    proc = subprocess.run(
        ["ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-i", "pipe:0",
         "-f", "f32le", "-ac", "1", "-ar", str(SAMPLE_RATE), "pipe:1"],
        input=data, capture_output=True, timeout=60,
    )
    if proc.returncode != 0 or not proc.stdout:
        raise HTTPException(422, "AUDIO_UNDECODABLE")
    return np.frombuffer(proc.stdout, dtype=np.float32)


def _mean_confidence(unit) -> Optional[float]:
    probs = getattr(unit, "probs", None)
    try:
        values = probs.tolist() if hasattr(probs, "tolist") else list(probs or [])
        return float(sum(values) / len(values)) if values else None
    except Exception:
        return None


def analyse_segments(wave: np.ndarray, raw_segments: list, model) -> list[dict]:
    from quran_transcript import Aya, MoshafAttributes, explain_error, quran_phonetizer

    moshaf = MoshafAttributes(rewaya="hafs", madd_monfasel_len=4, madd_mottasel_len=4, madd_mottasel_waqf=4, madd_aared_len=4)
    prepared = []
    verdicts: dict[str, dict] = {}
    order: list[str] = []
    for i, raw in enumerate(raw_segments):
        seg = parse_segment(raw, i)
        order.append(seg.id)
        a = int(seg.start_ms * SAMPLE_RATE / 1000)
        b = min(len(wave), int(seg.end_ms * SAMPLE_RATE / 1000))
        if b - a < int(0.4 * SAMPLE_RATE):
            verdicts[seg.id] = SegmentVerdict(seg.id, "skipped", reason="AUDIO_TOO_SHORT").to_json()
            continue
        try:
            ref = build_reference(seg, Aya(seg.surah, seg.ayah).get().uthmani_words)
            ph = quran_phonetizer(ref.uthmani, moshaf, remove_spaces=True)
        except Exception:
            verdicts[seg.id] = SegmentVerdict(seg.id, "skipped", reason="REFERENCE_UNAVAILABLE").to_json()
            continue
        prepared.append((seg, ref, ph, wave[a:b]))

    def infer(batch):
        with infer_lock:
            return model([x[3] for x in batch], [x[2] for x in batch], sampling_rate=SAMPLE_RATE)

    for k in range(0, len(prepared), BATCH):
        batch = prepared[k : k + BATCH]
        # فكُّ المكتبة قد يسقط على مقطعٍ بعينه (رُصد في القياس: IndexError في
        # multilevel_greedy_decode حين لا يطابق قناعُ الفونيمات المرجعَ). فلا تُسقط آيةٌ واحدةٌ
        # دفعتَها ولا مراجعةَ الطالب كلَّها: تُعاد الدفعةُ مقطعًا مقطعًا، ويُتخطّى الساقطُ وحده.
        try:
            outs = infer(batch)
        except Exception:
            outs = []
            for x in batch:
                try:
                    outs.append(infer([x])[0])
                except Exception:
                    outs.append(None)
        for (seg, ref, ph, _), out in zip(batch, outs):
            if out is None:
                verdicts[seg.id] = SegmentVerdict(seg.id, "skipped", reason="DECODE_FAILED").to_json()
                continue
            try:
                errors = explain_error(uthmani_text=ref.uthmani, ref_ph_text=ph.phonemes,
                                       predicted_ph_text=out.phonemes.text, mappings=ph.mappings)
                # وما فسّره وقفٌ جائزٌ على حدّ كلمةٍ لا يُعدّ لحنًا.
                errors = drop_pausal(errors, ref.uthmani.split(" "), out.phonemes.text,
                                     lambda text: quran_phonetizer(text, moshaf, remove_spaces=True),
                                     lambda u, r, p, mp: explain_error(uthmani_text=u, ref_ph_text=r, predicted_ph_text=p, mappings=mp))
                findings = [judge(e, len(ph.phonemes), seg, ref.uthmani, ref.lib_to_face) for e in errors]
                verdict = settle(seg, findings, _mean_confidence(out.phonemes), len(ref.lib_to_face))
            except Exception:
                verdict = SegmentVerdict(seg.id, "skipped", reason="EXPLAIN_FAILED")
            verdicts[seg.id] = verdict.to_json()
    return [verdicts[i] for i in order if i in verdicts]


@app.post("/analyse")
async def analyse(request: Request):
    model = state["model"]
    if model is None:
        raise HTTPException(503, "MODEL_LOADING" if not state["error"] else "MODEL_RETRYING")
    body = await request.body()
    if not body or len(body) > MAX_BODY:
        raise HTTPException(413, "BODY_TOO_LARGE")
    try:
        import json
        payload = json.loads(body)
        if payload.get("reading") != "hafs":
            raise HTTPException(409, "READING_NOT_SUPPORTED")
        audio = base64.b64decode(str(payload["audio"]), validate=True)
        segments = payload["segments"]
        if not isinstance(segments, list) or not (1 <= len(segments) <= MAX_SEGMENTS):
            raise ValueError("segments")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(400, "REQUEST_INVALID") from exc
    wave = decode_audio(audio)
    del audio, body
    try:
        results = analyse_segments(wave, segments, model)
    except ReferenceError as exc:
        raise HTTPException(400, str(exc)) from exc
    return {"reading": "hafs", "modelVersion": state["version"], "analysisVersion": ANALYSIS_VERSION, "segments": results}
