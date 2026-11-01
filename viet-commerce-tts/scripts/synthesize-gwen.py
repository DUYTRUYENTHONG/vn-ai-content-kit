"""Explicit, local-only Gwen synthesis from reviewed assets and a consenting adult reference."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import socket
from datetime import date

def sha(file):
    with Path(file).open('rb') as stream:return hashlib.file_digest(stream,'sha256').hexdigest()

def run():
    p=argparse.ArgumentParser(description=__doc__)
    for name in ('model-dir','assets','reference','script','output'):p.add_argument('--'+name,required=True)
    p.add_argument('--device',default='cpu')
    p.add_argument('--execute',action='store_true')
    a=p.parse_args()
    if not a.execute:raise ValueError('Synthesis is opt-in; inspect consent/assets and pass --execute manually')
    root=Path(__file__).resolve().parents[1]
    def private(value):
        value=Path(value).resolve()
        if value==root or root in value.parents:raise ValueError('Models, recordings, scripts and outputs must stay outside Git')
        return value
    model=private(a.model_dir);asset_file=private(a.assets);reference=private(a.reference);script_file=private(a.script);output=private(a.output)
    assets=json.loads(asset_file.read_text(encoding='utf-8'))
    if assets.get('modelId')!='g-group-ai-lab/gwen-tts-0.6B' or not assets.get('files'):raise ValueError('Reviewed local Gwen asset manifest required')
    expected=json.loads((root/'config/gwen.json').read_text(encoding='utf-8'))
    if assets.get('revision')!=expected['modelRevision']:raise ValueError('Local model revision differs from reviewed source')
    listed=set()
    for item in assets['files']:
        file=(model/item['path']).resolve()
        if model not in file.parents or file in listed or sha(file)!=item['sha256']:raise ValueError('Model asset path/hash mismatch')
        listed.add(file)
    if any(f.resolve() not in listed for f in model.rglob('*') if f.is_file()):raise ValueError('Every local snapshot file must be present in the reviewed manifest')
    if not (model/'config.json').is_file() or not any(model.glob('*.safetensors')):raise ValueError('Local config and safetensors weights are missing')
    consent=json.loads(reference.read_text(encoding='utf-8'))
    if (consent.get('sourceKind')!='human-recording' or consent.get('adult') is not True
        or consent.get('revoked') is not False or consent.get('storage')!='local-only'
        or 'commercial-synthesis' not in consent.get('permittedUses',[])
        or consent.get('transcriptReviewed') is not True or consent.get('cleanSpeechReviewed') is not True
        or date.fromisoformat(consent['signedAt'])>date.today()):raise ValueError('Reviewed adult commercial-synthesis consent is required')
    audio=private(reference.parent/consent['audio']);evidence=private(reference.parent/consent['evidence'])
    if sha(audio)!=consent['audioSha256'] or sha(evidence)!=consent['evidenceSha256'] or not evidence.stat().st_size:raise ValueError('Reference or consent evidence changed')
    import wave
    with wave.open(str(audio),'rb') as reference_wav:
        if reference_wav.getnchannels()!=1 or reference_wav.getsampwidth()!=2 or not 3<=reference_wav.getnframes()/reference_wav.getframerate()<=15:raise ValueError('Use a reviewed3–15second mono PCM16 reference')
    text=script_file.read_text(encoding='utf-8').strip()
    if not 10<=len(text)<=1500 or not consent.get('text') or not consent.get('speakerId'):raise ValueError('Bounded Vietnamese text and reviewed reference transcript required')
    os.environ.update(HF_HUB_OFFLINE='1',TRANSFORMERS_OFFLINE='1',HF_HUB_DISABLE_TELEMETRY='1',DO_NOT_TRACK='1')
    def deny(*_a,**_k):raise RuntimeError('Network disabled during local synthesis')
    socket.socket.connect=deny;socket.socket.connect_ex=deny;socket.create_connection=deny;socket.getaddrinfo=deny
    import torch
    import soundfile as sf
    from qwen_tts import Qwen3TTSModel
    tts=Qwen3TTSModel.from_pretrained(str(model),device_map=a.device,dtype=torch.bfloat16 if a.device.startswith('cuda') else torch.float32,attn_implementation='sdpa')
    wavs,sr=tts.generate_voice_clone(text=text,ref_audio=str(audio),ref_text=consent['text'],temperature=.3,top_k=20,top_p=.9,max_new_tokens=4096,repetition_penalty=2.0,subtalker_do_sample=True,subtalker_temperature=.1,subtalker_top_k=20,subtalker_top_p=1.0)
    output.parent.mkdir(parents=True,exist_ok=True);sf.write(str(output),wavs[0],sr,subtype='PCM_16')
    import math
    import wave
    from array import array
    with wave.open(str(output),'rb') as w:
        samples=array('h',w.readframes(w.getnframes()));duration=w.getnframes()/w.getframerate()
    rms=math.sqrt(sum(x*x for x in samples)/len(samples))/32768;clipped=sum(abs(x)>=32760 for x in samples)/len(samples)
    if not .5<=duration<=90 or rms<.005 or clipped>.01:raise ValueError('Generated waveform requires technical correction; preserved for inspection')
    receipt=dict(provider='gwen',voice=consent['speakerId'],speed=1,temperature=.3,referenceStyle='consented-reference',path=str(output),sha256=sha(output),script=text,scriptFile=str(script_file),scriptSha256=hashlib.sha256(text.encode()).hexdigest(),modelManifestSha256=sha(asset_file),runtimeConfigSha256=hashlib.sha256(json.dumps(dict(device=a.device,attention='sdpa',modelRevision=assets['revision']),sort_keys=True).encode()).hexdigest(),qa=dict(durationSeconds=duration,rms=rms,clippedFraction=clipped),languageTarget='vi-VN',referenceAudioSha256=sha(audio),consentEvidenceSha256=sha(evidence),offline=True,listeningVerified=False,publicationReady=False)
    output.with_suffix('.receipt.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(receipt,ensure_ascii=False))

if __name__=='__main__':
    try:run()
    except (ValueError,KeyError,OSError) as error:raise SystemExit(str(error))
