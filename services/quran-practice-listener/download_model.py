import os
import shutil
import time
from huggingface_hub import snapshot_download, hf_hub_download

os.makedirs('/converted', exist_ok=True)

# 1. Download pre-converted CTranslate2 Quran model
max_retries = 3
for attempt in range(1, max_retries + 1):
    try:
        snapshot_download(
            'OdyAsh/faster-whisper-base-ar-quran',
            revision='af9e0305a0ee90a8199ad405df0250b665d01c66',
            local_dir='/converted',
            ignore_patterns=['README.md', '.gitattributes'],
        )
        break
    except Exception as exc:
        if attempt == max_retries:
            raise
        print(f'Retry {attempt}/{max_retries} downloading model: {exc}')
        time.sleep(3)

# 2. faster-whisper expects tokenizer.json in the local model directory.
# Fetch the exact pinned Whisper-base tokenizer so the container runtime
# is fully self-contained and operates completely offline without network requests.
for attempt in range(1, max_retries + 1):
    try:
        tok_path = hf_hub_download(
            repo_id='openai/whisper-base',
            filename='tokenizer.json',
            revision='e37978b90ca9030d5170a5c07aadb050351a65bb',
        )
        shutil.copyfile(tok_path, '/converted/tokenizer.json')
        break
    except Exception as exc:
        if attempt == max_retries:
            raise
        print(f'Retry {attempt}/{max_retries} downloading tokenizer: {exc}')
        time.sleep(3)

print('Model and tokenizer downloaded successfully.', flush=True)
shutil.rmtree('/converted/.cache', ignore_errors=True)
