import catalog from '../templates/catalog.json';
import {normalizeLaunchConfig,type LaunchConfig} from '../bin/launch-config.mjs';
export type {LaunchConfig} from '../bin/launch-config.mjs';

const launcher=`import {readFile,access} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn,spawnSync} from 'node:child_process';
import {normalizeLaunchConfig} from './launch-schema.mjs';
const configPath=fileURLToPath(new URL('./freedom-launch.json',import.meta.url));
const folder=dirname(configPath);
const flags=new Set(process.argv.slice(2));
if([...flags].some(flag=>!['--check','--no-open','--dry-run'].includes(flag))){console.error('Unknown launcher option.');process.exit(1);}
async function findNpx(){
 const nodeFolder=dirname(process.execPath),separator=process.platform==='win32'?';':':';
 const directories=[nodeFolder,...(process.env.PATH||'').split(separator).filter(Boolean)];
 const candidates=[...new Set(directories.flatMap(dir=>[
  join(dir,'node_modules/npm/bin/npx-cli.js'),join(dir,'../lib/node_modules/npm/bin/npx-cli.js'),
  join(dir,'../share/nodejs/npm/bin/npx-cli.js'),join(dir,'../node_modules/npm/bin/npx-cli.js')
 ]))];
 for(const candidate of candidates){try{await access(candidate);return resolve(candidate);}catch{}}
 throw Error('npm / npx was not found. Install the official Node.js 24 distribution, then retry.');
}
async function main(){
 if(Number(process.versions.node.split('.')[0])<24)throw Error('Node.js 24 or newer is required: https://nodejs.org/en/download');
 const git=spawnSync('git',['--version'],{cwd:folder,encoding:'utf8',shell:false,windowsHide:true});
 if(git.error||git.status!==0)throw Error('Git is required: https://git-scm.com/downloads');
 const catalog=JSON.parse(await readFile(join(folder,'template-catalog.json'),'utf8'));
 normalizeLaunchConfig(JSON.parse(await readFile(configPath,'utf8')),catalog);
 const npx=await findNpx();
 if(flags.has('--check')){console.log(JSON.stringify({ready:true,node:process.versions.node,git:true,npx:true,simulation:true}));return;}
 console.log('Freedom ERP CRM SIM: download the public project, validate your plan and start your local workspace.');
 const args=[npx,'--yes','github:mars-tw/freedom-erp-crm','--config',configPath];
 if(flags.has('--dry-run'))args.push('--dry-run');else if(!flags.has('--no-open'))args.push('--open');
 const child=spawn(process.execPath,args,{cwd:folder,stdio:'inherit',shell:false,windowsHide:true});
 for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
 await new Promise((done,reject)=>{child.once('error',reject);child.once('exit',code=>{if(code===0||code===null)done();else reject(Error('The local workspace stopped with exit code '+code));});});
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Unable to start the simulation workspace.');process.exitCode=1;});
`;
const windows=`@echo off\r\nsetlocal DisableDelayedExpansion\r\nwhere node >nul 2>nul\r\nif errorlevel 1 (\r\n  echo Node.js 24 is required: https://nodejs.org/en/download\r\n  pause\r\n  exit /b 1\r\n)\r\nnode "%~dp0launch.mjs"\r\nif errorlevel 1 (\r\n  echo Please review the message above. Your existing workspace is not overwritten.\r\n  pause\r\n  exit /b 1\r\n)\r\n`;
const shell=`#!/bin/sh\nset -eu\nfolder=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)\nif ! command -v node >/dev/null 2>&1; then\n  echo "Node.js 24 is required: https://nodejs.org/en/download" >&2\n  exit 1\nfi\nexec node "$folder/launch.mjs"\n`;

