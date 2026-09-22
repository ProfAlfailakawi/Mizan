import os

os.environ['HF_HUB_OFFLINE'] = '1'
os.environ['TRANSFORMERS_OFFLINE'] = '1'

from faster_whisper import WhisperModel

WhisperModel('/models/tarteel-whisper', device='cpu', compute_type='int8')
print('Quran practice model load: OK (fully offline and self-contained)')
