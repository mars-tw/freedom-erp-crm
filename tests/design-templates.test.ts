import test from 'node:test';
import assert from 'node:assert/strict';
import {
 designTemplates,defaultDesignTemplate,designPreferenceKey,isDesignTemplateId,
 readDesignPreference,writeDesignPreference
} from '../web/design-templates.js';

const ids=['harbor','executive','atelier','commerce','industrial','verdant','editorial','midnight'];
function fixture(run:(context:{values:Map<string,string>;failRead:(value:boolean)=>void;failWrite:(value:boolean)=>void;writes:string[]})=>void){
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
 const values=new Map([
  ['freedom-erp.interface.v1',JSON.stringify({theme:'dark',density:'compact'})],
  ['freedom-erp.pins.v1.synthetic',JSON.stringify([{kind:'customer',id:'synthetic',module:'crm'}])]
 ]);
 const writes:string[]=[];let readFail=false,writeFail=false;
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{
  getItem(key:string){if(readFail)throw Error('storage denied');return values.get(key)??null;},
  setItem(key:string,value:string){if(writeFail)throw Error('storage quota');writes.push(key);values.set(key,value);}
 }});
 try{
  writeDesignPreference(defaultDesignTemplate);writes.length=0;
  run({values,writes,failRead:value=>{readFail=value;},failWrite:value=>{writeFail=value;}});
 }finally{
  readFail=false;writeFail=false;writeDesignPreference(defaultDesignTemplate);
  if(descriptor)Object.defineProperty(globalThis,'localStorage',descriptor);
  else Reflect.deleteProperty(globalThis,'localStorage');
 }
}
function luminance(hex:string){
 const values=[1,3,5].map(start=>parseInt(hex.slice(start,start+2),16)/255);
 return values.map(value=>value<=0.04045?value/12.92:((value+0.055)/1.055)**2.4)
  .reduce((sum,value,index)=>sum+value*[0.2126,0.7152,0.0722][index],0);
}

test('the eight frozen identities have distinct palettes and three real layout families',()=>{
 assert.deepEqual(designTemplates.map(template=>template.id),ids);
 assert.equal(defaultDesignTemplate,'harbor');
 assert.equal(designPreferenceKey,'freedom-erp.design.v1');
 assert.equal(Object.isFrozen(designTemplates),true);
 assert.equal(new Set(designTemplates.map(template=>template.name)).size,8);
 assert.equal(new Set(designTemplates.map(template=>template.palette.join(','))).size,8);
 assert.deepEqual([...new Set(designTemplates.map(template=>template.layout))].sort(),['floating','rail','top']);
 assert.deepEqual([...new Set(designTemplates.map(template=>template.category))].sort(),['business','creative','factory','store']);
 for(const template of designTemplates){
  assert.ok(Object.isFrozen(template)&&Object.isFrozen(template.tags)&&Object.isFrozen(template.palette));
  assert.ok(template.name.trim()&&template.englishName.trim()&&template.description.trim()&&template.signature.trim());
  assert.equal(template.palette.length,5);
  assert.ok(template.palette.every(color=>/^#[0-9a-f]{6}$/i.test(color)));
  const background=luminance(template.palette[0]),ink=luminance(template.palette[2]);
  assert.ok((Math.max(background,ink)+0.05)/(Math.min(background,ink)+0.05)>=4.5,template.id+' catalog text palette');
 }
});

test('template identifiers are exact enums rather than arbitrary classes object keys or executable values',()=>{
 for(const id of ids)assert.equal(isDesignTemplateId(id),true,id);
 for(const value of ['HARBOR',' harbor','harbor ','unknown','__proto__','constructor','<script>',0,null,undefined,{},[],Symbol('harbor')]){
  assert.equal(isDesignTemplateId(value),false);
 }
});

test('stored JSON accepts only version one and exactly the version template pair',()=>fixture(({values,writes})=>{
 for(const template of ids){
  values.set(designPreferenceKey,JSON.stringify({version:1,template}));
  assert.equal(readDesignPreference(),template);
 }
 for(const invalid of [
  null,[],{},'harbor',{version:2,template:'harbor'},{version:'1',template:'harbor'},
  {version:1,template:'unknown'},{version:1,template:'HARBOR'},
  {version:1,template:'harbor',role:'owner'},{version:1,template:'harbor',theme:'dark'}
 ]){
  values.set(designPreferenceKey,JSON.stringify(invalid));
  assert.equal(readDesignPreference(),'harbor');
 }
 for(const invalid of ['{broken',' '.repeat(300),'{"version":1,"template":"harbor","__proto__":{"approved":true}}']){
  values.set(designPreferenceKey,invalid);
  assert.equal(readDesignPreference(),'harbor');
 }
 assert.deepEqual(writes,[],'reads must not repair or overwrite browser storage');
}));

test('persistent writes touch only the design key and invalid writes preserve the last good choice',()=>fixture(({values,writes})=>{
 const legacyInterface=values.get('freedom-erp.interface.v1'),legacyPins=values.get('freedom-erp.pins.v1.synthetic');
 for(const template of designTemplates){
  assert.equal(writeDesignPreference(template.id),true);
  assert.deepEqual(JSON.parse(values.get(designPreferenceKey)!),{version:1,template:template.id});
  assert.equal(readDesignPreference(),template.id);
 }
 const before=new Map(values),count=writes.length;
 for(const invalid of ['unknown','MIDNIGHT',null,{},['harbor']]){
  assert.equal(writeDesignPreference(invalid as any),false);
  assert.deepEqual(values,before);
  assert.equal(readDesignPreference(),'midnight');
 }
 assert.equal(writes.length,count);
 assert.ok(writes.every(key=>key===designPreferenceKey));
 assert.equal(values.get('freedom-erp.interface.v1'),legacyInterface);
 assert.equal(values.get('freedom-erp.pins.v1.synthetic'),legacyPins);
}));

test('blocked writes prefer current-tab memory over readable stale storage and a successful write exits fallback',()=>fixture(({values,failRead,failWrite})=>{
 assert.equal(writeDesignPreference('harbor'),true);
 failWrite(true);
 assert.equal(writeDesignPreference('editorial'),false);
 assert.equal(JSON.parse(values.get(designPreferenceKey)!).template,'harbor');
 assert.equal(readDesignPreference(),'editorial');
 failRead(true);
 assert.equal(readDesignPreference(),'editorial');
 assert.equal(writeDesignPreference('not-a-template' as any),false);
 assert.equal(readDesignPreference(),'editorial');
 failRead(false);failWrite(false);
 assert.equal(writeDesignPreference('verdant'),true);
 assert.equal(readDesignPreference(),'verdant');
 values.set(designPreferenceKey,JSON.stringify({version:1,template:'executive'}));
 assert.equal(readDesignPreference(),'executive','a recovered persistent store is read again');
}));

test('an SSR or denied-storage environment never throws and keeps valid fallback choices in memory',()=>fixture(()=>{
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'localStorage')!;
 Reflect.deleteProperty(globalThis,'localStorage');
 try{
  assert.doesNotThrow(()=>readDesignPreference());
  assert.equal(readDesignPreference(),'harbor');
  assert.equal(writeDesignPreference('midnight'),false);
  assert.equal(readDesignPreference(),'midnight');
 }finally{
  Object.defineProperty(globalThis,'localStorage',descriptor);
  assert.equal(writeDesignPreference('harbor'),true);
 }
}));
