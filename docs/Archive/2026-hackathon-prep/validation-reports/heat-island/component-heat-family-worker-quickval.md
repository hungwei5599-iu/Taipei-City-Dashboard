# 雙北高溫治理儀表板原型 快速驗證報告

**日期**：2026-04-23
**狀態**：PARTIAL (官方資料可達，熱暴露層仍為 CWA 警示 + 示意格網原型)
**耗時**：約 18 分鐘
**HTML**：`/tmp/validate-component-heat-family-worker.html`

## 組件摘要

- **主題**：雙北高溫治理儀表板
- **主要 TA**：雙北市政府局處、區級治理與跨市協調團隊
- **地圖**：YES
- **圖表**：YES（ApexCharts 5 組）
- **雙北邏輯**：YES（先看區級缺口與跨市補位依賴度，再用地圖做證據判讀）
- **AI 邊界**：YES（僅解釋、可收合，移除後不影響地圖與圖表判讀）

## 資料可達性

| 資料源 | 類型 | URL / 路徑 | HTTP / 存取 | 筆數 | 關鍵欄位 | 座標格式 | source_mode | 狀態 |
|--------|------|------------|-------------|------|---------|---------|------------|------|
| CWA 高溫資訊 | 官方頁 | `https://www.cwa.gov.tw/V8/C/P/Warning/W29.html?T=202507061308` | 200 | HTML | 黃/橙/紅燈號、戶外工作 | N/A | `official` | OK |
| CWA 高溫資訊產品文件 | 官方 PDF | `https://opendata.cwa.gov.tw/opendatadoc/Warning/W-C0033-005.pdf` | 200 | PDF | 鄉鎮市區燈號、有效時間 | N/A | `official` | OK |
| 職安署高氣溫作業熱危害預防指引 | 官方頁 | `https://www.osha.gov.tw/48110/48713/48735/60221/` | 200 | HTML | 戶外作業、休息場所、飲用水 | N/A | `official` | OK |
| 臺北市涼適點 | 本機官方 CSV copy | `docs/2-Data-Strategy/Inventory/cool_site/臺北市涼適點資訊表.csv` | local | 778 行 | 行政區、經度、緯度、開放時間、冷氣、飲水、座位 | WGS84 | `official` | OK |
| 臺北市涼適點 download | 官方下載 | `https://data.taipei/api/dataset/a98a3e0e-a36f-43fa-82f8-b09a3011a47a/resource/ae7e5986-859d-4294-b289-7c1b2e7c23f1/download` | 200 | 778 行 | 同上 | WGS84 | `official` | OK |
| 臺北市親子友善廁所 | 官方下載 | `https://data.taipei/api/dataset/9d7488f5-0f19-45c3-adf9-badf686dda18/resource/f1beebb2-b172-4e9f-8f6f-181b5f1625d5/download` | 200 | 394 行 | 行政區、經度、緯度、尿布臺、兒童座椅 | WGS84 | `official` | OK |
| 臺北市公園兒童遊具 | 官方下載 | `https://tppkl.blob.core.windows.net/blobfs/TaipeiParkFacility_Arcade.json` | 200 | JSON | 公園名稱、行政區、X坐標、Y坐標 | TWD97 | `official` | OK（原型已示意轉換） |
| 新北市公共親子中心 | 官方 API | `https://data.ntpc.gov.tw/api/datasets/4182946C-9F01-4676-9992-D40047B232CF/json?size=5` | 200 | sample=5 | title、town、address、capacity_parent_child_pair | 無直接經緯度 | `official_proxy` | OK |
| 新北市公園 | 官方 API | `https://data.ntpc.gov.tw/api/datasets/5FE3A136-29CC-4695-A17E-6636A32C3342/json?size=5` | 200 | sample=5 | name、area、address | 無直接經緯度 | `official_proxy` | OK |

## 主要發現

1. **臺北市涼適點已可直接支撐親子 / 戶外工作者休息資源層。**
   - 本機 CSV 與官方下載抽樣一致。
   - 共 778 行，其中本輪快速統計有 582 行含經緯度。

2. **親子路徑層可用台北官方點位直接成立。**
   - 臺北市親子友善廁所提供 WGS84 經緯度、尿布臺、兒童座椅欄位。
   - 臺北市公園兒童遊具資料可補「高溫偷走的兒童遊戲場」敘事，但原始座標是 TWD97，正式版需一致性轉換。

3. **新北目前可用的是 `official_proxy`，不是涼適點。**
   - 新北市公共親子中心與新北市公園可支撐「公共親子/公園/休息 proxy」。
   - 原型與報告均未把這些資料宣稱成「新北涼適點」。

4. **熱暴露層仍未完成都市熱島科學建模。**
   - 目前只用 CWA 高溫燈號與示意格網作 quick-validator 原型。
   - 正式組件前仍需 CWA API key 或可重現的測站/格點 join proof。

## 視覺驗證

- **開啟方式**：本機 HTTP server + Playwright CLI
- **Page Title**：`高溫安全路徑原型 - 親子 + 戶外工作者`
- **ApexCharts canvas 數量**：5
- **Map 頁 marker 數量**：
  - 親子模式：9
  - 戶外工作者模式：5
