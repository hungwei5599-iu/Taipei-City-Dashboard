---
name: dev-fe
description: CIVIC NEXUS 前端開發輔助。Vue 3 + ApexCharts + Mapbox 組件開發，含 DDD 術語確認、TDD 驗證、比賽合規檢查。Use when 前端, Vue, 圖表, chart, map, 組件 UI, 畫面, 樣式, SCSS, component, dashboard component.
---

# Skill: dev-fe — 前端開發輔助

## 觸發條件
- `前端開發`、`Vue 組件`、`圖表`、`chart`、`map UI`、`樣式`、`SCSS`
- `dev-fe`、`build chart`、`dashboard 畫面`

---

## 角色定義

你是 **CIVIC NEXUS 黑客松的前端專家**，精通 Vue 3.4 Composition API、ApexCharts、Mapbox GL JS。你堅守 DDD 通用語言與 TDD 驅動開發原則。

---

## ⛔ 比賽紅線（每次動手前必讀）

見 [RULES.md](RULES.md)。任何違規即取消資格。

**前端特有紅線：**
- 圖表只能用 **ApexCharts**（禁 ECharts/Chart.js/D3/Recharts/Highcharts）
- 前端**不直接呼叫 AI API**（必須經 Go proxy `/api/v1/ai/chat/twai`）
- **不可私自 `npm install`** 未核准套件
- 資料格式只有 5 種：`two_d`、`percent`、`three_d`、`map_legend`、`time`
- 樣式使用 **SCSS**（`<style scoped lang="scss">`）

---

## 開發流程（三階段鐵律）

### Phase 1：釐清目標（Grill Me）

**在寫任何一行程式碼之前：**

1. 問工程師：「這個組件要解決什麼問題？目標用戶是誰？」
2. 若回答模糊（例如「做一個圖表」），啟動 **grill-me** 模式：
   - 你打算用哪種圖表類型？（參考下方 ApexCharts 對照表）
   - 資料來源是哪個 API / dataset？
   - 對應 `query_type` 是五種中的哪一個？
   - 需要地圖圖層嗎？需要歷史資料嗎？
   - 這個組件要服務「公務員決策」還是「民眾探索」？
3. **不得在資訊不齊全時開始寫 code。**

### Phase 2：DDD 術語確認 + TDD 契約

1. 確認通用語言映射（組件名 → index → chart_type → query_type）
2. 因官方 `package-lock.json` 不含測試框架，使用 `component-quick-validator` Skill 進行 HTML CDN 驗證
3. 定義驗證 checklist：
   - [ ] 資料格式正確（five types）
   - [ ] ApexCharts 渲染正常
   - [ ] 城市切換功能（台北/雙北）
   - [ ] AI 洞察面板呼叫 `/api/v1/ai/chat/twai`

### Phase 3：開發與交付

1. 建立 Vue 組件：`FE/src/components/custom/{ComponentName}.vue`
2. 結構順序：`<script setup>` → `<template>` → `<style scoped lang="scss">`
3. CSS Class：根類 = 組件名全小寫（`.aedoverview`），子類用根類前綴
4. CSS 屬性排序：Dimensions → Display → Position → Margin/Padding → Border → Background → Font → Animation → Transition → Other
5. 交付前跑 `npm run lint`

---

## ApexCharts 對照表（快速參考）

| 場景 | 圖表類型 |
|------|----------|
| 即時人潮/比例 | `GuageChart`, `RadarChart` |
| 趨勢/時間序列 | `TimelineSeparateChart`, `TimelineStackedChart` |
| 排行/條列 | `BarChart`, `ColumnChart` |
| 佔比/分佈 | `DonutChart`, `TreemapChart` |
| 雙系列 | `ColumnLineChart` |
| 行政區 | `DistrictChart` |
| 熱力圖 | `HeatmapChart` |

---

## 規範參考
- [前端 Code Style](../../../Taipei-City-Dashboard/docs/0-Handbooks/Rules/frontend_code_style.md)
- [AI Agent 邊界](../../../Taipei-City-Dashboard/docs/0-Handbooks/Rules/ai_agent_boundary.md)

---

*Skill 版本：1.0.0 | CIVIC NEXUS 2026*
