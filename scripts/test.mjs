import {spawnSync} from 'node:child_process';import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
for(const [cwd,args] of [[path.join(root,'viet-commerce-tts'),['--test','test/*.test.mjs']],[root,['--test','test/*.test.mjs']]]){const r=spawnSync(process.execPath,args,{cwd,stdio:'inherit',windowsHide:true});if(r.status!==0)process.exit(r.status??1);}
