import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {voiceRuntime,voiceProfile,inspectWav} from '../runtime/voice-runtime.mjs';
const run=promisify(execFile),root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const [command,...args]=process.argv.slice(2),readJson=async p=>JSON.parse((await fs.readFile(p,'utf8')).replace(/^\uFEFF/,''));
const runtimeLink=async(required=false)=>{try{return await readJson(path.join(root,'runtime-link.local.json'));}catch(e){if(e.code!=='ENOENT')throw e;if(required)throw Error('Configure runtime-link.local.json with your installed local voice assets first');return {};}};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
try{
 let result;
 if(!command||command==='help'){
  result={commands:['status','prepare-script ABS_SCRIPT [LEXICON]','voice-render ABS_SCRIPT','rag-build VERIFIED_FACTS INDEX_DIR','rag-query INDEX_DIR PRODUCT_ID PROMOTION_KEY QUERY','content-tuning-prepare ABS_REVIEWED_JSONL ABS_INDEX_DIR','feedback-record REQUEST','feedback-query REQUEST','hook-review DIRECTION','providers','corpus-check --manifest FILE --output DIR','gwen-prepare --manifest FILE --output DIR'],modelTrainingExecuted:false,publicationSupported:false};
 }else if(command==='status'){
  try{const link=await runtimeLink(true),r=await voiceRuntime(link.voiceHome);result={ready:true,provider:r.provider,voice:r.voice,speed:r.speed,referenceStyle:r.referenceStyle,presets:r.presetVoices,sharedInstalledRuntime:true,modelTrainingExecuted:false,listeningApproved:false};}
  catch(e){result={ready:false,reason:e.message,modelTrainingExecuted:false};}
 }else if(command==='voice-render'){
  if(!args[0]||!path.isAbsolute(args[0]))throw Error('Pass an absolute UTF-8 Vietnamese script path');
  const text=(await fs.readFile(args[0],'utf8')).replace(/^\uFEFF/,'').trim();if(text.length<10||text.length>1500)throw Error('Script must have10–1500characters');
  const link=await runtimeLink(true),r=await voiceRuntime(link.voiceHome);if(r.provider!=='vieneu')throw Error('This shared launcher supports the existing offline VieNeu runtime only');
  const profile=voiceProfile(r),dir=path.join(root,'outputs','voice',new Date().toISOString().replace(/[:.]/g,'-')+'-'+randomUUID().slice(0,8));await fs.mkdir(dir,{recursive:true});
  const script=path.join(dir,'script.vi.txt'),config=path.join(dir,'runtime.snapshot.json'),wav=path.join(dir,'preview.wav');await fs.writeFile(script,text,{flag:'wx'});await fs.writeFile(config,JSON.stringify(r,null,2),{flag:'wx'});
  await run(r.python,['-X','utf8','-I',path.join(root,'scripts','voice-vieneu.py'),'--config',config,'--input',script,'--output',wav,'--voice',profile.voice,'--speed',String(profile.speed),'--reference-style',profile.referenceStyle],{timeout:240000,maxBuffer:1024*1024,windowsHide:true});
  const bytes=await fs.readFile(wav);result={status:'rendered_needs_listening',path:wav,sha256:sha(bytes),scriptSha256:sha(Buffer.from(text)),qa:inspectWav(bytes),provider:r.provider,...profile,offline:true,listeningApproved:false,publicationReady:false,modelTrainingExecuted:false,attribution:r.attribution??'VieNeu-TTS v3 Turbo — Phạm Nguyễn Ngọc Bảo; codec MOSS — OpenMOSS-Team.'};await fs.writeFile(path.join(dir,'receipt.json'),JSON.stringify(result,null,2),{flag:'wx'});
 }else if(command==='content-tuning-prepare'){
  if(!args[0]||!args[1]||!args.slice(0,2).every(path.isAbsolute))throw Error('Pass absolute reviewed JSONL and isolated verified-index directory');
  const env={...process.env,TIKTOK_KNOWLEDGE_DIR:args[1],LANGCHAIN_TRACING_V2:'false',LANGCHAIN_TRACING:'false',LANGSMITH_TRACING:'false'};
  try{const r=await run(process.execPath,[path.join(root,'scripts','content-tuning.bundle.mjs'),args[0]],{cwd:root,env,timeout:120000,maxBuffer:4*1024*1024,windowsHide:true});process.stdout.write(r.stdout);process.exit(0);}catch(e){if(e.code===2&&e.stdout){process.stdout.write(e.stdout);process.exit(2);}throw e;}
 }else{
  const allowed=new Set(['prepare-script','hook-review','rag-build','rag-query','feedback-record','feedback-query','providers','corpus-check','gwen-prepare','help']);if(!allowed.has(command??'help'))throw Error('Unknown kit command');
  const env={...process.env,VIET_TTS_HOME:path.join(root,'data','tts'),LANGCHAIN_TRACING_V2:'false',LANGCHAIN_TRACING:'false',LANGSMITH_TRACING:'false'};
  const link=await runtimeLink();if(link.python)env.VIET_TTS_PYTHON=link.python;
  const r=await run(process.execPath,[path.join(root,'viet-commerce-tts','src','cli.bundle.mjs'),command??'help',...args],{cwd:root,env,timeout:120000,maxBuffer:4*1024*1024,windowsHide:true});process.stdout.write(r.stdout);process.exit(0);
 }
 console.log(JSON.stringify(result,null,2));
}catch(e){console.error(e.message);process.exitCode=1;}
