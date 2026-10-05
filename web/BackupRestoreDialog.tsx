import {useEffect,useRef} from 'react';
import type {RecordData} from './api';
import './quality-tools.css';
export type BackupCandidate={filename:string;workspace:RecordData;bytes:number};
export default function BackupRestoreDialog({candidate,onConfirm,onCancel}:{candidate:BackupCandidate;onConfirm:()=>void;onCancel:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null),cancel=useRef<HTMLButtonElement>(null);
 useEffect(()=>{const previous=document.activeElement as HTMLElement|null;dialog.current?.showModal();cancel.current?.focus();return()=>{dialog.current?.close();previous?.focus()};},[]);
 const source=candidate.workspace;
 return <dialog ref={dialog} className="backup-preview" data-testid="workspace-backup-preview" aria-labelledby="backup-preview-title" onCancel={onCancel}><h2 id="backup-preview-title">確認還原這份模擬備份</h2><p>完整檢查並傳輸成功後才會取代目前的資料。開始前可先取消，下載現在的備份。</p><dl><dt>檔案</dt><dd>{candidate.filename}</dd><dt>工作區</dt><dd>{String(source.company_name||'未填名稱')}</dd><dt>資料大小</dt><dd>{(candidate.bytes/1024).toFixed(1)} KiB</dd><dt>模組</dt><dd>{Array.isArray(source.modules)?source.modules.length:0} 個</dd><dt>模式</dt><dd>SIM · 不會送出銀行、薪資或報稅作業</dd></dl><p className="backup-warning">還原成功會建立新的資料世代，舊教學進度與釘選不會混入。伺服器仍會檢查全部欄位、引用及容量。</p><div className="backup-dialog-actions"><button ref={cancel} type="button" data-testid="workspace-backup-preview-cancel" onClick={onCancel}>取消，保留現在資料</button><button type="button" className="primary" data-testid="workspace-backup-restore" onClick={onConfirm}>確認還原模擬資料</button></div></dialog>;
}
