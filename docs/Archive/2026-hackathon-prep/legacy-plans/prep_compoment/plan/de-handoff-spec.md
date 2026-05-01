# 黑客松至 DE 交接規範 (Hackathon to DE Handoff Spec)

## 1. 背景 (Context)

本文件是針對黑客松軌道的 DE 交接規範。其目的是將目前的黑客松產出轉化為 DE 可直接執行的實作合約，避免 DE 需要從 HTML 原型、驗證報告或 Linear 任務內容中逆向工程邏輯。

本規範涵蓋以下內容的設計意圖：

- `ROG-5` 資料集註冊表 (dataset registry)
- `ROG-6` 快速驗證器至 DE 分流 (quick-validator to DE triage)
- `ROG-7` 組件 8 (Component 8) 就緒資料合約 (ready-data contract)
- `ROG-13` 組件 8 / 9 的後端消費合約 (BE consume contract)
- `ROG-14` 組件 7 / 10 的情境與邏輯資料集合約 (scenario / logical dataset contract)

此階段刻意採用「合約優先」模式：

- `component-quick-validator` 發現來源真實情況 (source truth)
- 資料集註冊表穩定來源真實情況
- 分流產出將來源真實情況操作化
- 組件 8 成為第一個具備 DE 就緒管道的合約

此階段**不設計**具體的 Airflow DAG、遷移或後端重構。

## 2. 現有證明 (Existing Evidence)

交接基礎是建立在現有的儲存庫資產上，而非新的假設。

### 目前資產

- `docs/2-Data-Strategy/Technical-Mapping.md`
  - 目前已驗證的黑客松資料來源單一來源映射表
- `docs/3-Tracks/prep_compoment/review/validation-results.md`
  - 來源可達性與備援方案影響的標準化摘要
- `docs/3-Tracks/prep_compoment/execute/validation-reports/component-8-quickval.md`
  - 目前最強而有力的證明，顯示組件 8 可以從驗證轉向 DE 合約
- `.agents/skills/component-quick-validator/SKILL.md`
  - 目前的上游驗證器工作流
- `Taipei-City-Dashboard-DE/dags/operators/common_pipeline.py`
  - 現有的 DE 管道骨架與資料集元數據慣例

### 最新驗證的儲存庫狀態

- `prep_compoment` 已使用 `plan / execute / review / ship` 結構
- `ship/` 下包含 10 個 `validate-component-*.html` 產出物
- `execute/validation-reports/` 下包含 8 個快速驗證報告
- `Taipei-City-Dashboard-DE/dags/proj_city_dashboard/` 已包含成熟的專案 DAG 集
- `BE/app/services/ai/tools/hackathon.go` 已註冊 `analyze_shelter_gap`，但處理器目前回傳寫死的文字

### 這代表什麼

缺少的並非原始的 DE 基礎設施，而是以下環節之間的交接層：

- 驗證器輸出
- 來源真實性註冊表
- DE 分流 (Triage)
- 第一條真實管道的就緒資料合約

## 3. ROG-5 資料集註冊表合約 (Dataset Registry Contract)

### 交付物

- `docs/3-Tracks/prep_compoment/plan/hackathon-dataset-registry.yaml`

### 目的

為 DE 團隊建立一個黑客松專用的機器可讀註冊表。這**不是**為了取代廣泛的平台註冊慣例，而是黑客松組件定義與 DE 實作層面之間的橋樑。

### 涵蓋範圍

目前註冊表應覆蓋全部 10 個組件，但成熟度分為三類：

- 已有可直接進資料合約的真實來源：`1 / 2 / 4 / 5 / 8 / 9`
- 已有可用真實來源或真實代理來源，但仍需欄位映射：`3 / 6`
- 不是單純 open-data endpoint 問題，而是邏輯資料集問題：`7 / 10`

### 每個來源記錄的必要欄位

