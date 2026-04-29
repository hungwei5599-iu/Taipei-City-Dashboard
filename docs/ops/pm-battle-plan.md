# PM 作戰指南：缺口分析與任務清單

> 這是組長（羅浚）的當天比賽作戰文件。  
> 每個 lane 有自己的 MVP 目標、缺口清單、驗收條件。  
> **原則：一個任務一個 owner，沒有 artifact 就不算開始。**

---

## 整體對接狀態（2026-04-21）

```
資料驗證 (PM) → ETL + DB (DE) → API/Tool (BE) → 圖表/地圖 (FE) → 整合驗收 (Integration)
     ✅               🔴 缺口              🟡 部分 mock           🟡 待接          🔴 未開始
```

---

## 🔴 最高優先缺口（會讓比賽爆炸的）

| # | 缺口描述 | 影響範圍 | Owner | 期限 |
|---|---------|---------|-------|------|
| G1 | DE 未收到 handoff-spec，沒有組件對應的 RID 配置 | 全部 10 組件 | 羅浚 → 賴泓瑋 | 立刻 |
| G2 | daniel 的 ETL 輸出是 CSV，但 BE query 的是 PostgreSQL | C1/C3/C4/C5/C8/C9 | 賴泓瑋 | 本週 |
| G3 | BE 的 `analyze_shelter_gap` / `analyze_flood_risk` 回傳寫死文字 | C8/C9 | 張詠翔 | DE 完成後 |
| G4 | C2 景點人潮 Cloudflare 封鎖，BE Proxy 未建立 | C2 | 張詠翔 | 本週 |
| G5 | C7/C10 邏輯資料集 schema 未定義，FE/BE 都在等 | C7/C10 | 羅浚 | 本週 |
| G6 | Docker 整合 stack 未驗證跑通 | 全部 | 余振言 | 比賽前一天 |

---

## DE Lane（賴泓瑋 / daniel）

### MVP 目標
> 比賽當天，至少 C1 + C8 + C9 的資料在 PostgreSQL 裡，BE 可以 query 到真實資料。

### 任務清單

| 優先 | 任務 | Artifact | 驗收條件 | 狀態 |
|------|------|---------|---------|------|
| P0 | 閱讀 `de-handoff-simple.md`，確認 10 個組件的 RID | 無需產出，只需確認 | 告知組長「我看完了」 | 🔴 待做 |
| P0 | `ETL.py` 加入 `extract_api()` 支援 GET + POST | `ETL.py` 更新 | C5 急診 POST 可跑 | 🔴 待做 |
| P0 | 跑 C1 藝文活動 ETL，驗證資料可用性 | CSV 或 DB 輸出 | `SELECT COUNT(*) > 0` | 🔴 待做 |
| P1 | C1 ETL 加 `load_to_db()`，寫入 `hackathon_component_1_event_map_ready` | PostgreSQL 表 | BE `summarize_events` query 到資料 | 🔴 待做 |
| P1 | C8 雙北避難收容合併 ETL + 衍生欄位計算 | `hackathon_component_8_shelter_gap_ready` | `support_status` 欄位有值 | 🔴 待做 |
| P1 | C9 淹水感測 ETL | `hackathon_component_9_flood_risk_ready` | 感測器資料有 `risk_level` | 🔴 待做 |
| P2 | C3 文化設施密度欄位映射定義 | 映射規則文件或程式碼 | 雙北欄位統一 | 🔴 待做 |
| P2 | C4 AED / C5 急診 ETL | 兩個 ready 表 | 各 `COUNT(*) > 0` | 🔴 待做 |

### 已知風險
- C5 急診是 POST 請求，`ETL.py` 目前只支援 GET
- C8 需要合併雙北兩個人口表，新北欄位是 `field1`/`percent28`（不是中文名）
- C2 不用動，BE 會直接 proxy

---

## BE Lane（張詠翔）

### MVP 目標
> 比賽當天，至少 `summarize_events`（C1）+ `analyze_shelter_gap`（C8）+ `analyze_flood_risk`（C9）接上真實 DB，其他可以 mock。

### 任務清單

| 優先 | 任務 | Artifact | 驗收條件 | 狀態 |
|------|------|---------|---------|------|
| P0 | 建立 C2 景點人潮 BE Proxy（繞過 Cloudflare）| `hackathon.go` Proxy handler | curl 呼叫 `/api/v1/ai/chat/twai` 回傳人潮資料 | 🔴 待做 |
| P1 | `analyze_shelter_gap` 接 DB（等 DE 完成 C8）| `hackathon.go` 更新 | query `hackathon_component_8_shelter_gap_ready` | 🟡 等 DE |
| P1 | `analyze_flood_risk` 接 DB（等 DE 完成 C9）| `hackathon.go` 更新 | query `hackathon_component_9_flood_risk_ready` | 🟡 等 DE |
| P1 | `summarize_events` 接 DB（等 DE 完成 C1）| `hackathon.go` 更新 | query `hackathon_component_1_event_map_ready` | 🟡 等 DE |
| P2 | 確認 DB 連線設定與 table schema 對齊 | 無需產出 | go test 通過 | 🔴 待做 |

