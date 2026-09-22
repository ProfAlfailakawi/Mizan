FROM python:3.11-slim AS model
RUN pip install --no-cache-dir 'transformers==4.56.2' 'torch==2.8.0' 'ctranslate2==4.6.0' 'huggingface-hub==0.35.1' 'sentencepiece==0.2.1'
RUN python - <<'PY'
from huggingface_hub import snapshot_download
snapshot_download('tarteel-ai/whisper-base-ar-quran',revision='5c3c53f',local_dir='/source-model')
PY
RUN ct2-transformers-converter --model /source-model --output_dir /converted --quantization int8

FROM python:3.11-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PORT=8080 MIZAN_QURAN_MODEL=/models/tarteel-whisper MIZAN_QURAN_MODEL_REV=5c3c53f
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY --from=model /converted /models/tarteel-whisper
COPY app.py .
CMD ["sh","-c","uvicorn app:app --host 0.0.0.0 --port ${PORT}"]
