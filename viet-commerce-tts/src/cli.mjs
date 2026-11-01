#!/usr/bin/env node
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {prepareScript} from './editorial.mjs';
import {reviewHookDirection} from './hooks.mjs';
import {persistIndex,loadIndex,createKnowledgePipeline} from './knowledge/index.mjs';
import {recordVoiceFeedback,voiceCorrectionContext} from './knowledge/voice-corrections.mjs';
const [command,...args]=process.argv.slice(2),json=async file=>JSON.parse(await readFile(file,'utf8'));
try{
 let result;
 if(command==='providers')result=await json(fileURLToPath(new URL('../config/providers.json',import.meta.url)));
 else if(command==='prepare-script')result=prepareScript(await readFile(args[0],'utf8'),args[1]?await json(args[1]):{});
 else if(command==='hook-review')result=reviewHookDirection(await json(args[0]));
 else if(command==='rag-build'){const r=await persistIndex(await json(args[0]),args[1]);result={changed:r.changed,indexFile:r.filename,corpusHash:r.index.corpusHash};}
 else if(command==='rag-query'){const [directory,productId,promotionKey,...query]=args;result=await createKnowledgePipeline(await loadIndex(directory)).invoke({query:query.join(' '),productId,promotionKey});}
 else if(command==='feedback-record')result=await recordVoiceFeedback(await json(args[0]));
 else if(command==='feedback-query')result=await voiceCorrectionContext(await json(args[0]));
 else if(['corpus-check','gwen-prepare','tts'].includes(command)){
  const scripts={'corpus-check':'prepare-corpus.py','gwen-prepare':'prepare-gwen-training.py',tts:'synthesize-gwen.py'};
  const r=spawnSync(process.env.VIET_TTS_PYTHON??'python',['-X','utf8','-I',fileURLToPath(new URL('../scripts/'+scripts[command],import.meta.url)),...args],{stdio:'inherit',windowsHide:true});if(r.error)throw r.error;process.exitCode=r.status??1;
 }else if(!command||command==='help')result={commands:['providers','prepare-script SCRIPT.txt [LEXICON.json]','hook-review DIRECTION.json','rag-build FACTS.json [PRIVATE_INDEX_DIR]','rag-query INDEX_DIR PRODUCT_ID PROMOTION_KEY QUERY','feedback-record REQUEST.json','feedback-query REQUEST.json','corpus-check [--manifest FILE --output DIR]','gwen-prepare [--manifest FILE --output DIR]','tts --help'],modelTrainingExecuted:false};
 else throw Error('Unknown command; run help');
 if(result)console.log(JSON.stringify(result,null,2));
}catch(error){console.error(error.message);process.exitCode=1;}
