"""
المسارُ الحقيقيّ كلُّه — صنفُ Muaalem نفسُه، وtorch وtransformers نفسُهما — على نموذجٍ صغيرٍ
بأوزانٍ عشوائيّة يُبنى هنا من مفردات المكتبة الحقيقيّة.

لا يُقاس بهذا جودةُ السماع (الأوزانُ عشوائيّة)، بل يُقاس ثلاث:
  ١) أنّ الخدمةَ تحمّل صنفَ النموذج بإعداده — وقد كان يسقط بعيبٍ في المكتبة (انظر
     `harden_config_class`).
  ٢) أنّ الاستدلالَ يمرّ من الصوت إلى الجواب بأنواع المكتبة الحقيقيّة.
  ٣) أنّ نموذجًا لا يفهم ما يسمع (ثقةٌ ضئيلة) **لا** يعود بأخطاء: يُقال «غيرُ واضح».

يُتخطّى حيث لا torch (بيئة CI لميزان)، ويجري في بناء صورة الخدمة.
"""
import base64
import json
import os
import sys
import tempfile
import time
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

try:
    import torch  # noqa: F401
    import quran_muaalem  # noqa: F401
    HAVE_STACK = True
except Exception:  # pragma: no cover
    HAVE_STACK = False


def build_tiny_model(directory: str):
    from quran_muaalem.modeling.configuration_multi_level_ctc import Wav2Vec2BertForMultilevelCTCConfig
    from quran_muaalem.modeling.modeling_multi_level_ctc import Wav2Vec2BertForMultilevelCTC
    from quran_muaalem.modeling.vocab import build_quran_phoneme_script_vocab
    from transformers import SeamlessM4TFeatureExtractor

    import app as service

    service.harden_config_class()
    Wav2Vec2BertForMultilevelCTCConfig.has_no_defaults_at_init = True
    build_quran_phoneme_script_vocab(os.path.join(directory, "vocab.json"))
    vocab = json.load(open(os.path.join(directory, "vocab.json"), encoding="utf-8"))
    cfg = Wav2Vec2BertForMultilevelCTCConfig(
        level_to_vocab_size={k: len(v) for k, v in vocab.items()}, hidden_size=32, num_hidden_layers=1,
        num_attention_heads=2, intermediate_size=64, output_hidden_size=32,
        conv_depthwise_kernel_size=3, adapter_kernel_size=3,
    )
    Wav2Vec2BertForMultilevelCTC(cfg).save_pretrained(directory)
    SeamlessM4TFeatureExtractor().save_pretrained(directory)


@unittest.skipUnless(HAVE_STACK, "torch/quran-muaalem not installed")
class RealPipeline(unittest.TestCase):
    def test_load_infer_and_withhold_when_the_model_does_not_understand(self):
        import app as service
        from fastapi.testclient import TestClient
        from test_app import segment, wav_bytes

        with tempfile.TemporaryDirectory() as d:
            build_tiny_model(d)
            service.MODEL_ID = d
            service.state.update(model=None, version=None, error=None)
            service._load_once()
            self.assertIsNotNone(service.state["model"], service.state["error"])
            client = TestClient(service.app)
            self.assertEqual(client.get("/health").status_code, 200)
            body = {"reading": "hafs", "audio": base64.b64encode(wav_bytes(4.0)).decode(), "segments": [segment()]}
            started = time.time()
            r = client.post("/analyse", content=json.dumps(body))
            self.assertEqual(r.status_code, 200, r.text)
            seg = r.json()["segments"][0]
            self.assertEqual(seg["status"], "unclear")
            self.assertEqual(seg["findings"], [])
            self.assertLess(time.time() - started, 60)
            service.state["model"] = None


if __name__ == "__main__":
    unittest.main()
