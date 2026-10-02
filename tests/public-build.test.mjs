import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp,mkdir,writeFile,rm,realpath} from 'node:fs/promises';
import {join,relative,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {verifyPublicBuild} from '../scripts/verify-public-build.mjs';

async function fixture(handler,run){
  const root=fileURLToPath(new URL('../.audit-tmp/public-build-fixtures/',import.meta.url));await mkdir(root,{recursive:true});
  const dir=await mkdtemp(join(root,'case-'));await mkdir(join(dir,'assets'));
  const html='<script src="/assets/app-new.js"></script><link href="/assets/app-new.css">';
  await writeFile(join(dir,'index.html'),html);await writeFile(join(dir,'assets/app-new.js'),'new javascript');await writeFile(join(dir,'assets/app-new.css'),'new styles');
  const server=createServer(handler);await new Promise(done=>server.listen(0,'127.0.0.1',done));
  try{await run({url:`http://127.0.0.1:${server.address().port}/`,distDir:dir,html});}finally{
    await new Promise(done=>server.close(done));
    const actual=await realpath(dir),inside=relative(await realpath(root),actual),workspace=relative(await realpath(fileURLToPath(new URL('../',import.meta.url))),actual);
    if(!/^case-[^\\/]+$/.test(inside)||isAbsolute(inside)||workspace.startsWith('..')||isAbsolute(workspace))throw new Error('Refusing cleanup outside the verified test directory.');
    await rm(actual,{recursive:true,force:true});
  }
}

test('deployment verification waits through old HTML and checks the bytes of both published assets',async()=>{
  let reads=0;await fixture((req,res)=>{if(req.url==='/')res.end(++reads<3?'<script src="/assets/old.js"></script>':'<script src="/assets/app-new.js"></script><link href="/assets/app-new.css">');else res.end(req.url.endsWith('.js')?'new javascript':'new styles');},async opts=>{const result=await verifyPublicBuild({...opts,timeoutMs:2000,intervalMs:1});assert.equal(result.ready,true);assert.equal(result.attempts,3);assert.equal(result.assets.length,2);});
});
test('matching filenames alone cannot pass a deployment with stale asset bytes',async()=>{
  await fixture((req,res)=>res.end(req.url==='/'?'<script src="/assets/app-new.js"></script><link href="/assets/app-new.css">':'wrong bytes'),async opts=>{await assert.rejects(verifyPublicBuild({...opts,timeoutMs:500,intervalMs:25}),/asset bytes/);});
});
test('deployment checks reject redirects and URLs containing embedded credentials',async()=>{
  await fixture((_req,res)=>{res.writeHead(302,{Location:'https://example.invalid/'});res.end();},async opts=>{await assert.rejects(verifyPublicBuild({...opts,timeoutMs:500,intervalMs:25}),/not verified/);await assert.rejects(verifyPublicBuild({...opts,url:'http://name:password@127.0.0.1/'}),/without embedded credentials/);});
});
