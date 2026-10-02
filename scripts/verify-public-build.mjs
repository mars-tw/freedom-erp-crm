import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const assetPaths=html=>[...html.matchAll(/(?:src|href)=["'](\/assets\/[^"']+\.(?:js|css))["']/g)].map(match=>match[1]).sort();

/** Check the actual served bytes before accepting a deployed frontend. */
export async function verifyPublicBuild({url,distDir=resolve(dirname(fileURLToPath(import.meta.url)),'../dist'),timeoutMs=60000,intervalMs=2000,onAttempt=()=>{}}){
  const target=new URL(url);
  if(!['http:','https:'].includes(target.protocol)||target.username||target.password)throw new Error('Use an HTTP(S) URL without embedded credentials.');
  target.hash='';
  const html=await readFile(resolve(distDir,'index.html'),'utf8');
  const paths=[...new Set(assetPaths(html))];
  if(!paths.some(path=>path.endsWith('.js'))||!paths.some(path=>path.endsWith('.css'))||paths.some(path=>path.includes('..')))throw new Error('Build the local frontend before checking its deployment.');
  const expected=new Map(await Promise.all(paths.map(async path=>[path,digest(await readFile(resolve(distDir,'.'+path)))])));
  const deadline=Date.now()+timeoutMs;
  let attempts=0,last='Public build not checked.';
  do {
    attempts++;
    try {
      const signal=AbortSignal.timeout(Math.max(1,Math.min(5000,deadline-Date.now())));
      const response=await fetch(target,{signal,redirect:'error',headers:{'Cache-Control':'no-cache'}});
      if(!response.ok)throw new Error(`HTML returned ${response.status}.`);
      const actualPaths=[...new Set(assetPaths(await response.text()))];
      if(JSON.stringify(paths)!==JSON.stringify(actualPaths))throw new Error('Public HTML still references a different build.');
      for(const path of paths){
        const asset=await fetch(new URL(path,target),{signal,redirect:'error',headers:{'Cache-Control':'no-cache'}});
        if(!asset.ok||digest(Buffer.from(await asset.arrayBuffer()))!==expected.get(path))throw new Error('Public asset bytes do not match the local build.');
      }
      return {ready:true,attempts,assets:paths};
    }catch(error){last=error instanceof Error?error.message:'Public build check failed.';onAttempt({attempts,ready:false,reason:last});}
    const remaining=deadline-Date.now();if(remaining<=0)break;
    await new Promise(done=>setTimeout(done,Math.min(intervalMs,remaining)));
  }while(Date.now()<deadline);
  throw new Error(`Public build was not verified after ${attempts} checks: ${last}`);
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  try{
    const result=await verifyPublicBuild({url:process.argv[2]||'https://freedom-erp-crm-demo.digimkt.workers.dev/',onAttempt:status=>process.stdout.write(JSON.stringify(status)+'\n')});
    process.stdout.write(JSON.stringify(result)+'\n');
  }catch(error){process.stderr.write((error instanceof Error?error.message:'Verification failed.')+'\n');process.exitCode=1;}
}
