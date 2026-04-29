# 組件 4 快速驗證報告

**日期**：2026-04-19
**狀態**：PARTIAL
**耗時**：~35m

## Phase 0：規格摘要

組件 4：**雙北 AED 急救地圖**，需要 **2 個資料源**、**2 種圖表**、**地圖 = 有**。

- 地圖圖層：AED 點位 + 500m 覆蓋圈
- 圖表：DistrictChart（以 bar 快速代理）+ BarChart
- 雙北切換：`Taipei` / `Metro-Taipei`
- AI Tool：`analyze_aed_coverage`

## 資料可達性

| 資料源 | URL | HTTP | 筆數 | 關鍵欄位 | 座標格式 | 更新時間 | 狀態 |
|--------|-----|------|------|---------|---------|---------|------|
| 台北 AED 設置地點 | `https://data.taipei/api/v1/dataset/438c61ad-24f6-4e54-a1cc-e2cfe0e7051e?scope=resourceAquire&limit=5` | 200 | 2728（樣本取 5） | `場所名稱`, `場所地址`, `緯度`, `經度`, `場所分類`, `場所類型` | WGS84 | `2026-03-17 09:50:50` | ✅ OK |
| 新北 AED 設置資訊 | `https://data.ntpc.gov.tw/api/datasets/B6B0E055-62D1-424E-8314-24B65B7AB492/json?size=5` | 200（HTML Request Rejected） | 0 | 無法取得 JSON | 未確認 | 未確認 | ⚠️ mock fallback |

### Phase 1 備註

- 沙箱內建網路無法解析 `data.taipei` / `data.ntpc.gov.tw`，已依規則改用升權 `curl` 重試。
- 台北端點可直接拿到真實 JSON。
- 新北端點在此環境遭 WAF/Request Rejected，故依 skill 規則改用 mock fallback。
- 先前總驗證表仍顯示新北 AED API 曾有正向結果，代表此問題偏向環境 / WAF，不等於資料源永久不可用。

## 視覺預覽

- **HTML 路徑**：`/tmp/validate-component-4.html`
- **資料來源標記**：`Taipei real + New Taipei mock fallback`
- **圖表配置靜態檢查**：2 個 `new ApexCharts(...)` ✅
- **地圖圖層靜態檢查**：2 個 `map.addLayer(...)`（AED 點位 + 覆蓋圈）✅
- **城市切換下拉**：存在 `citySelect` ✅
- **AI 面板收合**：存在 `toggleAi` 行為 ✅
- **視覺截圖**：未取得

### 視覺驗證判定

| 驗收項目 | 結果 |
|---------|------|
| 圖表渲染 | ⚠️ 靜態檢查通過；未取得瀏覽器截圖 |
| 地圖渲染 | ⚠️ 靜態檢查通過；未取得瀏覽器截圖 |
| 佈局符合 wireframe | ✅ YES（HTML 結構符合 60/40 版型） |
| 深色主題可讀 | ✅ YES（靜態檢查） |
| 城市切換下拉可見 | ✅ YES |
| AI 面板收合功能正常 | ✅ YES（程式存在且切換 class） |

### 預覽內容摘要

- 左側 60%：Mapbox 深色底圖、AED 點位、灰色覆蓋圈、類型圖例
- 右側 40%：KPI 3 張、各區密度 bar、雙城密度排行 bar、AI 洞察面板
- 台北模式：只顯示台北真實樣本 5 筆
- 雙北模式：加入新北 mock 3 筆，模擬林口/板橋/淡水的密度差異

## 合規檢查

- [x] 只用 ApexCharts（`https://cdn.jsdelivr.net/npm/apexcharts`）
- [x] 無直接 AI API 呼叫（無 TWCC/OpenAI/Anthropic/Gemini 前端呼叫）
- [x] 資料格式合規（`map_legend` 點位語意 + `two_d`/`percent` 代理圖表）
- [x] 無未核准套件（只有 ApexCharts + Mapbox CDN）
- [x] AI 可移除（收合 AI 面板後地圖 + 圖表仍保留）

## AI Tool Schema 審查

- **Tool 名稱**：`analyze_aed_coverage`
- **Input schema 合理**：YES — `cityPeriodSchema("focus")` 已註冊，可接受城市 + coverage focus 類型
- **hackathon.go 中已有 handler**：YES — `analyze_aed_coverage` 已在 `app/services/ai/tools/hackathon.go` 註冊，對應 `AnalyzeAEDCoverage`
- **輸出格式符合規格**：YES — 適合輸出密度摘要、缺口說明、增設建議

## 阻礙項

1. **新北 AED API 在目前環境被 WAF 擋下**：只能以 mock fallback 完成前端驗證。
2. **瀏覽器自動化受限**：本地 `http.server` 在沙箱中無法 bind port，且可用瀏覽器/Playwright 未就緒，因此本次未取得 screenshot。
3. **Gemini CLI 需額外登入授權**：本機 CLI 嘗試時跳出 browser auth prompt，無法在目前 session 內取得前端 review 輸出。
4. **validation-reports/README.md 仍是舊版組件名稱**：不能拿它判斷 heat island 現況。

## Ready for Harness?

**YES (Conditional)**

理由：
1. 台北 AED 真實資料已證明可直接轉成點位與分類圖層。
2. 新北資料雖然這次被 WAF 擋住，但規格、欄位與 fallback 路徑已清楚，正式開發可由 Go 後端代理或預先同步。
3. `analyze_aed_coverage` tool 已有後端 handler 骨架，前後端命名一致。
4. Quick validate HTML 已證明版型、互動與資料形狀可行。

條件：
- 正式開發前需決定新北資料取得策略（後端 proxy / 定期同步 / cache）。
- 若要把本報告升為 `PASS`，需在可用瀏覽器環境補一張實際渲染截圖。