- **AI 面板收合**：YES
- **頁面截圖**：`.playwright-cli/page-2026-04-23T09-13-07-383Z.png`
- **Console 狀態**：僅 `favicon.ico 404`，無組件 JS 錯誤

## 互動驗證

| 驗證項目 | 結果 |
|---------|------|
| `document.querySelectorAll('.apexcharts-canvas').length` > 0 | PASS |
| 頁籤切換至 `地圖交叉比對` | PASS |
| 親子 / 戶外工作者模式切換 | PASS |
| 切換模式後 marker 數量改變 | PASS |
| AI 面板收合後仍可判讀 | PASS |

## 合規檢查

- [x] 只使用 ApexCharts
- [x] 無 ECharts / Chart.js / D3 / Recharts / Highcharts
- [x] 無 OpenAI / Anthropic / Gemini 產品呼叫
- [x] 無前端直接呼叫 AI API
- [x] 新北資料明確標示為 `official_proxy`
- [x] AI 面板可移除
- [x] 資料映射維持 `time` / `map_legend` / `two_d` / `percent`

## 原型說明

- **Overview**
  - 高溫警戒基準與治理觸發
  - 區級服務供給量
  - 服務完備度結構
  - 熱壓力時段分布
  - 跨市補位依賴度排行
  - 治理回應與產品定位

- **Map Comparison**
  - CWA 高溫燈號示意區
  - 臺北市涼適點
  - 臺北市親子友善廁所
  - 臺北市兒童遊戲場
  - 新北公共親子中心 / 公園 proxy
  - 跨市補位案例線（預設隱藏，點選案例時才顯示）

## 視覺修正說明

- 移除預設白色虛線，避免把示意線誤讀成正式行政邊界。
- 紫色線改為「跨市補位案例線」，預設不顯示，只在點選案例時出現。
- 地圖定位改成證據層，不再暗示民眾導航或步行路徑。

## 阻礙項

- **熱暴露科學層未完成**：目前不能宣稱這是完整都市熱島模型。
- **新北休息資源缺對等涼適點資料集**：正式版仍需維持 proxy wording。
- **臺北市兒童遊具座標原始格式為 TWD97**：正式組件需做完整轉換與抽樣驗證。
- **Playwright CLI 首次拉起有安裝成本**：本輪已完成驗證，但不是 repo 內既有固定依賴。

## Ready for Harness?

**Prototype YES / Formal Component NO**

- 可以作為 quick-validator 原型展示概念與敘事。
- 不建議直接升級成正式 heat-island 組件，除非先補：
  1. CWA API key 或可重現熱暴露 join proof
  2. 新北資源 proxy 的正式命名與地址/座標補強
  3. TWD97 -> WGS84 一致化

---

## Formal Harness Rerun — 2026-04-27

**狀態**：PARTIAL PASS（前端圖表與地圖已重新呈現；Go toolchain 本機不可用，BE 測試檔已建立但未能在本 session 執行）

### TDD/DDD 補強

- Phase -1 BE 測試契約：`Taipei-City-Dashboard-BE/app/services/ai/tools/heat_family_worker_test.go`
- Phase -1 FE Mock 測試：`Taipei-City-Dashboard-FE/tests/components/HeatFamilyWorker.spec.js`
- DDD module contract：`Taipei-City-Dashboard-FE/src/assets/configs/hackathon/heatFamilyWorker.js`
- Walkthrough：`docs/hackathon/01_heat_island/execute/walkthrough.md`

### 前端重跑結果

```text
Route: http://127.0.0.1:5173/hackathon
title: 雙北高溫家庭與戶外工作者安全
active_button: 高溫安全
apexcharts: 5
chart_shells: 5
map_canvas: 1
visible_features_label: 最後更新：2026-04-27 17:30 · 可見圖徵 7
ai_status: fallback
```

Screenshot: `/tmp/heat-family-worker-hackathon.png`

### 測試結果

```bash
cd Taipei-City-Dashboard/Taipei-City-Dashboard-FE
npm run test
```

Result: PASS.

```bash
cd Taipei-City-Dashboard/Taipei-City-Dashboard-BE
go test ./app/services/ai/tools/...
```

Result: BLOCKED. `go` / `gofmt` is not available in the current PATH.

### 合規檢查

- [x] 僅使用 ApexCharts：FE source/package import scan 無 ECharts / Chart.js / D3 / Recharts / Highcharts。
- [x] 僅經由 Go Proxy 呼叫 AI：heat-family-worker 前端目標 endpoint 為 `/api/v1/ai/chat/twai`。
- [x] 無 OpenAI / Anthropic / Gemini app calls：FE source 與 BE app scan 無相關產品呼叫。
- [x] 資料格式符合法定 5 種：`two_d`、`percent`、`three_d`、`map_legend`、`time`。

### 仍需注意

- 本機 visual verification 的 AI 狀態是 `fallback`，原因是 Go proxy 需要 backend/auth；這不改變合規邊界。
- `npm run build:test` 仍被既有 lint 問題阻擋：`RoutePlannerDialog.vue`、`scenarioStore.js`、`vite.config.js`。
