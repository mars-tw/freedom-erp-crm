import React,{useEffect,useMemo,useState} from 'react';
import type {Workspace} from './api';
import {Icon,type IconName} from './icons';
import type {WorkspaceTarget} from './workbench-model';
import {availableRoleViews,readRoleView,roleCenterModel,roleViews,writeRoleView,type RoleView} from './role-center';
import './role-center.css';

export default function RoleCenter({workspace,onNavigate,onOpenCapabilities,disabled=false}:{workspace:Workspace;onNavigate:(module:string,target?:WorkspaceTarget)=>void;onOpenCapabilities?:()=>void;disabled?:boolean}) {
  const [selection,setSelection] = useState(() => ({generation:workspace.generation_id,view:readRoleView(workspace)}));
  const available = availableRoleViews(workspace);
  const view = selection.generation === workspace.generation_id && available.includes(selection.view) ? selection.view : readRoleView(workspace);
  const model = useMemo(() => roleCenterModel(workspace,view),[workspace,view]);
  const current = roleViews.find(role => role.id === model.view)!;
  useEffect(() => {
    if (selection.generation !== workspace.generation_id || !available.includes(selection.view)) setSelection({generation:workspace.generation_id,view:readRoleView(workspace)});
  },[workspace.generation_id,workspace.modules.join(','),selection.generation,selection.view]);
  function select(next:RoleView) {if (disabled || !available.includes(next)) return;writeRoleView(workspace,next);setSelection({generation:workspace.generation_id,view:next});}
  return <section className="role-center" data-testid="role-center" aria-labelledby="role-center-title">
    <header className="role-center-heading"><div><span className="eyebrow">今天要處理什麼？</span><h2 id="role-center-title">你的日常工作台</h2><p>選一個工作視角，把常用資料與流程放在前面。</p></div>{onOpenCapabilities && <button type="button" className="role-capabilities" data-testid="role-open-capabilities" disabled={disabled} onClick={onOpenCapabilities}><Icon name="search"/>找功能</button>}</header>
    <div className="role-view-picker" role="group" aria-label="工作視角">{roleViews.map(role => <button type="button" key={role.id} data-testid={`role-view-${role.id}`} aria-pressed={model.view === role.id} disabled={disabled || !available.includes(role.id)} aria-describedby="role-view-note" onClick={() => select(role.id)}><Icon name={({owner:'overview',sales:'crm',operations:'manufacturing',administration:'administration'} as Record<RoleView,IconName>)[role.id]}/><span>{role.name}</span>{!available.includes(role.id) && <small>需啟用相關功能</small>}</button>)}</div>
    <p id="role-view-note" className="role-view-note">只調整首頁的工作視角，不會改變功能或帳號權限。</p>
    <div className="role-current-heading"><h3>{current.name}的工作重點</h3><span>依目前模擬資料計算</span></div>
    <div className="role-cards">{model.cards.map(card => <button type="button" key={card.id} data-testid={`role-card-${card.id}`} disabled={disabled} onClick={() => onNavigate(card.module,card.target)}><span className="role-card-label"><Icon name={card.module as IconName}/>{card.label}</span><strong>{card.count}<small>{card.unit}</small></strong><p>{card.description}</p><span className="role-card-open">查看資料<Icon name="arrow"/></span></button>)}</div>
    {model.flow && <div className="role-flow" data-testid={`role-flow-${model.flow.id}`}><div className="role-flow-heading"><Icon name="arrow"/><div><h3>{model.flow.title}</h3><p>{model.flow.description}</p></div></div><ol aria-label="流程入口">{model.flow.steps.map((step,index) => <li key={step.module}><button type="button" data-testid={`role-flow-step-${model.flow!.id}-${step.module}`} disabled={disabled} onClick={() => onNavigate(step.module)}><span aria-hidden>{index+1}</span><strong>{step.label}</strong><Icon name="arrow"/></button></li>)}</ol><p className="role-flow-note">這些入口只開啟對應頁面。付款、進貨、出貨與行政申請都需要你另外確認。</p></div>}
  </section>;
}
