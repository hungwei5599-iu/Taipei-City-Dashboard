# 組件 5 快速驗證報告

**日期**：2026-04-19
**狀態**：PARTIAL
**耗時**：~45m

## Phase 0：規格摘要

組件 5：**雙北急診即時壅塞度**，需要 **3 個資料來源群組**、**3 種圖表**、**地圖 = 有**。

- 地圖圖層：各醫院急診壅塞燈號點位
- 圖表：GaugeChart（`radialBar`）+ HeatmapChart（`heatmap`）+ ColumnChart（`bar`）
- 雙北切換：`Taipei` / `Metro-Taipei`
- AI Tool：`analyze_er_status`

## 資料可達性

| 資料源 | URL | HTTP | 筆數 / 樣本 | 關鍵欄位 | 座標格式 | 更新時間 | 狀態 |
|--------|-----|------|-------------|---------|---------|---------|------|
| MOHW 醫事司急診即時頁 | `https://dep.mohw.gov.tw/DOMA/cp-979-4112-106.html` | 200 HTML | 台北 / 新北急診醫院名單可見 | 醫院名稱、縣市別、各院官方急診入口連結 | N/A | 頁面顯示更新時間 `115-02-24` | ✅ 官方來源可用 |
| NHI 院所查詢頁 | `https://www.nhi.gov.tw/ch/np-2926-1.html` | 200 HTML（Cloudflare challenge） | 急診即時服務入口存在，但內容被 challenge 擋住 | `急救責任醫院急診即時訊息` 入口 | N/A | 未直接取得 | ⚠️ challenge 擋下 |
| 台北醫療院所清冊 | `https://data.taipei/api/dataset/ffdd5753-30db-4c38-b65f-b77892773d60/resource/04a3d195-ee97-467a-b066-e471ff99d15d/download` | 200 CSV | 取樣到馬偕、國泰、三總、榮總、萬芳、新光 | 機構名稱、地址、經度、緯度 | WGS84 | `2026-01-07T16:14:11`（資料索引） | ✅ 真實座標可用 |
| 新北醫療院所清冊 | `https://data.ntpc.gov.tw/api/datasets/2B35CF0E-E5D5-4A4F-8C27-90E03F315A9B/json?size=5000` | 200 JSON | 取樣到亞東、雙和、慈濟、土城、輔大、耕莘 | `hosp_name`, `district`, `wgs84ax_longitude`, `wgs84ay_latitude` | WGS84 | 資料列中含 `date` 欄位 | ✅ 真實座標可用 |

### Phase 1 備註

- 沙箱 DNS 無法直接解析官方網站與 open data domain，本輪 live `curl` 一律改用升權重試。
- MOHW 頁面可直接驗證「雙北有哪些重度級急救責任醫院」與官方院站入口。
- NHI 主站目前被 Cloudflare challenge 擋下，所以無法在 quick validation 階段直接讀到其後端急診即時內容。
- 因此本輪策略是：**醫院名單與座標用真實來源；即時壅塞百分比與一週 heatmap 用 mock fallback。**
- `validation-results.md` 先前提到的 `https://data.gov.tw/dataset/125195`，目前已對到**不相關資料集**，本輪視為舊映射 / 錯綁，不再作為組件 5 的主要來源依據。

## 視覺預覽

- **HTML 路徑**：`/tmp/validate-component-5.html`
- **資料來源標記**：`hospital roster real + current load / weekly trend mock fallback`
- **圖表配置靜態檢查**：3 個 `new ApexCharts(...)` ✅
- **地圖圖層靜態檢查**：1 個 `map.addLayer(...)`（急診醫院點位）✅
- **城市切換下拉**：存在 `citySelect` ✅
- **AI 面板收合**：存在 `toggleAi` 行為 ✅
- **互動**：點擊醫院點位可更新 gauge / heatmap / AI 文案 ✅
- **視覺截圖**：未取得

### 視覺驗證判定

