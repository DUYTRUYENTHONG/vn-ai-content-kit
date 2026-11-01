"""Offline preset-only synthesis; no network, service credentials or voice cloning."""
import argparse
import json
import os
from pathlib import Path
import socket
import subprocess

parser = argparse.ArgumentParser()
for field in ['config', 'input', 'output', 'voice']:
    parser.add_argument('--'+field, required=True)
parser.add_argument('--speed', type=float, required=True)
parser.add_argument('--reference-style', choices=['preset', 'speaker-only'], default='preset')
args = parser.parse_args()
config = json.loads(Path(args.config).read_text(encoding='utf-8-sig'))
if config.get('provider') != 'vieneu' or args.voice not in [v['name'] for v in config['presetVoices']]:
    raise ValueError('Expected a configured local preset voice')
if not 1 <= args.speed <= 2:
    raise ValueError('Expected speaking speed from 1.0 to 2.0')
text = Path(args.input).read_text(encoding='utf-8').strip()
if not 10 <= len(text) <= 1500:
    raise ValueError('Expected a short Vietnamese script')
os.environ.update(HF_HUB_CACHE=config['hfCache'], HF_HUB_OFFLINE='1', HF_HUB_DISABLE_TELEMETRY='1', DO_NOT_TRACK='1', HF_HUB_DISABLE_IMPLICIT_TOKEN='1')
def deny_network(*_args, **_kwargs):
    raise RuntimeError('Network access is disabled during local voice rendering')
socket.socket.connect = deny_network
socket.socket.connect_ex = deny_network
socket.create_connection = deny_network
socket.getaddrinfo = deny_network
import onnxruntime as ort
ort.disable_telemetry_events()
from vieneu import Vieneu
import numpy as np
import soundfile as sf
tts = Vieneu(mode='v3turbo', backend='onnx', device='cpu', precision='fp32', threads=4, babble_retries=0)
audio = np.asarray(tts.infer(text, voice=args.voice, temperature=config['temperature'],
                             use_ref_codes=args.reference_style == 'preset'), dtype=np.float32)
peak = float(np.max(np.abs(audio)))
if not np.isfinite(audio).all() or peak == 0:
    raise ValueError('Invalid speech waveform')
if peak > 0.98:
    audio *= 0.98/peak
raw = Path(args.output).with_suffix('.native.wav')
sf.write(str(raw), audio, tts.sample_rate, subtype='PCM_16')
subprocess.run([config['ffmpeg'], '-hide_banner', '-loglevel', 'error', '-y', '-i', str(raw),
                '-af', f'atempo={args.speed}', '-ac', '1', '-c:a', 'pcm_s16le', args.output],
               check=True, timeout=60)
print(json.dumps(dict(provider='vieneu', voice=args.voice, speed=args.speed,
                      referenceStyle=args.reference_style, offline=True)))
