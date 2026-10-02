import {mkdir,copyFile} from 'node:fs/promises';
const base=new URL('../',import.meta.url);
await mkdir(new URL('dist/licenses/',base),{recursive:true});
for(const file of ['react-MIT.txt','hono-MIT.txt','zod-MIT.txt'])await copyFile(new URL('docs/licenses/'+file,base),new URL('dist/licenses/'+file,base));
await copyFile(new URL('LICENSE',base),new URL('dist/licenses/freedom-erp-MIT.txt',base));
await copyFile(new URL('NOTICE',base),new URL('dist/NOTICE.txt',base));
