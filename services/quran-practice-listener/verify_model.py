import os
import sys

os.environ['HF_HUB_OFFLINE'] = '1'
os.environ['TRANSFORMERS_OFFLINE'] = '1'

try:
    from faster_whisper import WhisperModel
    WhisperModel('/models/tarteel-whisper', device='cpu', compute_type='int8')
    print('Quran practice model load: OK (fully offline and self-contained)', flush=True)
except Exception as err:
    print(f'FATAL: Model verification failed: {err}', file=sys.stderr, flush=True)
    raise
