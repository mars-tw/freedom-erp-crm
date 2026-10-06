import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorld} from '../src/engine.js';
import {availableRoleViews,readRoleView,roleCenterModel,writeRoleView} from '../web/role-center.js';
import {validTarget} from '../web/workbench-model.js';

const values = new Map<string,string>(); let blockedRead = false, blockedWrite = false;
Object.defineProperty(globalThis,'sessionStorage',{configurable:true,value:{getItem(key:string){if (blockedRead) throw Error('blocked');return values.get(key) ?? null;},setItem(key:string,value:string){if (blockedWrite) throw Error('blocked');values.set(key,value);}}});

test('role views and flow steps use only enabled modules, with at most four cards',() => {
  for (const modules of [['inventory'],['wallets'],['crm'],['projects'],['administration'],['inventory','wallets','manufacturing'],['crm','wallets','services']]) {
    const workspace = createWorld('general','合成工作區',modules), before = JSON.stringify(workspace);
    for (const view of availableRoleViews(workspace)) {
      const model = roleCenterModel(workspace,view);
      assert.ok(model.cards.length <= 4);
      for (const card of model.cards) {assert.ok(modules.includes(card.module));if (card.target) assert.equal(validTarget(workspace,card.target),true);}
      for (const step of model.flow?.steps || []) assert.ok(step.module === 'reports' || modules.includes(step.module));
    }
    assert.equal(JSON.stringify(workspace),before);
  }
  const wallet = createWorld('general','合成錢包',['wallets']);
  assert.deepEqual(availableRoleViews(wallet),['owner']);
  assert.equal(roleCenterModel(wallet,'administration').view,'owner');
  assert.equal(roleCenterModel(wallet,'owner').cards[0].count,0);
});

test('counts reflect actual open records and zero available inventory, excluding closed operations',() => {
  const workspace = createWorld('general','合成計數');
  workspace.orders = [
    {id:'order-open',status:'paid',paid_minor:100,total_minor:100,lines:[{quantity:2,shipped_quantity:1}]},
    {id:'order-paid',status:'shipped',paid_minor:100,total_minor:100,lines:[{quantity:1,shipped_quantity:1}]},
    {id:'order-cancelled',status:'cancelled',paid_minor:0,total_minor:100,lines:[{quantity:1,shipped_quantity:0}]},
  ];
  workspace.products[0].on_hand = 2;workspace.products[0].reserved = 2;
  workspace.products[1].active = false;
  workspace.workOrders = [{id:'work-open',status:'started'},{id:'work-closed',status:'completed'}];
  const model = roleCenterModel(workspace,'operations');
  assert.equal(model.cards.find(card => card.id === 'empty-stock')?.count,1);
  assert.equal(model.cards.find(card => card.id === 'open-orders')?.count,1);
  assert.equal(model.cards.find(card => card.id === 'open-work-orders')?.count,1);
  assert.deepEqual(model.cards.find(card => card.id === 'open-orders')?.target,{module:'sales',kind:'order',id:'order-open'});
  assert.equal(validTarget(workspace,model.cards.find(card => card.id === 'empty-stock')?.target),true);
});

test('administrative counts distinguish submitted requests, scheduled shifts and active fake staff',() => {
  const workspace = createWorld('general','合成行政',['administration']);
  workspace.administration.requests = [{id:'r1',status:'submitted'},{id:'r2',status:'draft'},{id:'r3',status:'prepared_unreviewed'}];
  workspace.administration.shifts = [{id:'s1',status:'scheduled'},{id:'s2',status:'completed'},{id:'s3',status:'cancelled'}];
  workspace.administration.staff = [{id:'p1',status:'active'},{id:'p2',status:'inactive'}];
  workspace.administration.reservations = [{id:'e1',status:'reserved'},{id:'e2',status:'returned'}];
  const model = roleCenterModel(workspace,'administration');
  assert.equal(model.cards.length,4);
  assert.ok(model.cards.every(card => card.count === 1 && card.module === 'administration' && card.target === undefined));
  assert.deepEqual(model.flow?.steps,[{module:'administration',label:'開啟行政工作台'}]);
});

test('industry workflows keep preparation before operations and never mark navigation as completion',() => {
  assert.deepEqual(roleCenterModel(createWorld('retail','合成零售'),'owner').flow?.steps.map(step => step.module),['inventory','wallets','sales','reports']);
  assert.deepEqual(roleCenterModel(createWorld('service','合成服務'),'sales').flow?.steps.map(step => step.module),['crm','services','wallets','reports']);
  assert.deepEqual(roleCenterModel(createWorld('manufacturing','合成製造'),'operations').flow?.steps.map(step => step.module),['inventory','manufacturing','reports']);
  const workspace = createWorld('retail','合成空訂單');
  const card = roleCenterModel(workspace,'sales').cards.find(card => card.id === 'open-orders')!;
  assert.equal(card.count,0); assert.equal(card.target,undefined); assert.ok(!card.description.includes('完成'));
});

test('view preference strictly validates schema and isolates workspace generations',() => {
  const workspace = createWorld('general','合成偏好');workspace.generation_id = 'preference-a';
  const other = {...workspace,generation_id:'preference-b'};
  assert.equal(writeRoleView(workspace,'operations'),true);assert.equal(readRoleView(workspace),'operations');assert.equal(readRoleView(other),'owner');
  const key = 'freedom-erp.role-view.v1.preference-b';
  for (const malformed of ['{bad','null','[]','{"version":2,"view":"sales"}','{"version":1,"view":"admin"}','{"version":1,"view":"sales","permission":"admin"}','{"version":1}','x'.repeat(121)]) {values.set(key,malformed);assert.equal(readRoleView(other),'owner');}
  const limited = createWorld('general','合成單功能',['wallets']);limited.generation_id = 'preference-b';
  values.set(key,'{"version":1,"view":"operations"}');assert.equal(readRoleView(limited),'owner');assert.equal(writeRoleView(limited,'operations'),false);
  assert.equal(writeRoleView({...workspace,generation_id:''},'owner'),false);assert.equal(readRoleView({...workspace,generation_id:'x'.repeat(101)}),'owner');
});

test('blocked storage keeps the latest current-tab choice instead of stale stored preferences',() => {
  const workspace = createWorld('general','合成封鎖');workspace.generation_id = 'preference-blocked';
  writeRoleView(workspace,'owner');blockedWrite = true;
  try {assert.equal(writeRoleView(workspace,'sales'),false);assert.equal(readRoleView(workspace),'sales');blockedRead = true;assert.equal(readRoleView(workspace),'sales');assert.equal(readRoleView({...workspace,generation_id:'preference-new'}),'owner');}
  finally {blockedRead = false;blockedWrite = false;}
  assert.equal(readRoleView(workspace),'sales');writeRoleView(workspace,'owner');assert.equal(readRoleView(workspace),'owner');
});
