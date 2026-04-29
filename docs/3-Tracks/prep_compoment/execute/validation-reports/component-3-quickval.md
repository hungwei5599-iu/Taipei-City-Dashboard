# 組件 3 快速驗證報告

**日期**：2026-04-19
**狀態**：PARTIAL（資料源全 mock，視覺渲染 PASS）
**耗時**：~15m

---

## 資料可達性

| 資料源 | URL / 方法 | HTTP | 筆數 | 關鍵欄位 | 狀態 |
|--------|-----------|------|------|---------|------|
| 台北藝文館所 | `data.taipei /api/v1/dataset/e8a63a3c...` | 200 | 0 | 空陣列 | ❌ mock fallback |
| 台北各區圖書館 | `data.taipei /api/v1/dataset/a6e1f0b5...` | 200 | 0 | 空陣列 | ❌ mock fallback |
| 文化部設施清冊 | `cloud.culture.tw /frontsite/cms/listJsonAction` | 200 | — | 回傳 HTML（非 JSON）| ❌ mock fallback |
| opendata.culture.tw | `FileId=E7A66841...` | 404 | — | — | ❌ mock fallback |
| 新北圖書館 | `data.ntpc.gov.tw /api/datasets/.../json` | 400 | — | WAF 封鎖 | ❌ mock fallback |
| 文化部活動 API（category=6）| `cloud.culture.tw /frontsite/trans/SearchShowAction.do` | 200 | 817 筆（全國）/ 34 筆（雙北）| title, showInfo[].latitude/longitude | ⚠️ 活動資料可用，**非設施資料** |

**結論：** 組件 3 所需的「文化設施清冊（圖書館/博物館/展演空間數量）」目前無公開 JSON API 可直接取用。文化部 cloud.culture.tw 提供活動資料但非設施點位清冊。正式開發需透過 Go 後端爬取文化部網站或使用文化部 OpenData 申請授權 API Key。

---

## 視覺預覽

- **HTML 路徑**：`/tmp/validate-component-3.html`
- **預覽 URL**：`http://localhost:7373/validate-component-3.html`
- 圖表渲染：**YES**（3 個 ApexCharts canvas，無 JS error）
- 地圖渲染：**N/A**（組件 3 無地圖圖層）
- 佈局符合 wireframe：**YES**（左側圖表 + 右側 AI 面板）
- 深色主題可讀：**YES**
- 城市切換下拉：**YES**（台北市 / 雙北切換，圖表資料同步更新）
- AI 面板收合：**YES**（收合後圖表仍正常）
- console error：**0**

### 渲染組件清單

| # | 圖表 | ApexCharts type | 狀態 |
|---|------|----------------|------|
| 1 | 各行政區密度排行（水平長條） | `bar` (horizontal) | ✅ |
| 2 | 設施類型雷達圖（選定區域，支援雙區比較） | `radar` | ✅ |
| 3 | 各區 vs 全市平均差距（正負色對照） | `bar` (vertical) | ✅ |
| 4 | KPI 數字卡（全市均密度 / 最匱乏區 / 最豐富區） | 純 HTML TextUnit | ✅ |

---

## 合規檢查

- [x] 只用 ApexCharts（無 echarts/chartjs/d3/recharts/highcharts）
- [x] 無直接 AI API 呼叫（AI 面板為 mock 靜態文字）
- [x] 資料格式合規（`two_d` 密度數列 / `percent` 差距數列）
- [x] 無未核准套件（只有 apexcharts CDN，無 mapbox）
- [x] AI 可移除（收合 AI 面板後 3 個圖表 + KPI 仍正常渲染）

---

## AI Tool Schema 審查

- **Tool 名稱**：`compare_cultural_density`
- **Input schema**：`{ district_a: string, district_b: string }` — 合理 ✅
- **hackathon.go 中已有 handler**：待確認（目前 13 個 tool 中未逐一核對）
- **輸出格式符合規格**：YES — 純文字洞察，附 source_trace

---

## 阻礙項

1. **資料源全 mock**：無可直接 curl 的文化設施清冊 JSON API。正式開發需要：
   - 方案 A：向文化部申請 OpenData API Key（`opendata.culture.tw`）
   - 方案 B：Go 後端爬取並 cache 文化部網頁表格資料
   - 方案 C：使用文化部活動資料（category=6）統計各區展演場次數作為「活躍度」代理指標（非設施數量）

2. **組件 3 無地圖**：規格書設計為 DistrictChart（行政區色階圖），需要雙北行政區 GeoJSON boundary 疊色，HTML 原型未實作（依 skill 規格可省略）。

3. **`compare_cultural_density` tool handler** 是否已在 `hackathon.go` 中：需在正式開發前確認。

---

## Ready for Harness?

**NO** — 原因：資料源全 mock，尚未找到可直接對接的文化設施 API。建議先確認資料取得方案（上述三選一）後，再啟動 `agent-harness-construction`。

**建議優先行動：**
- 先以方案 C（文化部活動資料 category=6 統計各區場次）快速上線 demo 版
- 正式版平行申請文化部 OpenData API Key
