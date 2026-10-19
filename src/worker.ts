import {DurableObject} from 'cloudflare:workers';
import {Hono} from 'hono';
import {command,createWorld,report,validateWorld} from './engine.js';
import {digest,ok,Problem} from './problem.js';
import {templates} from './templates.js';
import {readWorkspaceState,writeWorkspaceState} from './workspace-storage.js';
import {backupStatus,backupTransfer,assembleBackup,discardBackup} from './workspace-backup.js';
import {applyRetention,createLineState,createSimulatedBackup,createToken,dayMs,decryptSimulatedBackup,hashForIdempotency,ingestLineMessage,projectLineState,resetExpiry,seedLineFixtures,sessionExpiry,type ConversationType,type LineAccount,type LineAudit,type LineRole,type LineState,type Quadrant,type SyncState} from './line-inbox.js';
import {createSimulatedLineAdapters} from './line-adapters.js';
const tokenHex=(size:number)=>Array.from(crypto.getRandomValues(new Uint8Array(size)),v=>v.toString(16).padStart(2,'0')).join('');
interface Env {WORKSPACES:DurableObjectNamespace<BusinessWorkspace>;ASSETS:Fetcher;DEFAULT_INDUSTRY?:string;DEFAULT_COMPANY?:string;DEFAULT_MODULES?:string;PUBLIC_DEMO?:string;AUTO_SETUP?:string;RETENTION_HOURS?:string}
interface Stored {workspace:any;csrf:string;receipts:Record<string,any>;lastAt:number;rate:{start:number;count:number};version:number}
const json=(data:any,status=200,extra:Record<string,string>={})=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...extra}});
function failure(error:unknown){if(error instanceof Problem){const wait=(error as Problem&{retryAfterMs?:number}).retryAfterMs;return json({error:{code:error.code,message:error.message,...(wait?{retry_after_ms:wait}:{})}},error.status,wait?{'Retry-After':String(Math.ceil(wait/1000))}:{});}return json({error:{code:'internal_error',message:'無法完成模擬操作，請確認原操作結果'}},500);}
const lineStateKey='line-state-v1';
const lineSessionCookie='line_session';
const lineWorkspaceCookie='line_workspace';
const lineCookie=(request:Request,name:string)=>request.headers.get('Cookie')?.split(';').map(value=>value.trim()).find(value=>value.startsWith(`${name}=`))?.slice(name.length+1)||'';
const lineRequestId=(request:Request)=>request.headers.get('X-Request-Id')||createToken(12);
const lineEmail=(value:unknown)=>typeof value==='string'&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)&&value.length<=180;
const linePassword=(value:unknown)=>typeof value==='string'&&value.length>=8&&value.length<=200;
const lineRole=(value:unknown):value is LineRole=>value==='fish'||value==='family'||value==='branch_admin';
const lineQuadrant=(value:unknown):value is Quadrant=>['important_urgent','urgent_not_important','not_important_not_urgent','important_not_urgent'].includes(String(value));
const lineSyncState=(value:unknown):value is SyncState=>['online','offline','backfilling','paused','error'].includes(String(value));
const lineHash=async(value:string)=>{let bytes=new TextEncoder().encode(value);for(let i=0;i<256;i++)bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));return Array.from(bytes,item=>item.toString(16).padStart(2,'0')).join('');};
const lineJson=async(request:Request)=>{const raw=await request.text();ok(new TextEncoder().encode(raw).length<=65536,413,'body_limit','請求太大');try{const parsed=JSON.parse(raw);ok(parsed&&typeof parsed==='object'&&!Array.isArray(parsed),422,'json_invalid','JSON 格式不符');return parsed as Record<string,any>;}catch(error){if(error instanceof Problem)throw error;throw new Problem(422,'json_invalid','JSON 格式不符');}};
const lineWriteHeaders=(request:Request,url:URL,state:LineState)=>{ok(request.method==='POST',405,'method_invalid','不支援此方法');ok(request.headers.get('Origin')===url.origin,403,'origin_invalid','拒絕跨來源寫入');ok(request.headers.get('x-csrf-token')===state.csrf,403,'csrf_failed','家庭工作階段驗證失敗');const key=request.headers.get('Idempotency-Key');ok(!!key&&/^[A-Za-z0-9_-]{8,100}$/.test(key),422,'key_required','請提供操作識別');const expected=request.headers.get('If-Match-Version');ok(!!expected&&/^\d+$/.test(expected),428,'version_required','請提供家庭資料版本');return {key:key!,expected:Number(expected)};};
const lineAudit=(state:LineState,actorId:string|null,actorRole:LineRole|'anonymous',action:string,target:string,result:LineAudit['result'],requestId:string,errorCode:string|null,now:number)=>{state.audits.push({id:createToken(12),actorId,actorRole,action,target,result,createdAt:new Date(now).toISOString(),requestId,errorCode});};
const lineErrorResponse=(error:unknown)=>failure(error);

