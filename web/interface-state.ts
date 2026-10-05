import type {Workspace} from './api';
import {indexWorkspace,validTarget,type WorkspaceTarget,type WorkbenchRecord} from './workbench-model';
export type ThemePreference='light'|'dark'|'system';
export type DensityPreference='comfortable'|'compact';
export interface InterfacePreferences {theme:ThemePreference;density:DensityPreference}
export const pinLimit=24;
const preferenceKey='freedom-erp.interface.v1';
const pinPrefix='freedom-erp.pins.v1.';
const memory=new Map<string,string>();
const volatile=new Set<string>();
const defaults=():InterfacePreferences=>({theme:'light',density:'comfortable'});
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
function storage(type:'local'|'session'):Storage{return type==='local'?localStorage:sessionStorage;}
function read(type:'local'|'session',key:string):string|null{
 if(volatile.has(key))return memory.get(key)??null;
 try{return storage(type).getItem(key);}catch{return memory.get(key)??null;}
}
function save(type:'local'|'session',key:string,value:unknown){
 const raw=JSON.stringify(value);memory.set(key,raw);
 if(memory.size>128){const oldest=[...memory.keys()].find(k=>k!==preferenceKey);if(oldest){memory.delete(oldest);volatile.delete(oldest);}}
 try{storage(type).setItem(key,raw);volatile.delete(key);}catch{volatile.add(key);}
}
function preference(value:unknown):InterfacePreferences|null{
 if(!object(value)||Object.keys(value).length!==2||Object.keys(value).some(k=>k!=='theme'&&k!=='density')||!['light','dark','system'].includes(value.theme as string)||!['comfortable','compact'].includes(value.density as string))return null;
 return {theme:value.theme as ThemePreference,density:value.density as DensityPreference};
}
export function readInterfacePreferences():InterfacePreferences{
 try{const raw=read('local',preferenceKey);return raw&&raw.length<=256?(preference(JSON.parse(raw))??defaults()):defaults();}catch{return defaults();}
}
export function writeInterfacePreferences(p:InterfacePreferences):void{try{const valid=preference(p);if(valid)save('local',preferenceKey,valid);}catch{/* Invalid visual preferences never block the application. */}}
export function resolveTheme(pref:ThemePreference,systemDark:boolean):'light'|'dark'{return pref==='dark'||pref==='system'&&systemDark?'dark':'light';}
function pinKey(w:Workspace):string|null{return typeof w.generation_id==='string'&&w.generation_id.length>0&&w.generation_id.length<=100?pinPrefix+encodeURIComponent(w.generation_id):null;}
function equal(a:WorkspaceTarget,b:WorkspaceTarget){return a.kind===b.kind&&a.module===b.module&&a.id===b.id;}
function parsePins(w:Workspace,value:unknown):WorkspaceTarget[]{
 if(!Array.isArray(value))return [];const pins:WorkspaceTarget[]=[];
 for(const v of value){
  if(!object(v)||Object.keys(v).length!==3||Object.keys(v).some(k=>!['module','kind','id'].includes(k))||typeof v.module!=='string'||typeof v.kind!=='string'||typeof v.id!=='string'||v.id.length>100||!validTarget(w,v))continue;
  const target:WorkspaceTarget={module:v.module,kind:v.kind,id:v.id};if(pins.some(p=>equal(p,target)))continue;pins.push(target);if(pins.length===pinLimit)break;
 }return pins;
}
export function readPinnedRecords(w:Workspace):WorkspaceTarget[]{
 try{const key=pinKey(w);if(!key)return [];const raw=read('session',key);return raw&&raw.length<=16384?parsePins(w,JSON.parse(raw)):[];}catch{return [];}
}
export function togglePinnedRecord(w:Workspace,target:WorkspaceTarget):WorkspaceTarget[]{
 const pins=readPinnedRecords(w);
 try{const key=pinKey(w);if(!key||!object(target)||Object.keys(target).length!==3||Object.keys(target).some(k=>!['module','kind','id'].includes(k))||!validTarget(w,target))return pins;
 const existing=pins.some(p=>equal(p,target));if(!existing&&pins.length>=pinLimit)return pins;
 const updated=existing?pins.filter(p=>!equal(p,target)):[...pins,{module:target.module,kind:target.kind,id:target.id}];save('session',key,updated);return updated;
 }catch{return pins;}
}
/** Titles and descriptions are always rebuilt from the latest server workspace. */
export function pinnedRecords(w:Workspace):WorkbenchRecord[]{const index=indexWorkspace(w);return readPinnedRecords(w).flatMap(pin=>{const record=index.find(r=>equal(r.target,pin));return record?[record]:[];});}
