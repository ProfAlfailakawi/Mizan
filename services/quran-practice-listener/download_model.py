import os
import sys
import shutil
import time
import json
import urllib.request
from huggingface_hub import snapshot_download, hf_hub_download

TARGET_DIR = '/converted'
os.makedirs(TARGET_DIR, exist_ok=True)
print('Starting model acquisition for quran-practice-listener...', flush=True)

MODEL_REPO = 'OdyAsh/faster-whisper-base-ar-quran'
MODEL_REV = 'af9e0305a0ee90a8199ad405df0250b665d01c66'
TOKENIZER_REPO = 'openai/whisper-base'
TOKENIZER_REV = 'e37978b90ca9030d5170a5c07aadb050351a65bb'

DIRECT_URLS = {
    'model.bin': f'https://huggingface.co/{MODEL_REPO}/resolve/{MODEL_REV}/model.bin',
    'config.json': f'https://huggingface.co/{MODEL_REPO}/resolve/{MODEL_REV}/config.json',
    'vocabulary.json': f'https://huggingface.co/{MODEL_REPO}/resolve/{MODEL_REV}/vocabulary.json',
    'preprocessor_config.json': f'https://huggingface.co/{MODEL_REPO}/resolve/{MODEL_REV}/preprocessor_config.json',
    'tokenizer.json': f'https://huggingface.co/{TOKENIZER_REPO}/resolve/{TOKENIZER_REV}/tokenizer.json',
}

def direct_download(filename: str, url: str, max_retries: int = 5) -> None:
    dest_path = os.path.join(TARGET_DIR, filename)
    tmp_path = dest_path + '.tmp'
    for attempt in range(1, max_retries + 1):
        try:
            print(f'Direct downloading {filename} via HTTPS (attempt {attempt}/{max_retries})...', flush=True)
            req = urllib.request.Request(
                url,
                headers={'User-Agent': 'Mozilla/5.0 (compatible; MizanQuranListener/1.0)'}
            )
            with urllib.request.urlopen(req, timeout=180) as resp, open(tmp_path, 'wb') as f:
                while True:
                    chunk = resp.read(1024 * 1024)
                    if not chunk:
                        break
                    f.write(chunk)
            os.replace(tmp_path, dest_path)
            print(f'Direct download completed: {filename} ({os.path.getsize(dest_path)} bytes)', flush=True)
            return
        except Exception as exc:
            print(f'Error during direct download of {filename} (attempt {attempt}/{max_retries}): {exc}', file=sys.stderr, flush=True)
            if os.path.exists(tmp_path):
                try:
                    os.remove(tmp_path)
                except OSError:
                    pass
            if attempt == max_retries:
                raise
            time.sleep(attempt * 3)

# 1. Primary download: HuggingFace Hub snapshot
max_retries = 3
hub_success = False
for attempt in range(1, max_retries + 1):
    try:
        print(f'Downloading model snapshot via huggingface_hub (attempt {attempt}/{max_retries})...', flush=True)
        snapshot_download(
            MODEL_REPO,
            revision=MODEL_REV,
            local_dir=TARGET_DIR,
            ignore_patterns=['README.md', '.gitattributes'],
            max_workers=2,
            etag_timeout=120,
        )
        print('Model snapshot download complete.', flush=True)
        hub_success = True
        break
    except Exception as exc:
        print(f'HuggingFace snapshot warning (attempt {attempt}/{max_retries}): {exc}', file=sys.stderr, flush=True)
        time.sleep(attempt * 3)

# 2. Tokenizer download via HuggingFace Hub
tok_success = False
for attempt in range(1, max_retries + 1):
    try:
        print(f'Downloading tokenizer.json via huggingface_hub (attempt {attempt}/{max_retries})...', flush=True)
        hf_hub_download(
            repo_id=TOKENIZER_REPO,
            filename='tokenizer.json',
            revision=TOKENIZER_REV,
            local_dir=TARGET_DIR,
            etag_timeout=120,
        )
        print('Tokenizer download complete.', flush=True)
        tok_success = True
        break
    except Exception as exc:
        print(f'HuggingFace tokenizer warning (attempt {attempt}/{max_retries}): {exc}', file=sys.stderr, flush=True)
        time.sleep(attempt * 3)

# 3. Direct fallback for any missing or incomplete artifacts
for filename, url in DIRECT_URLS.items():
    file_path = os.path.join(TARGET_DIR, filename)
    needs_download = False
    if not os.path.isfile(file_path):
        needs_download = True
    elif filename == 'model.bin' and os.path.getsize(file_path) < 100_000_000:
        needs_download = True
    elif filename.endswith('.json'):
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                json.load(f)
        except Exception:
            needs_download = True

    if needs_download:
        print(f'Artifact {filename} missing or incomplete, activating direct HTTPS fallback...', flush=True)
        direct_download(filename, url)

# 4. Clean cache directory without touching converted artifacts
cache_dir = os.path.join(TARGET_DIR, '.cache')
if os.path.exists(cache_dir):
    shutil.rmtree(cache_dir, ignore_errors=True)

# 5. Final strict validation
required_artifacts = ['model.bin', 'config.json', 'vocabulary.json', 'tokenizer.json']
for artifact in required_artifacts:
    target_path = os.path.join(TARGET_DIR, artifact)
    if not os.path.isfile(target_path) or os.path.getsize(target_path) == 0:
        raise RuntimeError(f'Required model artifact missing or empty: {target_path}')

print('All Quran practice model artifacts validated successfully.', flush=True)
