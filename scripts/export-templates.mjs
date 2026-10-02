import {mkdir,writeFile} from 'node:fs/promises';
import {transform} from 'esbuild';
import {readFile} from 'node:fs/promises';
// The shipped CLI reads JSON; Node 24 deliberately refuses TS stripping in node_modules.
const source=await readFile(new URL('../src/templates.ts',import.meta.url),'utf8');
const {code}=await transform(source,{loader:'ts',format:'esm',target:'es2023'});
const {templates,moduleDependencies}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
await mkdir(new URL('../templates/',import.meta.url),{recursive:true});
await writeFile(new URL('../templates/catalog.json',import.meta.url),JSON.stringify({format:'freedom-template-catalog-v1',templates,moduleDependencies},null,2)+'\n');