### 已知風險
- 13 個 tool handler 大多是寫死文字，DE 每完成一個組件就要更新一次
- C7/C10 邏輯資料集 schema 還沒定義，等 PM 先確認

---

## FE Lane（林鈞元）

### MVP 目標
> 比賽當天，至少 C1（地圖點位）+ C8（缺口長條圖）+ C9（感測器地圖）可以展示真實資料。

### 任務清單

| 優先 | 任務 | Artifact | 驗收條件 | 狀態 |
|------|------|---------|---------|------|
| P0 | 確認 10 個組件的 Vue component 對應哪個 AI tool | 清單或 comment | 每個組件都知道呼叫哪個 endpoint | 🔴 待確認 |
| P1 | C1 藝文活動地圖：接 BE `/api/v1/ai/chat/twai`（等 BE 完成）| Vue component 更新 | 地圖顯示真實點位 | 🟡 等 BE |
| P1 | C8 避難缺口圖表：ApexCharts 長條圖顯示行政區缺口 | Vue component | 圖表有資料，不是空的 | 🟡 等 BE |
| P2 | C9 淹水感測地圖：顯示感測器點位 | Vue component | 地圖有感測器點位 | 🟡 等 BE |
| P2 | 確認所有圖表都是 ApexCharts（禁用其他圖表庫）| code review | no ECharts/Chart.js imports | 🔴 確認中 |

### 已知風險
- FE 在 BE contract 穩定前不要開始 mock 資料
- C7/C10 的 UI 邏輯等 PM 定義後再做

---

## Integration Lane（余振言）

### MVP 目標
> 比賽前一天，完整 Docker stack 可以在一台機器上跑通，所有組件有畫面。

### 任務清單

| 優先 | 任務 | Artifact | 驗收條件 | 狀態 |
|------|------|---------|---------|------|
| P0 | 確認 Docker stack 在本機跑通（FE + BE + DB）| 無需產出 | `docker compose up` 後前端有畫面 | 🔴 待驗 |
| P1 | 確認 DE 的 PostgreSQL 連線設定與 Docker DB 一致 | 環境設定文件 | ETL 跑完後 DB 有資料 | 🔴 待確認 |
| P1 | 端到端煙霧測試：點一個組件，AI 有回應 | 測試紀錄 | 至少 C1/C8/C9 回傳真實資料 | 🟡 等 DE+BE |
| P2 | Demo script 走一遍，計時 | `demo-script.md` 更新 | 5 分鐘內完成 demo | 🔴 待做 |

---

## PM Lane（羅浚）

### 立刻要做的事

- [ ] **今天**：把 `de-handoff-simple.md` 傳給 daniel，並口頭確認他看懂
- [ ] **今天**：確認 daniel 的 C1 藝文活動 RID（`cloud.culture.tw` category=1）他有收到
- [ ] **本週**：定義 C7 防災情境切換的邏輯資料集 schema（`hackathon_component_7_scenario_context_ready`）
- [ ] **本週**：定義 C10 決策建議的邏輯資料集 schema（`hackathon_component_10_decision_effects_ready`）
- [ ] **比賽前**：確認 judge QA 問題與 demo 故事線

### 對接驗證節點（你要主動追蹤）

| 節點 | 誰觸發 | 你要確認什麼 |
|------|--------|------------|
| DE 完成 C1 | 賴泓瑋 | DB 有資料，告知張詠翔可以接 |
| BE 完成 C1 tool | 張詠翔 | API 回傳真實資料，告知林鈞元可以接 |
| DE 完成 C8 | 賴泓瑋 | `support_status` 有值，告知張詠翔 |
| 整合測試通過 | 余振言 | Demo 可以跑，更新 demo script |

---

## 工作流對接圖

```
[PM 給 RID + handoff-simple.md]
          ↓
[DE: ETL.py extract → transform → load_to_db]
          ↓
[PostgreSQL: hackathon_component_X_ready]
          ↓
[BE: hackathon.go tool handler query DB]
          ↓
[FE: Vue component 呼叫 /api/v1/ai/chat/twai]
          ↓
[Integration: Docker stack 端到端驗證]
```

---

## 比賽當天 MVP 最低標（不能再少了）

| 組件 | Lane | 最低要求 |
|------|------|---------|
| C1 藝文活動 | DE→BE→FE | 地圖顯示真實活動點位 |
| C8 避難缺口 | DE→BE→FE | 行政區缺口圖表有真實資料 |
| C9 淹水監測 | DE→BE→FE | 感測器地圖有點位 |
| C2 景點人潮 | BE→FE | BE Proxy 建立，燈號顯示 |
| 其他 6 個 | FE | UI 有畫面，資料可以是 mock |

---

*最後更新：2026-04-21 | 作者：羅浚（PM）*
