import {readFile,writeFile,mkdir,rename,open,unlink} from 'node:fs/promises';
import path from 'node:path';
import {homedir} from 'node:os';
import {randomUUID,createHash} from 'node:crypto';
import {buildIndex,createKnowledgePipeline,hash,tokens} from './index.mjs';

export const voiceFeedbackFile=path.join(process.env.VIET_TTS_HOME??path.join(homedir(),'.local/share/viet-commerce-tts'),'corrections/ledger.json');
const digest=/^[a-f0-9]{64}$/u;
const byteHash=bytes=>createHash('sha256').update(bytes).digest('hex');
const iso=value=>typeof value==='string'&&/T.*(?:Z|[+-]\d\d:\d\d)$/u.test(value)&&Number.isFinite(Date.parse(value));
const fingerprint=voice=>hash({provider:voice.provider,voice:voice.voice,speed:voice.speed,temperature:voice.temperature??null,referenceStyle:voice.referenceStyle??null,modelManifestSha256:voice.modelManifestSha256,runtimeConfigSha256:voice.runtimeConfigSha256});
const requireValue=(value,message)=>{if(!value)throw Error(message);};

export async function readFeedbackVoice(receiptFile){
  requireValue(path.isAbsolute(receiptFile),'Use an absolute narration receipt path');
  const receiptBytes=await readFile(receiptFile),voice=JSON.parse(receiptBytes);
  requireValue(typeof voice.script==='string'&&voice.script.length>=10&&voice.script.length<=1500,'An exact narration script is required');
  requireValue(typeof voice.provider==='string'&&typeof voice.voice==='string'&&Number.isFinite(voice.speed),'Voice provider/profile is missing');
  for(const key of ['sha256','scriptSha256','modelManifestSha256','runtimeConfigSha256'])requireValue(digest.test(voice[key]),'Missing exact voice provenance: '+key);
  requireValue(path.isAbsolute(voice.path)&&path.isAbsolute(voice.scriptFile),'Absolute source audio/script paths required');
  requireValue(byteHash(await readFile(voice.path))===voice.sha256,'Narration audio bytes changed');
  requireValue((await readFile(voice.scriptFile,'utf8'))===voice.script&&hash(voice.script)===voice.scriptSha256,'Narration script bytes changed');
  return {voice,receiptSha256:byteHash(receiptBytes),profileKey:fingerprint(voice)};
}

export async function prepareVoiceFeedback(request){
  requireValue(request&&Object.keys(request).every(k=>['receiptFile','account','productId','issue','targetText','feedback','sourceRef','reviewedAt'].includes(k)),'Unknown feedback field; approvals cannot be imported here');
  requireValue(typeof request.account==='string'&&request.account.trim().length>0&&typeof request.productId==='string'&&request.productId.trim().length>0,'An explicit project/account and product scope is required');
  requireValue(['pronunciation','pacing','emphasis','naturalness'].includes(request.issue),'Choose an explicit voice issue');
  for(const key of ['targetText','feedback','sourceRef'])requireValue(typeof request[key]==='string'&&request[key].trim().length>0&&request[key].length<=500,'Missing/bounded review field: '+key);
  requireValue(iso(request.reviewedAt)&&Date.parse(request.reviewedAt)<=Date.now(),'Use the actual non-future review timestamp');
  const source=await readFeedbackVoice(request.receiptFile);
  requireValue(source.voice.script.includes(request.targetText),'Review target is not in this exact script');
  const record={version:1,account:request.account,productId:request.productId,receiptFile:request.receiptFile,receiptSha256:source.receiptSha256,audioSha256:source.voice.sha256,scriptSha256:source.voice.scriptSha256,profileKey:source.profileKey,provider:source.voice.provider,voice:source.voice.voice,issue:request.issue,targetText:request.targetText,feedback:request.feedback,sourceRef:request.sourceRef,reviewedAt:request.reviewedAt,decision:'rejected_needs_correction',approvedReplacement:null,trainingEligible:false};
  // Repeat ingestion of the same reviewed issue is idempotent, independent of import time.
  record.id=hash({audio:record.audioSha256,issue:record.issue,target:record.targetText,source:record.sourceRef});
  record.recordHash=hash(record);
  return record;
}

async function validateRecord(record){
  const {recordHash,...body}=record;
  requireValue(hash(body)===recordHash,'Voice feedback record checksum changed');
  requireValue(record.decision==='rejected_needs_correction'&&record.approvedReplacement===null&&record.trainingEligible===false,'Feedback cannot confer correction approval or training eligibility');
  const source=await readFeedbackVoice(record.receiptFile);
  requireValue(source.receiptSha256===record.receiptSha256&&source.profileKey===record.profileKey&&source.voice.sha256===record.audioSha256&&source.voice.scriptSha256===record.scriptSha256,'Feedback source binding changed');
  requireValue(source.voice.script.includes(record.targetText)&&iso(record.reviewedAt),'Invalid reviewed target or timestamp');
  return record;
}