export function launchConfigText(value:LaunchConfig):string{return JSON.stringify(normalizeLaunchConfig(value,catalog),null,2)+'\n';}
export function setupCommand(value:LaunchConfig):string{normalizeLaunchConfig(value,catalog);return 'npx --yes github:mars-tw/freedom-erp-crm --config ./freedom-launch.json --open';}
export function launchKitFiles(value:LaunchConfig,schemaSource:string):Record<string,string>{
 const config=normalizeLaunchConfig(value,catalog);
 if(typeof schemaSource!=='string'||!schemaSource.includes('normalizeLaunchConfig'))throw new Error('建置包缺少設定檢查程式。');
 return {'freedom-launch.json':JSON.stringify(config,null,2)+'\n','start.cmd':windows,'start.sh':shell,'launch.mjs':launcher,'launch-schema.mjs':schemaSource,'template-catalog.json':JSON.stringify(catalog,null,2)+'\n',
  'README.txt':`Freedom ERP CRM 一鍵啟動包\n\n店名：${config.company_name}\n產業：${config.industry}\n只使用 SIM 與模擬商品，沒有銀行、正式會計、發票或物流連線。\n\n1. 先安裝 Node.js 24 與 Git，且需要網路下載公開專案。\n2. 將這個 ZIP 解壓到自己的資料夾。\n3. Windows：雙擊 start.cmd。macOS／Linux：在終端機執行 sh start.sh。\n\n啟動後會開啟已配置的工作區。連接埠自動選擇，資料放在此資料夾的 ${config.directory}。\n關閉服務後，用同一啟動檔與瀏覽器接續；保留 cookie 才能回到原訪客資料。\n不要移除資料資料夾。設定不符時會拒絕覆寫，請改用另一個新資料夾。\n原啟動視窗按 Ctrl+C 停止。跨裝置同步與正式營運不在本測試版範圍。\n\n如果系統限制啟動檔，可在同資料夾的終端機執行：\n${setupCommand(config)}\n\n檢查環境而不啟動：node launch.mjs --check\nMIT 專案：https://github.com/mars-tw/freedom-erp-crm\n`};
}

const encoder=new TextEncoder();
const crcTable=Array.from({length:256},(_,index)=>{let c=index;for(let bit=0;bit<8;bit++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
function crc32(bytes:Uint8Array){let crc=0xffffffff;for(const byte of bytes)crc=crcTable[(crc^byte)&255]^(crc>>>8);return (crc^0xffffffff)>>>0;}
function combine(parts:Uint8Array[]){const result=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let offset=0;for(const part of parts){result.set(part,offset);offset+=part.length;}return result;}
/** Store-only ZIP with fixed filenames, CRC-32 and Unix script permissions. */
export function buildLaunchKit(value:LaunchConfig,schemaSource:string):Uint8Array{
 const locals:Uint8Array[]=[],centrals:Uint8Array[]=[];let offset=0;
 for(const [filename,text] of Object.entries(launchKitFiles(value,schemaSource))){
  const name=encoder.encode(filename),data=encoder.encode(text),crc=crc32(data);
  const local=new Uint8Array(30+name.length),lv=new DataView(local.buffer);lv.setUint32(0,0x04034b50,true);lv.setUint16(4,20,true);lv.setUint16(6,0x800,true);lv.setUint16(12,0x5021,true);lv.setUint32(14,crc,true);lv.setUint32(18,data.length,true);lv.setUint32(22,data.length,true);lv.setUint16(26,name.length,true);local.set(name,30);locals.push(local,data);
  const central=new Uint8Array(46+name.length),cv=new DataView(central.buffer);cv.setUint32(0,0x02014b50,true);cv.setUint16(4,0x0314,true);cv.setUint16(6,20,true);cv.setUint16(8,0x800,true);cv.setUint16(14,0x5021,true);cv.setUint32(16,crc,true);cv.setUint32(20,data.length,true);cv.setUint32(24,data.length,true);cv.setUint16(28,name.length,true);cv.setUint32(38,((filename.endsWith('.sh')?0o100755:0o100644)*65536)>>>0,true);cv.setUint32(42,offset,true);central.set(name,46);centrals.push(central);offset+=local.length+data.length;
 }
 const directory=combine(centrals),end=new Uint8Array(22),ev=new DataView(end.buffer);ev.setUint32(0,0x06054b50,true);ev.setUint16(8,centrals.length,true);ev.setUint16(10,centrals.length,true);ev.setUint32(12,directory.length,true);ev.setUint32(16,offset,true);return combine([...locals,directory,end]);
}
