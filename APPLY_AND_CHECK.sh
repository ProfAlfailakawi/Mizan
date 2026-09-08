#!/usr/bin/env bash
set -euo pipefail
python3 APPLY_ALL_MIZAN_NOTES.py
npm run check
