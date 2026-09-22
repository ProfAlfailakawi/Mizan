# Practice-only Quran listener.
# Consume a pinned, pre-converted CTranslate2 artifact instead of converting the
# training checkpoint during every Cloud Build release.
FROM python:3.11-slim AS model
RUN pip install --no-cache-dir 'huggingface-hub==0.35.1'
RUN python - <<'PY'
import shutil
from huggingface_hub import snapshot_download, hf_hub_download

snapshot_download(
    'OdyAsh/faster-whisper-base-ar-quran',
    revision='af9e0305a0ee90a8199ad405df0250b665d01c66',
    local_dir='/converted',
    ignore_patterns=['README.md', '.gitattributes'],
)

# faster-whisper expects tokenizer.json in the local model directory.
# Fetch the exact pinned Whisper-base tokenizer so the container runtime
# is fully self-contained and operates completely offline without network requests.
tok_path = hf_hub_download(
    repo_id='openai/whisper-base',
    filename='tokenizer.json',
    revision='e37978b90ca9030d5170a5c07aadb050351a65bb',
)
shutil.copyfile(tok_path, '/converted/tokenizer.json')
PY

FROM python:3.11-slim
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8080 \
    MIZAN_QURAN_MODEL=/models/tarteel-whisper \
    MIZAN_QURAN_MODEL_REV=odyash-ct2-af9e0305a0ee90a8199ad405df0250b665d01c66

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY --from=model /converted /models/tarteel-whisper
COPY app.py .

# Fail during image construction if the pinned artifact is incomplete/incompatible.
# Ensure offline mode to guarantee no network calls occur during runtime or container startup.
RUN python - <<'PY'
import os
os.environ['HF_HUB_OFFLINE'] = '1'
os.environ['TRANSFORMERS_OFFLINE'] = '1'
from faster_whisper import WhisperModel
WhisperModel('/models/tarteel-whisper', device='cpu', compute_type='int8')
print('Quran practice model load: OK (fully offline and self-contained)')
PY

CMD ["sh","-c","uvicorn app:app --host 0.0.0.0 --port ${PORT}"]
