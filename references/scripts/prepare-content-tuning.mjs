import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {prepareContentDataset} from '../src/knowledge/content-tuning.mjs';
import {loadIndex,privateKnowledgeDir} from '../src/knowledge/index.mjs';

try {
  const input=process.argv[2];
  if(!input||!path.isAbsolute(input))throw new Error('Pass an absolute private reviewed-examples.jsonl file; empty input is not fabricated from existing captions');
  const records=(await readFile(input,'utf8')).split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line));
  const directory=process.env.TIKTOK_KNOWLEDGE_DIR??privateKnowledgeDir;
  const result=prepareContentDataset(records,await loadIndex(directory));
  const output=path.join(directory,'content-tuning',result.manifest.datasetHash.slice(0,16));
  await mkdir(output,{recursive:true});
  for(const split of ['train','validation','heldout'])await writeFile(path.join(output,`${split}.jsonl`),result[split].map(r=>JSON.stringify(r)).join('\n')+'\n',{mode:0o600});
  await writeFile(path.join(output,'manifest.json'),JSON.stringify(result.manifest,null,2),{mode:0o600});
  console.log(JSON.stringify({output,...result.manifest},null,2));
  if(!result.manifest.ready)process.exitCode=2;
}catch(e){console.error(e.message);process.exitCode=1;}
