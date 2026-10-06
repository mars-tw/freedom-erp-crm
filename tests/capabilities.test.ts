import test from 'node:test';
import assert from 'node:assert/strict';
import {capabilities,filterCapabilities,capabilityDestination} from '../web/capabilities.js';
test('34 unique capabilities distinguish available simulation scope from missing enterprise functions',()=>{
 assert.equal(capabilities.length,34);assert.equal(new Set(capabilities.map(row=>row.id)).size,34);
 for(const row of capabilities){assert.match(row.id,/^CAP\d{2}$/);assert.ok(row.available.length&&row.gap.length);assert.ok(['ready','partial','planned'].includes(row.status));if(row.status==='planned')assert.equal(capabilityDestination(row,['inventory','sales','wallets','crm','services','projects','manufacturing','administration']),null);}
 for(const id of ['CAP05','CAP07','CAP08','CAP09','CAP25','CAP30'])assert.equal(capabilities.find(row=>row.id===id)!.status,'planned');
});
test('literal search combines scope and gaps with explicit category and status filters',()=>{
 assert.ok(filterCapabilities('發票','','').some(row=>row.id==='CAP09'));assert.deepEqual(filterCapabilities('[]','',''),[]);assert.ok(filterCapabilities('FIFO','採購與庫存','ready').some(row=>row.id==='CAP17'));assert.deepEqual(filterCapabilities('無此功能zz','上手與工作台','planned'),[]);
});
test('module prerequisites gate navigation without pretending to enable or overwrite a workspace',()=>{
 const sale=capabilities.find(row=>row.id==='CAP14')!,planned=capabilities.find(row=>row.id==='CAP05')!;
 assert.equal(capabilityDestination(sale,null),'build');assert.equal(capabilityDestination(sale,['crm']),'build');assert.equal(capabilityDestination(sale,['sales','inventory','wallets']),'sales');assert.equal(capabilityDestination(planned,['wallets']),null);
 const backup=capabilities.find(row=>row.id==='CAP27')!;assert.equal(capabilityDestination(backup,['crm']),'settings');
});

test('alternative implemented subflows open services or administration when stock sales are disabled',()=>{
 const receivable=capabilities.find(row=>row.id==='CAP06')!,procurement=capabilities.find(row=>row.id==='CAP16')!;
 assert.equal(capabilityDestination(receivable,['services','crm','wallets']),'services');
 assert.equal(capabilityDestination(receivable,['crm']),'build');
 assert.equal(capabilityDestination(procurement,['administration']),'administration');
 assert.equal(capabilityDestination(procurement,['inventory','wallets']),'inventory');
});
