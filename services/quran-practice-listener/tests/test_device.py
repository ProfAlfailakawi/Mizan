"""اختيارُ العتاد في المستمع — بمكتبةٍ مزيّفة، فالجوابُ معروفٌ قبل السؤال."""
import os
import sys
import types
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))


class FakeWhisper:
    """يسجّل ما طُلب، ويرفض CUDA حين يُقال له."""
    cuda_available = True
    calls = []

    def __init__(self, path, **kw):
        FakeWhisper.calls.append(kw)
        if kw.get('device') == 'cuda' and not FakeWhisper.cuda_available:
            raise RuntimeError('CUDA driver version is insufficient')
        self.kw = kw


def fresh_app():
    fake = types.ModuleType('faster_whisper')
    fake.WhisperModel = FakeWhisper
    sys.modules['faster_whisper'] = fake
    sys.modules.pop('app', None)
    import app
    return app


class DeviceChoice(unittest.TestCase):
    def setUp(self):
        FakeWhisper.calls = []
        for var in ('MIZAN_LISTENER_DEVICE', 'MIZAN_GPU_COMPUTE'):
            os.environ.pop(var, None)

    def test_auto_prefers_cuda_float16(self):
        FakeWhisper.cuda_available = True
        app = fresh_app()
        app.make_model('x')
        self.assertEqual(app.state['device'], 'cuda')
        self.assertEqual(FakeWhisper.calls[-1]['compute_type'], 'float16')

    def test_auto_falls_back_to_cpu_int8(self):
        FakeWhisper.cuda_available = False
        app = fresh_app()
        app.make_model('x')
        self.assertEqual(app.state['device'], 'cpu')
        self.assertEqual(FakeWhisper.calls[-1]['compute_type'], 'int8')

    def test_cuda_is_strict_no_silent_cpu(self):
        # نشرُ GPU يسقط بصوتٍ لا يعمل ببطء CPU وثمنِ GPU.
        FakeWhisper.cuda_available = False
        os.environ['MIZAN_LISTENER_DEVICE'] = 'cuda'
        app = fresh_app()
        with self.assertRaises(RuntimeError):
            app.make_model('x')

    def test_cpu_is_explicit(self):
        FakeWhisper.cuda_available = True
        os.environ['MIZAN_LISTENER_DEVICE'] = 'cpu'
        app = fresh_app()
        app.make_model('x')
        self.assertEqual(app.state['device'], 'cpu')
        self.assertNotIn('cuda', [c.get('device') for c in FakeWhisper.calls])


if __name__ == '__main__':
    unittest.main()
