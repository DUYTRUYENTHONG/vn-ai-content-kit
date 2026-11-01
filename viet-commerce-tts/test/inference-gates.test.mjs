import test from 'node:test';import assert from 'node:assert/strict';import {promisify} from 'node:util';import {execFile} from 'node:child_process';
test('inference help and opt-in gates run without importing a model',async t=>{
 const python=process.env.VIET_TTS_PYTHON;if(!python){t.skip('Set VIET_TTS_PYTHON to test the standard-library entry point');return;}
 const run=promisify(execFile),{stdout}=await run(python,['-X','utf8','-I','scripts/synthesize-gwen.py','--help'],{windowsHide:true});assert.match(stdout,/--execute/);
 await assert.rejects(run(python,['-X','utf8','-I','scripts/synthesize-gwen.py','--model-dir','missing','--assets','missing','--reference','missing','--script','missing','--output','missing'],{windowsHide:true}),e=>/opt-in/.test(e.stderr));
 await assert.rejects(run(python,['-X','utf8','-I','scripts/synthesize-gwen.py','--execute','--model-dir','.','--assets','missing','--reference','missing','--script','missing','--output','missing'],{windowsHide:true}),e=>/outside Git/.test(e.stderr));
 const code=String.raw`
import tempfile,json,hashlib,importlib.util,sys
from pathlib import Path
spec=importlib.util.spec_from_file_location('infer','scripts/synthesize-gwen.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
with tempfile.TemporaryDirectory() as d:
 root=Path(d);model=root/'model';model.mkdir();(model/'config.json').write_text('{}');(model/'model.safetensors').write_bytes(b'fixture-only-not-model-weights')
 cfg=json.loads(Path('config/gwen.json').read_text());assets={'modelId':cfg['model'],'revision':cfg['modelRevision'],'files':[{'path':'config.json','sha256':m.sha(model/'config.json')}]};manifest=root/'assets.json';manifest.write_text(json.dumps(assets));ref=root/'ref.json';ref.write_text(json.dumps({'sourceKind':'synthetic'}));script=root/'script.txt';script.write_text('Nội dung kiểm thử tiếng Việt.',encoding='utf-8')
 sys.argv=['infer','--execute','--model-dir',str(model),'--assets',str(manifest),'--reference',str(ref),'--script',str(script),'--output',str(root/'output.wav')]
 try:m.run();raise AssertionError('incomplete snapshot accepted')
 except ValueError as e:assert 'Every local snapshot file' in str(e)
 assets['files'].append({'path':'model.safetensors','sha256':m.sha(model/'model.safetensors')});manifest.write_text(json.dumps(assets))
 try:m.run();raise AssertionError('synthetic reference accepted')
 except ValueError as e:assert 'consent' in str(e)
 assert 'torch' not in sys.modules
print('asset and consent gates precede model import')
`;
 assert.match((await run(python,['-X','utf8','-I','-c',code],{windowsHide:true})).stdout,/precede model import/);
});
