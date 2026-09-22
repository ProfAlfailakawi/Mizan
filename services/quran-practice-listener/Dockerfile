# Practice-only Quran listener.
# Consume a pinned, pre-converted CTranslate2 artifact instead of converting the
# training checkpoint during every Cloud Build release.
FROM python:3.11-slim AS model
ENV PYTHONUNBUFFERED=1
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir --timeout 120 'huggingface-hub==0.35.1'
WORKDIR /build
COPY download_model.py .
RUN python download_model.py

FROM python:3.11-slim
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8080 \
    MIZAN_QURAN_MODEL=/models/tarteel-whisper \
    MIZAN_QURAN_MODEL_REV=odyash-ct2-af9e0305a0ee90a8199ad405df0250b665d01c66

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir --timeout 120 -r requirements.txt
COPY --from=model /converted /models/tarteel-whisper
COPY app.py .
COPY verify_model.py .
RUN python verify_model.py && rm -f verify_model.py

CMD ["sh","-c","uvicorn app:app --host 0.0.0.0 --port ${PORT}"]

