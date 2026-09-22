FROM python:3.11-slim AS model

# Build-time conversion only. Use the CPU wheel explicitly: the generic Linux torch wheel
# can pull the CUDA stack into Cloud Build even though this service is CPU-only.
RUN pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cpu 'torch==2.8.0'
RUN pip install --no-cache-dir \
    'transformers==4.56.2' \
    'ctranslate2==4.6.0' \
    'huggingface-hub==0.35.1' \
    'sentencepiece==0.2.1'

ARG QURAN_MODEL_REV=5c3c53fdf9272c4f6ee0bee09a1e5a4a615ee25c
RUN python - <<'PY'
from huggingface_hub import snapshot_download
snapshot_download(
    'tarteel-ai/whisper-base-ar-quran',
    revision='5c3c53fdf9272c4f6ee0bee09a1e5a4a615ee25c',
    local_dir='/source-model',
)
PY

# faster-whisper needs the Whisper tokenizer/preprocessor assets next to the converted
# CTranslate2 weights. Copy them during conversion so the runtime is fully self-contained.
RUN ct2-transformers-converter \
    --model /source-model \
    --output_dir /converted \
    --quantization int8 \
    --force \
    --copy_files added_tokens.json normalizer.json preprocessor_config.json \
                 special_tokens_map.json tokenizer_config.json

FROM python:3.11-slim
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8080 \
    MIZAN_QURAN_MODEL=/models/tarteel-whisper \
    MIZAN_QURAN_MODEL_REV=5c3c53fdf9272c4f6ee0bee09a1e5a4a615ee25c

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY --from=model /converted /models/tarteel-whisper
COPY app.py .

# Fail the image build, not the first participant request, if the converted model is incomplete.
RUN python - <<'PY'
from faster_whisper import WhisperModel
WhisperModel('/models/tarteel-whisper', device='cpu', compute_type='int8')
print('Quran practice model load: OK')
PY

CMD ["sh","-c","uvicorn app:app --host 0.0.0.0 --port ${PORT}"]