- `component_id`: 組件 ID
- `component_name`: 組件名稱
- `tool_name`: 工具名稱
- `city_scope`: 城市範圍
- `source_name`: 來源名稱
- `source_platform`: 來源平台
- `source_id_or_rid`: 來源 ID 或資源 ID
- `endpoint`: 端點位址
- `transport_type`: 傳輸類型
- `validation_status`: 驗證狀態
- `validation_source`: 驗證依據
- `update_cadence`: 更新頻率
- `coordinate_mode`: 座標模式
- `key_fields`: 關鍵欄位
- `fallback_mode`: 備援模式
- `proxy_required`: 是否需要代理
- `ready_dataset_name`: 就緒資料集名稱
- `ready_contract_ref`: 就緒合約引用
- `next_action`: 下一步行動

### 標準列舉 (Enums)

`validation_status` (驗證狀態)

- `verified`: 已驗證
- `verified_with_proxy_required`: 已驗證但需要代理
- `verified_with_address_join`: 已驗證但需要地址關聯
- `verified_with_mapping_required`: 已驗證但需要欄位映射
- `unverified`: 未驗證

`fallback_mode` (備援模式)

- `real`: 真實資料
- `real_with_proxy`: 真實資料（透過代理）
- `real_with_normalization`: 真實資料（經過標準化）
- `mock_allowed`: 允許使用模擬資料
- `blocked`: 已封鎖

### 註冊表規範

- 每個「來源」一筆記錄，而非每個「圖表」一筆記錄
- 註冊表內容必須僅反映已驗證的儲存庫證據
- 註冊表允許在任何 DAG 存在之前定義邏輯上的 `ready_dataset_name`
- 未來的快速驗證執行可以強化記錄，但在沒有證據的情況下不能默默弱化記錄

## 4. ROG-6 快速驗證器至 DE 分流合約 (Quick-Validator to DE Triage Contract)

### 交付物

- `docs/3-Tracks/prep_compoment/review/quickval-source-health.json`

### 目的

將驗證器的發現壓縮為 DE 可使用的產出物，使 DE 不需要閱讀完整的 Markdown 報告或 HTML 原型即可了解目前的來源狀態。

### 來源健康記錄體系 (Record Shape)

- `source_key`: 來源金鑰
- `component_ids`: 組件 ID 列表
- `source_name`: 來源名稱
- `http_status`: HTTP 狀態碼
- `access_state`: 存取狀態
- `sample_count`: 樣本數量
- `key_fields`: 關鍵欄位
- `coordinate_mode`: 座標模式
- `last_validated_at`: 最後驗證時間
- `observed_update_time`: 觀察到的更新時間
- `fallback_reason`: 備援原因
- `de_action`: DE 行動
- `risk_level`: 風險等級
- `evidence_refs`: 證據引用

### 標準列舉 (Enums)

`access_state` (存取狀態)

- `ok`: 正常
- `proxy_required`: 需要代理
- `schema_join_required`: 需要架構關聯
- `address_geocode_required`: 需要地址經緯度編碼
- `not_yet_validated`: 尚未驗證

`de_action` (DE 行動)

- `build_be_proxy`: 建立後端代理
- `define_address_normalization`: 定義地址標準化
- `define_field_mapping`: 定義欄位映射
- `ready_for_pipeline`: 準備好進入管道
- `collect_more_validation`: 蒐集更多驗證資訊

### 更新語義

- 未來的驗證器執行將透過 `source_key` 進行更新
- 每當蒐集到新證據時，`last_validated_at` 務必更新
- 除非有新證據證明，否則 `de_action` 的嚴重程度只能降低不能升高
- `evidence_refs` 應始終指向儲存庫內的證據，而非對話背景

### 為什麼需要這個

`component-quick-validator` 已經能快速發現真實問題，但目前結果大多存在於人類可讀的產出物中。此 JSON 使這些發現對 DE 而言成為可供分流的資料層。

## 5. ROG-7 組件 8 就緒資料合約 (Component 8 Ready-Data Contract)

