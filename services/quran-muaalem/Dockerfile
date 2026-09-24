# «المعلّم القرآني» في ميزان — كشفُ التشكيل والتجويد بعد التلاوة (حفص، للتدريب وحده).
#
# خدمةٌ منفصلة عن مستمع التتبّع: نموذجُها أثقل (Wav2Vec2-BERT ~660M) ولا يُحتاج إليه أثناء
# التلاوة، بل بعدها. فانفصالُه يُبقي التتبّعَ الحيَّ خفيفًا، ويُبقي تعثُّرَ أحدهما عن الآخر.
FROM python:3.11-slim
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8080 \
    HF_HOME=/models/hf \
    HF_HUB_DISABLE_TELEMETRY=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
# torch للمعالج وحده: عجلةُ PyPI الافتراضيّة تجرّ مكتبات CUDA (غيغابايتات) لا يستعملها Cloud Run.
RUN pip install --no-cache-dir --timeout 180 torch==2.8.0 --index-url https://download.pytorch.org/whl/cpu
COPY requirements.txt .
RUN pip install --no-cache-dir --timeout 180 -r requirements.txt

COPY analysis.py app.py prefetch.py ./
COPY tests ./tests
# أداةُ القياس ترافق الخدمةَ لأنّ اختباراتها تجري هنا؛ ولا يشغّلها الإنتاج.
COPY benchmark ./benchmark
# الاختباراتُ داخل الصورة، على النُّسخ نفسها: منطقُ الحكم، والخدمةُ بنموذجٍ مزيّف، والمسارُ
# الحقيقيّ بنموذجٍ صغيرٍ عشوائيّ. فصورةٌ لا تجتازها لا تُبنى — ولا تصل الإنتاج.
RUN MIZAN_MUAALEM_MODEL=/nonexistent python -m unittest discover -s tests
# محاولةُ تنزيلٍ مسبق (مهلةُ ١٥ دقيقة) لا تُسقط البناء.
RUN timeout 900 python prefetch.py || echo "muaalem prefetch skipped; runtime download will be used"

CMD ["sh","-c","uvicorn app:app --host 0.0.0.0 --port ${PORT} --workers 1"]
