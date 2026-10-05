#!/usr/bin/env node
import {mkdir,readFile,writeFile,lstat,readdir,unlink,access} from 'node:fs/promises';
import {constants} from 'node:fs';
import {resolve,join,dirname,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {createRequire} from 'node:module';
import {normalizeLaunchConfig} from './launch-config.mjs';
import {openBrowser} from './browser-opener.mjs';

const packageRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const known=new Set(['industry','name','modules','directory','port','config','open','doctor','dry-run','help']);
const boolFlags=new Set(['help','dry-run','open','doctor']);
const help=`Freedom ERP CRM（僅模擬資料與 SIM 測試幣）
用法：npx --yes github:mars-tw/freedom-erp-crm --config launch.json --open
或：npx --yes github:mars-tw/freedom-erp-crm --industry retail --name '我的店'
--industry retail|wholesale|service|restaurant|manufacturing|ecommerce|projects|general
--name 名稱  --modules crm,inventory,sales,wallets  --directory 獨立資料目錄
--port 8788|auto  --open（服務就緒後開啟瀏覽器）
--config launch.json（資料目錄以設定檔所在位置為基準）
--doctor（只檢查環境與設定，不建立檔案或啟動服務）
--dry-run（建立設定並檢查，不啟動服務）`;
const canonical=value=>JSON.stringify(value,(_key,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
const same=(a,b)=>canonical(a)===canonical(b);
const plain=value=>value&&typeof value==='object'&&!Array.isArray(value);

async function assertNoLinks(path){
 let cursor=resolve(path);
 while(true){try{if((await lstat(cursor)).isSymbolicLink())throw Error('實例路徑不能包含符號連結。');}catch(e){if(e.code!=='ENOENT')throw e;}const parent=dirname(cursor);if(parent===cursor)break;cursor=parent;}
}
async function optionalStat(path){try{return await lstat(path);}catch(e){if(e.code==='ENOENT')return null;throw e;}}
function storagePathBudget(directory,hash){
 const database='a'.repeat(64)+'.sqlite-wal';
 const longest=Math.max(
  join(directory,'state','v3','do',`freedom-local-${hash}-BusinessWorkspace`,database).length,
  join(directory,'state','v3','observability','miniflare-wobs-trace-store',database).length,
 );
 // workerd's SQLite files still encounter the Windows MAX_PATH boundary.
 if(process.platform==='win32'&&longest>=260)throw Error(`資料目錄過長：workerd 儲存路徑預計 ${longest} 字元，Windows 須少於 260 字元。請將建置包解壓至較短的資料夾（例如 C:\\Freedom），再重新啟動；尚未建立或覆寫資料。`);
 return longest;
}
async function regularFile(path){const stat=await optionalStat(path);if(stat&&(!stat.isFile()||stat.isSymbolicLink()))throw Error('實例的設定與鎖定檔須為一般檔案，未覆寫資料。');return stat;}
async function readJson(path,message){try{return JSON.parse(await readFile(path,'utf8'));}catch(e){if(e.code==='ENOENT')return undefined;throw Error(message);}}
async function portAvailable(port){return new Promise(done=>{const probe=createServer();probe.once('error',()=>done(false));probe.listen(port,'127.0.0.1',()=>probe.close(()=>done(true)));});}
async function choosePort(requested,existing,probe){
 if(requested!=='auto'){if(probe&&!await portAvailable(requested))throw Error(`連接埠 ${requested} 已在使用或無法存取。請選擇 --port 與獨立 --directory。`);return requested;}
 for(let candidate=existing?.port??8788;candidate<=65535;candidate++)if(await portAvailable(candidate))return candidate;
 throw Error('找不到可使用的本機連接埠。');
}
function validateProfile(existing,launch,catalog){
 if(!plain(existing)||existing.format!=='freedom-erp-instance-v1'||Object.keys(existing).some(k=>!['format','industry','company_name','modules','port','auto_setup','simulation','real_finance'].includes(k))||!Number.isInteger(existing.port)||existing.simulation!==true||existing.real_finance!==false||Object.hasOwn(existing,'auto_setup')&&typeof existing.auto_setup!=='boolean')throw Error('已有實例設定格式不符，未覆寫資料。');
 let valid;try{valid=normalizeLaunchConfig({...existing,format:'freedom-erp-launch-v1',auto_setup:existing.auto_setup??false},catalog);}catch{throw Error('已有實例設定格式不符，未覆寫資料。');}
 if(valid.port==='auto'||!same(valid.modules,existing.modules)||valid.company_name!==existing.company_name)throw Error('已有實例設定格式不符，未覆寫資料。');
 for(const key of ['industry','company_name','modules','auto_setup','simulation','real_finance'])if(!same(valid[key],launch[key]))throw Error('目錄已有不同的企業或設定。請指定另一個 --directory，未覆寫資料。');
 if(launch.port!=='auto'&&existing.port!==launch.port)throw Error('目錄已有不同的企業或設定。請指定另一個 --directory，未覆寫資料。');
}
async function inspectDirectory(directory,launch,catalog){
 await assertNoLinks(directory);
 const stat=await optionalStat(directory);if(stat&&!stat.isDirectory())throw Error('實例資料路徑須為目錄。');
 const manifestPath=join(directory,'instance.json');await regularFile(manifestPath);
 const existing=await readJson(manifestPath,'已有實例設定無法讀取，未覆寫。');
 if(existing){validateProfile(existing,launch,catalog);await regularFile(join(directory,'wrangler.json'));const storage=await optionalStat(join(directory,'state'));if(storage&&(!storage.isDirectory()||storage.isSymbolicLink()))throw Error('實例儲存路徑須為一般目錄，未覆寫資料。');}
 else if(stat&&(await readdir(directory)).filter(name=>name!=='.freedom-runtime.lock').length)throw Error('目錄已有其他檔案，未覆寫。');
 const lockPath=join(directory,'.freedom-runtime.lock');await regularFile(lockPath);
 const lock=await readJson(lockPath,'實例鎖定檔無法讀取，未覆寫。');
 if(lock){if(!plain(lock)||!Number.isInteger(lock.pid)||lock.pid<=0||typeof lock.token!=='string'||!/^[a-f0-9-]{36}$/.test(lock.token)||Object.keys(lock).some(k=>!['pid','token'].includes(k)))throw Error('實例鎖定檔格式不符，未覆寫。');let alive=true;try{process.kill(lock.pid,0);}catch(e){if(e.code==='ESRCH')alive=false;}if(alive)throw Error('這個實例已在執行。請使用目前的服務，或關閉原視窗後再啟動。');}
 return {existing,staleLock:lock};
}
async function acquireLease(directory,staleLock){
 const path=join(directory,'.freedom-runtime.lock'),guard=join(directory,'.freedom-start.lock'),token=randomUUID();
 // Serialize every acquisition, including recovery of a dead process's lease.
 // A leftover guard is refused conservatively; it is never auto-deleted.
 try{await writeFile(guard,JSON.stringify({pid:process.pid,token})+'\n',{encoding:'utf8',flag:'wx'});}catch(e){if(e.code==='EEXIST')throw Error('實例啟動鎖已存在。請確認其他啟動視窗已關閉；若上次意外中斷，再移除 .freedom-start.lock 後重試。');throw e;}
 try{
  if(staleLock){await assertNoLinks(directory);await regularFile(path);if(!same(await readJson(path,'實例鎖定檔無法讀取。'),staleLock))throw Error('實例正在由另一個程序啟動，請稍後再試。');await unlink(path);}
  try{await writeFile(path,JSON.stringify({pid:process.pid,token})+'\n',{encoding:'utf8',flag:'wx'});}catch(e){if(e.code==='EEXIST')throw Error('實例正在由另一個程序啟動，請稍後再試。');throw e;}
 }finally{try{await assertNoLinks(directory);await regularFile(guard);const held=await readJson(guard,'無法讀取啟動鎖。');if(held?.pid===process.pid&&held.token===token)await unlink(guard);}catch{/* Retain an unverifiable guard. */}}
 return async()=>{try{await assertNoLinks(directory);await regularFile(path);const lock=await readJson(path,'無法讀取實例鎖定檔。');if(lock?.pid===process.pid&&lock.token===token)await unlink(path);}catch{/* Never remove a lock we cannot establish as ours. */}};
}
async function runtimeConfig(directory,launch,hash,existing){
 const base=JSON.parse(await readFile(join(packageRoot,'wrangler.jsonc'),'utf8'));
 const desired={...base,name:'freedom-local-'+hash,main:join(packageRoot,'src','worker.ts'),assets:{...base.assets,directory:join(packageRoot,'dist')},vars:{...base.vars,DEFAULT_INDUSTRY:launch.industry,DEFAULT_COMPANY:launch.company_name,DEFAULT_MODULES:launch.modules.join(','),PUBLIC_DEMO:'false',...(launch.auto_setup?{AUTO_SETUP:'true'}:{})}};
 const path=join(directory,'wrangler.json');
 if(!existing)return {desired,path,refresh:false};
 const stored=await readJson(path,'已有執行設定無法讀取，未覆寫。');
 if(!plain(stored)||typeof stored.main!=='string'||!isAbsolute(stored.main)||!plain(stored.assets)||typeof stored.assets.directory!=='string'||!isAbsolute(stored.assets.directory))throw Error('已有執行設定格式不符，未覆寫資料。');
 const priorRoot=dirname(dirname(stored.main));
 if(stored.main!==join(priorRoot,'src','worker.ts')||stored.assets.directory!==join(priorRoot,'dist')||!same({...stored,main:desired.main,assets:{...stored.assets,directory:desired.assets.directory}},desired))throw Error('已有執行設定與實例不符，未覆寫資料。');
 return {desired,path,refresh:!same(stored,desired)};
}
async function waitReady(url,launch,exit){
 const deadline=Date.now()+90000;
 while(Date.now()<deadline){
  const readiness=(async()=>{try{const [healthResponse,templatesResponse]=await Promise.all([fetch(url+'/api/health',{signal:AbortSignal.timeout(1500)}),fetch(url+'/api/templates',{signal:AbortSignal.timeout(1500)})]);if(!healthResponse.ok||!templatesResponse.ok)return false;const health=await healthResponse.json(),data=await templatesResponse.json();return health.name==='freedom-erp-crm'&&health.currency==='SIM'&&health.simulation===true&&health.real_finance===false&&data.defaults?.public_demo===false&&data.defaults.industry===launch.industry&&data.defaults.company_name===launch.company_name&&same(data.defaults.modules,launch.modules)&&data.defaults.auto_setup===launch.auto_setup;}catch{return false;}})();
  const event=await Promise.race([readiness.then(ready=>({ready})),exit.then(result=>({exit:result}))]);
  if('exit' in event)throw Error(`本機服務尚未就緒就退出：${event.exit.code??event.exit.signal??event.exit.error?.message??'未知原因'}`);
  if(event.ready)return;
  await Promise.race([new Promise(done=>setTimeout(done,300)),exit.then(result=>{throw Error(`本機服務尚未就緒就退出：${result.code??result.signal??'未知原因'}`);})]);
 }
 throw Error('本機服務啟動逾時（90 秒）。請檢查上方錯誤後重新啟動。');
}
async function main(){
 const options={},args=process.argv.slice(2);
 for(let i=0;i<args.length;i++){const match=/^--([a-z-]+)(?:=(.*))?$/.exec(args[i]);if(!match||!known.has(match[1]))throw Error(`不支援的參數：${args[i]}`);const key=match[1];if(Object.hasOwn(options,key))throw Error(`參數重複：--${key}`);if(boolFlags.has(key)){if(match[2]!==undefined)throw Error(`--${key} 不接受值`);options[key]=true;continue;}const value=match[2]??args[++i];if(!value||value.startsWith('--'))throw Error(`--${key} 需要值`);options[key]=value;}
 if(options.help){console.log(help);return;}
 if(Number(process.versions.node.split('.')[0])<24)throw Error('需要 Node.js 24 或更新版本。');
 const catalog=JSON.parse(await readFile(join(packageRoot,'templates','catalog.json'),'utf8'));
 let launch,directory;
 if(options.config){
  if(['industry','name','modules','directory','port'].some(k=>Object.hasOwn(options,k)))throw Error('--config 不能與 --industry、--name、--modules、--directory 或 --port 混用。');
  const configPath=resolve(options.config);await assertNoLinks(configPath);await regularFile(configPath);
  const raw=await readJson(configPath,'建置設定無法讀取，請使用有效的 JSON。');if(raw===undefined)throw Error('找不到建置設定檔。');launch=normalizeLaunchConfig(raw,catalog);directory=resolve(dirname(configPath),launch.directory);
 }else{
  const industry=options.industry??'retail',template=catalog.templates.find(t=>t.id===industry);
  if(!template)throw Error('無效產業。'+help);
  launch=normalizeLaunchConfig({format:'freedom-erp-launch-v1',industry,company_name:options.name??'我的模擬企業',modules:options.modules?options.modules.split(',').map(v=>v.trim()):[...template.modules],port:options.port==='auto'?'auto':Number(options.port??8788),auto_setup:false},catalog);
  const hash=createHash('sha256').update(industry+'\n'+launch.company_name).digest('hex').slice(0,10);directory=resolve(options.directory??join('.freedom-instance',industry+'-'+hash));
 }
 if(directory===packageRoot)throw Error('實例目錄不能覆寫程式專案。');
 const hash=createHash('sha256').update(launch.industry+'\n'+launch.company_name).digest('hex').slice(0,10);
 const workerdPathLength=storagePathBudget(directory,hash);
 const {existing,staleLock}=await inspectDirectory(directory,launch,catalog);
 const runtime=await runtimeConfig(directory,launch,hash,existing);
 const port=await choosePort(launch.port,existing,!options['dry-run']);
 const desired={format:'freedom-erp-instance-v1',industry:launch.industry,company_name:launch.company_name,modules:launch.modules,port,...(options.config?{auto_setup:launch.auto_setup}:{}),simulation:true,real_finance:false};
 const output={...desired,directory,storage:join(directory,'state'),profile:join(directory,'instance.json'),url:`http://127.0.0.1:${port}`};
 if(options.doctor){
  const dependencyRoot=dirname(createRequire(import.meta.url).resolve('wrangler/package.json')),wrangler=join(dependencyRoot,'bin','wrangler.js');
  await access(join(packageRoot,'dist','index.html'),constants.R_OK);await access(wrangler,constants.R_OK);
  let writable=directory;while(!await optionalStat(writable))writable=dirname(writable);await access(writable,constants.W_OK);
  console.log(JSON.stringify({...output,doctor:true,ready:false,auto_setup:launch.auto_setup,checks:{node:process.versions.node,ui_build:true,runtime:true,directory_writable:true,profile:existing?'resume':'new',port_available:await portAvailable(port),workerd_path_length:workerdPathLength,...(process.platform==='win32'?{workerd_path_limit:259}:{})}}));return;
 }
 if(!options['dry-run']){try{await access(join(packageRoot,'dist','index.html'),constants.R_OK);}catch{throw Error('尚未建置介面。請在原始碼專案先執行 npm run build；GitHub 安裝會自動建置。');}}
 await mkdir(directory,{recursive:true});const release=await acquireLease(directory,staleLock);
 let child;
 try{
  // Recheck profile after taking the lease, before any configuration writes.
  await assertNoLinks(directory);await regularFile(output.profile);
  const latest=await readJson(output.profile,'已有實例設定無法讀取，未覆寫。');if(!same(latest,existing))throw Error('實例設定已由另一個程序變更，未覆寫資料。');
  if(!existing){await writeFile(runtime.path,JSON.stringify(runtime.desired,null,2)+'\n',{encoding:'utf8',flag:'wx'});await writeFile(output.profile,JSON.stringify(desired,null,2)+'\n',{encoding:'utf8',flag:'wx'});}
  else{if(runtime.refresh)await writeFile(runtime.path,JSON.stringify(runtime.desired,null,2)+'\n','utf8');if(existing.port!==port)await writeFile(output.profile,JSON.stringify({...existing,port},null,2)+'\n','utf8');}
  if(options['dry-run']){console.log(JSON.stringify(output));return;}
  const dependencyRoot=dirname(createRequire(import.meta.url).resolve('wrangler/package.json')),wrangler=join(dependencyRoot,'bin','wrangler.js');
  console.log(`正在啟動 ${launch.company_name}。資料目錄：${directory}`);
  child=spawn(process.execPath,[wrangler,'dev','--config',runtime.path,'--persist-to',output.storage,'--port',String(port),'--ip','127.0.0.1','--inspector-port','0'],{cwd:packageRoot,stdio:'inherit',shell:false,windowsHide:true});
  const exit=new Promise(done=>{child.once('error',error=>done({error}));child.once('exit',(code,signal)=>done({code,signal}));});
  const stop=signal=>child?.kill(signal);
  const onInt=()=>stop('SIGINT'),onTerm=()=>stop('SIGTERM');process.on('SIGINT',onInt);process.on('SIGTERM',onTerm);
  try{
   await waitReady(output.url,launch,exit);
   console.log(JSON.stringify({...output,ready:true,auto_setup:launch.auto_setup}));
   console.log(`已就緒：${output.url}/#learning\n設定：${output.profile}\n資料：${output.storage}\n按 Ctrl+C 停止，重新執行相同指令即可繼續使用。`);
   if(options.open){try{await openBrowser(output.url+'/#learning');}catch(e){console.error(`服務已就緒，瀏覽器未能自動開啟。請手動開啟 ${output.url}/#learning。${e.message}`);}}
   const result=await exit;if(result.error)throw result.error;if(result.code!==0&&result.code!==null){process.exitCode=result.code;throw Error(`本機服務退出：${result.code}`);}
  }catch(e){if(child.exitCode===null&&child.signalCode===null){stop('SIGTERM');await exit;}throw e;}
  finally{process.removeListener('SIGINT',onInt);process.removeListener('SIGTERM',onTerm);}
 }finally{await release();}
}
main().catch(error=>{console.error(error instanceof Error?error.message:'無法建立模擬系統');process.exitCode=process.exitCode||1;});
