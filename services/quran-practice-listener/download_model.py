import os
import sys
import shutil
import time
from huggingface_hub import snapshot_download, hf_hub_download

os.makedirs('/converted', exist_ok=True)
print('Starting model download for quran-practice-listener...', flush=True)

# 1. Download pre-converted CTranslate2 Quran model
# Use max_workers=2 and etag_timeout=120 to avoid rate limiting and connection timeouts in Cloud Build
max_retries = 5
for attempt in range(1, max_retries + 1):
    try:
        print(f'Downloading model snapshot (attempt {attempt}/{max_retries})...', flush=True)
        snapshot_download(
            'OdyAsh/faster-whisper-base-ar-quran',
            revision='af9e0305a0ee90a8199ad405df0250b665d01c66',
            local_dir='/converted',
            ignore_patterns=['README.md', '.gitattributes'],
            max_workers=2,
            etag_timeout=120,
        )
        print('Model snapshot download complete.', flush=True)
        break
    except Exception as exc:
        print(f'Error on model download attempt {attempt}/{max_retries}: {exc}', file=sys.stderr, flush=True)
        if attempt == max_retries:
            raise
        delay = attempt * 5
        print(f'Waiting {delay}s before retry...', flush=True)
        time.sleep(delay)

# 2. faster-whisper expects tokenizer.json in the local model directory.
# Fetch the exact pinned Whisper-base tokenizer so the container runtime
# is fully self-contained and operates completely offline without network requests.
for attempt in range(1, max_retries + 1):
    try:
        print(f'Downloading tokenizer.json (attempt {attempt}/{max_retries})...', flush=True)
        hf_hub_download(
            repo_id='openai/whisper-base',
            filename='tokenizer.json',
            revision='e37978b90ca9030d5170a5c07aadb050351a65bb',
            local_dir='/converted',
            etag_timeout=120,
        )
        print('Tokenizer download complete.', flush=True)
        break
    except Exception as exc:
        print(f'Error on tokenizer download attempt {attempt}/{max_retries}: {exc}', file=sys.stderr, flush=True)
        if attempt == max_retries:
            raise
        delay = attempt * 5
        print(f'Waiting {delay}s before retry...', flush=True)
        time.sleep(delay)

shutil.rmtree('/converted/.cache', ignore_errors=True)

# 3. Validate required model artifacts exist and are non-empty
required_artifacts = ['model.bin', 'config.json', 'vocabulary.json', 'tokenizer.json']
for artifact in required_artifacts:
    target_path = os.path.join('/converted', artifact)
    if not os.path.isfile(target_path) or os.path.getsize(target_path) == 0:
        raise RuntimeError(f'Required model artifact missing or empty: {target_path}')

print('All Quran practice model artifacts validated successfully.', flush=True)
