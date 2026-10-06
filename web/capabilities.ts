export type CapabilityStatus='ready'|'partial'|'planned';
export type Capability={id:string;title:string;group:string;status:CapabilityStatus;available:string;gap:string;module?:string;requires?:string[];routes?:{module:string;requires:string[]}[]};
/** Our independently implemented scope, not claims of parity with reference vendors. */
export const capabilities:Capability[]=[
 {id:'CAP01',title:'引導建置',group:'上手與工作台',status:'ready',available:'店名、八種行業、推薦功能、明確建立與本機啟動包。',gap:'目前建立單訪客 SIM 工作區。',module:'build'},
 {id:'CAP02',title:'角色工作視角',group:'上手與工作台',status:'ready',available:'店長、業務、庫存製造、行政的快捷入口與實際待辦。',gap:'這是畫面偏好，尚無多人身份或權限角色。',module:'overview'},
 {id:'CAP03',title:'搜尋與操作引導',group:'上手與工作台',status:'ready',available:'工作區紀錄搜尋、功能地圖、操作條件提示及可選教學。',gap:'搜尋只涵蓋本工作區與已列出的功能。',module:'overview'},
 {id:'CAP04',title:'待辦與指標入口',group:'上手與工作台',status:'ready',available:'依目前紀錄顯示待處理數量，點選後前往相關工作。',gap:'指標只反映模擬資料，沒有外部 BI 整合。',module:'overview'},
 {id:'CAP05',title:'總帳與結帳',group:'財務與稅務',status:'planned',available:'尚未實作。',gap:'待建立科目、分錄、期間、試算與結帳；SIM 流水不能取代總帳。'},
 {id:'CAP06',title:'應收帳款',group:'財務與稅務',status:'partial',available:'訂單可分次模擬付款，服務可驗收後以測試幣支付。',gap:'尚無正式應收科目、帳齡、信用額度及沖銷。',module:'sales',requires:['sales','wallets'],routes:[{module:'sales',requires:['sales','wallets']},{module:'services',requires:['services','crm','wallets']}]},
 {id:'CAP07',title:'應付帳款',group:'財務與稅務',status:'planned',available:'尚未實作正式應付流程。',gap:'待建立供應商帳單、付款條件、帳齡及採購對帳。'},
 {id:'CAP08',title:'銀行與資金對帳',group:'財務與稅務',status:'planned',available:'目前只有獨立的 SIM 測試幣流水。',gap:'尚無銀行帳戶、對帳單配對或銀行連線。'},
 {id:'CAP09',title:'稅務與發票',group:'財務與稅務',status:'planned',available:'尚未實作。',gap:'待設計模擬稅額、發票狀態與測試申報；不送正式發票或申報。'},
 {id:'CAP10',title:'固定資產',group:'財務與稅務',status:'planned',available:'行政模組有設備登記與借用。',gap:'尚無資產台帳、折舊、處分分錄或會計連動。'},
 {id:'CAP11',title:'客戶與商機',group:'客戶與銷售',status:'ready',available:'客戶、聯絡人、商機、跟進、案件與失單原因。',gap:'單訪客模擬，沒有銷售人員權限或郵件連線。',module:'crm',requires:['crm']},
 {id:'CAP12',title:'報價與產品配置',group:'客戶與銷售',status:'partial',available:'案件可建立不可變報價版本與期限。',gap:'尚無產品配置器、分級價目與複雜折扣規則。',module:'crm',requires:['crm']},
 {id:'CAP13',title:'客服案件',group:'客戶與銷售',status:'partial',available:'客戶案件、服務交付與補件紀錄。',gap:'尚無客服工單佇列、SLA、知識庫及全通路客服。',module:'crm',requires:['crm']},
 {id:'CAP14',title:'訂單與交付',group:'客戶與銷售',status:'ready',available:'多品項訂單、分次付款、分批出貨、取消與部分退貨。',gap:'全程 SIM，沒有物流或支付商串接。',module:'sales',requires:['sales','inventory','wallets']},
 {id:'CAP15',title:'門市 POS',group:'客戶與銷售',status:'planned',available:'現有訂單頁可以練習銷售流程。',gap:'尚無收銀檯、桌位、現金班結、掃碼或離線 POS。'},
 {id:'CAP16',title:'採購與請購',group:'採購與庫存',status:'partial',available:'商品採購入庫扣除 SIM，行政可保存請購草稿與整理紀錄。',gap:'尚無採購單、供應商管理與收貨／帳單三方比對。',module:'inventory',requires:['inventory','wallets'],routes:[{module:'inventory',requires:['inventory','wallets']},{module:'administration',requires:['administration']}]},
 {id:'CAP17',title:'商品與 FIFO 庫存',group:'採購與庫存',status:'ready',available:'商品目錄、成本層、可用／保留數量及退貨成本回補。',gap:'沒有效期、食安或多倉儲位管理。',module:'inventory',requires:['inventory']},
 {id:'CAP18',title:'倉庫與儲位',group:'採購與庫存',status:'planned',available:'目前商品只計工作區總庫存。',gap:'尚無多倉、調撥、儲位、揀貨與盤點差異單。'},
 {id:'CAP19',title:'BOM 與製造工單',group:'製造與服務',status:'ready',available:'配方版本、製造工單、備料、開工與完工成本轉移。',gap:'沒有工作中心、產能、工時及製程品質管理。',module:'manufacturing',requires:['manufacturing','inventory','wallets']},
 {id:'CAP20',title:'需求與補貨計畫',group:'製造與服務',status:'planned',available:'庫存頁可查看目前可用數量。',gap:'尚無安全庫存、需求預測、MRP 或自動採購建議。'},
 {id:'CAP21',title:'服務交付與派工',group:'製造與服務',status:'partial',available:'服務模擬確認、交付、補件、驗收及測試幣支付。',gap:'尚無外勤地圖、技師派工、工時或服務合約排程。',module:'services',requires:['services','crm','wallets']},
 {id:'CAP22',title:'專案與資源',group:'製造與服務',status:'partial',available:'案件、待辦、到期時間及里程碑。',gap:'尚無資源產能、時數計費、專案預算及完整甘特圖。',module:'projects',requires:['projects']},
 {id:'CAP23',title:'人資基本資料',group:'人員與行政',status:'partial',available:'組織與合成人員資料，可記錄任職狀態。',gap:'尚無真人敏感資料管理、招募、考核或員工自助。',module:'administration',requires:['administration']},
 {id:'CAP24',title:'排班與出勤',group:'人員與行政',status:'partial',available:'週班表、手動出勤、請假申請與附理由更正。',gap:'尚無正式打卡、工時計薪、勞動法規計算或主管權限。',module:'administration',requires:['administration']},
 {id:'CAP25',title:'薪資與獎酬',group:'人員與行政',status:'planned',available:'尚未實作。',gap:'待建立模擬薪資結構、扣項與核對，不產生真薪資付款。'},
 {id:'CAP26',title:'費用與行政申請',group:'人員與行政',status:'partial',available:'請假、請購與費用草稿、提交、補件及整理紀錄。',gap:'整理完成仍未經獨立覆核，尚無多人簽核權限。',module:'administration',requires:['administration']},
 {id:'CAP27',title:'備份與資料追溯',group:'分析與平台',status:'ready',available:'SIM JSON 匯出／還原、分段接續、原操作復原與歷史來源。',gap:'備份需要自行保存，沒有雲端多租戶正式維運承諾。',module:'settings'},
 {id:'CAP28',title:'分析與預算',group:'分析與平台',status:'partial',available:'出貨、退款、FIFO 成本、毛利、庫存與行政範圍報表。',gap:'尚無預算、財務合併、任意查詢與外部資料倉儲。',module:'reports'},
 {id:'CAP29',title:'流程自動化',group:'分析與平台',status:'planned',available:'現有操作逐筆確認；可重試未確認的原操作。',gap:'尚無排程、自動事件規則、整合 Webhook 或自訂流程編輯器。'},
 {id:'CAP30',title:'企業身份與整合',group:'分析與平台',status:'planned',available:'公開試用依訪客 cookie 隔離，工作視角是介面偏好。',gap:'尚無 M365／SSO、正式多人權限、NetSuite／Odoo 同步或多公司合併。'},
 {id:'CAP31',title:'電商與網站',group:'延伸營運',status:'planned',available:'電商行業範本只提供模擬商品與訂單。',gap:'尚無公開商店、結帳、網站編輯器或商品通路同步。'},
 {id:'CAP32',title:'批號、序號與條碼',group:'延伸營運',status:'planned',available:'現有 FIFO 層追蹤採購入庫成本。',gap:'成本層不等於批號；尚無序號、效期、條碼掃描與召回追溯。'},
 {id:'CAP33',title:'品質與維護',group:'延伸營運',status:'planned',available:'行政模組可登記設備與借用。',gap:'尚無檢驗、品質異常、保養排程與維修工單。'},
 {id:'CAP34',title:'日曆與預約',group:'延伸營運',status:'partial',available:'行政週班表與設備借用可檢查時間衝突。',gap:'尚無客戶預約、外部行事曆同步與會議室排程。',module:'administration',requires:['administration']}
];
export const capabilityStatuses:Record<CapabilityStatus,string>={ready:'已可用（SIM）',partial:'部分可用',planned:'待建置'};
export function filterCapabilities(query:string,group:string,status:string){
 const tokens=query.normalize('NFKC').toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
 return capabilities.filter(row=>(!group||row.group===group)&&(!status||row.status===status)&&tokens.every(token=>[row.id,row.title,row.group,row.available,row.gap].join(' ').normalize('NFKC').toLocaleLowerCase().includes(token)));
}
export function capabilityDestination(row:Capability,modules:string[]|null):string|null{
 if(row.status==='planned'||!row.module)return null;
 if(!modules)return 'build';
 if(row.routes)return row.routes.find(route=>route.requires.every(module=>modules.includes(module)))?.module||'build';
 return (row.requires||[]).every(module=>modules.includes(module))?row.module:'build';
}