### 目標

組件 8 是第一個 DE 實作目標，因為它擁有最強大的已驗證來源集和清晰的區域級決策故事。

### 邏輯資料集

- `hackathon_component_8_shelter_gap_ready`

### 下游消費者

- 組件 8 的黑客松前端與後端
- 稍後重構 BE `analyze_shelter_gap` 的目標

### 目前後端狀態

`analyze_shelter_gap` 已在 `hackathon.go` 中註冊，但其目前的實作回傳寫死的敘述性文字。在此階段，替換該實作明確不在範圍內。此交接僅定義 DE 可以據以開發的就緒資料合約。

### 上遊輸入

- 台北市收容處所清單
- 新北市收容處所清單
- 台北市年齡結構
- 新北市年齡結構
- (可選) 稍後階段的台北市老化指數擴展

### 管道階段 (Pipeline Stages)

1. 來源攝入 (Source Ingest)
2. 城市特定欄位標準化
3. 行政區/地址標準化
4. 按行政區彙整收容能量
5. 按行政區彙整脆弱人口 (Vulnerable population)
6. 缺口運算 (Gap computation)
7. 溯源與新鮮度標記 (Provenance + freshness stamping)
8. 就緒資料發佈

### 合併策略預設值

- 行政區級別合併優先
- 當缺乏座標時，對收容設施進行地址標準化
- 此階段無幾何優先 (Geometry-first) 的依賴
- 此階段無跨城市搬遷的最佳化

### 就緒資料欄位 (Ready-data fields)

- `city_scope`: 城市範圍
- `district_name`: 行政區名稱
- `district_code`: 行政區代碼
- `shelter_count`: 收容處所數量
- `shelter_capacity`: 收容能量
- `vulnerable_population_65p`: 65 歲以上脆弱人口
- `aging_index`: 老化指數
- `capacity_gap_abs`: 能量缺口絕對值
- `capacity_gap_ratio`: 能量缺口比例
- `support_status`: 支援狀態
- `geo_mode`: 地理模式
- `source_trace`: 來源追蹤
- `data_mode`: 資料模式
- `last_validated_at`: 最後驗證時間
- `lasttime_in_data`: 資料中的最後時間

### 衍生欄位規則

- `capacity_gap_abs = vulnerable_population_65p - shelter_capacity`
- 當 `vulnerable_population_65p > 0` 時，`capacity_gap_ratio = capacity_gap_abs / vulnerable_population_65p`

`support_status` (支援狀態)

- `surplus`: 剩餘（能量充足）
- `tight`: 吃緊（接近平衡，餘裕低）
- `gap`: 缺口（明顯不足）
- `critical_gap`: 嚴重缺口（嚴重不足，需要明確干預）

建議解讀方式：

- `surplus`: 能量達到或超過脆弱人口
- `tight`: 接近平衡且剩餘空間有限
- `gap`: 明顯短缺
- `critical_gap`: 嚴重短缺，需要專項干預

### 受限的未解決項目

- 地圖層可能需要收容處所的地理編碼 (Geocoding)
- 在生產環境合併前需要行政區規範映射 (District canonical mapping)
- 新北市人口標題映射必須作為合約的一部分保留
- 老化指數豐富化在 v1 中延後處理且可為空 (nullable)

## 6. ROG-13 組件 8 / 9 的後端消費合約 (BE Consume Contract)

### 目的

本節定義第一波解除後端 mock 的邊界。這一波只聚焦：

- `analyze_shelter_gap`
- `analyze_flood_risk`

### Component 8 -> `analyze_shelter_gap`

後端應消費：

- `hackathon_component_8_shelter_gap_ready`

最小輸入欄位：

- `city_scope`
- `district_name`
- `shelter_capacity`
- `vulnerable_population_65p`
- `capacity_gap_abs`
- `capacity_gap_ratio`
- `support_status`
- `source_trace`
- `data_mode`
- `lasttime_in_data`

