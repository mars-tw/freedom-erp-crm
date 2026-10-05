export type DesignTemplateId = 'harbor'|'executive'|'atelier'|'commerce'|'industrial'|'verdant'|'editorial'|'midnight';
export interface DesignTemplate {
  id:DesignTemplateId;
  name:string;
  englishName:string;
  category:'business'|'store'|'creative'|'factory';
  description:string;
  signature:string;
  tags:string[];
  /** Light palette: background, surface, ink, primary accent, secondary accent. */
  palette:string[];
  layout:'rail'|'top'|'floating';
}

const entries:DesignTemplate[] = [
  {id:'harbor',name:'深海商務',englishName:'Harbor',category:'business',description:'把指標、待處理事項與工作入口放進清楚的浮動外框。',signature:'深海導覽、青藍細光邊與雙欄工作卡。',tags:['浮動導覽','商務總覽','雙欄卡片'],palette:['#eef5f8','#ffffff','#102a43','#147b95','#e3a147'],layout:'floating'},
  {id:'executive',name:'典雅企業',englishName:'Executive',category:'business',description:'以分層側欄與穩定留白整理企業的日常紀錄。',signature:'石墨側欄、金色細線與典雅襯線標題。',tags:['分層側欄','企業管理','金色細線'],palette:['#eef0f3','#ffffff','#252a33','#82601f','#c2a46a'],layout:'rail'},
  {id:'atelier',name:'品牌工作室',englishName:'Atelier',category:'creative',description:'用大字標題、水平導覽與展示卡片安排品牌及專案工作。',signature:'梅紫大字、粉色段落與非對稱圓角卡。',tags:['水平導覽','大字展示','品牌專案'],palette:['#f7edf7','#fffaff','#482444','#a23570','#e97fab'],layout:'top'},
  {id:'commerce',name:'活力店務',englishName:'Commerce',category:'store',description:'商品、訂單與待辦採寬幅格狀排列，適合快速切換店務。',signature:'鈷藍導覽、橙色標記與圓角商品格。',tags:['水平導覽','商品格','圓角操作'],palette:['#edf3ff','#ffffff','#143264','#2458d3','#df721f'],layout:'top'},
  {id:'industrial',name:'工廠控制室',englishName:'Industrial',category:'factory',description:'以緊實側欄、工程分隔與技術數字核對庫存及製造流程。',signature:'板岩工程線、橙色指示與方角工作面板。',tags:['工程側欄','方角面板','技術數字'],palette:['#e9eef2','#f8fafc','#263645','#b34d20','#e28b39'],layout:'rail'},
  {id:'verdant',name:'自然門市',englishName:'Verdant',category:'store',description:'讓門市、服務與行政紀錄保有寬留白和柔和閱讀節奏。',signature:'霧綠浮動導覽、寬留白與柔和圓角。',tags:['浮動導覽','寬留白','門市服務'],palette:['#edf7f2','#ffffff','#163f36','#187257','#89b9a6'],layout:'floating'},
  {id:'editorial',name:'編輯工作台',englishName:'Editorial',category:'creative',description:'用清楚的段落、襯線標題與橫向導覽管理案件和內容。',signature:'酒紅章節線、丁香色工作面與編輯式標題。',tags:['橫向章節','襯線標題','案件內容'],palette:['#f3edf8','#fffaff','#43263d','#8a3556','#ad8bd1'],layout:'top'},
  {id:'midnight',name:'夜間科技',englishName:'Midnight',category:'business',description:'以精細光帶、垂直導覽與切角數據卡整理工作狀態。',signature:'靛藍控制側欄、青藍光帶與精準數字。',tags:['控制側欄','切角數據卡','細光帶'],palette:['#edf0fd','#ffffff','#25275e','#514bbb','#218ca1'],layout:'rail'},
];

export const designTemplates:readonly DesignTemplate[] = Object.freeze(entries.map(entry=>{
  Object.freeze(entry.tags);Object.freeze(entry.palette);return Object.freeze(entry);
}));
export const defaultDesignTemplate:DesignTemplateId = 'harbor';
export const designPreferenceKey = 'freedom-erp.design.v1';
const ids = new Set<string>(designTemplates.map(template=>template.id));
let memoryPreference:DesignTemplateId = defaultDesignTemplate;
let memoryFallback = false;

export function isDesignTemplateId(value:unknown):value is DesignTemplateId {
  return typeof value==='string' && ids.has(value);
}
function preference(value:unknown):DesignTemplateId|null {
  if(!value || typeof value!=='object' || Array.isArray(value))return null;
  const data=value as Record<string,unknown>;
  if(Object.keys(data).length!==2 || !Object.hasOwn(data,'version') || !Object.hasOwn(data,'template') || data.version!==1 || !isDesignTemplateId(data.template))return null;
  return data.template;
}

/** Visual preferences never read or write workspace data. */
export function readDesignPreference():DesignTemplateId {
  if(memoryFallback)return memoryPreference;
  try{
    const raw=localStorage.getItem(designPreferenceKey);
    return raw && raw.length<=256 ? preference(JSON.parse(raw))??defaultDesignTemplate : defaultDesignTemplate;
  }catch{return defaultDesignTemplate;}
}
export function writeDesignPreference(id:DesignTemplateId):boolean {
  if(!isDesignTemplateId(id))return false;
  memoryPreference=id;
  try{
    const raw=JSON.stringify({version:1,template:id});localStorage.setItem(designPreferenceKey,raw);
    if(localStorage.getItem(designPreferenceKey)!==raw)throw new Error('Design preference was not retained');
    memoryFallback=false;return true;
  }catch{
    memoryFallback=true;return false;
  }
}
