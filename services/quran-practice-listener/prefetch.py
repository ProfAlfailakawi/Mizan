"""
تنزيلُ النموذج مسبقًا في الصورة — محاولةٌ لا شرط.

إن نجح بدأ المستمعُ في ثوانٍ بعد كل نومٍ لـCloud Run (لا يُنزَّل النموذجُ من جديد عند كل
إقلاع). وإن تعثّر لم يسقط البناء — ولا نشرُ ميزان معه — ويُنزَّل عند الإقلاع كما في app.py.
"""
import os, sys

CHAIN = [m for m in [os.getenv('MIZAN_QURAN_MODEL', '').strip(), 'OdyAsh/faster-whisper-base-ar-quran', 'Systran/faster-whisper-small', 'Systran/faster-whisper-base'] if m]

try:
    from faster_whisper.utils import download_model
except Exception as exc:  # pragma: no cover
    print(f'prefetch skipped: {exc}', flush=True)
    sys.exit(0)

for model_id in dict.fromkeys(CHAIN):
    try:
        path = download_model(model_id, cache_dir='/models')
        print(f'prefetched {model_id} -> {path}', flush=True)
        break
    except Exception as exc:
        print(f'prefetch failed for {model_id}: {exc}', flush=True)
else:
    print('prefetch: no model cached; the service will download at startup', flush=True)
