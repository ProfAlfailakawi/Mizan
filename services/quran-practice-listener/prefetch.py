"""
تنزيلُ النموذج مسبقًا في الصورة — ثم **تحميلُه** فيها للتحقّق — محاولةٌ لا شرط.

يُنزَّل النموذجُ إلى مجلّدٍ صريح (`/models/baked`) لا إلى مخبأ Hugging Face، ويُكتب اسمُه في
`/models/baked/MODEL_ID`، ثم يُحمَّل كما يحمّله الإقلاع. فإن كُتب الملفّ فالنموذجُ في الصورة
ويعمل يقينًا؛ وإن تعثّر شيءٌ لم يسقط البناء — ولا نشرُ ميزان معه — ويُنزَّل عند الإقلاع.
"""
import os, shutil, sys, time

BAKED = os.getenv('MIZAN_BAKED_MODEL_DIR', '/models/baked')
CHAIN = [m for m in [os.getenv('MIZAN_QURAN_MODEL', '').strip(), 'OdyAsh/faster-whisper-base-ar-quran', 'Systran/faster-whisper-small', 'Systran/faster-whisper-base'] if m]

try:
    from faster_whisper import WhisperModel
    from faster_whisper.utils import download_model
except Exception as exc:  # pragma: no cover
    print(f'prefetch skipped: {exc}', flush=True)
    sys.exit(0)

for model_id in dict.fromkeys(CHAIN):
    for attempt in range(1, 4):
        try:
            shutil.rmtree(BAKED, ignore_errors=True)
            os.makedirs(BAKED, exist_ok=True)
            download_model(model_id, output_dir=BAKED)
            WhisperModel(BAKED, device='cpu', compute_type='int8', cpu_threads=2)
            with open(os.path.join(BAKED, 'MODEL_ID'), 'w', encoding='utf-8') as f:
                f.write(model_id)
            print(f'MIZAN_LISTENER_MODEL_BAKED {model_id} -> {BAKED}', flush=True)
            sys.exit(0)
        except Exception as exc:
            print(f'prefetch attempt {attempt}/3 failed for {model_id}: {exc}', flush=True)
            time.sleep(5 * attempt)
shutil.rmtree(BAKED, ignore_errors=True)
print('MIZAN_LISTENER_MODEL_NOT_BAKED: the service will download at startup', flush=True)