export class BusinessWorkspace extends DurableObject<Env>{
 private readonly lineAdapters=createSimulatedLineAdapters();
 async alarm(){await this.ctx.storage.deleteAll();}
 async fetch(request:Request){try{return await this.ctx.blockConcurrencyWhile(async()=>{try{return await this.handle(request);}catch(error){return failure(error);}});}catch(error){return failure(error);}}
 private async handle(request:Request):Promise<Response>{
  if(new URL(request.url).pathname.startsWith('/api/line-'))return this.handleLine(request);
  let s=await readWorkspaceState<Stored>(this.ctx.storage);const fresh=s===undefined,now=Date.now();
  if(!s)s={workspace:null,csrf:tokenHex(32),receipts:{},lastAt:now,rate:{start:now,count:0},version:0};
  s.rate=(await this.ctx.storage.get<Stored['rate']>('rate'))??s.rate;
  if(now-s.rate.start>60000)s.rate={start:now,count:0};
  if(s.rate.count>=120){const error=new Problem(429,'rate_limit','操作較密集，請稍候接續原工作');Object.assign(error,{retryAfterMs:Math.max(1,s.rate.start+60001-now)});throw error;}
  s.rate.count++;await this.ctx.storage.put('rate',s.rate);s.lastAt=now;
  const url=new URL(request.url),path=url.pathname.replace('/api/workspace','');
  if(request.method==='GET'){
   if(fresh&&path==='/view'&&this.env.PUBLIC_DEMO==='false'&&this.env.AUTO_SETUP==='true'){s.workspace=createWorld(this.env.DEFAULT_INDUSTRY??'retail',this.env.DEFAULT_COMPANY??'我的模擬企業',this.env.DEFAULT_MODULES?.split(','),1);s.version=1;validateWorld(s.workspace);}
   await this.persist(s);
   if(path==='/view')return json({workspace:s.workspace,csrf:s.csrf,version:s.version,retention_hours:this.env.PUBLIC_DEMO==='false'?null:72,expires_at:this.env.PUBLIC_DEMO==='false'?null:new Date(s.lastAt+72*3600000).toISOString(),report:s.workspace?report(s.workspace):null});
   if(path==='/export'){ok(s.workspace,404,'workspace_missing','請先建立工作區');return json(s.workspace);}
   if(path==='/import/status')return json({...await backupStatus(this.ctx.storage,now),version:s.version});
   if(path.startsWith('/receipts/')){const receipt=s.receipts[decodeURIComponent(path.slice(10))];ok(receipt,404,'receipt_missing','找不到收據');return json({receipt});}
   return json({error:{code:'not_found',message:'找不到路徑'}},404);
  }
  ok(request.method==='POST',405,'method_invalid','不支援此方法');
  ok(request.headers.get('Origin')===url.origin,403,'origin_invalid','拒絕跨來源寫入');
  ok(request.headers.get('x-csrf-token')===s.csrf,403,'csrf_invalid','工作區驗證失敗');
  const key=request.headers.get('Idempotency-Key');ok(key&&/^[A-Za-z0-9_-]{8,100}$/.test(key),422,'key_required','請提供操作識別');
  const expected=request.headers.get('If-Match-Version');ok(expected&&/^\d+$/.test(expected),428,'version_required','請提供工作區版本');
  const text=await request.text();ok(new TextEncoder().encode(text).length<=32768,413,'body_limit','請求太大');
  let body:any;try{body=JSON.parse(text);}catch{throw new Problem(422,'json_invalid','JSON 格式不符');}
  const hash=digest({path,body,expected});
  const prior=s.receipts[key];
  if(prior){ok(prior.hash===hash,409,'idempotency_conflict','相同識別不能使用不同參數');await this.persist(s);return json({workspace:s.workspace,result:prior.result,receipt:prior,replayed:true,csrf:s.csrf,version:s.version,report:s.workspace?report(s.workspace):null});}
  ok(Number(expected)===s.version,412,'version_stale','工作區版本已更新');
  if(['/import/begin','/import/part','/import/abort'].includes(path)){const transfer=await backupTransfer(this.ctx.storage,path,body,Number(expected),s.version,key,hash,now);await this.persist(s);return json(transfer);}
  ok(Object.keys(s.receipts).length<500||['/clear','/import','/import/commit','/setup'].includes(path),429,'receipt_limit','操作數已達試用上限，請先備份，再清除或還原工作區');
  const next=structuredClone(s);let result:string|null=null;
  if(path==='/setup'){ok(!s.workspace,409,'workspace_exists','工作區已存在，請先備份及清除');next.workspace=createWorld(body.industry,body.company_name,body.modules,s.version+1);result=next.workspace.generation_id;}
  else if(path==='/commands'){ok(s.workspace,409,'workspace_missing','請先建立工作區');ok(typeof body.action==='string',422,'action_invalid','請指定操作');const applied=command(s.workspace,body.action,body.payload);next.workspace=applied.workspace;result=applied.result;}
  else if(path==='/import'||path==='/import/commit'){
   const workspace=path==='/import/commit'?await assembleBackup(this.ctx.storage,body,s.version,now):body?.workspace;ok(workspace,422,'import_invalid','請提供模擬工作區');
   try{validateWorld(workspace);}catch(error){if(error instanceof Problem)throw error;throw new Problem(422,'import_invalid','匯入結構不符');}
   next.workspace=structuredClone(workspace);next.workspace.generation_id=tokenHex(16);next.workspace.version=s.version+1;result=next.workspace.generation_id;
  }
  else if(path==='/clear'){next.workspace=null;next.csrf=tokenHex(32);result=null;}
  else throw new Problem(404,'not_found','找不到路徑');
  next.version=s.version+1;if(next.workspace){next.workspace.version=next.version;validateWorld(next.workspace);}
  const receipt={id:key,hash,expected_version:Number(expected),version:next.version,action:path==='/commands'?body.action:path,result,created_at:new Date(now).toISOString(),simulation:true};
  if(Object.keys(next.receipts).length>=500&&['/clear','/setup','/import','/import/commit'].includes(path))next.receipts=Object.fromEntries(Object.entries(next.receipts).slice(-100));
  next.receipts[key]=receipt;await this.persist(next);
  if(['/clear','/import','/import/commit','/setup'].includes(path)){try{await discardBackup(this.ctx.storage,path==='/import/commit'?body.id:undefined);}catch{/* A completed commit remains acknowledged; temporary upload data can expire. */}}
  return json({workspace:next.workspace,result,receipt,csrf:next.csrf,version:next.version,report:next.workspace?report(next.workspace):null});
 }
 private async handleLine(request:Request):Promise<Response>{
  const url=new URL(request.url),path=url.pathname,now=Date.now(),requestId=lineRequestId(request);
  let state=await this.ctx.storage.get<LineState>(lineStateKey);
  if(!state){state=createLineState(now);await this.ctx.storage.put(lineStateKey,state);}
  const save=async()=>this.ctx.storage.put(lineStateKey,state);
  if(request.method==='GET'&&path==='/api/line-auth/bootstrap')return json({initialized:state.initialized,csrf:state.csrf,version:state.version,simulation:true,workspace_scope:'private'});
  if(request.method==='GET'&&path==='/api/line-auth/password-reset/outbox'){
   const current=await this.lineActor(state,request,now,save,['fish']);
   return json({items:state.emailOutbox.map(item=>({id:item.id,account_email:state.accounts.find(account=>account.id===item.accountId)?.email??'unknown',created_at:new Date(item.createdAt).toISOString(),expires_at:new Date(item.expiresAt).toISOString(),used:item.usedAt!==null,simulated_token:item.token})) ,version:state.version});
  }
  if(request.method==='GET'&&path==='/api/line-auth/sessions'){
   await this.lineActor(state,request,now,save,['fish']);
   return json({items:Object.values(state.sessions).map(session=>({id:hashForIdempotency('session',session.id).slice(0,16),device_name:session.deviceName,role:session.role,last_seen_at:new Date(session.lastSeenAt).toISOString(),expires_at:new Date(session.expiresAt).toISOString(),revoked:session.revokedAt!==null})),version:state.version});
  }
  if(request.method==='GET'&&['/api/line-inbox','/api/line-inbox/sync-status','/api/line-inbox/audit','/api/line-inbox/backup','/api/line-inbox/notifications','/api/line-inbox/classification-preferences'].includes(path)){
   const current=await this.lineActor(state,request,now,save);
   if(path==='/api/line-inbox/sync-status')return json({sync:state.sync,version:state.version});
   if(path==='/api/line-inbox/backup')return json({backup:{adapter:state.backup.adapter,state:state.backup.state,queue_count:state.backup.queue.length,versions:state.backup.versions,last_successful_at:state.backup.lastSuccessfulAt},version:state.version});
   if(path==='/api/line-inbox/notifications')return json({items:current.account.role==='fish'?state.notifications:[],version:state.version});
   if(path==='/api/line-inbox/classification-preferences')return json({items:current.account.role==='fish'?structuredClone(state.classificationPreferences):[],version:state.version});
   if(path==='/api/line-inbox/audit'){
    const items=current.account.role==='fish'?state.audits:state.audits.filter(item=>item.actorId===current.account.id).map(item=>({action:item.action,target:item.target,result:item.result,createdAt:item.createdAt,errorCode:item.errorCode}));
    return json({items,version:state.version});
   }
   return json({...projectLineState(state,current.account.role),version:state.version});
  }
  const write=lineWriteHeaders(request,url,state),body=await lineJson(request),key=write.key,bodyHash=hashForIdempotency(path,body),prior=state.operations[key];
  if(prior){ok(prior.hash===bodyHash,409,'idempotency_conflict','相同識別不能使用不同參數');return json({...prior.response as Record<string,any>,replayed:true});}
  ok(write.expected===state.version,412,'stale_version','家庭資料版本已更新');
  ok(!['actor','actor_id','workspace','workspace_id','role'].some(field=>field in body),403,'scope_override','不得由請求內容覆蓋家庭身份或工作區範圍');
  const finish=async(data:Record<string,any>,status=200)=>{state.version+=1;const response={...data,version:state.version};state.operations[key]={hash:bodyHash,response,createdAt:new Date(now).toISOString()};await save();return json(response,status);};
  const failAudit=async(actorId:string|null,actorRole:LineRole|'anonymous',action:string,target:string,errorCode:string,status=409)=>{lineAudit(state,actorId,actorRole,action,target,'failed',requestId,errorCode,now);await save();throw new Problem(status,errorCode,errorCode==='sync_offline'?'同步離線，暫停送出':errorCode==='capability_disabled'?'此能力尚未通過模擬測試閘門':'操作未完成');};
  if(path==='/api/line-auth/bootstrap'){
   await this.lineRate(state,request,'bootstrap',3,now,save);
   ok(!state.initialized,409,'bootstrap_exists','Fish 管理員已建立，不能重複初始化');
   ok(lineEmail(body.email)&&linePassword(body.password)&&typeof body.display_name==='string'&&body.display_name.trim().length>0,422,'credentials_invalid','請提供有效的管理員資料');
   const admin=await this.createLineAccount(body.email,body.display_name,'fish',body.password,true);
   const family=await this.createLineAccount('family@example.test','家人測試帳號','family','family-demo-password',true);
   const branchAdmin=await this.createLineAccount('branch-admin@example.test','分會管理員測試帳號','branch_admin','branch-admin-demo-password',true);
   state.accounts.push(admin,family,branchAdmin);state.initialized=true;seedLineFixtures(state,now);lineAudit(state,admin.id,'fish','bootstrap','family-workspace','allowed',requestId,null,now);
   return finish({initialized:true,role:'fish',account:{id:admin.id,email:admin.email,display_name:admin.displayName},simulated_family_account:{email:family.email},simulated_branch_admin_account:{email:branchAdmin.email},capabilities:{line:'simulated',ai:'simulated',email:'simulated',backup:'simulated',openchat_send:'disabled'}});
  }
  if(path==='/api/line-auth/login'){
   await this.lineRate(state,request,'login',8,now,save);
   ok(state.initialized,409,'bootstrap_required','請先建立 Fish 管理員');
   const account=state.accounts.find(item=>item.email===String(body.email).toLowerCase()&&item.active);
   if(!account||!linePassword(body.password)||(await lineHash(String(body.password)+account.passwordSalt))!==account.passwordHash){lineAudit(state,null,'anonymous','login','family-workspace','denied',requestId,'unauthorized',now);await save();throw new Problem(401,'unauthorized','帳號或密碼不正確');}
   const sessionId=lineCookie(request,lineSessionCookie)||createToken(32);state.sessions[sessionId]={id:sessionId,accountId:account.id,role:account.role,createdAt:now,lastSeenAt:now,expiresAt:sessionExpiry(now),revokedAt:null,deviceName:typeof body.device_name==='string'?body.device_name.slice(0,80):'瀏覽器裝置'};
   lineAudit(state,account.id,account.role,'login','family-session','allowed',requestId,null,now);
   return finish({authenticated:true,account:{id:account.id,email:account.email,display_name:account.displayName,role:account.role},session_expires_at:new Date(sessionExpiry(now)).toISOString(),csrf:state.csrf});
  }
  if(path==='/api/line-auth/logout'){
   const current=await this.lineActor(state,request,now,save);const sessionId=lineCookie(request,lineSessionCookie);if(sessionId)delete state.sessions[sessionId];lineAudit(state,current.account.id,current.account.role,'logout','family-session','allowed',requestId,null,now);return finish({authenticated:false});
  }
  if(path.match(/^\/api\/line-auth\/sessions\/[^/]+\/revoke$/)){
   const current=await this.lineActor(state,request,now,save,['fish']);const publicId=path.split('/').at(-2)!;const target=Object.values(state.sessions).find(item=>hashForIdempotency('session',item.id).slice(0,16)===publicId);ok(target,404,'session_missing','找不到裝置工作階段');target.revokedAt=now;lineAudit(state,current.account.id,current.account.role,'session_revoke',publicId,'allowed',requestId,null,now);return finish({revoked:true});
  }
  if(path==='/api/line-auth/password-reset/request'){
   await this.lineRate(state,request,'reset',5,now,save);ok(lineEmail(body.email),422,'credentials_invalid','Email 格式不符');const account=state.accounts.find(item=>item.email===String(body.email).toLowerCase()&&item.role==='family'&&item.verifiedEmail);if(account){this.lineAdapters.email.enqueueReset(state,account.id,now);lineAudit(state,account.id,'family','password_reset_request','password-reset','allowed',requestId,null,now);}else lineAudit(state,null,'anonymous','password_reset_request','password-reset','allowed',requestId,null,now);return finish({message:'若帳號存在，已建立 15 分鐘一次性 Email outbox 連結。',delivery:'simulated'});
  }
  if(path==='/api/line-auth/password-reset/complete'){
   ok(typeof body.token==='string'&&linePassword(body.password),422,'reset_invalid','重設資料不符');const entry=state.emailOutbox.find(item=>item.token===body.token&&item.usedAt===null);ok(entry&&entry.expiresAt>now,422,'reset_invalid','重設連結已失效');const account=state.accounts.find(item=>item.id===entry.accountId);ok(account,422,'reset_invalid','重設帳號不存在');account.passwordSalt=createToken(16);account.passwordHash=await lineHash(String(body.password)+account.passwordSalt);entry.usedAt=now;for(const session of Object.values(state.sessions))if(session.accountId===account.id)session.revokedAt=now;lineAudit(state,account.id,'family','password_reset_complete','password-reset','allowed',requestId,null,now);return finish({message:'密碼已重設，請重新登入。'});
  }
  const current=await this.lineActor(state,request,now,save);
  if(path==='/api/line-inbox/classification-preferences'){
   ok(current.account.role==='fish',403,'forbidden','只有 Fish 可以管理分類偏好');
   ok(['private','group','openchat'].includes(String(body.pattern)),422,'preference_invalid','分類偏好來源不符');
   const pattern=body.pattern as ConversationType;
   const index=state.classificationPreferences.findIndex(value=>value.pattern===pattern);
   if(body.clear===true){
    if(index>=0)state.classificationPreferences.splice(index,1);
    lineAudit(state,current.account.id,'fish','classification_preference_clear',pattern,'allowed',requestId,null,now);
    return finish({items:structuredClone(state.classificationPreferences)});
   }
   ok(lineQuadrant(body.quadrant),422,'quadrant_invalid','四象限不符');
   const preference={id:index>=0?state.classificationPreferences[index].id:createToken(12),scope:'fish' as const,pattern,quadrant:body.quadrant as Quadrant,updatedAt:new Date(now).toISOString()};
   if(index>=0)state.classificationPreferences[index]=preference;else state.classificationPreferences.push(preference);
   lineAudit(state,current.account.id,'fish','classification_preference_upsert',pattern,'allowed',requestId,null,now);
   return finish({preference,items:structuredClone(state.classificationPreferences)});
  }
  if(path.match(/^\/api\/line-inbox\/[^/]+\/classification$/)){
   ok(current.account.role==='fish',403,'forbidden','家人不能修改分類');const id=path.split('/').at(-2)!;const item=state.inbox.find(value=>value.id===id);ok(item,404,'record_missing','找不到收件匣訊息');ok(lineQuadrant(body.quadrant),422,'quadrant_invalid','四象限不符');const previous=item.quadrant??item.suggestedQuadrant;item.quadrant=body.quadrant;item.suggestedQuadrant=null;item.reviewQueue=false;item.reviewReason=null;item.version+=1;const existing=state.classificationPreferences.find(value=>value.pattern===item.conversationType);if(existing){existing.quadrant=body.quadrant;existing.updatedAt=new Date(now).toISOString();}else state.classificationPreferences.push({id:createToken(12),scope:'fish',pattern:item.conversationType,quadrant:body.quadrant,updatedAt:new Date(now).toISOString()});this.lineAdapters.notifications.publish(state,item,now);lineAudit(state,current.account.id,'fish','classification_confirm',id,'allowed',requestId,null,now);return finish({item:{...item,accountScope:undefined,deduplicationKey:undefined,importantHold:undefined}});
  }
  if(path.match(/^\/api\/line-inbox\/task-candidates\/[^/]+\/approve$/)){
   ok(current.account.role==='fish',403,'forbidden','只有 Fish 可以核准待辦候選');const id=path.split('/').at(-2)!;const candidate=state.taskCandidates.find(value=>value.id===id);ok(candidate,404,'record_missing','找不到待辦候選');ok(candidate.status==='pending',409,'invalid_transition','待辦候選已處理');candidate.status='approved';const task={id:`task-${state.tasks.length+1}`,candidateId:candidate.id,title:candidate.title,assignee:candidate.assignee,dueAt:candidate.dueAt,status:'待處理' as const,notes:'由 Fish 核准，家人可以協作。',sourceSummary:candidate.sourceSummary,createdAt:new Date(now).toISOString(),completedAt:null,version:1};state.tasks.push(task);lineAudit(state,current.account.id,'fish','task_candidate_approve',id,'allowed',requestId,null,now);return finish({task});
  }
  if(path.match(/^\/api\/line-inbox\/tasks\/[^/]+$/)){
   const id=path.split('/').at(-1)!;const task=state.tasks.find(value=>value.id===id);ok(task,404,'record_missing','找不到正式待辦');const canCollaborate=current.account.role==='family'||current.account.role==='branch_admin';ok((canCollaborate&&Object.keys(body).every(field=>['status','notes'].includes(field)))||current.account.role==='fish',403,'forbidden','家人與分會管理員只能更新待辦狀態與備註');if('status' in body)ok(['待處理','進行中','完成'].includes(body.status),422,'invalid_transition','待辦狀態不符');if('notes' in body)ok(typeof body.notes==='string'&&body.notes.length<=1000,422,'notes_invalid','備註過長');if('status' in body){const previous=task.status;task.status=body.status;if(task.status==='完成'&&previous!=='完成')task.completedAt=new Date(now).toISOString();if(task.status!=='完成')task.completedAt=null;}if('notes' in body)task.notes=body.notes;task.version+=1;lineAudit(state,current.account.id,current.account.role,'task_update',id,'allowed',requestId,null,now);return finish({task});
  }
  if(path.match(/^\/api\/line-inbox\/replies\/[^/]+\/send$/)){
   ok(current.account.role==='fish',403,'forbidden','家人不能送出回覆');const id=path.split('/').at(-2)!;const draft=state.drafts.find(value=>value.id===id);ok(draft,404,'record_missing','找不到回覆草稿');ok(body.confirmed===true,409,'invalid_transition','必須逐筆確認回覆草稿');if(state.sync.state==='offline')return failAudit(current.account.id,'fish','reply_send',id,'sync_offline');if(draft.conversationType==='openchat')return failAudit(current.account.id,'fish','reply_send',id,'capability_disabled');ok(draft.status==='pending',409,'invalid_transition','回覆草稿已處理');draft.status='sent';draft.version+=1;lineAudit(state,current.account.id,'fish','reply_send',id,'allowed',requestId,null,now);return finish({sent:true,draft:{id:draft.id,status:draft.status}});
  }
  if(path==='/api/line-inbox/sync/control'){
   ok(current.account.role==='fish',403,'forbidden','只有 Fish 可以控制同步');ok(lineSyncState(body.state),422,'sync_state_invalid','同步狀態不符');const requested=body.state as SyncState;if(requested==='online'&&state.sync.state==='offline'){state.sync.state='backfilling';state.sync.backfillRemaining=Math.max(1,state.sync.backfillRemaining);state.sync.lastError=null;}else{state.sync.state=requested;if(requested==='offline')state.sync.lastError='Connector 暫時離線';}for(const item of state.inbox)item.syncState=state.sync.state;lineAudit(state,current.account.id,'fish','sync_control','connector', 'allowed',requestId,null,now);return finish({sync:state.sync});
  }
  if(path==='/api/line-inbox/backfill/continue'){
   ok(current.account.role==='fish',403,'forbidden','只有 Fish 可以繼續補抓');const result=this.lineAdapters.connector.continueBackfill(state,now,body.simulate_failure===true);lineAudit(state,current.account.id,'fish','backfill_continue','connector',result.failed?'failed':'allowed',requestId,result.failed?'backfill_failed':null,now);return finish({sync:state.sync,completed:result.completed});
  }
  if(path==='/api/line-inbox/connector/ingest'){
   ok(current.account.role==='fish',403,'forbidden','只有 Fish 可以管理 Connector');
   const input={accountScope:'fish',conversationId:String(body.conversationId),conversationType:body.conversationType as ConversationType,receivedAt:Number(body.receivedAt),rawText:String(body.rawText??body.raw_text??''),sourceMessageId:typeof body.sourceMessageId==='string'?body.sourceMessageId:null,sender:typeof body.sender==='string'?body.sender:undefined,sourceName:typeof body.sourceName==='string'?body.sourceName:undefined,confidence:typeof body.confidence==='number'?body.confidence:undefined,suggestedQuadrant:lineQuadrant(body.suggestedQuadrant)?body.suggestedQuadrant:undefined,reviewReason:typeof body.reviewReason==='string'?body.reviewReason:undefined,attachment:body.attachment};
   const analysis=this.lineAdapters.ai.analyze(state,input);const result=this.lineAdapters.connector.ingest(state,{...input,...analysis});if(result.created&&state.backup.state==='error'&&!state.backup.queue.some(item=>item.id===`backup-${result.item.id}`))state.backup.queue.push({id:`backup-${result.item.id}`,createdAt:new Date(now).toISOString(),attempts:0});lineAudit(state,current.account.id,'fish','connector_ingest',result.item.id,'allowed',requestId,null,now);return finish({created:result.created,item:{...result.item,accountScope:undefined,deduplicationKey:undefined,importantHold:undefined}});
  }
  if(path==='/api/line-inbox/retention/run'){
   ok(current.account.role==='fish',403,'forbidden','只有 Fish 可以執行保存期限工作');const result=applyRetention(state,now,90);lineAudit(state,current.account.id,'fish','retention_run','raw-boundary','allowed',requestId,null,now);return finish({retention:result});
  }
  if(path==='/api/line-inbox/backup/create'){
   ok(current.account.role==='fish',403,'forbidden','只有 Fish 可以建立備份');ok(typeof body.recovery_key==='string'&&body.recovery_key.length>=8,422,'backup_key_invalid','復原金鑰長度不符');const backup=await this.lineAdapters.backup.create(state,body.recovery_key,now);const id=`backup-${state.backup.versions.length+1}`;state.backupBlobs[id]=backup;state.backup.versions.push({id,createdAt:backup.createdAt,bytes:backup.ciphertext.length/2,scope:backup.scope});state.backup.queue=[];state.backup.lastSuccessfulAt=backup.createdAt;lineAudit(state,current.account.id,'fish','backup_create',id,'allowed',requestId,null,now);return finish({backup:{id,version:backup.version,created_at:backup.createdAt,bytes:backup.ciphertext.length/2,encrypted:true,scope:backup.scope}});
  }
  if(path==='/api/line-inbox/backup/control'){
   ok(current.account.role==='fish',403,'forbidden','只有 Fish 可以控制備份 Adapter');
   ok(body.state==='simulated'||body.state==='error',422,'backup_state_invalid','備份狀態不符');
   state.backup.state=body.state;
   lineAudit(state,current.account.id,'fish','backup_control','backup-adapter','allowed',requestId,null,now);
   return finish({backup:{adapter:state.backup.adapter,state:state.backup.state,queue_count:state.backup.queue.length,last_successful_at:state.backup.lastSuccessfulAt}});
  }
  if(path==='/api/line-inbox/backup/retry'){
   ok(current.account.role==='fish',403,'forbidden','只有 Fish 可以重試備份');
   for(const job of state.backup.queue)job.attempts+=1;
   state.backup.queue=[];state.backup.state='simulated';state.backup.lastSuccessfulAt=new Date(now).toISOString();lineAudit(state,current.account.id,'fish','backup_retry','backup-queue','allowed',requestId,null,now);return finish({backup:{...state.backup,queue:undefined,queue_count:0}});
  }
  if(path==='/api/line-inbox/backup/restore-preview'||path==='/api/line-inbox/backup/restore'){
   ok(current.account.role==='fish',403,'forbidden','只有 Fish 可以還原備份');const id=String(body.backup_id);const backup=state.backupBlobs[id];ok(backup,404,'backup_missing','找不到備份版本');ok(typeof body.recovery_key==='string',422,'backup_key_invalid','請提供復原金鑰');const restored=await decryptSimulatedBackup(backup,body.recovery_key);const preview={backup_id:id,version:restored.version,item_count:restored.inbox.length,target:'isolated-line-restore-preview',would_overwrite:false,integrity_verified:true,permission_version:restored.version,audit_count:restored.audits.length};if(path.endsWith('preview')){lineAudit(state,current.account.id,'fish','backup_restore_preview','backup-restore','allowed',requestId,null,now);return finish({preview});}const restore={id:createToken(12),backupId:id,version:restored.version,target:'isolated-line-restore' as const,integrityVerified:true,permissionVersion:restored.version,auditCount:restored.audits.length,createdAt:new Date(now).toISOString()};state.restoreRecords.push(restore);lineAudit(state,current.account.id,'fish','backup_restore','backup-restore','allowed',requestId,null,now);return finish({restore:{id:restore.id,backup_id:restore.backupId,version:restore.version,target:restore.target,integrity_verified:restore.integrityVerified,permission_version:restore.permissionVersion,audit_count:restore.auditCount,created_at:restore.createdAt}});
  }
  throw new Problem(404,'not_found','找不到路徑');
 }
 private async lineActor(state:LineState,request:Request,now:number,save:()=>Promise<void>,roles?:LineRole[]){
  const sessionId=lineCookie(request,lineSessionCookie),session=sessionId?state.sessions[sessionId]:undefined;
  ok(session&&session.revokedAt===null&&session.expiresAt>now,401,'unauthorized','請先登入家庭中台');
  const account=state.accounts.find(item=>item.id===session.accountId&&item.active);ok(account,401,'unauthorized','家庭帳號已失效');
  session.lastSeenAt=now;session.expiresAt=sessionExpiry(now);
  if(roles&&!roles.includes(account.role)){lineAudit(state,account.id,account.role,'authorization_denied','protected-operation','denied',lineRequestId(request),'forbidden',now);await save();throw new Problem(403,'forbidden','此操作只允許 Fish');}
  return {session,account};
 }
 private async lineRate(state:LineState,request:Request,scope:string,limit:number,now:number,save:()=>Promise<void>){
  const key=`${scope}:${request.headers.get('CF-Connecting-IP')||'local'}`,current=state.rateLimits[key]??{windowStart:now,count:0};if(now-current.windowStart>=15*60*1000){current.windowStart=now;current.count=0;}if(current.count>=limit){await save();throw new Problem(429,'rate_limited','請稍候再試');}current.count+=1;state.rateLimits[key]=current;
 }
 private async createLineAccount(email:string,displayName:string,role:LineRole,password:string,verifiedEmail:boolean):Promise<LineAccount>{const passwordSalt=createToken(16);return {id:createToken(12),email:email.toLowerCase(),displayName,role,passwordSalt,passwordHash:await lineHash(password+passwordSalt),verifiedEmail,active:true};}
 private async persist(s:Stored){await writeWorkspaceState(this.ctx.storage,s);if(this.env.PUBLIC_DEMO!=='false')await this.ctx.storage.setAlarm(Date.now()+72*3600000);else await this.ctx.storage.deleteAlarm();}
}
const app=new Hono<{Bindings:Env}>();
app.get('/api/health',c=>c.json({name:'freedom-erp-crm',version:'0.1.0',simulation:true,real_finance:false,currency:'SIM'}));
app.get('/api/templates',c=>c.json({items:templates,defaults:{industry:c.env.DEFAULT_INDUSTRY??'retail',company_name:c.env.DEFAULT_COMPANY??'自由工坊示範商店',modules:c.env.DEFAULT_MODULES?.split(',').filter(v=>templates.some(t=>t.modules.includes(v))),public_demo:c.env.PUBLIC_DEMO!=='false',auto_setup:c.env.PUBLIC_DEMO==='false'&&c.env.AUTO_SETUP==='true',retention_hours:c.env.PUBLIC_DEMO==='false'?null:72}}));
app.all('/api/workspace/*',async c=>{const raw=c.req.header('Cookie')??'';let token=raw.split(';').map(v=>v.trim()).find(v=>v.startsWith('freedom_session='))?.slice(16);let fresh=false;if(!token||!/^[a-f0-9]{64}$/.test(token)){token=tokenHex(32);fresh=true;}const id=c.env.WORKSPACES.idFromName(digest(token));const stub=c.env.WORKSPACES.get(id);const response=await stub.fetch(c.req.raw);const headers=new Headers(response.headers);headers.append('Set-Cookie',`freedom_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${c.env.PUBLIC_DEMO==='false'?31536000:259200}${new URL(c.req.url).protocol==='https:'?'; Secure':''}`);headers.set('Content-Security-Policy',"default-src 'none'; frame-ancestors 'none'");return new Response(response.body,{status:response.status,headers});});
const lineProxy=async(c:any)=>{const raw=c.req.header('Cookie')??'';let workspace=raw.split(';').map((value:string)=>value.trim()).find((value:string)=>value.startsWith(`${lineWorkspaceCookie}=`))?.slice(lineWorkspaceCookie.length+1);let session=raw.split(';').map((value:string)=>value.trim()).find((value:string)=>value.startsWith(`${lineSessionCookie}=`))?.slice(lineSessionCookie.length+1);if(!workspace||!/^[a-f0-9]{64}$/.test(workspace))workspace=createToken(32);if(!session||!/^[a-f0-9]{64}$/.test(session))session=createToken(32);const id=c.env.WORKSPACES.idFromName(digest(`line:${workspace}`)),stub=c.env.WORKSPACES.get(id),response=await stub.fetch(c.req.raw),headers=new Headers(response.headers),secure=new URL(c.req.url).protocol==='https:'?' Secure':'';headers.append('Set-Cookie',`${lineWorkspaceCookie}=${workspace}; Path=/; HttpOnly; SameSite=Strict; Max-Age=31536000${secure}`);headers.append('Set-Cookie',`${lineSessionCookie}=${session}; Path=/; HttpOnly; SameSite=Strict; Max-Age=1800${secure}`);headers.set('Content-Security-Policy',"default-src 'self'; frame-ancestors 'none'");return new Response(response.body,{status:response.status,headers});};
app.all('/api/line-auth',lineProxy);
app.all('/api/line-auth/*',lineProxy);
app.all('/api/line-inbox',lineProxy);
app.all('/api/line-inbox/*',lineProxy);
app.all('/api/*',c=>c.json({error:{code:'not_found',message:'找不到路徑'}},404));
app.all('*',c=>c.env.ASSETS.fetch(c.req.raw));
export default app;
