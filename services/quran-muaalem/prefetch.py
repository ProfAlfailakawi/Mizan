"""
تنزيلُ نموذج المعلّم في الصورة — محاولةٌ لا شرط.

النموذجُ نحو ٦٦٠ مليون معامل. إن نزل في البناء أقلعت الخدمةُ بعد كل نومٍ لـCloud Run دون
أن تُنزّله من جديد. وإن تعثّر لم يسقط البناء (ولا نشرُ ميزان)، ويُنزَّل عند الإقلاع في app.py.
"""
import os
import sys

MODEL_ID = os.getenv("MIZAN_MUAALEM_MODEL", "obadx/muaalem-model-v3_2").strip()
REVISION = os.getenv("MIZAN_MUAALEM_REVISION", "").strip() or None

try:
    from huggingface_hub import snapshot_download
    path = snapshot_download(repo_id=MODEL_ID, revision=REVISION)
    print(f"prefetched {MODEL_ID} -> {path}", flush=True)
except Exception as exc:
    print(f"prefetch skipped ({exc}); the service will download at startup", flush=True)
sys.exit(0)
