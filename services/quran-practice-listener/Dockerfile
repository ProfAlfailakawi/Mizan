# Practice-only Quran listener.
# Consume a pinned, pre-converted CTranslate2 artifact instead of converting the
# training checkpoint during every Cloud Build release.
FROM python:3.11-slim AS model
RUN pip install --no-cache-dir 'huggingface-hub==0.35.1'
RUN python - <<'PY'
from huggingface_hub import snapshot_download
snapshot_download(
    'OdyAsh/faster-whisper-base-ar-quran',
    revision='af9e0305a0ee90a8199ad405df0250b665d01c66',
    local_dir='/converted',
    ignore_patterns=['README.md', '.gitattributes'],
)
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
RUN python - <<'PY'
from faster_whisper import WhisperModel
WhisperModel('/models/tarteel-whisper', device='cpu', compute_type='int8')
print('Quran practice model load: OK')
PY

CMD ["sh","-c","uvicorn app:app --host 0.0.0.0 --port ${PORT}"]
