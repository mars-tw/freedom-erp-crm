#!/usr/bin/env node
import {mkdir,readFile,writeFile,lstat,readdir} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {createRequire} from 'node:module';

const packageRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const known=new Set(['industry','name','modules','directory','port','dry-run','help']);
const help=`Freedom ERP CRM（僅模擬資料與測試幣）
用法：npx --yes github:mars-tw/freedom-erp-crm --industry retail --name '我的店'
--industry retail|wholesale|service|restaurant|manufacturing|ecommerce|projects|general
--name 名稱  --modules crm,inventory,sales,wallets  --directory 獨立資料目錄
--port 8788  --dry-run（建立設定並檢查，不啟動服務）`;

async function main(){
 const options={};
 const args=process.argv.slice(2);
 for(let i=0;i<args.length;i++){
  const match=/^--([a-z-]+)(?:=(.*))?$/.exec(args[i]);
  if(!match||!known.has(match[1]))throw Error(`不支援的參數：${args[i]}`);
  const key=match[1];if(Object.hasOwn(options,key))throw Error(`參數重複：--${key}`);
  if(['help','dry-run'].includes(key)){if(match[2]!==undefined)throw Error(`--${key} 不接受值`);options[key]=true;continue;}
  const value=match[2]??args[++i];if(!value||value.startsWith('--'))throw Error(`--${key} 需要值`);options[key]=value;
 }
 if(options.help){console.log(help);return;}
 if(Number(process.versions.node.split('.')[0])<24)throw Error('需要 Node.js 24 或更新版本。');
 const catalog=JSON.parse(await readFile(join(packageRoot,'templates','catalog.json'),'utf8'));
 const {templates,moduleDependencies}=catalog;
 const industry=options.industry??'retail';const template=templates.find(t=>t.id===industry);
 if(!template)throw Error('無效產業。'+help);
 const company=String(options.name??'我的模擬企業').trim();
 if(!company||company.length>100||/[\u0000-\u001f]/.test(company))throw Error('名稱須為 1–100 字，不能包含控制字元。');
 const modules=options.modules?String(options.modules).split(',').map(v=>v.trim()):[...template.modules];
 const allowed=new Set(templates.flatMap(t=>t.modules));
 if(modules.length===0||new Set(modules).size!==modules.length||modules.some(v=>!allowed.has(v)))throw Error('模組名稱無效或重複。');
 for(const name of modules)for(const dependency of moduleDependencies[name]??[])if(!modules.includes(dependency))throw Error(`${name} 需要模組 ${dependency}`);
 const port=Number(options.port??8788);if(!Number.isInteger(port)||port<1024||port>65535)throw Error('連接埠須為 1024–65535 的整數。');
 if(!options['dry-run'])await new Promise((done,reject)=>{const probe=createServer();probe.once('error',()=>reject(Error(`連接埠 ${port} 已在使用或無法存取。請選擇 --port 與獨立 --directory。`)));probe.listen(port,'127.0.0.1',()=>probe.close(done));});
 const hash=createHash('sha256').update(industry+'\n'+company).digest('hex').slice(0,10);
 const directory=resolve(String(options.directory??join('.freedom-instance',industry+'-'+hash)));
 if(directory===packageRoot)throw Error('實例目錄不能覆寫程式專案。');
 // Never follow a pre-existing symbolic path into a different store's files.
 let cursor=directory;while(cursor!==dirname(cursor)){try{if((await lstat(cursor)).isSymbolicLink())throw Error('實例路徑不能包含符號連結。');}catch(e){if(e.code!=='ENOENT')throw e;}cursor=dirname(cursor);}
 const manifestPath=join(directory,'instance.json');let existing;
 try{existing=JSON.parse(await readFile(manifestPath,'utf8'));}catch(e){if(e.code!=='ENOENT')throw Error('已有實例設定無法讀取，未覆寫。');}
 const desired={format:'freedom-erp-instance-v1',industry,company_name:company,modules,port,simulation:true,real_finance:false};
 if(existing){
  if(JSON.stringify(existing)!==JSON.stringify(desired))throw Error('目錄已有不同的企業或設定。請指定另一個 --directory，未覆寫資料。');
 }else{
  try{if((await readdir(directory)).length)throw Error('目錄已有其他檔案，未覆寫。');}catch(e){if(e.code!=='ENOENT')throw e;}
  await mkdir(directory,{recursive:true});
  const base=JSON.parse(await readFile(join(packageRoot,'wrangler.jsonc'),'utf8'));
  const config={...base,name:'freedom-local-'+hash,main:join(packageRoot,'src','worker.ts'),assets:{...base.assets,directory:join(packageRoot,'dist')},vars:{...base.vars,DEFAULT_INDUSTRY:industry,DEFAULT_COMPANY:company,DEFAULT_MODULES:modules.join(','),PUBLIC_DEMO:'false'}};
  await writeFile(join(directory,'wrangler.json'),JSON.stringify(config,null,2)+'\n',{encoding:'utf8',flag:'wx'});
  await writeFile(manifestPath,JSON.stringify(desired,null,2)+'\n',{encoding:'utf8',flag:'wx'});
 }
 const output={...desired,directory,storage:join(directory,'state'),url:`http://127.0.0.1:${port}`};
 if(options['dry-run']){console.log(JSON.stringify(output));return;}
 try{await readFile(join(packageRoot,'dist','index.html'));}catch{throw Error('尚未建置介面。請在原始碼專案先執行 npm run build；GitHub 安裝會自動建置。');}
 console.log(`已建立 ${company}（${template.name}）。開啟 ${output.url}\n資料保存在 ${output.storage}。按 Ctrl+C 停止，重新執行相同指令可繼續使用。`);
 const dependencyRoot=dirname(createRequire(import.meta.url).resolve('wrangler/package.json'));
 const wrangler=join(dependencyRoot,'bin','wrangler.js');
 const child=spawn(process.execPath,[wrangler,'dev','--config',join(directory,'wrangler.json'),'--persist-to',output.storage,'--port',String(port),'--ip','127.0.0.1','--inspector-port','0'],{cwd:packageRoot,stdio:'inherit',shell:false});
 for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
 await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>code===0||code===null?resolve():reject(Error(`本機服務退出：${code}`)));});
}
main().catch(error=>{console.error(error instanceof Error?error.message:'無法建立模擬系統');process.exitCode=1;});