export async function loadVoiceFeedback(file=voiceFeedbackFile){
  let ledger;try{ledger=JSON.parse(await readFile(file,'utf8'));}catch(error){if(error.code==='ENOENT')return [];throw error;}
  requireValue(ledger.version===1&&Array.isArray(ledger.records)&&ledger.records.length<=2000,'Invalid voice feedback ledger');
  const seen=new Set();for(const record of ledger.records){await validateRecord(record);requireValue(!seen.has(record.id),'Duplicate voice feedback identity');seen.add(record.id);}
  return ledger.records;
}

export async function recordVoiceFeedback(request,file=voiceFeedbackFile){
  const record=await prepareVoiceFeedback(request);await mkdir(path.dirname(file),{recursive:true});
  const lock=await open(file+'.lock','wx');
  try{
    const records=await loadVoiceFeedback(file),old=records.find(r=>r.id===record.id);
    if(old){requireValue(old.recordHash===record.recordHash,'Conflicting review; preserve the existing feedback event');return {id:old.id,reused:true,approvedCorrection:false};}
    records.push(record);const temp=file+'.'+randomUUID()+'.tmp';
    await writeFile(temp,JSON.stringify({version:1,records},null,2),{mode:0o600});await rename(temp,file);
    return {id:record.id,reused:false,approvedCorrection:false};
  }finally{await lock.close();await unlink(file+'.lock');}
}

export async function voiceCorrectionContext({receiptFile,query,asOf=new Date().toISOString(),topK=3,maxAgeHours=720,account,productId},file=voiceFeedbackFile){
  requireValue(typeof query==='string'&&query.trim().length>0&&query.length<=1500,'A bounded correction query is required');
  requireValue(iso(asOf)&&Date.parse(asOf)<=Date.now()&&Number.isInteger(topK)&&topK>=1&&topK<=5&&Number.isFinite(maxAgeHours)&&maxAgeHours>0&&maxAgeHours<=720,'Invalid voice retrieval bounds');
  requireValue(typeof account==='string'&&account.trim()&&typeof productId==='string'&&productId.trim(),'Account/project and product scope are required');
  const target=await readFeedbackVoice(receiptFile),when=Date.parse(asOf);
  const records=(await loadVoiceFeedback(file)).filter(r=>r.profileKey===target.profileKey&&r.account===account&&r.productId===productId&&Date.parse(r.reviewedAt)<=when&&when-Date.parse(r.reviewedAt)<=maxAgeHours*3600000);
  const index=buildIndex(records.map(r=>({sourceId:r.id,productId:r.productId,promotionKey:'voice-review-only',section:'negative-voice-review',text:`Unresolved user feedback, not an approved pronunciation rule. Issue: ${r.issue}. Target wording: ${r.targetText}. User feedback: ${r.feedback}. The target scope is the exact supplied wording only. No accepted replacement; listening review remains required.`,sourceUri:`local-voice-feedback:${r.id}`,sourceHash:r.recordHash,verified:true,verifiedAt:r.reviewedAt,validFrom:r.reviewedAt,claimFields:['voice-review-event'],timestampBasis:'recorded user feedback on exact WAV/script, not pronunciation certification'})));
  // Separate retrieval scope: a pronunciation question about “giá” must not be
  // interpreted as a request for a product price by the campaign fact retriever.
  const retriever=async request=>{
    const terms=[...new Set(tokens(request.query))];
    const hits=index.sources.map(source=>{const words=new Set(tokens(source.text)),matches=terms.filter(t=>words.has(t)).length;return {source,score:terms.length?matches/terms.length:0};}).filter(h=>h.score>=.25).sort((a,b)=>b.score-a.score||a.source.sourceId.localeCompare(b.source.sourceId)).slice(0,topK);
    return {status:hits.length?'retrieved':'abstained',reason:hits.length?null:'No relevant current feedback for this exact provider/profile/model',hits};
  };
  const result=await createKnowledgePipeline(index,{retriever}).invoke({query,productId,promotionKey:'voice-review-only',asOf,topK});
  return {...result,mode:'voice-feedback-retrieval-and-prompt-only',retrieval:'profile-filtered lexical overlap through LangChain',scope:'negative-review-memory',approvedCorrection:null,modelTrained:false,voiceModified:false,publicationReady:false};
}
