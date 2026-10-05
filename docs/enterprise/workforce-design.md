# 企業、招募、人資、排班、出勤與薪資設計

狀態：`spec_draft`。功能階段：`planned`。設計日期及官方來源查核日：2026-10-05。

適用前提：台灣 1–200 人的小店與中小企業，先採一般工時及單一台灣雇主，資料模型保留多法人、多分店及工廠。本文是後續開發規格，未新增 runtime 模組、登入、審核、排班器、薪資計算或政府串接。所有介面、按鈕、command 名稱與資料實體均為規劃。

## 1. 現況與實作前置條件

檢視基準：`src/templates.ts`、`src/engine.ts`、`src/worker.ts`。現行模組只有 `inventory`、`sales`、`wallets`、`services`、`crm`、`projects`、`manufacturing`。產業範本為 version 1；世界資料為 schemaVersion 1。

現行 Worker 以隨機 `freedom_session` cookie 的 digest 決定訪客 Durable Object。它提供同源／CSRF、工作區版本及冪等檢查，沒有 user identity、team login、tenant membership 或 RBAC。現行 `/view`、`/export` 會回傳工作區資料，不能直接拿來承載員工個別薪資。公開試用的 DO 在最後一次存取後 72 小時清除；這是模擬資料期限，不能當成正式人事資料的保存制度。

新增模組固定使用以下 ID，既有七個 ID 保留：

| 本文模組 | 職責 | 規劃依賴 |
| --- | --- | --- |
| `enterprise` | 法人、分店／工廠、部門、職位、成本中心與政策範圍 | Phase 0 身分與租戶架構 |
| `hr` | 員工、僱用關係、到職、異動、離職及年資 | enterprise |
| `recruitment` | 職缺需求、候選人代號、甄選與錄用交接 | enterprise、hr；審核依賴 approvals |
| `scheduling` | 班別、班表、換班與人力需求 | enterprise、hr；發布審核依賴 approvals |
| `attendance` | 原始出勤、修正、請假、加班及關帳 | scheduling、hr；核定依賴 approvals |
| `payroll` | 給薪政策、薪資草稿、覆核及個別模擬薪資單 | hr、attendance；核定依賴 approvals |

`approvals`、`documents`、`analytics`、`treasury`、`accounting`、`tax`、`invoices`、`procurement`、`assets`、`quality`、`connectors` 的完整規格由其他設計文件負責。本文只定義需要的交接契約。薪資可在沒有 treasury／accounting 時製作模擬草稿，不能因此生成付款或分錄。

Phase 0 必須先完成：

1. 經伺服器驗證的 user／session 與 tenant membership，並把 DO 路由改為已驗證租戶；tenant_id 不能直接信任瀏覽器 payload，也不能沿用「同一 cookie 扮演全部角色」。
2. 每個 command 的伺服器端權限、資料範圍、本人利益衝突與 maker-checker 檢查。切換角色下拉選單只可作為介面示意，不能成為審核證據。
3. 員工自助讀取、薪資私有端點、欄位遮罩、private export 與存取稽核。前端隱藏欄位不等於有保護。
4. 新 schema／範本版本、migration、逐實體欄位 allowlist、未知欄位拒絕及安全匯入。現行 command gate 沒有接受本文的新 command。
5. 租戶內跨店交易及鎖定策略。先以一租戶一 DO 處理一致性；日後若分割成分店 DO，須另設員工工時及薪資關帳的協調交易，不能只做每店各自檢查。
6. 把短期公開 SIM 儲存與未來私有保存架構分開。尚未完成前，只能使用虛構員工與模擬案例。

## 2. 台灣政策基準與官方查核

下表僅記錄本次核對的關鍵規則。法規數值、適用資格、級距、費率、假日與生效日要放入有來源的政策版本；本文不提供可直接執行的排班或正式薪資規則。每個引用的查核日均為 2026-10-05。

勞動部法令系統本次頁尾顯示資料截止日為 2026-08-31，勞基法顯示 2024-07-31 修正版；來源查核日不等於對後續修法的保證。正式上線與每次政策更新前，另須確認主管機關最新公告、施行日期與適用對象。政策驗證缺漏時顯示「待確認」，不得標示「依法合規」。

