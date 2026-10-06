import {spawn} from 'node:child_process';

export function browserCommand(url,platform=process.platform,commandInterpreter=process.env.ComSpec??'cmd.exe'){
 const match=/^http:\/\/127\.0\.0\.1:(\d+)\/(?:#learning)?$/.exec(url);
 if(!match||String(Number(match[1]))!==match[1]||Number(match[1])<1024||Number(match[1])>65535)throw Error('本機網址格式不符。');
 // The URL is generated from a validated numeric port. User text never enters cmd.
 if(platform==='win32')return {command:commandInterpreter,args:['/d','/s','/c',`start "" "${url}"`],options:{shell:false,windowsHide:true,windowsVerbatimArguments:true,stdio:'ignore'}};
 return {command:platform==='darwin'?'open':'xdg-open',args:[url],options:{shell:false,windowsHide:true,stdio:'ignore'}};
}

export async function openBrowser(url,{platform=process.platform,commandInterpreter=process.env.ComSpec??'cmd.exe',spawnProcess=spawn,timeoutMs=5000}={}){
 const {command,args,options}=browserCommand(url,platform,commandInterpreter);
 if(!Number.isInteger(timeoutMs)||timeoutMs<1)throw Error('瀏覽器啟動等待時間不符。');
 await new Promise((done,reject)=>{
  const opener=spawnProcess(command,args,options);let settled=false;
  const finish=error=>{if(settled)return;settled=true;clearTimeout(timer);opener.removeListener('exit',onExit);error?reject(error):done();};
  const onExit=code=>finish(code===0?undefined:Error(`瀏覽器啟動失敗：${code}`));
  const timer=setTimeout(()=>{
   finish(Error(`瀏覽器啟動逾時（${timeoutMs} 毫秒）。`));
   // Only terminate this opener, never the browser or any workspace process.
   try{if(opener.exitCode===null&&opener.signalCode===null)opener.kill('SIGTERM');}catch{}
  },timeoutMs);
  // Retain this once-handler through timeout so a late kill/spawn error is safe.
  opener.once('error',finish);opener.once('exit',onExit);
 });
}