最小輸出責任：

- 依 `city` 參數產出台北或雙北摘要
- 在 `vulnerability_weight=true` 時可利用 `aging_index` 補充說明
- 每句敘事都能指回 `source_trace`

### Component 9 -> `analyze_flood_risk`

建議邏輯就緒資料集名稱：

- `hackathon_component_9_flood_risk_ready`

最小輸入欄位：

- `city_scope`
- `sensor_id`
- `district_name`
- `risk_level`
- `upstream_pressure_ratio`
- `event_time`
- `source_trace`
- `data_mode`
- `last_validated_at`
- `lasttime_in_data`

最小輸出責任：

- 以即時淹水感測作主體
- 可吸收雨水下水道水位站作補強來源
- 支援風險來源占比與上游外溢敘事

本節明確不處理：

- 全部 AI tools 一次性資料驅動化
- 完整流域模擬
- 最終 BE handler 重寫

## 7. ROG-14 組件 7 / 10 的情境與邏輯資料集合約 (Scenario / Logical Dataset Contract)

### 核心判斷

組件 7 與 10 的主要缺口不是 open-data endpoint，而是邏輯資料集與派生資料形狀尚未定義。

### Component 7 logical dataset

邏輯資料集名稱：

- `hackathon_component_7_scenario_context_ready`

最小欄位：

- `scenario_id`
- `city_scope`
- `trigger_context`
- `disaster_mode`
- `active_overlay_set`
- `dashboard_filter_effect`
- `derived_pressure_profile`
- `source_trace`
- `data_mode`
- `last_validated_at`

用途：

- 作為全局 filter / query context
- 驅動整個儀表板模式切換，而不是單一圖表資料源

### Component 10 logical dataset

邏輯資料集名稱：

- `hackathon_component_10_decision_effects_ready`

最小欄位：

- `scenario_id`
- `decision_id`
- `priority`
- `action`
- `evidence`
- `expected_effect`
- `side_effects`
- `positive_effects`
- `confidence`
- `source_trace`
- `alternatives`
- `overlay_payload`

此資料集需對齊現有 BE payload 形狀：

- `generate_decisions`
- `visualize_side_effects`
- `generate_briefing`

本節只定義形狀，不建立新資料表或 DAG。

## 8. 建議開發順序 (Recommended Build Order)

1. 接受 `hackathon-dataset-registry.yaml` 作為黑客松來源合約
2. 接受 `quickval-source-health.json` 作為 DE 分流產出物
3. 將 Component 1 正式納入 registry
4. 補齊 Component 3 / 6 的來源與映射
5. 定義 Component 7 / 10 的邏輯資料集合約
6. 鎖定組件 8 的行政區/地址標準化規則
7. 實作 `hackathon_component_8_shelter_gap_ready`
8. 定義 `hackathon_component_9_flood_risk_ready`
9. 僅在就緒資料存在後，再決定是否將 `analyze_shelter_gap` / `analyze_flood_risk` 接回使用該資料

此順序將產品決策保留在上游，實作決策保留在下游。

## 9. 驗收清單 (Acceptance Checklist)

- [ ] 註冊表涵蓋組件 `1 / 2 / 3 / 4 / 5 / 6 / 7 / 8 / 9 / 10`
- [ ] 每筆註冊記錄都包含驗證狀態、備援模式和下一步行動
- [ ] 來源健康狀態 JSON 能表達「需要代理」、「需要地址關聯」、「需要架構映射」和「準備好進入管道」等狀態
- [ ] 組件 8 合約可以在不詢問額外產品決策的情況下實作
- [ ] Component 8 / 9 的後端消費邊界已被寫清楚
- [ ] Component 7 / 10 的邏輯資料集合約可被 FE / BE / DE 共用
- [ ] DE 團隊不需要閱讀 Linear 任務描述即可理解此交接內容
- [ ] 此規範中的所有檔案引用均指向儲存庫中真實存在的路徑
