---
name: data-assessment
description: 深度診斷開放資料集（如 TDX, OSM, 政府 API），偵測 Foreign Key 斷鏈、空間佈局異常與測站真實延遲，避免開發者採用具有幽靈實體的高風險資料而導致視覺化災難。
version: 2026.04.27
metadata: {"author":"Antigravity","language":"zh-TW","category":"ops","short-description":"執行資料完整性深度檢測工作流(Data Integrity Profiling)"}
---

# Data Assessment (Integrity Profiler)

協助專案進行深度的「資料完整性檢測」，避免在黑客松中選到充滿斷鏈（孤兒節點）、座標飛至海外、或大量沉默延遲發報的 API，確保資料能順利支援嚴苛的動態路徑演算與時間倒數劇本。

## Single responsibility

- Primary job: 執行資料的實體關聯偵測 (Orphan Ratio)、拓樸防呆 (Spatial Drift)、以及新鮮度檢測 (Temporal Staleness)。
- Not this skill's job: 單純的改寫 HTML/CSS 版面或介面 UI 開發。
- Split / handoff rule: 如果資料已經確認無礙並需要開始寫前端 Vue / React 組件，請回到前端專屬工作流 (交由 `grill-me` 進行圖表決策，再交由 `component-quick-validator` 實作)。

<role>
首席資料架構驗證官，用最具破壞性與批判性的角度挑出 API 隱藏的關聯性危機。
</role>

<decision_boundary>
Use when:
- 想要使用關聯性高的資料集（如：TDX 的「即時公車動態」需搭配「靜態站牌」表）。
- 剛拿到一包政府 API，想知道它能不能準確投射到地圖上，或者想知道感測器有沒有壞掉。
- 需要評估該資料集適不適合拿來做「倒數計時」或「即時路徑計算」決策。

Do not use when:
- 開發純靜態展示型的文案頁面，且不涉及地理空間交集。

Inputs:
- 靜態標的 API (Static URL) 與 動態標的 API (Dynamic URL)。
- 使用的 ID、經緯度、時間欄位名稱。

Successful output:
- **孤兒率 (Orphan Rate)** 分析。
- **異常空間偏移點** 比例。
- **沉默延遲 (Staleness)** 的殭屍測站分析。
- **DE 清洗需求單 (Data Cleaning Ticket)** (若驗證失敗)。
- **預期標準 Mock Schema** (若驗證失敗，供後方驗證器使用)。
</decision_boundary>

## 文件輸出契約（2026-05-01）

- 可直接指導賽中重建的資料決策，才寫入 `docs/3-Tracks/competition-mvp/contracts/de_dataset_manifest.yaml`、`docs/3-Tracks/competition-mvp/contracts/db_schema_plan.sql` 或 `docs/3-Tracks/competition-mvp/role-specs/de.md`。
- profiler output、curl sample、raw JSON/CSV 摘要、Mock Schema、失敗證據寫入 `docs/Archive/2026-hackathon-prep/validation-reports/`。
- 不得把新的 active assessment report 寫到 `docs/3-Tracks/prep_compoment/` 或 `docs/hackathon/`。
- 若 output 同時包含 spec 與 evidence，先拆成 active contract 與 archive evidence 兩份，不要混在同一份文件。

## Primary use cases

1) **空間與時效壓力測試**
- Trigger examples: "幫我壓測 YouBike API 的座標跟時間", "用 data_profiler 檢查這包資料"
- Required inputs: API 連結與對應的緯度、經度、時間欄位。
- Expected result: 偵測出是否有飛離台灣的點位，與延遲超過 30 分鐘以上的測站點位數量。

2) **關聯式主外鍵 (Join) 壓測**
- Trigger examples: "幫我檢查 TDX 這兩包靜態跟動態的資料 Orphan Rate"
- Required inputs: 靜、動態 API 網址，以及綁定的 Key。
- Expected result: 吐出「幽靈資料（動態有資料但靜態沒建檔）」的百分比，超過 5% 發出紅色警告不建議用。

## Communication notes

- User vocabulary: Orphan Rate (孤兒率)、FK Mapping (主外鍵關聯)、Spatial Drift (座標飄移)。
- Avoid jargon: 直接說「這份資料有 X 筆車輛在站牌表裡找不到」，不要只給純理論定義。
- Least-surprise rule: 以最壞情況（墨菲定律）來審查資料，不要對政府開放資料抱持「一定都是活的/準的」幻想。

## Host / portability targets

- Primary host(s): Antigravity / Claude Code
- 工具相依性: 強烈依賴位於 `docs/2-Data-Strategy/Strategic-Assessment/data_profiler.py` 的壓測腳本。

<workflow>
Step 0: 確認測項 (Validation Scope)
- Action: 確認待檢測的 API 是否牽涉「關聯性」、「空間」、「時間」三個維度。如果是關聯性，請要求使用者提供靜態(Static)母表 API。
- Input: API 網址與目標。

Step 1: 執行自動化壓測 (Data Profiling Execution)
- Action: 嘗試使用內部指令呼叫 `data_profiler.py`。
  - 若測時間：`python docs/2-Data-Strategy/Strategic-Assessment/data_profiler.py time-drift <網址> --time <欄位>`
  - 若測空間：`python docs/2-Data-Strategy/Strategic-Assessment/data_profiler.py boundary <網址> --lat <欄位> --lon <欄位>`
  - 若測關聯：`python docs/2-Data-Strategy/Strategic-Assessment/data_profiler.py join <動網址> <靜網址> --key <欄位>`
  - (若腳本不可用，請以 curl 等指令手動抓取樣本並分析)。

Step 2: 致命弱點判讀 (Vulnerability Analysis)
- Action: 依據腳本或手動分析回傳的：(1) Orphan Rate > 5% (2) Space Drifting > 1% (3) Time Staleness > 10% 逕行嚴格封殺與否決。

Step 3: 逆向交接與 Mock Schema 生成 (Handoff to DE & Mock)
- Action: 若發現高風險致命傷（如 TWD97 需轉碼、無座標需 Group By），必須強制產出：
  1. 給 Data Engineer (DE) 的 **Data Cleaning Ticket**：若可作正式重建依據，寫入 `docs/3-Tracks/competition-mvp/role-specs/de.md` 或 `contracts/de_dataset_manifest.yaml`。
  2. 供 `/component-quick-validator` 預先開發用的 **Mock JSON Schema**：寫入 `docs/Archive/2026-hackathon-prep/validation-reports/`，不得放進 active docs。
</workflow>

<output_contract>
Return exactly these sections:
1. **🔗 實體關聯健康度 (FK Integrity)**: 點出孤兒率，判斷是否有幽靈車。
2. **🗺️ 空間拓樸精確度 (Spatial Topology)**: 點出偏離預定矩陣的點位。
3. **⏱️ 時間沉默率 (Temporal Health)**: 點出死掉的殭屍測站比例。
4. **🎫 DE 清洗需求單 (Data Cleaning Ticket)**: 若有失敗項目，條列明確的清洗需求 (例如 TWD97 -> WGS84，或依 Address Group By)。
5. **📄 預期標準 Mock Schema**: 依據清洗需求，推導出未來正確的 JSON 資料結構範例，供前端直接 Mock 開發。
</output_contract>

<tool_rules>
- 優先使用 `docs/2-Data-Strategy/Strategic-Assessment/data_profiler.py`。若腳本不在，請改用 `curl` 抓取樣本進行判斷。
</tool_rules>

<default_follow_through_policy>
- Directly do: 直接呼叫腳本或 `curl` 執行壓測。
</default_follow_through_policy>