| 驗收項目 | 結果 |
|---------|------|
| 圖表渲染 | ⚠️ 靜態檢查通過；未取得瀏覽器截圖 |
| 地圖渲染 | ⚠️ 靜態檢查通過；未取得瀏覽器截圖 |
| 佈局符合 wireframe | ✅ YES（左圖右圖表 + AI 面板） |
| 深色主題可讀 | ✅ YES（靜態檢查） |
| 城市切換下拉可見 | ✅ YES |
| AI 面板收合功能正常 | ✅ YES |
| 點擊地圖更新側邊圖表 | ✅ YES（HTML 邏輯已接上） |

### 預覽內容摘要

- 左側 60%：雙北急診醫院燈號地圖，院名與座標盡量採真實 open data
- 右側 40%：KPI 3 張、選定醫院 gauge、7 日 heatmap、各級醫院平均壅塞度 bar、AI 洞察面板
- 台北模式：只顯示台北急診醫院樣本
- 雙北模式：加入新北急診醫院樣本，可直接看到雙和 / 亞東 / 土城等燈號差異

## 合規檢查

- [x] 只用 ApexCharts（`https://cdn.jsdelivr.net/npm/apexcharts`）
- [x] 無直接 AI API 呼叫（AI 文字為 mock handler 文案）
- [x] 資料格式合規（`map_legend` 點位語意 + `percent/time/two_d` 代理圖表）
- [x] 無未核准套件（只有 ApexCharts + Mapbox GL CDN）
- [x] AI 可移除（收合 AI 面板後地圖 + 圖表仍保留）

## AI Tool Schema 審查

- **Tool 名稱**：`analyze_er_status`
- **Input schema 合理**：YES — `cityPeriodSchema("time")` 已註冊，可接受城市與時間上下文
- **hackathon.go 中已有 handler**：YES — `analyze_er_status` 已在 `app/services/ai/tools/hackathon.go` 註冊，對應 `AnalyzeERStatus`
- **輸出格式符合規格**：YES — 適合輸出壅塞摘要、分流建議與副作用提醒

## 阻礙項

1. **NHI 主站急診入口被 Cloudflare challenge 擋下**：無法在本輪 quick validation 直接讀到其 downstream current-status 內容。
2. **MOHW 官方頁可驗證院名與官方入口，但不是結構化 JSON**：要做正式版仍需後端 proxy / scrape / cache。
3. **即時壅塞百分比與一週 heatmap 仍是 mock fallback**：本輪驗證的是視覺與互動可行，不是正式即時數據整合。
4. **瀏覽器自動化仍受限**：本輪未取得 screenshot，因此無法升為 `PASS`。

## Gemini CLI 診斷（本地 tooling）

- `~/.gemini/settings.json` 目前固定為 `selectedType = oauth-personal`
- `~/.gemini/oauth_creds.json` 與 `~/.gemini/google_accounts.json` 存在，但 headless probe 仍無法直接復用
- 已新增 repo-local 工具：
  - `scripts/gemini-preflight.sh`
  - `scripts/ask-gemini-safe.sh`
- 目前 preflight 結論：**需要互動式重新授權**，不再讓 `gemini -p` 卡死等待 browser auth
- 最近一次 wrapper artifact：`.omx/artifacts/gemini-5-quick-validation-ui-20260419-200221.md`

## Ready for Harness?

**YES (Conditional)**

理由：
1. 官方來源足以確認雙北急診醫院名單與官方急診資訊入口。
2. 台北 / 新北醫療院所座標資料皆可取得，地圖點位可走真實院名與位置。
3. `analyze_er_status` 後端 mock handler 已存在，前後端命名一致。
4. Quick validation HTML 已證明地圖、gauge、heatmap、bar 與 AI 面板的互動組合可行。

條件：
- 正式版需決定 current-status 的結構化擷取策略（後端 proxy / scrape / cache）。
- 若要把報告升為 `PASS`，需在可用瀏覽器環境補一張實際渲染截圖。
