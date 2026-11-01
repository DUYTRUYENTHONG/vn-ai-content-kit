"""Offline, standard-library corpus validation. No synthesis, uploads or training."""
from __future__ import annotations

import argparse
from array import array
from collections import Counter
from datetime import date, datetime, timezone
from difflib import SequenceMatcher
import hashlib
import json
import math
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import unicodedata
import wave

ROOT = Path(__file__).resolve().parents[1]
CONFIG = json.loads((ROOT / 'config/corpus-policy.json').read_text(encoding='utf-8'))
HOME = Path(os.environ.get('VIET_TTS_HOME', Path.home()/'.local/share/viet-commerce-tts'))


def private_path(path):
    path = Path(path).resolve()
    if path == ROOT or ROOT in path.parents:
        raise ValueError('Private corpus, consent, output and model assets must live outside the Git checkout')
    return path


def sha(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def normalize(text):
    return ' '.join(re.findall(r'\w+', unicodedata.normalize('NFC', text).casefold()))


def audio_stats(path):
    with wave.open(str(path), 'rb') as audio:
        if (audio.getcomptype(), audio.getsampwidth(), audio.getnchannels(), audio.getframerate()) != ('NONE', 2, 1, 48000):
            raise ValueError('Expected lossless PCM16 mono 48000Hz WAV; keep the original lossless recording')
        duration = audio.getnframes()/audio.getframerate()
        if not 3 <= duration <= 15:
            raise ValueError('Clip must be 3–15 seconds')
        data = audio.readframes(audio.getnframes())
        if len(data) != audio.getnframes()*2:
            raise ValueError('Truncated WAV')
    samples = array('h', data)
    if sys.byteorder != 'little':
        samples.byteswap()
    peak = max(abs(x) for x in samples)/32768
    rms = math.sqrt(sum(x*x for x in samples)/len(samples))/32768
    clipping = sum(abs(x) >= 32760 for x in samples)/len(samples)
    silence = sum(abs(x) < 32 for x in samples)/len(samples)
    if rms < 0.003 or peak < 0.01 or clipping > 0.001 or silence > 0.7:
        raise ValueError('Silence/level/clipping check failed')
    return dict(duration=duration, peak=peak, rms=rms, clippingFraction=clipping,
                silenceFraction=silence, pcmSha256=hashlib.sha256(data).hexdigest())


def cuda_probe():
    try:
        p = subprocess.run(['nvidia-smi', '--query-gpu=name,memory.total', '--format=csv,noheader,nounits'],
                           capture_output=True, text=True, timeout=5, check=True)
        devices = [line.strip() for line in p.stdout.splitlines() if line.strip()]
        available = any(float(line.rsplit(',', 1)[1]) >= 6000 for line in devices)
        return dict(available=available, devices=devices, note='CUDA PyTorch/bfloat16 still checked at launch')
    except (OSError, subprocess.SubprocessError, ValueError, IndexError):
        return dict(available=False, devices=[], note='No local NVIDIA CUDA GPU with at least 6GB VRAM detected; Intel Arc/CPU ONNX is inference only')


def split_rows(rows):
    """Keep sessions, original sources, declared text families and near text together."""
    parent = list(range(len(rows)))
    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i
    def union(a, b):
        parent[find(a)] = find(b)
    for i, row in enumerate(rows):
        for j in range(i):
            other = rows[j]
            if (any(row[k] == other[k] for k in ('sessionId', 'sourceId', 'textGroup'))
                    or SequenceMatcher(None, normalize(row['text']), normalize(other['text'])).ratio() >= CONFIG['dataset']['nearDuplicateRatio']):
                union(i, j)
    groups = {}
    for i, row in enumerate(rows):
        groups.setdefault(find(i), []).append(row)
    ordered = sorted(groups.values(), key=lambda g: hashlib.sha256((str(CONFIG['dataset']['seed'])+min(r['id'] for r in g)).encode()).hexdigest())
    if len(ordered) < 3:
        raise ValueError('Need at least three independent session/source/text groups for train, validation and untouched test')
    target = max(1, math.ceil(len(rows)*0.1))
    splits = dict(train=[], validation=[], test=[])
    for name in ('test', 'validation'):
        while ordered and len(splits[name]) < target and len(ordered) > (2 if name == 'test' else 1):
            splits[name].extend(ordered.pop(0))
    # Guarantee a held-out group even for a three-group corpus.
    for name in ('test', 'validation'):
        if not splits[name]:
            splits[name].extend(ordered.pop(0))
    splits['train'] = [r for group in ordered for r in group]
    return splits


def validate(manifest_path, output):
    manifest_path, output = private_path(manifest_path), private_path(output)
    errors, rows = [], []
    manifest = {}
    try:
        manifest = json.loads(manifest_path.read_text(encoding='utf-8-sig'))
        if (not isinstance(manifest, dict) or not isinstance(manifest.get('consents', []), list)
                or not isinstance(manifest.get('clips', []), list)):
            raise ValueError('Expected corpus object with consent/clip lists')
        if manifest.get('schemaVersion') != 1 or manifest.get('purpose') != 'human-training':
            errors.append('Corpus must declare schemaVersion1 and purpose human-training; examples/synthetic fixtures are never training-ready')
        if manifest.get('accent') not in {'vi-VN-northern', 'vi-VN-central', 'vi-VN-southern'} or manifest.get('gender') not in {'female', 'male', 'unspecified'}:
            errors.append('Expected one Vietnamese speaker with reviewed accent and gender metadata')
        consent_by_id = {}
        for c in manifest.get('consents', []):
            try:
                if not isinstance(c, dict):
                    raise ValueError('Consent must be an object')
                if c['id'] in consent_by_id:
                    raise ValueError('Duplicate consent ID')
                if (c['speakerId'] != manifest['speakerId'] or c.get('adult') is not True
                        or c.get('revoked') is not False or c.get('storage') != 'local-only'
                        or not {'tts-training', 'commercial-synthesis'} <= set(c.get('permittedUses', []))):
                    raise ValueError('Explicit adult speaker permission for local training and commercial synthesis required')
                if date.fromisoformat(c['signedAt']) > date.today():
                    raise ValueError('Consent cannot be future-dated')
                evidence = private_path(manifest_path.parent/c['evidence'])
                if evidence.stat().st_size == 0:
                    raise ValueError('Consent evidence cannot be empty')
                if sha(evidence) != c['evidenceSha256']:
                    raise ValueError('Consent evidence hash mismatch')
                consent_by_id[c['id']] = c
            except (KeyError, TypeError, ValueError, OSError) as exc:
                errors.append(f'Consent invalid: {exc}')
        seen_ids, seen_text, seen_audio = set(), set(), set()
        for i, clip in enumerate(manifest.get('clips', [])):
            try:
                if not isinstance(clip, dict):
                    raise ValueError('Clip must be an object')
                for field in ('id', 'audio', 'text', 'sourceId', 'sessionId', 'textGroup', 'speakerId', 'consentId'):
                    if not isinstance(clip.get(field), str) or not clip[field].strip():
                        raise ValueError(f'Missing {field}')
                identity = clip['id'].casefold()
                reserved = {'con', 'prn', 'aux', 'nul'} | {prefix+str(n) for prefix in ('com', 'lpt') for n in range(1,10)}
                if (not re.fullmatch(r'[A-Za-z0-9_-]{1,80}', clip['id']) or identity in seen_ids
                        or identity in reserved):
                    raise ValueError('Clip ID must be unique and filename-safe')
                seen_ids.add(identity)
                if clip.get('sourceKind') != 'human-recording':
                    raise ValueError('Only original consented human recordings; synthetic presets and unknown online speakers are excluded')
                if (clip['speakerId'] != manifest.get('speakerId') or clip['consentId'] not in consent_by_id
                        or clip.get('transcriptReviewed') is not True or clip.get('cleanSpeechReviewed') is not True):
                    raise ValueError('Speaker, consent, transcript and clean speech listening review required')
                text = unicodedata.normalize('NFC', clip['text']).strip()
                words = normalize(text).split()
                if (not 10 <= len(text) <= 600 or not 3 <= len(words) <= 100
                        or any(x in text for x in ('|', '\n', '\r', '\x00'))):
                    raise ValueError('Transcript needs 10–600 characters, 3–100 whitespace words and no metadata delimiters')
                normalized = normalize(text)
                path = private_path(manifest_path.parent/clip['audio'])
                stats = audio_stats(path)
                if normalized in seen_text or stats['pcmSha256'] in seen_audio:
                    raise ValueError('Duplicate transcript or decoded PCM audio')
                seen_text.add(normalized); seen_audio.add(stats['pcmSha256'])
                rows.append(dict(clip, text=text, audio=str(path), audioSha256=sha(path), **stats))
            except (KeyError, TypeError, ValueError, OSError, wave.Error) as exc:
                errors.append(f'Clip {i+1}: {exc}')
    except (OSError, ValueError, TypeError) as exc:
        errors.append(f'Corpus unavailable/invalid: {exc}')
    seconds = sum(r['duration'] for r in rows)
    if len(rows) < CONFIG['dataset']['minClips'] or seconds < CONFIG['dataset']['minSeconds']:
        errors.append(f'Need at least 100 unique reviewed clips and 600 seconds; found {len(rows)} clips/{seconds:.2f}s')
    splits = None
    if rows:
        try:
            splits = split_rows(rows)
        except ValueError as exc:
            errors.append(str(exc))
    hardware = cuda_probe()
    fingerprint = hashlib.sha256(json.dumps(dict(manifest=manifest, audio=[r['audioSha256'] for r in rows],
        splitPolicy=CONFIG['dataset']), sort_keys=True, ensure_ascii=False).encode()).hexdigest()
    report = dict(schemaVersion=1, checkedAt=datetime.now(timezone.utc).isoformat(), datasetSha256=fingerprint,
                  configSha256=sha(ROOT/'config/corpus-policy.json'), dataReady=not errors,
                  corpusAndHardwareReady=not errors and hardware['available'], trainingReady=False,
                  trainingEnvironmentVerified=False, deploymentReady=False,
                  errors=errors, hardware=hardware,
                  blockers=errors+([] if hardware['available'] else [hardware['note']])+['Pinned source, full training weights, dependencies and CUDA execution must pass run.py preflight'],
                  clips=len(rows), seconds=seconds, transcriptWhitespaceWordHistogram=dict(Counter(str(len(normalize(r['text']).split())//10*10)+'-'+str(len(normalize(r['text']).split())//10*10+9) for r in rows)),
                  tokenizerTokens='Computed with the pinned phoneme tokenizer at encoding/training; whitespace words above are not model tokens',
                  splits={k: len(v) for k,v in (splits or {}).items()},
                  naturalnessImprovement=None, note='Preparation does not train, evaluate or activate a model.')
    output.mkdir(parents=True, exist_ok=True)
    if not errors:
        dataset_dir = output/fingerprint
        dataset_dir.mkdir(exist_ok=True)
        for name, items in splits.items():
            (dataset_dir/f'{name}.jsonl').write_text(''.join(json.dumps(r, ensure_ascii=False)+'\n' for r in items), encoding='utf-8')
        report['rawSplitHashes'] = {name: sha(dataset_dir/f'{name}.jsonl') for name in splits}
        raw = dataset_dir/'raw_audio'; raw.mkdir(exist_ok=True)
        for r in rows:
            target = raw/(r['id']+'.wav')
            if target.exists() and sha(target) != r['audioSha256']:
                raise ValueError('Existing dataset audio changed; use a new private output directory')
            if not target.exists():
                shutil.copyfile(r['audio'], target)
        (dataset_dir/'metadata.csv').write_text('file_name|text\n'+''.join(r['id']+'.wav|'+r['text']+'\n' for r in rows), encoding='utf-8')
        report['datasetDirectory'] = str(dataset_dir)
    (output/'readiness.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', type=Path, default=HOME/'training/corpus.json')
    parser.add_argument('--output', type=Path, default=HOME/'training/prepared')
    args = parser.parse_args()
    try:
        result = validate(args.manifest, args.output)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        raise SystemExit(0 if result['trainingReady'] else 2)
    except (OSError, ValueError) as exc:
        print(str(exc), file=sys.stderr)
        raise SystemExit(2)
