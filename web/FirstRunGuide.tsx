import React,{useRef,useState} from 'react';
import type {Workspace} from './api';
import {availablePaths} from './learning';
import {Icon} from './icons';
import {readGuideHidden,writeGuideHidden,starterRoute,starterEvidence} from './start-guide';
import './first-run-guide.css';

export default function FirstRunGuide({workspace,onNavigate}:{workspace:Workspace;onNavigate:(module:string)=>void}){
 const [hidden,setHidden]=useState(()=>readGuideHidden(workspace.generation_id));
 const [volatile,setVolatile]=useState(false);
 const heading=useRef<HTMLHeadingElement>(null);
 const route=starterRoute(workspace),evidence=starterEvidence(workspace);
 const paths=availablePaths(workspace);
 function show(value:boolean){setHidden(!value);setVolatile(!writeGuideHidden(workspace.generation_id,!value));requestAnimationFrame(()=>value?heading.current?.focus():document.querySelector<HTMLButtonElement>('[data-testid="guide-reopen"]')?.focus());}
 if(hidden)return <div className="starter-collapsed"><span>工作台已就緒，從左側選擇要做的工作。</span><button type="button" data-testid="guide-reopen" onClick={()=>show(true)}><Icon name="learning"/>開啟上手引導</button></div>;
 return <section className="starter-guide" data-testid="first-run-guide" aria-labelledby="starter-guide-heading">
  <div className="starter-guide-heading"><div><span className="eyebrow">你的系統已建立</span><h2 id="starter-guide-heading" ref={heading} tabIndex={-1}>接下來，先完成一件工作。</h2><p>下面的按鈕直接帶你到操作畫面。示範資料可以修改，所有金額都使用 SIM 測試幣。</p></div><button type="button" className="starter-dismiss" data-testid="guide-dismiss" onClick={()=>show(false)}>收起引導</button></div>
  <ol className="starter-progress" aria-label="上手進度"><li className="is-done"><span aria-hidden="true">✓</span><strong>工作區已建立</strong></li><li className={evidence.records?'is-done':''} data-testid="guide-status-records"><span aria-hidden="true">{evidence.records?'✓':'2'}</span><strong>{evidence.records?'已新增或調整資料':'新增或調整資料'}</strong></li><li className={evidence.operation?'is-done':''} data-testid="guide-status-operation"><span aria-hidden="true">{evidence.operation?'✓':'3'}</span><strong>{evidence.operation?'已完成模擬操作':'完成模擬操作'}</strong></li></ol>
  <div className="starter-actions"><article className="starter-primary"><div className="starter-icon"><Icon name={route.module as Parameters<typeof Icon>[0]['name']}/></div><h3>{route.title}</h3><p>{route.description}</p><button type="button" className="primary" data-testid="guide-start-main" onClick={()=>onNavigate(route.module)}>{route.action}<Icon name="arrow"/></button></article>
   <article><div className="starter-icon"><Icon name={paths.length?'learning':'overview'}/></div><h3>{paths.length?'跟著做一筆完整流程':'從已啟用的功能開始'}</h3><p>{paths.length?'畫面會提示庫存、測試幣與交付條件；每次操作都由你確認。':'目前功能沒有適用的交易教學。使用第一張卡片開始，操作條件會顯示在各筆紀錄旁。'}</p>{paths.length?<button type="button" data-testid="guide-start-learning" onClick={()=>onNavigate('learning')}>帶我做一次<Icon name="arrow"/></button>:<button type="button" data-testid="guide-start-module" onClick={()=>onNavigate(route.module)}>查看操作畫面<Icon name="arrow"/></button>}</article>
   <article><div className="starter-icon"><Icon name="settings"/></div><h3>把你的練習保存下來</h3><p>在設定頁匯出 SIM 備份。公開試用會到期清除；需要長期保留，可下載本機建置包。</p><button type="button" data-testid="guide-open-settings" onClick={()=>onNavigate('settings')}>查看備份與設定<Icon name="arrow"/></button></article></div>
  <p className="starter-evidence-note">進度依目前工作區的實際紀錄更新，開啟頁面不會標記完成。{volatile?'引導顯示設定目前只保留在本分頁。':''}</p>
 </section>;
}
