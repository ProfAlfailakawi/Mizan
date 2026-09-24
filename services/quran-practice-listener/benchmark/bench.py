"""
قياسُ «يسمعك» على تلاوات كبار القرّاء — المتابعةُ الحيّة كما تجري في الصفحة.

تُنزَّل تلاوةُ كلّ آيةٍ من everyayah.com وتُوصل آياتُ المقطع في تسجيلٍ واحد، ثم يُقطَّع
بإيقاع الصفحة نفسِه (`CHUNK_MS` و`WINDOW_CHUNKS` و`EDGE_HOLD_MS` تُقرأ من
src/lib/recognition-window.ts فلا تفترق عنها)، ويُمرَّر كلُّ مقطعٍ بالمسارين كما يمرّ في الإنتاج:

  ـ مسارُ الموضع (`/listen`): الترويسةُ + المقطعُ الأخير ← `best_match` مع `after`.
  ـ مسارُ الكلمات (`/recognise`): نافذةُ المقاطع ← كلماتٌ بتوقيت ← يُثبَّت ما قبل حافّة
    النافذة ← جبهةُ ما قيل.

ويُقاس لكلّ كلمة:
  ـ **التأخّر**: من لحظة قولها إلى لحظة انكشافها (زمنُ الحوسبة الفعليّ داخلٌ فيه).
  ـ **السبق**: كلمةٌ انكشفت قبل أن تُقال — أخطرُ ما في «اختبر حفظك».
  ـ **القفزُ**: موضعٌ تقريبيٌّ ابتعد عن الحقيقة أكثر من آية (المتشابهاتُ والمكرَّرات).

وتوقيتُ الكلمة الحقيقيّ غيرُ معلوم داخل الآية: المعلومُ حدودُ الآيات (كلُّ آيةٍ ملفّ).
فيُقسَّم زمنُ الآية على كلماتها بنسبة حروفها — تقريبٌ يُعلَن، ولذلك يُعدّ السبقُ سبقًا حين
يتجاوز كلمةً واحدة (`AHEAD_TOLERANCE`) لا قبل.

والصوتُ في مجلّدٍ مؤقّتٍ لا يُرفع ولا يُحفظ.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import statistics
import subprocess
import sys
import tempfile
import time
import urllib.request
from difflib import SequenceMatcher

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
SERVICE = os.path.dirname(HERE)
ROOT = os.path.dirname(os.path.dirname(SERVICE))
sys.path.insert(0, SERVICE)

from app import best_match, norm  # noqa: E402

SR = 16_000
AHEAD_TOLERANCE = 1
JUMP_WORDS = 12


def rhythm() -> dict:
    """إيقاعُ الصفحة من مصدره — لا نسخةٌ تفترق عنه."""
    src = open(os.path.join(ROOT, 'src/lib/recognition-window.ts'), encoding='utf-8').read()
    get = lambda name: int(re.search(rf'export const {name} = (\d+);', src).group(1))  # noqa: E731
    return {'chunkMs': get('CHUNK_MS'), 'windowChunks': get('WINDOW_CHUNKS'), 'edgeHoldMs': get('EDGE_HOLD_MS')}


def fetch_ayah(base: str, folder: str, surah: int, ayah: int, workdir: str) -> np.ndarray | None:
    url = f'{base}/{folder}/{surah:03d}{ayah:03d}.mp3'
    mp3 = os.path.join(workdir, f'{folder}-{surah}-{ayah}.mp3')
    for attempt in range(3):
        try:
            with urllib.request.urlopen(url, timeout=60) as r, open(mp3, 'wb') as f:
                f.write(r.read())
            break
        except Exception:
            time.sleep(2 * (attempt + 1))
    else:
        return None
    raw = subprocess.run(['ffmpeg', '-v', 'quiet', '-i', mp3, '-ac', '1', '-ar', str(SR), '-f', 's16le', '-'],
                         capture_output=True, check=False).stdout
    os.remove(mp3)
    if not raw:
        return None
    return np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0


def word_times(ayat: list[dict], durations: list[float]) -> list[float]:
    """لحظةُ انتهاء كلّ كلمة: زمنُ الآية مقسومًا بنسبة حروف كلماتها (تقريبٌ معلن)."""
    ends, t = [], 0.0
    for a, d in zip(ayat, durations):
        words = norm(a['text']).split()
        weights = [max(1, len(w)) for w in words]
        total, acc = sum(weights), 0
        for w in weights:
            acc += w
            ends.append(t + d * acc / total)
        t += d
    return ends


def follow_frontier(expected: list[str], heard: list[str]) -> int:
    """
    جبهةُ ما قيل: آخرُ كلمةٍ في الوجه طوبقت بما سُمع — مقابلةٌ تسلسليّة لا تقفز بعيدًا.

    تقريبٌ لـ`followFrontier` (src/lib/live-judging.ts): الكتلُ المتطابقةُ بالترتيب، ولا تُقبل
    كتلةٌ تبعد عن الجبهة أكثرَ من ستّ كلمات إلا أن تكون كلمتين فأكثر.
    """
    frontier = -1
    for block in SequenceMatcher(None, heard, expected, autojunk=False).get_matching_blocks():
        if block.size == 0:
            continue
        end = block.b + block.size - 1
        if block.size >= 2 or block.b <= frontier + 6:
            frontier = max(frontier, end)
    return frontier


def simulate(model, ayat: list[dict], audio: np.ndarray, ends: list[float], rh: dict) -> dict:
    chunk = int(SR * rh['chunkMs'] / 1000)
    n = (len(audio) + chunk - 1) // chunk
    expected = [w for a in ayat for w in norm(a['text']).split()]
    total_words = len(expected)
    revealed_at = [None] * total_words  # لحظةُ الانكشاف
    ahead_events, jumps, rough_ahead = 0, 0, 0
    last_global, committed_until, heard = -1, 0.0, []
    # المساران يتقاسمان النموذجَ والمعالجَ نفسَهما في الإنتاج (نسخةٌ بمعالجين): فساعةُ خادمٍ واحدة،
    # وكلُّ طلبٍ ينتظر ما قبله — لا ساعتان مستقلّتان تُظهران التأخّرَ أقلَّ ممّا هو.
    server_free = 0.0
    listen_cost, recog_cost = [], []
    reached = 0  # أوّلُ كلمةٍ لم تنكشف
    skipped = 0

    def reveal(upto: int, at: float):
        nonlocal reached, ahead_events
        upto = min(upto, total_words - 1)
        while reached <= upto:
            revealed_at[reached] = at
            # انكشفت ولم تُقل بعد عند لحظة انكشافها — بأكثر من هامش التقريب.
            if reached > truth_index(at) + AHEAD_TOLERANCE:
                ahead_events += 1
            reached += 1

    def truth_index(t: float) -> int:
        i = -1
        for k, e in enumerate(ends):
            if e <= t:
                i = k
            else:
                break
        return i

    for i in range(n):
        arrive = (i + 1) * chunk / SR  # يصل المقطعُ حين يُسجَّل كاملًا
        head = audio[:chunk]
        piece = audio[i * chunk:(i + 1) * chunk]

        # ـ مسارُ الموضع
        final = i == n - 1
        newest_by = lambda t: min(n - 1, int(t * SR // chunk) - 1)  # آخرُ مقطعٍ وصل عند اللحظة t  # noqa: E731
        # كما في الصفحة: مهمّةٌ تبدأ وقد وصل أحدثُ منها تُترك له (الموضعُ يحتاج أحدثَ مقطعٍ وحده).
        start = max(server_free, arrive)
        skip_listen = not final and newest_by(start) > i
        # كما في /listen (`after_header`): الترويسةُ تُقصّ من الصوت، ولا يُكتب إلا المقطعُ نفسُه.
        t0 = time.perf_counter()
        if skip_listen:
            candidate, conf, cost = None, 0.0, 0.0
        else:
            segs, _ = model.transcribe(piece, language='ar', beam_size=1, best_of=1, condition_on_previous_text=False,
                                       vad_filter=True, vad_parameters={'min_silence_duration_ms': 300}, without_timestamps=True)
            transcript = ' '.join(s.text for s in segs).strip()
            candidate, conf = best_match(transcript, ayat, last_global)
            cost = time.perf_counter() - t0
            listen_cost.append(cost)
        server_free = start + cost
        if candidate is not None and conf >= 0.55:
            g = candidate['globalIndex']
            truth = truth_index(arrive)
            if abs(g - truth) > JUMP_WORDS:
                jumps += 1
            if g > truth + AHEAD_TOLERANCE:
                rough_ahead += 1
            last_global = g

        # ـ مسارُ الكلمات
        first = max(0, i - (rh['windowChunks'] - 1))
        # والنافذةُ كذلك بلا ترويسة (`after_header` في /recognise)، فالتوقيتُ منها مباشرة.
        audio_in = audio[first * chunk:(i + 1) * chunk]
        head_s = 0.0
        commit_until = (i + 1) * chunk / SR - (0 if final else rh['edgeHoldMs'] / 1000)
        # وكذلك الكلمات: تُترك لأحدثَ منها ما دامت نافذتُه تبدأ قبل آخر ما ثبت (لا ثقب).
        newest = newest_by(server_free)
        # وتُقاس بالتي تليها (i+1) لا بأحدثِها — كما في الصفحة: تتسلسل حتى أحدثِ نافذةٍ تغطّي.
        next_first = max(0, i + 1 - (rh['windowChunks'] - 1))
        if not final and newest > i and next_first * chunk / SR <= committed_until:
            skipped += 1
            continue
        t0 = time.perf_counter()
        segs, _ = model.transcribe(audio_in, language='ar', beam_size=1, best_of=1, condition_on_previous_text=False,
                                   vad_filter=True, vad_parameters={'min_silence_duration_ms': 300}, word_timestamps=True)
        words = [w for s in segs for w in (s.words or [])]
        cost = time.perf_counter() - t0
        recog_cost.append(cost)
        server_free = server_free + cost  # يصل مع مقطع الموضع نفسه، فيُخدم بعده
        recog_free = server_free
        start_s = first * chunk / SR
        tail = []
        for w in words:
            if w.end <= head_s + 0.05:
                continue
            ws, we = start_s + (w.start - head_s), start_s + (w.end - head_s)
            if ws < committed_until - 0.08:
                continue
            if we > commit_until:
                tail.append(norm(w.word))  # عند الحافّة: لا يُثبَّت، ويُكشف إن طابق التاليةَ تمامًا
                continue
            text = norm(w.word)
            if text:
                heard.extend(text.split())
            committed_until = max(committed_until, we)
        f = follow_frontier(expected, heard)
        # provisionalReach (src/lib/live-judging.ts): ما عند الحافّة مطابقًا التاليةَ تمامًا — ومن الجبهة الفارغة كذلك.
        for text in tail:
            if f + 1 < total_words and text and text == expected[f + 1]:
                f += 1
            else:
                break
        if f >= 0:
            reveal(f, recog_free)

    lags = [revealed_at[k] - ends[k] for k in range(total_words) if revealed_at[k] is not None]
    return {
        'words': total_words, 'revealed': sum(1 for r in revealed_at if r is not None),
        'lags': lags, 'aheadEvents': ahead_events, 'roughJumps': jumps, 'roughAhead': rough_ahead,
        'chunks': n, 'skippedWindows': skipped, 'listenCost': listen_cost, 'recogCost': recog_cost,
    }


def pct(values: list[float], q: float) -> float | None:
    if not values:
        return None
    s = sorted(values)
    return round(s[min(len(s) - 1, int(q * (len(s) - 1) + 0.5))], 2)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--passages', default=os.path.join(HERE, 'passages.json'))
    ap.add_argument('--reciters', default=os.path.join(SERVICE, '..', 'quran-muaalem', 'benchmark', 'reciters.json'))
    ap.add_argument('--only', default='')
    ap.add_argument('--model', default=os.getenv('MIZAN_QURAN_MODEL', 'OdyAsh/faster-whisper-base-ar-quran'))
    ap.add_argument('--threads', type=int, default=2)
    ap.add_argument('--out', required=True)
    ap.add_argument('--markdown', required=True)
    args = ap.parse_args()

    from faster_whisper import WhisperModel
    from quran_transcript import Aya

    rh = rhythm()
    model = WhisperModel(args.model, device='cpu', compute_type='int8', cpu_threads=args.threads)
    rec = json.load(open(args.reciters, encoding='utf-8'))
    wanted = {x.strip() for x in args.only.split(',') if x.strip()}
    passages = json.load(open(args.passages, encoding='utf-8'))['passages']
    reciters = [r for r in rec['reciters'] if (not wanted or r['id'] in wanted) and r['id'] in set(passages_reciters(passages))]
    runs = []
    with tempfile.TemporaryDirectory() as work:
        for p in passages:
            ayat = [{'surah': p['surah'], 'ayah': a, 'text': Aya(p['surah'], a).get().uthmani} for a in range(p['from'], p['to'] + 1)]
            for r in reciters:
                if r['id'] not in p['reciters']:
                    continue
                pieces = [fetch_ayah(rec['base'], r['folder'], p['surah'], a['ayah'], work) for a in ayat]
                if any(x is None for x in pieces):
                    runs.append({'passage': p['id'], 'reciter': r['id'], 'missing': True})
                    continue
                audio = np.concatenate(pieces)
                ends = word_times(ayat, [len(x) / SR for x in pieces])
                out = simulate(model, ayat, audio, ends, rh)
                runs.append({'passage': p['id'], 'reciter': r['id'], 'style': r.get('style'), **out})
                print(f"{p['id']:>10} {r['id']:>10}: words {out['words']} revealed {out['revealed']} "
                      f"lag p50 {pct(out['lags'], .5)}s p90 {pct(out['lags'], .9)}s ahead {out['aheadEvents']} "
                      f"jumps {out['roughJumps']}", flush=True)

    measured = [x for x in runs if not x.get('missing')]
    lags = [v for x in measured for v in x['lags']]
    words = sum(x['words'] for x in measured)
    report = {
        'protocol': 'MIZAN-LISTENER-FOLLOW-1', 'model': args.model, 'rhythm': rh, 'cpuThreads': args.threads,
        'measuredAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        'words': words, 'revealed': sum(x['revealed'] for x in measured),
        'lagSeconds': {'p50': pct(lags, .5), 'p90': pct(lags, .9), 'max': pct(lags, 1.0)},
        'aheadEvents': sum(x['aheadEvents'] for x in measured),
        'roughJumps': sum(x['roughJumps'] for x in measured),
        'roughAhead': sum(x['roughAhead'] for x in measured),
        'computeSeconds': {
            'listenP50': pct([c for x in measured for c in x['listenCost']], .5),
            'recogniseP50': pct([c for x in measured for c in x['recogCost']], .5),
            'recogniseP90': pct([c for x in measured for c in x['recogCost']], .9),
        },
        'runs': [{k: v for k, v in x.items() if k not in ('lags', 'listenCost', 'recogCost')} |
                 ({'lagP50': pct(x['lags'], .5), 'lagP90': pct(x['lags'], .9)} if 'lags' in x else {}) for x in runs],
        'caveats': [
            'توقيتُ الكلمة داخل الآية مقسومٌ بنسبة الحروف (تقريب)؛ حدودُ الآيات وحدها دقيقة.',
            'جبهةُ الكلمات هنا تقريبٌ لـfollowFrontier في الصفحة (مقابلةٌ تسلسليّة).',
            'الحوسبةُ على معالجِ عدّاء GitHub بخيطين — تقاربُ Cloud Run ولا تطابقه؛ والشبكةُ غيرُ محسوبة.',
            'كبارُ القرّاء لا يخطئون: هذا يقيس المتابعة لا كشفَ الخطأ.',
        ],
    }
    json.dump(report, open(args.out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    with open(args.markdown, 'w', encoding='utf-8') as md:
        md.write('## قياس «يسمعك» — المتابعةُ الحيّة (MIZAN-LISTENER-FOLLOW-1)\n\n')
        md.write(f"- الإيقاع: مقطع {rh['chunkMs']}ms، نافذة {rh['windowChunks']} مقاطع، مهلةُ الحافّة {rh['edgeHoldMs']}ms — النموذج `{args.model}`\n")
        md.write(f"- الكلمات: {words} — انكشف منها {report['revealed']}\n")
        md.write(f"- **التأخّر** (من قول الكلمة إلى انكشافها): الوسيط {report['lagSeconds']['p50']}s، و٩٠٪ تحت {report['lagSeconds']['p90']}s\n")
        md.write(f"- **كلماتٌ انكشفت قبل أن تُقال** (بأكثر من كلمة): {report['aheadEvents']}\n")
        md.write(f"- قفزاتُ الموضع التقريبيّ (أبعد من {JUMP_WORDS} كلمة): {report['roughJumps']}\n")
        md.write(f"- زمنُ الحوسبة لكلّ مقطع: الموضع {report['computeSeconds']['listenP50']}s، الكلمات {report['computeSeconds']['recogniseP50']}s (p90 {report['computeSeconds']['recogniseP90']}s)\n\n")
        md.write('| المقطع | القارئ | كلمات | انكشف | تأخّر p50 | p90 | سبق | قفز |\n|---|---|---|---|---|---|---|---|\n')
        for x in report['runs']:
            if x.get('missing'):
                md.write(f"| {x['passage']} | {x['reciter']} | — | ملفّ غائب | | | | |\n")
            else:
                md.write(f"| {x['passage']} | {x['reciter']} | {x['words']} | {x['revealed']} | {x['lagP50']} | {x['lagP90']} | {x['aheadEvents']} | {x['roughJumps']} |\n")
        md.write('\n**حدود:**\n' + ''.join(f'- {c}\n' for c in report['caveats']))
    return 0


def passages_reciters(passages: list[dict]) -> list[str]:
    return [r for p in passages for r in p['reciters']]


if __name__ == '__main__':
    raise SystemExit(main())
