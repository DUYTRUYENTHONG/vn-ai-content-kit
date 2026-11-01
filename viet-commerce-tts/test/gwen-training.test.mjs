import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
test('Gwen export preserves holdouts and train-only reference, rejecting source changes and synthetic rows',async t=>{
  const python=process.env.VIET_TTS_PYTHON;if(!python){t.skip('Set VIET_TTS_PYTHON for the standard-library exporter test');return;}
  const code=String.raw`
import importlib.util,json,tempfile,hashlib
from pathlib import Path
spec=importlib.util.spec_from_file_location('gwen','scripts/prepare-gwen-training.py');g=importlib.util.module_from_spec(spec);spec.loader.exec_module(g)
with tempfile.TemporaryDirectory() as d:
    root=Path(d);dataset=root/'dataset';dataset.mkdir();ready={'dataReady':True,'datasetDirectory':str(dataset),'datasetSha256':'f'*64,'rawSplitHashes':{}}
    for name in ('train','validation','test'):
        audio=root/(name+'.wav');audio.write_bytes(('fixture-only-'+name).encode())
        row={'audio':str(audio),'audioSha256':g.corpus.sha(audio),'text':'Nội dung kiểm thử, không phải dữ liệu người nói thật.','speakerId':'fixture','sourceKind':'human-recording','consentId':'fixture-only','transcriptReviewed':True,'cleanSpeechReviewed':True}
        f=dataset/(name+'.jsonl');f.write_text(json.dumps(row,ensure_ascii=False)+'\n',encoding='utf-8');ready['rawSplitHashes'][name]=g.corpus.sha(f)
    r=g.export_prepared(ready,root/'export');assert r['trainingReady'] is False and r['trainingExecuted'] is False
    assert r==g.export_prepared(ready,root/'export')
    for name,item in r['files'].items():
        row=json.loads(Path(item['path']).read_text(encoding='utf-8'));assert Path(row['audio']).name==name+'.wav';assert Path(row['ref_audio']).name=='train.wav'
    (root/'test.wav').write_bytes(b'changed')
    try:g.export_prepared(ready,root/'bad');raise AssertionError('tamper accepted')
    except ValueError as e:assert 'unbound' in str(e)
    (root/'test.wav').write_bytes(b'fixture-only-test')
    f=dataset/'train.jsonl';row=json.loads(f.read_text(encoding='utf-8'));row['sourceKind']='synthetic';f.write_text(json.dumps(row)+'\n',encoding='utf-8');ready['rawSplitHashes']['train']=g.corpus.sha(f)
    try:g.export_prepared(ready,root/'bad');raise AssertionError('synthetic accepted')
    except ValueError as e:assert 'synthetic' in str(e)
print('export contract passed; no corpus validation, model loading or training inferred')
`;
  const {stdout}=await promisify(execFile)(python,['-X','utf8','-I','-c',code],{windowsHide:true});assert.match(stdout,/export contract passed/);
});