| 議題 | 本次確認的規則 | 對設計的要求與直達來源 |
| --- | --- | --- |
| 一般正常工時 | 一般情況每日不超過 8 小時、每週不超過 40 小時；變形工時另有行業及同意程序。 | 預設 general_standard；二週／八週／四週變形工時均需個別資格、證據與版本，不能把產業名稱當成授權。[勞基法第 30 條](https://laws.mol.gov.tw/FLAW/FLAWDOC01.aspx?id=FL014930&flno=30)、[第 30-1 條](https://laws.mol.gov.tw/FLAW/FLAWDOC01.aspx?id=FL014930&flno=30-1)（查核：2026-10-05）。 |
| 輪班換班 | 採輪班制且更換班次時，原則應有連續 11 小時休息。8 小時例外需符合公告適用範圍、工會或勞資會議同意；30 人以上另有備查要求。每週更換班次的規定也有勞工同意例外。 | 分開記錄 rotating、shift_change 與 consent；固定班的兩次出勤不能全部誤稱第 34 條換班。企業也可設定較嚴的安全間隔。[勞基法第 34 條](https://laws.mol.gov.tw/FLAW/FLAWDOC01.aspx?id=FL014930&flno=34)、[勞動部適用範圍](https://www.mol.gov.tw/1607/28162/28166/28218/28232/29068/post)（查核：2026-10-05）。 |
| 班中休息 | 連續工作 4 小時原則至少休息 30 分鐘；輪班、連續性或緊急性工作可在工作時間內另行調配。 | 記錄實際 break intervals 與調配依據，不只從排定班別固定扣除午休。[勞基法第 35 條](https://laws.mol.gov.tw/FLAW/FLAWDOC01.aspx?id=FL014930&flno=35)（查核：2026-10-05）。 |
| 例假、休息日 | 一般每 7 日有 1 日例假及 1 日休息日；變形工時及指定行業例外另有條件。休息日工作時數原則計入延長工時總數。 | day_type 要區分例假、休息日、國定假日與工作日；例假不能用一般加班簽核就解鎖。[勞基法第 36 條](https://laws.mol.gov.tw/FLAW/FLAWDOC01.aspx?id=FL014930&flno=36)（查核：2026-10-05）。 |
| 延長工時 | 正常與延長合計一般每日不超過 12 小時、延長工時一般每月不超過 46 小時。另有法定同意程序與例外，不能只靠員工申請或主管點同意。 | 一般版先檢查跨店合計；總量管制、災害事件及其他例外須獨立政策與程序證據，缺漏時阻擋對應路徑。[勞基法第 32 條](https://laws.mol.gov.tw/FLAW/FLAWDOC01.aspx?id=FL014930&flno=32)（查核：2026-10-05）。 |
| 加班費與補休 | 延長工時、休息日及假日工作適用不同給付規則。補休須出於勞工意願且經雇主同意，依工作時數計算；期限或契約終止仍未休者，按原加班日標準給薪。 | 保留 day_type、原工作日、工資基準版本、員工選擇與期限；不能自動把所有加班換成補休。[勞基法第 24 條](https://laws.mol.gov.tw/FLAW/FLAWDOC01.aspx?id=FL014930&flno=24)、[第 32-1 條](https://laws.mol.gov.tw/FLAW/FLAWDOC01.aspx?id=FL014930&flno=32-1)、[第 39 條](https://laws.mol.gov.tw/FLAW/FLAWDOC01.aspx?id=FL014930&flno=39)（查核：2026-10-05）。 |
| 特休 | 同一雇主或事業單位的繼續年資決定權利；滿半年未滿一年為 3 日，其他級距依版本表。期日由勞工排定，必要時雙方協商調整；年度終結或終止未休須給薪，遞延須協商且保留後續結算義務。 | 年資、計算年度、來源 grant、使用與遞延均不可直接改餘額；同法人跨店不重設年資。各年期日與未休給薪須可供書面通知。[勞基法第 38 條](https://laws.mol.gov.tw/FLAW/FLAWDOC01.aspx?id=FL014930&flno=38)（查核：2026-10-05）。 |
| 其他假別與全勤 | 請假須依假別分別設定工資、單位、證明及保障；2025-12-09 修正的請假規則自 2026-01-01 施行，普通傷病假全勤扣發比例及家庭照顧事假有新規定。 | 不提供「請任何假就扣完全勤」預設；假別政策要保存生效日與較優約定，不可用新規則重算舊期。[勞工請假規則第 7 條](https://laws.mol.gov.tw/FLAW/FLAWDOC01.aspx?id=FL014935&flno=7)、[第 9 條](https://laws.mol.gov.tw/FLAW/FLAWDOC01.aspx?id=FL014935&flno=9)、[第 9-1 條](https://laws.mol.gov.tw/FLAW/FLAWDOC01.aspx?id=FL014935&flno=9-1)、[施行日期](https://laws.mol.gov.tw/FLAW/PrintFLAWDOC01.aspx?id=FL014935&flno=12)（查核：2026-10-05）。 |
| 出勤紀錄 | 須逐日記至分鐘，保存 5 年；員工申請副本或影本不得拒絕。 | 原始事件、核定紀錄與修正軌跡分存，個人可申請自己的紀錄。[勞基法第 30 條第 5、6 項](https://laws.mol.gov.tw/FLAW/FLAWDOC01.aspx?id=FL014930&flno=30)（查核：2026-10-05）。 |
| 工資明細與清冊 | 須提供各項目計算方式明細，清冊記入工資及相關明細並保存 5 年。給付頻率有法定原則與當事人特別約定等例外。 | 薪資單要有數量、基準、算法版本、加扣項及總額；不得只顯示「實領」。給付日／週期保留約定依據。[勞基法第 23 條](https://laws.mol.gov.tw/FLAW/FLAWDOC01.aspx?id=FL014930&flno=23)（查核：2026-10-05）。 |
| 勞工名卡與勞退名冊 | 勞工名卡保存至離職後 5 年；勞退僱用名冊、相關紀錄及制度選擇文件也有離職後 5 年保存要求。 | 未來正式版按 record_class 計算期限；公開 SIM 不收身分證、出生日期、住址及名卡原件。[勞基法第 7 條](https://laws.mol.gov.tw/FLAW/FLAWDOC01.aspx?id=FL014930&flno=7)、[勞退條例第 21 條](https://www.bli.gov.tw/0008222.htm)（查核：2026-10-05）。 |
| 勞退雇主與自提 | 適用新制的法定雇主提繳不得低於每月工資 6%；雇主負擔不能轉扣員工薪資。員工自願提繳另有規則，兩者要分開。 | employer_cost 與 employee_deduction 分列，採適用對象、提繳工資級距及生效版本；不能用底薪一欄代表全部基準。[勞退條例第 14、16 條](https://www.bli.gov.tw/0008222.htm)、[勞保局雇主提繳扣薪問答](https://www.bli.gov.tw/0017593.html)（查核：2026-10-05）。 |
| 小店保險與勞退 | 未滿 5 人不能概括當成免就保、免職災保、免勞退；各制度依投保單位、個人資格與適用條件判斷。 | 每制度獨立 applicability，部分工時也要檢查；沒有資格資料不能預設免保。[勞保局未滿 5 人問答](https://www.bli.gov.tw/0101713.html)、[勞退提繳問答](https://www.bli.gov.tw/0017594.html)（查核：2026-10-05）。 |
| 勞保與健保基準 | 勞保按工資性質及投保薪資表申報，加班費等不能只因名稱省略；健保受僱者原則以薪資所得，得扣除加班費但另有其他制度下限限制。 | 建立 labor_insurance、occupational_accident、pension、nhi 各自基準，不共用單一 insured_salary。調整及生效日期分別保存。[勞保局投保薪資解釋](https://www.bli.gov.tw/0022930.html)、[健保署投保金額申報與調整](https://www.nhi.gov.tw/ch/cp-7257-3a813-2626-1.html)（查核：2026-10-05）。 |

SIM 金額與法律 TWD 基準屬不同量綱。政策參考可以展示正式幣別 `TWD` 的最低工資或投保表來源，但 SIM 薪資不能與 TWD 門檻比較後宣稱合規。最低工資、級距、保費、稅率及假日表本次不硬寫金額，也不自動更新。未經查核發布的政策版本不得進入正式計算。

## 3. 組織與小店使用方式

`Tenant` 是資料與權限邊界；`LegalEntity` 是雇主；`Site` 是分店、工廠、辦公室或倉庫；`Department` 是管理單位；`Position` 是職位定義；`CostCenter` 是成本歸集單位。這五種關係不可混為一個 company_name。

一人店先建立一個法人、一個據點及一個成本中心，部門可用「店務」，職位可用「負責人」或「門市人員」。不強迫建立複雜組織樹。擴增第二分店只增加 Site 與有效期間 assignment，不複製員工。工廠可在 Site 下增設工作區及技能需求，排班會引用工作區；製造工單仍由 manufacturing 負責。

員工可同時有多個據點或成本分攤，但每個有效僱用期間須有明確雇主、主要 assignment 與核准的成本分攤。跨法人轉任不是一般跨店調班；建立 EmploymentChange，記錄原關係結束、新關係開始與經覆核的年資承認依據。系統不自行裁定轉任必須保留或重置的全部法定權利。

組織版本只影響生效日之後的新交易。停用據點、職位或成本中心保留歷史引用，有未結班表／出勤／薪資時先處理交接，禁止硬刪或把歷史成本移到新名稱下。

## 4. 資料契約與實體

本文採 relational 邏輯模型，不要求現在把這些資料塞進 World JSON。共用欄位：`id`、`tenant_id`、`record_version`、`created_at`、`created_by_user_id`、`updated_at`、`status`、`simulation=true`。金額用安全整數 `amount_minor`，幣別固定 SIM；分鐘、時數及百分比採明確單位和固定精度，不用二進位浮點作金額。

有效期間採半開區間 `[effective_from,effective_to)`；空的 to 代表尚未結束。僱用及班別時間用 UTC instant，另存 `timezone=Asia/Taipei`，畫面用當地時間；日期型權利另存 local_date，不把它轉成可變動的 UTC 日期。

| 實體 | 主要欄位 | 關聯、唯一性與不可變條件 |
| --- | --- | --- |
| Tenant／Membership（Phase 0） | user_id、tenant_id、role_grants、scope、valid_from/to、identity_level | Membership 唯一綁定 tenant＋user；由伺服器 session 識別，不能由 command 自稱 approver。Employee 與 Membership 分離。 |
| LegalEntity | code、display_name、country、timezone、policy_scope_id | code 在 tenant 內唯一；SIM 只填虛構名稱及代號，不填真統編、負責人身分或正式登記附件。 |
| Site／WorkArea | legal_entity_id、site_type、code、name、parent_site_id | 分店／工廠不另產 tenant；父子樹無循環，WorkArea 必須在同一法人據點下。 |
| Department／Position | legal_entity_id、parent_id、code、name、skill_requirements | 組織樹不能循環，Position 不直接附本人薪資。 |
| CostCenter | legal_entity_id、code、name、effective_from/to | 歷史成本指向版本，不因停用改寫；不能分攤到其他 tenant。 |
| Employee | employee_code、display_alias、membership_user_id?、service_start_date、privacy_class | 員工代號在 tenant 內唯一；沒有登入也能有虛構員工。SIM 無 real_name、ID、住址、銀行、病歷或真正聯絡資料欄位。 |
| Employment | employee_id、legal_entity_id、contract_type、work_fraction、start_at、end_at、service_credit_id、policy_profile_id | employment 指僱用關係，status 不由一般 update 直接改。並行僱用要有用途與覆核，不能迴避同雇主工時合計。 |
| AssignmentVersion | employment_id、site_id、department_id、position_id、manager_employee_id、is_primary、cost_allocations、effective_from/to | 同 employment 主要 assignment 不重疊；同時生效的成本分攤合計 100%，本人不能為自己的簽核人。 |
| EmploymentChange | employment_id、change_type、before_version_ids、proposed_values、effective_at、reason、employee_ack_id、approval_id | 到職／調動／調薪／留停／復職／離職有獨立 change_type；核准後只透過新版本修正。 |
| WorkforcePolicyVersion | policy_key、jurisdiction、applies_to、source_urls、source_revision、verified_at、effective_from/to、parameters、approval_id、digest | 日曆、一般工時、假別、輪班、最低工資及保存各有 key。相同 scope＋key 的已發布期間不能重疊。發布版本 immutable。 |
| PolicyProfileVersion／ServiceCredit | employment_id、policy_version_ids、effective_from/to；employment_id、service_interval、credited_days、recognition_reason、evidence_ref、approval_id | profile 明列全部適用政策，不憑職稱推斷；年資承認逐段留來源，跨法人不得自動複製。 |
| PolicyEvidence | policy_version_id、evidence_type、synthetic_reference、approved_scope、valid_from/to | 行業資格、工會／勞資會議、勞工同意、主管機關備查分開；SIM 只使用虛構證據。缺一項不能宣稱已完成法定程序。 |
| ShiftTypeVersion | site_id、name、local_start、local_end、crosses_midnight、planned_breaks、rotating_group、effective_from/to | 班別描述可複用；改班別不改已發布 ShiftInstance。 |
| StaffingDemand | site_id、work_area_id?、time_interval、position_id、skill_id?、required_count、source_ref? | 可引用 manufacturing workOrder／project task 的 id，不把預估需求變為員工出勤。 |
| RosterRevision／ShiftInstance | roster_id、revision、period_from/to、site_id、employee_id、employment_id、start_at、end_at、day_type_segments、policy_version_ids、digest | 一個班次 end 大於 start；同員工跨店重疊檢查；published snapshot 不可 update。 |
| ShiftSwap | from_shift_id、to_shift_id?、requester_employee_id、replacement_employee_id、consent_ids、approval_id | consent 不是 approval；新 revision 發布成功才 supersede 原班次，原班次保留。 |
| AttendanceEvent | employee_id、occurred_at、event_type、source、synthetic_device_id?、received_at、event_key | 原始事件 append-only；重送相同 event_key＋內容返回原事件，異內容拒絕。無 SIM 真 GPS、生物辨識或真正打卡機資料。 |
| AttendanceAdjustment | employee_id、event_ids、proposed_intervals、reason、evidence_ref、approval_id | 改的是核定版本，不覆寫原始事件；必須記錄提出者與別人核定者。 |
| AttendanceDayVersion | employment_id、work_day_key、civil_date_segments、actual_work_intervals、actual_break_intervals、event_ids、adjustment_ids、policy_version_ids、exceptions、digest | 實際工作、休息、請假分段不可重疊；actual 與 roster 分存。待爭議分鐘不可靜默刪除。 |
| AttendancePeriod | legal_entity_id、period_from/to、employee_ids、approved_day_version_ids、cutoff_at、digest | 關帳凍結每一天的核定版本與異常處理結果；lock 之後修正要重開或下一期 adjustment。 |
| LeaveRequest／LeaveLedger | employment_id、leave_type_policy_id、intervals、requested_unit、reason_code、consent_ref?；ledger_type、quantity、source_ref | balance 由 grant／reserve／consume／release／carry／payout entries 計算，不直接 update。病假只存類別與審核證據代號。 |
| OvertimeRequest／OvertimeActual | employment_id、requested_interval、reason、approval_id；attendance_day_version_id、actual_interval、day_type、pay_basis_version_id、dispute_status | 申請與實際分鐘分開；事前未核准不能成為自動不給薪條件。 |
| CompTimeLedger | overtime_actual_id、employee_choice_ref、employer_consent_ref、earned_minutes、used_minutes、expires_on、payout_ref | 每筆追溯原加班日及薪資基準；不能混成一個無來源餘額。 |
| PayComponentVersion | code、kind、calculation_basis、input_unit、amount_or_rate、rounding_policy_id、wage_nature_review、insurance_basis_flags、effective_from/to | kind 分 earning、employee_deduction、employer_cost；是否屬工資與各投保基準需分別審核，不能依名稱推斷。 |
| PayCalculationPolicyVersion | policy_key、pay_basis、proration_unit、divisor_definition、rounding_precision、rounding_mode、source_urls、effective_from/to、approval_id | proration、平日每小時工資、未休結算及捨入分別定義；每個 divisor 有用途，不能共用無來源的固定除數。 |
| CompensationVersion | employment_id、pay_basis、component_version_ids、pay_cycle、pay_day_rule、proration_policy_id、effective_from/to、approval_id | pay_basis 先支援 monthly／hourly；相同 employment 的有效方案不重疊，調薪期內須分段。 |
| CoverageVersion | employment_id、scheme、applicability、basis_policy_id、bracket_ref、employee_share_rule、employer_share_rule、effective_from/to、verified_at | scheme 分勞保、就保、職災、勞退、健保；unknown applicability 會擋薪資核定。SIM 僅學習參數，不代表已申報。 |
| PayrollPeriod／PayrollRun | legal_entity_id、period_from/to、run_type、attendance_period_id、snapshot_ids、run_revision、source_digest、calculation_digest、approval_id | 同一雇主＋期間＋run_type 不能有重複有效主批次；run_type 為 regular／adjustment／final。 |
| PayrollLine／Payslip | run_id、employee_id、employment_id、component_id、quantity、unit、basis_snapshot、rate_snapshot、amount_minor、source_refs、currency；slip_revision、visibility、digest | 總額等於各行；薪資單 immutable，修正另出 revision。本人只讀自己的已發布單，不透過全 workspace export。 |
| WorkforceCostAllocation | payroll_line_id、site_id、cost_center_id、project_id?、work_order_id?、allocation_basis_snapshot、amount_minor | 切到各中心的整數金額合計等於原行；捨入差額有固定可稽核歸屬。不得直接寫製造庫存成本。 |
| HiringRequisition／Candidate | legal_entity_id、site_id、position_id、requested_count、budget_ref、approval_id；candidate_alias、stage、requisition_id、evaluation_refs | SIM 候選人用代號與虛構評語，不匯入真人履歷。candidate hired 才交接 Employment draft，不能直接 active。 |
| ReviewCase／ApprovalDecision | object_type/id、revision_digest、maker_user_id、affected_employee_ids、required_roles、reviewer_user_id、decision、reason、decided_at | decision 綁定內容 digest；修改內容使原決定失效。本人與 maker 衝突檢查採 user principal，不以換 membership／角色繞過。 |
| PrivateExportRequest | requestor_user_id、export_type、object_ids、field_scope、purpose、approval_id?、expires_at、download_token_digest、downloaded_at | employee_self 範圍由本人 binding 決定；bulk_company 才走獨立核准。檔案不放公開網址，下載端再驗 session、scope 及期限。 |
| RetentionRule／RetentionHold | record_class、trigger_event、duration、policy_version、scope；hold_reason、authorizer、starts_at、ends_at? | 人事、出勤、薪資、候選人及存取日誌分開；hold 阻止刪除，解除要留證據。 |

所有關聯驗證 tenant 一致、法人範圍有效及對應版本有效。API 不允許 payload 帶 actor／reviewer 覆蓋伺服器 principal。附件交給 documents，SIM 附件只容許系統產生的虛構內容；上傳真人身分、銀行帳號、健康或履歷原件不在本版本範圍。

## 5. 精確狀態、動作與交易關係

下列動作名稱為未來 command 契約。每次 mutation 均需 `expected_record_version`、內容 digest 或 revision id、冪等鍵，以及伺服器記錄的 actor、tenant、scope。未列出的轉移一律拒絕；一般 `update.status` 不得跳過轉移。退回理由必填，reviewed snapshot 任何欄位修改都要重新送審。

### 5.1 共用簽核及政策

ReviewCase：`draft --review.submit--> pending`；`pending --review.approve--> approved`；`pending --review.return--> returned`；`pending --review.reject--> rejected`；`draft/returned --review.cancel--> cancelled`。returned 修改後 `review.resubmit` 產生新 revision＋新 pending decision。approved 的內容不可修改，欲改內容需新案，舊案記 superseded 關聯。審核只能決定內容，不能順帶付款、申報或發布薪資單。

單人模式另走 `draft --review.prepare_unreviewed--> prepared_unreviewed`；此狀態只能記 owner_attestation 或 `review.submit_for_independent_check`→pending，不能呼叫 review.approve。原 maker 不變，外部 reviewer 必須是已驗證的另一個 principal。PayrollRun 可停在 previewed，連結這份未覆核案，不會因責任聲明變為 approved。

組織主檔採 `draft --enterprise.submit--> in_review --enterprise.approve--> approved --enterprise.activate--> active`；activate 需生效日已到。in_review 可 return 到 draft 或 reject 到 cancelled；active 的修訂與停用建立新版本，`enterprise.deactivate` 只有未來引用已處理且有效日已到才能使該版本 inactive。此流程不與法規政策發布混用。

PolicyVersion：`draft --policy.submit--> in_review --policy.approve--> approved --policy.publish--> published`。publish 需已核定的版本、來源、生效日與適用 scope，並檢查已發布區間不重疊。未到生效日的 published 只表示已排定，不代表現在適用。`policy.replace` 建立新的 draft；歷史 published 保留原 digest。發現錯誤用 `policy.withdraw` 標 withdrawn，阻擋後續新計算，既有關帳資料列入影響覆核，不能直接重算。

### 5.2 招募、到職、異動及離職

HiringRequisition：`draft --requisition.submit--> in_review --requisition.approve--> approved --requisition.open--> open`；`open --requisition.close--> closed`；draft／in_review 可 cancel；in_review 可 return 到 draft 新 revision。open 才能建立 Candidate。

Candidate：`applied --candidate.screen--> screened --candidate.schedule_interview--> interviewing --candidate.recommend--> recommended`；`recommended --offer.submit--> offer_review --offer.approve--> offer_approved --offer.record_acceptance--> accepted --candidate.handoff--> handed_off`。applied／screened／interviewing／recommended 可 reject 或 record_withdrawal；offer_review 可 return 到 recommended 或 reject；offer_approved 可 record_decline；accepted 可 cancel_handoff 到 withdrawn 且需理由。hired 不是手動旗標；handed_off 建立 Employment draft，成功完成到職後才顯示 hired projection。不得自動寄通知或刊登真職缺。

Employment：`draft --employment.submit_onboarding--> onboarding_review --employment.approve_onboarding--> ready --employment.activate--> active`。activate 在核准到職時間由明確操作或經另行授權的排程執行，時間未到拒絕；要有 AssignmentVersion、CompensationVersion、PolicyProfile 與 coverage applicability。onboarding_review 可 return 到 draft 或 reject 到 cancelled。Employee login invite 與 activate 分開，不自動建立外部帳號。

EmploymentChange：`draft --employmentChange.submit--> in_review --employmentChange.approve--> approved --employmentChange.apply--> applied`。apply 僅於 effective_at 已到且 source versions 未變時，在一個交易內結束舊有效期間、建立新 Assignment／Compensation／Employment 狀態版本；更新有衝突則保留 approved 並返回 version_conflict。in_review 可 return 到 draft、reject 到 rejected；draft／approved 未 apply 前可 cancel 並留理由。

leave_of_absence apply 使 Employment active→on_leave；return apply 使 on_leave→active。transfer／promotion／compensation apply 不改 active，而增加版本。不得把 on_leave 一律視為所有社會保險停止，CoverageVersion 另走資格覆核。

離職以 termination change 處理：active／on_leave 送出後只標示有待辦的離職案，不提前改離職狀態；approved＋生效日到 `employmentChange.apply` 才使 Employment→terminated，停止之後排班及業務權限，產生未休／補休／最終薪資待辦。Employee 保留歷史；證明、退保／停繳或資遣事項是獨立 checklist，不能把 checklist 打勾稱為政府已受理。最終薪資不可等刪除員工才計算。

### 5.3 班表與換班

RosterRevision：`draft --roster.validate--> checked --roster.submit--> in_review --roster.approve--> approved --roster.publish--> published`。validate 只產生檢核快照；硬性衝突或政策 unknown 不能 checked。draft／checked 修改後回 draft，新 digest；in_review 可 return 到 draft 或 reject 到 cancelled。publish 原子建立 ShiftInstance、凍結政策及班別 snapshot，保留發布者、時間與接收範圍。

published 不可直接修改。訂正用 `roster.revise` 建立 draft revision，核定發布後一次 supersede 被替代班次；已發生實際出勤的班次，訂正班表不能改寫 AttendanceEvent。取消已發布未來班次用 revise 的 cancellation entries，不直接 delete。需要通知時先交給 connectors 待辦，本規格不發送外部訊息。

ShiftSwap：`requested --swap.record_consents--> consented --swap.submit--> in_review --swap.approve--> approved --swap.apply--> applied`。consent 要涵蓋被替換者／接班者；apply 必須重新驗證目前 assignment、衝突、休息與政策，建立及發布新 roster revision。requested／consented 可 withdraw；in_review 可 reject；approved 未 apply 可 cancel。接班者同意也不能取代審核或工時驗證。

### 5.4 實際出勤、請假與加班

AttendanceEvent 只有 accepted 原始事件或 rejected receipt，沒有「核准打卡」來覆寫原始時間。AttendanceDayVersion：`open --attendance.derive--> proposed --attendance.submit--> in_review --attendance.approve--> approved`；missing_event、overlap、unknown_day_type、break_unconfirmed 等 exception 必須先補證據或開 dispute。in_review 可 return 到 proposed 新 revision；approved 修正需 AttendanceAdjustment 重走 review，舊版 superseded。

AttendanceAdjustment：`draft --adjustment.submit--> in_review --adjustment.approve--> approved --adjustment.apply--> applied`，apply 產生新的 AttendanceDayVersion，不動原始事件。本人提出修正由別人核定。in_review 可 return 到 draft 或 reject；draft 可 cancel。已關帳者只能先獲批准重開，或建立明確列入下一期的追補案。

LeaveRequest：`draft --leave.submit--> requested`；有可用餘額的假別才 reserve，病假等資格／證據審核不能用「尚未產生 grant」自動駁回。一般假別 `requested --leave.approve--> approved --leave.apply--> applied`，apply 寫入 leave ledger consumption 與新的 AttendanceDayVersion；已核定的日紀錄須依 adjustment 流程重新核定。requested 由 return 回 draft、reject 到 rejected、withdraw 到 withdrawn，三者均釋放 reserve。approved 未 apply 可 cancel 到 cancelled，由原核准範圍重新確認；applied 更正用 reversal ledger＋新申請，保留原紀錄。假額同時保存法定日數與換算分鐘基準，部分日及部分工時的換算政策待核對，不能一律把 1 日當 8 小時。法定假別與特休的合法權利不由主管任意拒絕，特休衝突先走協商調整，原期日、理由及員工同意保留，未決案件列 dispute。

OvertimeRequest：`draft --overtime.submit--> requested --overtime.authorize--> authorized`，requested 可 reject／withdraw。authorized 表示排定或准許，不表示已工作。實際出勤核定後 `overtime.link_actual` 建立 OvertimeActual（confirmed／disputed），只取實際分鐘；超過申請的時間建立差異待辦。沒有 authorized 的實際加班也保留 proposed／disputed 案，由核定者確認事實與給付依據，不能清零。

CompTime 選擇案：`draft --compTime.record_employee_choice--> employee_chosen --compTime.record_employer_consent--> agreed --compTime.grant--> granted`，grant 只在 confirmed OvertimeActual 後建 ledger。granted 用 approved leave 消耗；期限／離職的未用額 `compTime.queue_payout`→payout_pending，薪資核定後 `compTime.link_payroll`→payout_recorded。到期不自動歸零，不自動用當期新時薪取代原工作日基準。

AttendancePeriod：`open --attendancePeriod.submit_close--> in_review --attendancePeriod.approve_close--> approved --attendancePeriod.lock--> locked`。每個員工的實際日版本須 approved，所有爭議分鐘須有處理記錄與追補方案。in_review 可 return 到 open。locked 重開用 `attendancePeriod.request_reopen` 建 ReviewCase；批准後 `attendancePeriod.reopen`→open 新 revision，依賴的薪資 draft 標 stale，approved／released run 只開 adjustment，不原地修改。

### 5.5 薪資與成本

PayrollRun：`draft --payroll.snapshot--> ready --payroll.preview--> previewed --payroll.submit--> in_review --payroll.approve--> approved --payroll.release_simulated--> released`。

- snapshot 必須引用 locked AttendancePeriod、當時有效的 employment／compensation／coverage／policy 版本及已核准的加扣項；不能以 published roster、時程預估或未核定的打卡推導最終應付。
- preview 只製作 SIM 薪資明細及校驗報告，這個規格沒有執行計算程式。未核對的級距、工資性質或 proration 使結果 blocked；必須先補齊版本。
- 任何來源 digest 改變都使 ready／previewed／in_review 失效為 stale；`payroll.refresh_snapshot` 建新 run revision 回 ready，舊審核失效。approved／released 不可 refresh。
- in_review 可 `payroll.return`→draft 新 revision 或 `payroll.reject`→cancelled。draft／ready／previewed 可 cancel。approved 發現錯誤用 `payroll.void_before_release`→voided；released 改錯另建 adjustment run，引用原單與差額來源。
- release_simulated 只發布個別 SIM Payslip 與 WorkplaceCostAllocation，顯示「模擬薪資，未付款」。沒有 paid／bank_sent／filed 狀態。員工 `payslip.acknowledge` 只記已閱，不等於接受正確或拋棄爭議權。
- `payroll.prepare_treasury_handoff`、`payroll.prepare_accounting_handoff` 只在 released 後生成唯讀、版本綁定的模擬待辦。未來 treasury／accounting 各自核定；本 command 不動 wallets、ledger、製造存貨、銀行或政府網站。

同一員工不同支付制度、期中到職／離職／調薪要拆分適用區間；月薪 proration、加班平日每小時工資額、特休／補休結算各有基準，不能一律用月薪除以排班時數。每項計算顯示 policy version、基數、數量、率、捨入及來源。

## 6. 排班、出勤與給薪的業務邊界

排班畫面同時顯示人力缺口與衝突，不會為補滿人數默默調整休假或延長工時。檢核按 employee＋employer 跨店累計；同一員工的相鄰班次、跨月班、跨店支援與休息日工作均要一起看。店長只能見授權範圍的班表，但伺服器檢查完整可用資料，再用「其他據點已有班次」回報衝突，避免洩露其他店詳細紀錄。

跨夜班例如台灣當地 2026-10-05 22:00 至 2026-10-06 06:00，保留單一 ShiftInstance 與完整 UTC 範圍。核定出勤另存 civil_date_segments 以便每日紀錄、跨月結算及假日切點；work_day_key 與 overtime boundary 由經核定政策決定，不能只因午夜把一班變成兩班、重置連續工作／休息檢查或重複發薪。實際休息需確認是否確實解除工作義務，不能看有排午休就從打卡時間自動扣除。

出勤形成三份明確資料：排定 roster、不可變的原始 attendance events、核定 actual attendance。薪資只消費後者加上核准的假別與給薪分類。缺卡不等於缺勤；提早打卡不必然等於已工作；加班申請未過不等於確定沒有工作。畫面保留異常與爭議分鐘，交由有權責者核定事實，不用演算法直接懲罰。

時薪按核定實際應給薪分鐘及有效時薪版本形成 earning，休假／休息日等給付另依政策。月薪以有效月薪方案為基礎，不能依班表不足任意扣薪；到職、離職、調薪及無薪假分別使用 proration／leave 規則。加扣項需各有來源與理由，拒絕無來源的「其他扣款」。雇主負擔費用單列成本；員工自提、員工應負擔保費與其他依法或約定的扣項要有對應政策，不能把雇主負擔併入實領扣款。

SIM 示範可用虛構時薪 200 SIM、核定普通應給薪 300 分鐘，展示普通 earning 1,000 SIM，再分列假別或其他組件。這只是算式教學；不把 200 SIM 與台灣正式最低時薪比較，不暗示它是合法 TWD 薪資。

特殊工時、責任制、外國人、未成年人、派遣、承攬、跨境、舊制退休金或多雇主正式制度先標 applicability_pending。不能勾選「主管」就解除勞基法規則；詳細資格及計算規則須另立查核過的 policy pack，未覆蓋的路徑不標 ready。

## 7. 權限、本人利益衝突與單人小店

以下角色及權限都是 Phase 0 之後的規劃。owner 可兼任 hr_clerk、scheduler 或 payroll_preparer；同一 user_id 仍視為同一人，切換角色或不同 membership 不增加覆核獨立性。

| 角色 | 可讀／可做 | 不隨角色自動取得的權限 |
| --- | --- | --- |
| tenant_admin | 邀請、停用成員、配置 scope、查看存取稽核摘要 | 不自動讀任何員工薪資或健康證據；不能幫自己授權後追溯批准本人案件。 |
| owner／enterprise_manager | 組織、政策申請與範圍內的人力成本彙總 | 本人利益案件需迴避；彙總小樣本要遮罩，不藉彙總推知個別薪資。 |
| hr_clerk | 虛構員工、僱用變更草稿、到離職 checklist | 不能核准自己製作的敏感異動或自己的調薪；不必能見全部薪資單。 |
| hr_reviewer | 授權法人內的異動及政策覆核 | 不自動有 payroll approve 或 treasury 權限。 |
| scheduler／site_manager | 授權據點的人力需求、班表與換班審核 | 無全公司薪資；不得核准本人換班、本人出勤修正／加班／請假。 |
| attendance_reviewer | 授權員工的出勤、假別與爭議事實核定 | 不因 attendance 權限能修改月薪或扣項。 |
| payroll_preparer | 指定法人薪資草稿與明細、成本分攤 | 不能核准自己的薪資製作結果或發起付款。 |
| payroll_checker | 指定批次與個別明細覆核、退回 | 核定包含本人行時須把本人部分分交另一合格 checker；不能自審。 |
| employee | 本人班表、出勤、假別權利、申請、自己已發布薪資單 | 不能見其他員工單據、全 workspace export 或替自己批准修正。 |
| auditor／external_reviewer | 經核准、限期間／法人／案件的唯讀資料與覆核 | 不因「外部」取得全租戶權限；不能拿共用 owner session 核准。 |

敏感動作至少要求 maker_user_id ≠ checker_user_id，checker 不屬 affected employee，且 source digest 不變。各核定面向分開 grant；HR 核定不能順帶薪資核定，薪資核定也不能順帶付款授權。本人跨店任職、兼任主管與另開 membership 一樣要迴避。

小店 `governance_mode=single_operator` 是顯式例外模式：允許一人製作草稿、輸入虛構出勤及查看自己的模擬預覽。畫面固定顯示「未完成第二人審核」，review status 用 `prepared_unreviewed`，`independent_review=false`，不能冒用 approved、maker-checker passed 或 released。

單人模式可建立 `owner_attestation`（責任聲明、原因、處理範圍、外部覆核待辦及到期日），不生成第二位 reviewer。只允許下載帶「未覆核模擬草稿」水印的預覽，不能解鎖正式核定、本人調薪自審或替本人薪資確認。外部覆核者未完成個人登入、scope 授權與實際決定前，狀態維持未覆核。

將來若要讓某些低風險非本人案件適用單人例外，須另核定具體 exception policy，使用可辨識的 `approved_with_exception` 狀態與責任記錄，不計入雙人核定率。本文未設置這條生效路徑；企業正式 payroll、付款與政府申報仍須各自實作與授權。

## 8. 保存、薪資私密資料與未來串接

公開 SIM 保持匿名、虛構資料與短期自動清除。即使畫面有 employee_code，也不收真人識別、銀行帳號、正式薪資單或病假證明；沒有團隊登入時，不在公開工作區演示真人員工自助。

未來私有版應有下列保存及存取規格：

- record_class 分 employee_card、attendance、payroll_register、pension_roster、policy_evidence、candidate、audit_access。正式法定類別依第 2 節來源建立 RetentionRule；候選人及非必要附件採用目的、必要性與核定期限，不預設永久保留。
- 薪資清冊及出勤至少滿足法定五年要求；員工名卡及勞退相關名冊保留至離職後五年，起算事件不同。爭議／稽核 hold 會暫停刪除；不得一個「刪除員工」動作把關聯記錄全部清掉。[工資清冊：第 23 條](https://laws.mol.gov.tw/FLAW/FLAWDOC01.aspx?id=FL014930&flno=23)、[出勤：第 30 條](https://laws.mol.gov.tw/FLAW/FLAWDOC01.aspx?id=FL014930&flno=30)、[名卡：第 7 條](https://laws.mol.gov.tw/FLAW/FLAWDOC01.aspx?id=FL014930&flno=7)、[勞退名冊：第 21 條](https://www.bli.gov.tw/0008222.htm)（查核：2026-10-05）。
- 禁止薪資進 public view、全工作區 JSON、操作收據、廣義事件日誌、通知正文、分析明細或 CDN cache。Payroll 私有端點須驗證 tenant＋user＋employee binding；PrivateExport 另有權限、原因、範圍、期限與下載稽核，不能靠猜 slip id 取得。
- 記錄 read／export／change／approve，不記完整薪資 payload 或敏感附件內文；備份、索引、下載暫存及復原副本也要納入刪除／hold。長期保存需可驗證加密、權限和復原演練。
- 停權員工不可再讀新的公司資料；本人歷史出勤副本與薪資交付另走核實本人及限範圍交付流程，不以廣泛恢復企業角色處理。

PrivateExport 的 employee_self 路徑為 `requested --export.verify_self--> ready --export.download--> downloaded`，核實本人與範圍後即可交付自己的紀錄，不強加主管核准。bulk_company 路徑為 `requested --export.submit--> in_review --export.approve--> approved --export.prepare--> ready`；in_review 可 reject 到 rejected，ready 超時由 expire 到 expired，下載也要再驗權限。任一路徑撤回為 cancelled，download token 單次或限定次數與期限，不能取得全租戶薪資。

RetentionHold 為 `draft --retentionHold.submit--> requested --retentionHold.approve--> active`，requested 可 reject 到 rejected；`active --retentionHold.request_release--> release_review --retentionHold.approve_release--> released`。逾期不自動解除爭議 hold；release_review 退回 active。刪除計畫須再次檢查 active／release_review hold、期限、關聯及備份範圍，核准計畫與實際刪除回執分存。

串接是未來 integration gate：先有私有資料架構與正式營運授權，再有法規政策覆核、服務商契約／資格、憑證保管、最小權限、測試環境、maker-checker、冪等、回執驗證、失敗／重送處理及保留策略。政府加退保、健保調整、稅務、銀行付款、履歷平台、打卡設備或通知外送都未取得本次呼叫權限，也未實作。準備匯出資料不是已送件；服務接受請求不是已核准或已入帳。

## 9. 依頁面列出主要按鈕

所有頁面右上角顯示「規劃中／SIM」。未完成身分架構的 prototype 只能展示靜態示意；不得把按鈕畫成已成功核定真人資料。以下頁面路径為規劃路由。

| 頁面 | 主要按鈕 | 用途、前置條件及可見結果 |
| --- | --- | --- |
| /enterprise | 新增法人 | 建 draft 法人與政策範圍，使用虛構名稱；不做公司登記。 |
| /enterprise/sites | 新增分店／工廠 | 建 Site、timezone 及工作區；scope 必須在同 tenant／法人。 |
| /enterprise/organization | 新增部門／職位 | 建組織節點或職位定義，阻擋循環及重複代號。 |
| /enterprise/cost-centers | 新增成本中心；停用 | 建有效期間；停用只阻止新引用，有未結資料顯示交接待辦。 |
| /enterprise/policies | 建立新版本 | 複製政策為 draft，保留來源、修訂／查核及生效日，舊版不改。 |
| /enterprise/policies/:id | 送審；發布 | 送審綁 digest；發布需核定、區間不重疊、適用證據完整。 |
| /recruitment | 新增職缺需求；送審 | 建人力及預算需求，核定後才可 open。 |
| /recruitment/:id | 新增候選人；記錄甄選 | 使用 SIM 代號，記 stage 與評核；不匯入履歷或寄信。 |
| /recruitment/candidates/:id | 建立錄用草稿；交接到職 | 核定錄用及記錄接受後建立 Employment draft；不直接 active。 |
| /hr/employees | 新增員工；開始到職 | 建代號、僱用與有效 assignment／給薪／政策草稿。 |
| /hr/employees/:id | 申請異動；申請留停／復職 | 建 EmploymentChange、展示前後差異及生效日，尚未 apply 不改現況。 |
| /hr/employees/:id | 申請離職 | 建 termination 案及 checklist，保留年資、假額與最終薪資待辦。 |
| /hr/changes/:id | 送審；核准／退回；套用 | 分開 maker 與 checker；核准不提前生效，套用須版本及時間條件。 |
| /scheduling/shift-types | 新增班別版本 | 填跨夜、休息及輪班群組；不重寫已發布班次。 |
| /scheduling/rosters | 建立班表；複製前期 | 只建立 draft，重新檢查本期資格、假日與 assignment。 |
| /scheduling/rosters/:id | 檢查衝突 | 展示重疊、休息、一般工時、政策缺漏及人力缺口，列出關聯班次。 |
| /scheduling/rosters/:id | 送審；發布；建立訂正版 | 發布需要核定 snapshot；訂正必須新 revision，不能改 actual。 |
| /scheduling/swaps | 申請換班；記錄同意 | 收雙方同意及新班次，重驗跨店衝突；同意尚未代替審核。 |
| /attendance | 模擬打卡；查看原始紀錄 | 新增 synthetic AttendanceEvent，原事件只能讀取。 |
| /attendance/exceptions | 申請修正；補充證據 | 建 adjustment 及原因；缺卡、加班差異與休息未確認各有待辦。 |
| /attendance/day/:id | 核定實際出勤；退回 | 綁定完整區間、證據及版本，禁止本人核定與無理由清除分鐘。 |
| /attendance/periods/:id | 送出關帳；鎖定；申請重開 | 凍結 approved actual；重開經另一審核案，標示依賴薪資受影響。 |
| /leave | 申請請假；提出特休協商 | 留假別、區間與餘額來源；特休由員工排定，調整記雙方協商。 |
| /leave/balances | 查看明細；建立遞延／結算草稿 | 查 grant／use／carry／payout，不能直接修改餘額。 |
| /overtime | 申請加班；核對實際；選擇補休 | 分開 requested／authorized／actual／補休選擇與雇主同意。 |
| /payroll/components | 新增組件版本 | 設定加項、員工扣項或雇主成本；註明基準、捨入、工資性質及有效期間。 |
| /payroll/compensation | 申請調薪 | 建 CompensationVersion 草稿及 change，本人不能核定。 |
| /payroll/coverage | 檢查制度適用；建立調整草稿 | 分開勞保、就保、職災、勞退及健保；unknown 擋核定，不發送申報。 |
| /payroll/runs | 建立批次；擷取核定資料 | 用 locked actual 與有效給薪版本形成 snapshot；不能抓 roster 充數。 |
| /payroll/runs/:id | 模擬試算；查看差異 | 展示每個 component 的來源、基數、率、額與雇主成本；stale 必須重建。 |
| /payroll/runs/:id | 送審；核准／退回 | 異動使舊審核失效；核准本人行需其他 checker。 |
| /payroll/runs/:id | 發布模擬薪資單 | 只產本人可見 SIM 單及成本資料，不稱已發薪、不扣 wallet。 |
| /payroll/runs/:id | 建立財務交接待辦；建立差額批次 | 分開 treasury／accounting 待辦；更正 released 時新增 adjustment。 |
| /me/payslips | 查看本人明細；下載本人單；提出異議 | 私有端點逐筆驗證本人；已閱不會關閉爭議或批准薪資。 |
| /me/attendance | 下載本人出勤副本 | 範圍含原始與核定來源，交付須驗證本人；不導出同事資料。 |
| /enterprise/governance | 設定單人模式；建立責任聲明 | 顯示 prepared_unreviewed，建立外部覆核待辦，不製造假審核人。 |
| /enterprise/retention | 檢視期限；申請 hold；審核刪除計畫 | 分 record_class 與起算事件，有 hold 或未滿期限不得執行刪除。 |

## 10. 可驗收業務案例

這些是後續實作驗收，不代表本次已執行功能測試。每案均應同時驗 API 回應、前端結果與稽核／保存資料。

| 編號 | Given／When | 必須看見的結果 |
| --- | --- | --- |
| WF-01 | 同 tenant 開兩店，同法人員工跨店支援 | Employee 不複製、年資不重置；班次及成本指向各店，工時合併檢查。 |
| WF-02 | tenant A 的 payroll endpoint 改帶 tenant B 或猜對 slip id | 伺服器拒絕且不回薪資、姓名、存在性差異或全 workspace。 |
| WF-03 | owner 兼 hr_clerk，再切 hr_reviewer 審自己的調薪 | self_approval 拒絕；user principal 相同不因角色不同放行。 |
| WF-04 | 同 maker 建另一 membership 來批出勤修正 | maker_checker_conflict 拒絕；案維持 pending，留下拒絕稽核。 |
| WF-05 | 一人店沒有第二 reviewer，製作 payroll preview | 顯示 prepared_unreviewed 與水印；無 approved／released，不可假稱雙人覆核。 |
| WF-06 | 已發布班表想改同班次起訖時間 | 直接 update 拒絕；只能新 revision，原班次與發布證據仍可查。 |
| WF-07 | 同員工 09:00–17:00 在甲店，16:00–20:00 在乙店 | 跨店重疊被阻擋；店長只收到必要衝突摘要，不取得乙店完整私人資料。 |
| WF-08 | 22:00–翌日 06:00 的班跨日／跨月 | 一班保存完整範圍，civil_date 分段；不重置連續工作、不漏分鐘、不雙計薪。 |
| WF-09 | 輪班換班僅間隔 9 小時且沒有公告例外證據 | 一般 policy 阻擋發布；「員工同意」不能單獨解鎖例外。 |
| WF-10 | 固定班兩次出勤間隔不足企業安全規則 | 顯示企業安全規則結果；不誤稱每次都違反第 34 條輪班換班規定。 |
| WF-11 | 班表有休息，但實際仍在工作，沒有休息確認 | 不固定扣午休；建立 break_unconfirmed，完成事實核定前不能關帳。 |
| WF-12 | 沒有加班申請，但原始下班與證據有延長工作 | 保留實際及爭議分鐘，開給付核對案；不能直接把該時間設零。 |
| WF-13 | 加班核准 120 分鐘，actual 核定 75 分鐘 | Payroll ordinary overtime source 只用核定 75 分鐘；差異有來源，不從申請額發薪。 |
| WF-14 | 特休由員工排定，店長要求換日 | 保留原期日、急迫需求理由及協商；未取得協商不得直接改成主管日期。 |
| WF-15 | 年度未休特休／補休到期，或契約終止尚有餘額 | 建 payout_pending，使用相應原基準及政策；不得歸零或無條件遞延。 |
| WF-16 | 月中調薪，當月兩個薪資版本相接 | 依有效日拆分，舊期間沿用舊方案；禁止重疊、缺口或改寫上一期單據。 |
| WF-17 | 計時人員缺卡，班表排了整日 | 不以班表代 actual，不當缺勤直接扣款；例外處理後才可鎖定。 |
| WF-18 | 月薪員工某月排班少，沒有核定無薪假 | 不因 roster 少就自動按小時計扣月薪；適用版本明列與差異待辦可查。 |
| WF-19 | 員工請受保障假別／普通傷病假，系統有全勤組件 | 使用請假日當時的生效版本，禁止「任一請假扣全勤」泛用公式；新規不重算舊期。 |
| WF-20 | 小店未滿 5 人或員工為部分工時 | Coverage 各制度資格分開；不能一鍵關掉全部，unknown 阻核定。 |
| WF-21 | 把雇主勞退成本輸入 employee_deduction | 類型與政策檢查拒絕；雇主成本不減實領，員工自提另列。 |
| WF-22 | payroll 已 in_review，出勤重開造成 source digest 改變 | run 變 stale；原 approval 不能繼續，重建後重新送審。 |
| WF-23 | released 薪資單發現漏項 | 原單不改；adjustment 帶原 id、差額來源及新核定，兩單都能追溯。 |
| WF-24 | Payroll 預覽包含 checker 本人薪資 | 本人部分分交其他 checker；不得由一人整批核定所有本人行。 |
| WF-25 | 成本分攤及捨入後產生差額 | 各成本中心 amount_minor 合計等於原 earning／employer_cost；差額歸屬可追溯。 |
| WF-26 | employee 請自己的薪資單與出勤副本 | 取得自己資料；不能藉通用 export、收據或 history 讀其他員工明細。 |
| WF-27 | 想停用仍被 future roster／未結 payroll 引用的據點 | 阻擋或要求先完成交接；不硬刪、不變更歷史歸屬。 |
| WF-28 | 想刪 terminated 員工或有 hold 的薪資紀錄 | 未滿保存期限或 hold 時拒絕；刪除計畫含備份／暫存／索引，不只主表。 |
| WF-29 | Public SIM 匯入帶身分證、銀行帳號或真人履歷欄位 | 私密欄位 allowlist 拒絕；不能用自由 notes 當繞過正式資料邊界的渠道。 |
| WF-30 | 同一冪等鍵重送同內容與異內容 | 同內容返回同結果、不同內容拒絕；不產雙班次、雙假額或雙薪資單。 |
| WF-31 | Candidate 錄用通過後點交接 | 只產到職 draft；核定、到職時間、assignment／給薪／coverage 完成才 active。 |
| WF-32 | 點發布模擬薪資單及財務交接 | 只有私有 SIM 文件與版本化待辦；wallet、ledger、銀行及政府均無寫入。 |
| WF-33 | 把 200 SIM 時薪拿去跑台灣 TWD 最低工資檢查 | 回 currency_scope_mismatch／reference_only，不能顯示合規。 |

## 11. 開發順序與交付門檻

1. Phase 0：identity／membership／tenant DO 路由／RBAC／私有讀取與 export，先驗跨租戶拒絕及本人隔離。
2. Phase 1：enterprise、HR 有效版本、recruitment 基本候選人／錄用到到職交接，以及共用 approvals／documents，先驗同雇主跨店、到職／異動／離職、本人迴避與候選人資料範圍。
3. Phase 2：scheduling、attendance、leave／overtime 及 locked actual，先完成跨夜、休息、假額與爭議保留。
4. Phase 3：payroll SIM snapshot、預覽、不同人覆核、薪資單及成本交接，先驗版本失效、金額守恆及單人模式。
5. Phase 4：依核定薪資快照交接會計、資金、採購、資產及營運報表；招募進階分析可在此擴充，但基本招募與到職交接已排在 Phase 1。私有留存政策是 Phase 0 的共用前置條件，不留到後期才建立。
6. Phase 5：薪資扣繳及稅務／憑證資料交接，依財務與稅務文件驗收。
7. Phase 6：正式制度政策包與外部 connectors 另立具體授權、專業覆核及驗收，沒有本次呼叫權。

文件驗證只需確認現況對照、名詞與版本一致、來源可追溯及案例足以落地。本次未跑排班、未試算真人薪資、未辦理保險申報、未付款，亦未修改現有 runtime。
