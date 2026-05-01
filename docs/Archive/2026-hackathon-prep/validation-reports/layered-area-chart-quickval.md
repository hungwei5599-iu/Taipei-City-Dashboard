# 分層面積圖快速驗證報告

**日期**：2026-05-01
**狀態**：PASS for concept prototype
**原型**：`docs/Archive/2026-hackathon-prep/prototype-html/layered-area-chart-quickval.html`

## 可行性結論

可以在本專案下實作，但必須定位為 **ApexCharts 合規版 2D / 2.5D ridgeline-style small multiples**。

不得宣稱為真正 3D 透視圖，也不得把每一層解讀成可加總的 stacked total。正式 Vue implementation 應以既有 ApexCharts pattern 重寫，不能直接把 quickval HTML 視為正式元件。

## 資料可達性

| 資料源 | URL | HTTP | 筆數 | 關鍵欄位 | 座標格式 | 更新時間 | 狀態 |
|--------|-----|------|------|----------|----------|----------|------|
| Mock concept prototype | N/A | N/A | 130 | x_axis, y_axis, data | N/A | 2026-05-01 | OK for prototype |

## 資料格式

- 使用格式：`three_d`
- `x_axis`：年份或時間區間
- `y_axis`：分層類別
- `data`：相對聲量或分佈值
- Mock data 已在 HTML 內標註：`DATA SOURCE: mock concept prototype`

## 視覺預覽

- 圖表渲染：YES，Chrome 本地開啟原型後顯示 5 個 `area chart with 1 data series`。
- 地圖渲染：N/A，此概念不需要 Mapbox。
- 佈局符合 quickval 目的：YES，桌面為圖表 + AI placeholder 側欄，手機版改為單欄。
- 深色主題可讀：YES，使用 `#090909` 背景、`#494b4e` 框線、`#5a9cf8` 強調色。

## 驗證紀錄

- 靜態掃描：HTML 未出現 banned chart library / direct AI provider 關鍵字，結果 `static-compliance-pass`。
- ApexCharts 引用：HTML 中 `ApexCharts` 出現 4 次，且唯一外部圖表 CDN 為 `https://cdn.jsdelivr.net/npm/apexcharts`。
- 瀏覽器渲染：Chrome 開啟 `file://.../layered-area-chart-quickval.html` 後，5 個分層 area chart 正常出現。
- AI panel 收合：按下「收合 AI 洞察 placeholder」後側欄隱藏，5 個圖表仍存在。
- 城市切換：切換到「雙北」後，更新時間變為 `2026-05-01 16:35`，圖表標籤 peak 數值同步更新。

## 合規檢查

- [x] 只用 ApexCharts CDN。
- [x] 無直接 AI API 呼叫。
- [x] AI 區塊是靜態 placeholder，收合後圖表仍可讀。
- [x] 資料格式對齊五種格式之一：`three_d`。
- [x] 不新增 npm / Go dependency。
- [x] Prototype 放在 archive prototype-html，不放 active docs 或 skill 目錄。

## AI Tool Schema 審查

- Tool 名稱：N/A
- Input schema 合理：N/A
- handler：N/A
- 輸出格式符合規格：N/A

此 prototype 不需要 AI tool。若正式元件要產生文字洞察，前端只能呼叫 `/api/v1/ai/chat/twai`，不得直接呼叫模型或外部 AI API。

## 阻礙項

- 真實政府 API 或正式資料源尚未指定。
- 正式接資料前需先執行 `/data-assessment`，確認資料延遲、欄位穩定性、分類值與時間粒度。
- 如果產品目標是精準比較單點數值，分層面積圖不是最佳選擇，應改用 `TimelineSeparateChart` 或 `BarChart`。

## Ready for Harness?

YES, for frontend concept validation only.

正式 harness 前提：
- 先鎖定資料源與 component index。
- 將資料契約寫入 `docs/3-Tracks/competition-mvp/contracts/`。
- 正式 Vue component 需依專案 ApexCharts / SCSS pattern 重寫。
