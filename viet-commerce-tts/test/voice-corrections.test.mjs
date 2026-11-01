import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {recordVoiceFeedback,voiceCorrectionContext,loadVoiceFeedback} from '../src/knowledge/voice-corrections.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
async function fixture(dir,name='one',profile='southern-female'){
  const script='Khách sắp tới nhà chơi rồi? Mình dọn chỗ ngồi trước đã.',audio=Buffer.from('synthetic test bytes, not a real listening-approved recording '+name);
  const audioFile=path.join(dir,name+'.wav'),scriptFile=path.join(dir,name+'.txt'),receiptFile=path.join(dir,name+'.json');
  await writeFile(audioFile,audio);await writeFile(scriptFile,script);
  await writeFile(receiptFile,JSON.stringify({provider:'vieneu',voice:profile,speed:1.2,temperature:.8,referenceStyle:'speaker-only',path:audioFile,scriptFile,script,sha256:sha(audio),scriptSha256:sha(script),modelManifestSha256:'a'.repeat(64),runtimeConfigSha256:'b'.repeat(64)}));
  return {receiptFile,audioFile,script,request:{receiptFile,account:'demo-store',productId:'demo-product',issue:'pronunciation',targetText:'Khách sắp tới nhà chơi rồi?',feedback:'The first sentence needs pronunciation correction.',sourceRef:'test-user-review-event',reviewedAt:new Date(Date.now()-1000).toISOString()}};
}
test('exact-source feedback is idempotent, retrieved through LangChain, and cannot confer approval/training',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'voice-feedback-'));
  try{
    const f=await fixture(dir),ledger=path.join(dir,'ledger.json');
    assert.equal((await recordVoiceFeedback(f.request,ledger)).reused,false);
    assert.equal((await recordVoiceFeedback(f.request,ledger)).reused,true);
    const result=await voiceCorrectionContext({account:'demo-store',productId:'demo-product',receiptFile:f.receiptFile,query:'Khách sắp tới nhà chơi rồi phát âm câu mở đầu'},ledger);
    assert.equal(result.status,'retrieved');assert.equal(result.sources.length,1);assert.match(result.prompt,/Unresolved user feedback/);
    assert.equal(result.approvedCorrection,null);assert.equal(result.modelTrained,false);assert.equal(result.publicationReady,false);
    assert.equal((await loadVoiceFeedback(ledger)).length,1);
    const oldTracing=process.env.LANGSMITH_TRACING;
    try{process.env.LANGSMITH_TRACING='true';await assert.rejects(voiceCorrectionContext({account:'demo-store',productId:'demo-product',receiptFile:f.receiptFile,query:'Khách sắp tới'},ledger),/refuses cloud tracing/);}
    finally{if(oldTracing===undefined)delete process.env.LANGSMITH_TRACING;else process.env.LANGSMITH_TRACING=oldTracing;}
    await assert.rejects(recordVoiceFeedback({...f.request,approved:true},ledger),/approvals cannot/);
    await assert.rejects(recordVoiceFeedback({...f.request,targetText:'not in the exact script'},ledger),/not in this exact script/);
    await assert.rejects(recordVoiceFeedback({...f.request,feedback:'changed review under the same source event'},ledger),/Conflicting review/);
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('voice retrieval abstains across profiles and stale reviews and rejects changed source bytes/ledger',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'voice-feedback-'));
  try{
    const f=await fixture(dir),other=await fixture(dir,'two','different-voice'),ledger=path.join(dir,'ledger.json');
    const old={...f.request,reviewedAt:new Date(Date.now()-48*3600000).toISOString()};await recordVoiceFeedback(old,ledger);
    assert.equal((await voiceCorrectionContext({account:'demo-store',productId:'demo-product',receiptFile:other.receiptFile,query:'Khách sắp tới nhà chơi rồi'},ledger)).status,'abstained');
    const modelOnly=await fixture(dir,'three'),modelReceipt=JSON.parse(await readFile(modelOnly.receiptFile,'utf8'));modelReceipt.modelManifestSha256='c'.repeat(64);await writeFile(modelOnly.receiptFile,JSON.stringify(modelReceipt));
    assert.equal((await voiceCorrectionContext({account:'demo-store',productId:'demo-product',receiptFile:modelOnly.receiptFile,query:'Khách sắp tới nhà chơi rồi'},ledger)).status,'abstained');
    assert.equal((await voiceCorrectionContext({account:'demo-store',productId:'demo-product',receiptFile:f.receiptFile,query:'khủng long thiên thạch'},ledger)).status,'abstained');
    assert.equal((await voiceCorrectionContext({account:'demo-store',productId:'demo-product',receiptFile:f.receiptFile,query:'Khách sắp tới nhà chơi rồi',maxAgeHours:24},ledger)).status,'abstained');
    const original=await readFile(f.audioFile);await writeFile(f.audioFile,'changed');await assert.rejects(loadVoiceFeedback(ledger),/audio bytes changed/);await writeFile(f.audioFile,original);
    const data=JSON.parse(await readFile(ledger,'utf8'));data.records[0].approvedReplacement='pretend approved';await writeFile(ledger,JSON.stringify(data));await assert.rejects(loadVoiceFeedback(ledger),/checksum changed/);
  }finally{await rm(dir,{recursive:true,force:true});}
});
