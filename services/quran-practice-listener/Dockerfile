# Practice/follow-only Quran listener.
# The model is prefetched into the image when possible (fast cold starts), but a failed
# prefetch never fails the build: a flaky download used to fail the whole Mizan release.
# app.py downloads at startup whenever the image carries no model.
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
# محاولةُ تنزيلٍ مسبق لا تُسقط البناء: إن نجحت أقلع المستمعُ سريعًا بعد كل نوم.
COPY prefetch.py .
RUN timeout 900 python prefetch.py || echo "model prefetch skipped; runtime download will be used"
COPY app.py .

CMD ["sh","-c","uvicorn app:app --host 0.0.0.0 --port ${PORT}"]
