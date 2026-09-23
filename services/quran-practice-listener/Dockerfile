# Practice/follow-only Quran listener.
# The model is fetched at service start (see app.py), never during the image build:
# a flaky model download used to fail the build and with it the whole Mizan release.
FROM python:3.11-slim
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8080 \
    HF_HUB_DISABLE_TELEMETRY=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir --timeout 120 -r requirements.txt
COPY app.py .

CMD ["sh","-c","uvicorn app:app --host 0.0.0.0 --port ${PORT}"]
