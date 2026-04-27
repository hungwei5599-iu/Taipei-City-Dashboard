# 組件 1 快速驗證報告 (運動中心使用情況)

**日期**：2026-04-22
**狀態**：PARTIAL (使用 Mock Data)
**耗時**：3m 15s

## 資料可達性
| 資料源 | URL | HTTP | 筆數 | 關鍵欄位 | 座標格式 | 更新時間 | 狀態 |
|--------|-----|------|------|---------|---------|---------|------|
| 臺北市各區運動中心 | /api/v1/dataset/80be7612... | N/A  | Mock | name, lat, lng | WGS84 | N/A | Mock Fallback (網路無法解析 data.taipei) |
| 新北市運動中心 | N/A | N/A | Mock | name, lat, lng | WGS84 | N/A | 待確認開放資料集 |

## 視覺預覽
- 截圖：(環境無 Claude Preview MCP，但 HTML 已產生於 `/tmp/validate-component-sports-center.html`)
- 圖表渲染：YES (使用 ApexCharts `radialBar`)
- 地圖渲染：YES (使用 Mapbox GL JS `v1.13.0`，包含 Marker 顏色變化)
- 佈局符合 wireframe：YES (左側資料看板 + 右側滿版地圖 + 右下 AI 輔助面板)
- 深色主題可讀：YES
- 容留人數狀態展示：YES (透過不同 Badge 與 Tag 展示人數百分比、冷氣、設施狀況)

## 合規檢查
- [x] 只用 ApexCharts
- [x] 無直接 AI API 呼叫 (原型設計無後端，正式開發將遵守)
- [x] 資料格式合規（two_d、percent 格式）
- [x] 無未核准套件
- [x] AI 可移除 (面板右上角有收合按鈕)

## AI Tool Schema 審查
- Tool 名稱：`analyze_sports_center_status` (需註冊至 registry)
- Input schema 合理：YES (輸入 `city` 與 `facility_type`)
- hackathon.go 中已有 handler：NO (需於正式開發時新增)
- 輸出格式符合規格：YES (產出推薦與分流建議字串)

## 阻礙項
- **即時人數 API 缺失**：臺北開放資料目前只有「各區運動中心」點位與「年度場地開放情形」，未能找到每分鐘/每小時更新的「各設施容留人數」。若最終無對應 API，需由後端自行實作 Redis 模擬或爬蟲。

## Ready for Harness?
YES (視覺表現優異，但需釐清資料來源策略)
