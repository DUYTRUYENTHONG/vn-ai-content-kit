import {build} from 'esbuild';
await build({entryPoints:['src/content-mcp.mjs'],outfile:'dist/content-mcp.mjs',bundle:true,platform:'node',target:'node22',format:'esm',legalComments:'eof',banner:{js:"import {createRequire} from 'node:module';const require=createRequire(import.meta.url);"}});
