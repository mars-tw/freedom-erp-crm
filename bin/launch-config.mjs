// Shared by the browser builder and Node launcher. No platform imports.
const fields=new Set(['format','industry','company_name','modules','port','directory','auto_setup','simulation','real_finance']);
const controls=/[\u0000-\u001f\u007f-\u009f]/;
export function normalizeLaunchConfig(value,catalog){
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('建置設定須為 JSON 物件。');
 for(const key of Object.keys(value))if(!fields.has(key))throw Error(`不支援的建置設定欄位：${key}`);
 if(value.format!=='freedom-erp-launch-v1')throw Error('建置設定格式須為 freedom-erp-launch-v1。');
 const template=catalog.templates.find(t=>t.id===value.industry);
 if(!template)throw Error('無效產業範本。');
 if(typeof value.company_name!=='string'||!value.company_name.trim()||value.company_name.length>100||controls.test(value.company_name))throw Error('名稱須為 1–100 字，不能包含控制字元。');
 const modules=value.modules===undefined?[...template.modules]:value.modules;
 const allowed=new Set(catalog.templates.flatMap(t=>t.modules));
 if(!Array.isArray(modules)||modules.length===0||new Set(modules).size!==modules.length||modules.some(v=>typeof v!=='string'||!allowed.has(v)))throw Error('模組名稱無效或重複。');
 const dependencies=catalog.moduleDependencies??template.module_dependencies??{};
 for(const name of modules)for(const dependency of dependencies[name]??[])if(!modules.includes(dependency))throw Error(`${name} 需要模組 ${dependency}`);
 const port=value.port===undefined?'auto':value.port;
 if(port!=='auto'&&(!Number.isInteger(port)||port<1024||port>65535))throw Error('連接埠須為 auto 或 1024–65535 的整數。');
 const directory=value.directory===undefined?'./freedom-data':value.directory;
 if(typeof directory!=='string'||!directory.trim()||directory.length>500||controls.test(directory)||/^(?:[\\/]|[a-z]:)/i.test(directory)||directory.includes(':')||directory.split(/[\\/]/).includes('..'))throw Error('資料目錄須為設定檔旁的相對路徑，不能包含 ..、磁碟代號或控制字元。');
 const auto_setup=value.auto_setup===undefined?true:value.auto_setup;
 if(typeof auto_setup!=='boolean')throw Error('auto_setup 須為布林值。');
 if(value.simulation!==undefined&&value.simulation!==true||value.real_finance!==undefined&&value.real_finance!==false)throw Error('建置設定僅允許模擬資料與 SIM 測試幣。');
 return {format:'freedom-erp-launch-v1',industry:template.id,company_name:value.company_name.trim(),modules:[...modules],port,directory,auto_setup,simulation:true,real_finance:false};
}
