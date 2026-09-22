import os
import sys
import time
import json
import urllib.request

TARGET_DIR = os.getenv('TARGET_DIR', '/converted')
os.makedirs(TARGET_DIR, exist_ok=True)
print(f'Starting model acquisition for quran-practice-listener into {TARGET_DIR}...', flush=True)

MODEL_REPO = 'OdyAsh/faster-whisper-base-ar-quran'
MODEL_REV = 'af9e0305a0ee90a8199ad405df0250b665d01c66'
TOKENIZER_REPO = 'openai/whisper-base'
TOKENIZER_REV = 'e37978b90ca9030d5170a5c07aadb050351a65bb'

ARTIFACT_URLS = {
    'model.bin': f'https://huggingface.co/{MODEL_REPO}/resolve/{MODEL_REV}/model.bin',
    'config.json': f'https://huggingface.co/{MODEL_REPO}/resolve/{MODEL_REV}/config.json',
    'vocabulary.json': f'https://huggingface.co/{MODEL_REPO}/resolve/{MODEL_REV}/vocabulary.json',
    'preprocessor_config.json': f'https://huggingface.co/{MODEL_REPO}/resolve/{MODEL_REV}/preprocessor_config.json',
    'tokenizer.json': f'https://huggingface.co/{TOKENIZER_REPO}/resolve/{TOKENIZER_REV}/tokenizer.json',
}

MIN_SIZES = {
    'model.bin': 140_000_000,
    'config.json': 500,
    'vocabulary.json': 500_000,
    'preprocessor_config.json': 100,
    'tokenizer.json': 1_000_000,
}

def download_file(filename: str, url: str, max_retries: int = 5) -> None:
    dest_path = os.path.join(TARGET_DIR, filename)
    tmp_path = dest_path + '.tmp'
    min_size = MIN_SIZES.get(filename, 1)

    for attempt in range(1, max_retries + 1):
        try:
            print(f'Downloading {filename} (attempt {attempt}/{max_retries}) from {url}...', flush=True)
            req = urllib.request.Request(
                url,
                headers={
                    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
                    'Accept': '*/*',
                }
            )
            with urllib.request.urlopen(req, timeout=180) as resp, open(tmp_path, 'wb') as out_f:
                downloaded = 0
                chunk_size = 1024 * 1024  # 1 MB
                while True:
                    chunk = resp.read(chunk_size)
                    if not chunk:
                        break
                    out_f.write(chunk)
                    downloaded += len(chunk)
                    if downloaded % (10 * 1024 * 1024) == 0:
                        print(f'  {filename}: {downloaded // (1024 * 1024)} MB received...', flush=True)

            file_size = os.path.getsize(tmp_path)
            if file_size < min_size:
                raise ValueError(f'File {filename} is too small: {file_size} bytes (expected >= {min_size})')

            if filename.endswith('.json'):
                with open(tmp_path, 'r', encoding='utf-8') as jf:
                    json.load(jf)

            os.replace(tmp_path, dest_path)
            print(f'Successfully downloaded and validated {filename} ({file_size} bytes)', flush=True)
            return
        except Exception as exc:
            print(f'Error downloading {filename} (attempt {attempt}/{max_retries}): {exc}', file=sys.stderr, flush=True)
            if os.path.exists(tmp_path):
                try:
                    os.remove(tmp_path)
                except OSError:
                    pass
            if attempt == max_retries:
                raise
            sleep_time = attempt * 3
            print(f'Waiting {sleep_time}s before retry...', flush=True)
            time.sleep(sleep_time)

for name, url in ARTIFACT_URLS.items():
    target = os.path.join(TARGET_DIR, name)
    min_size = MIN_SIZES.get(name, 1)
    if os.path.isfile(target) and os.path.getsize(target) >= min_size:
        print(f'Artifact {name} already exists and valid ({os.path.getsize(target)} bytes), skipping.', flush=True)
        continue
    download_file(name, url)

# Final strict check
for name, min_size in MIN_SIZES.items():
    path = os.path.join(TARGET_DIR, name)
    if not os.path.isfile(path):
        raise RuntimeError(f'FATAL: Missing artifact after download: {path}')
    actual_size = os.path.getsize(path)
    if actual_size < min_size:
        raise RuntimeError(f'FATAL: Artifact {path} size {actual_size} is less than minimum {min_size}')

print('All 5 Quran practice model artifacts downloaded and validated successfully.', flush=True)
