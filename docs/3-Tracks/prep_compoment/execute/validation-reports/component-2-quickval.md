# 組件 2 快速驗證報告：景點人潮即時燈號

**日期**：2026-04-16  
**狀態**：✅ PASS (Mock Fallback)  
**耗時**：約 5 分鐘  
**驗證者**：component-quick-validator skill v1.0

---

## Phase 0：規格摘要

> **組件 2 — 景點人潮即時燈號**（SYS.06 城市韌性/觀光）
>
> - 資料源：2 個（travel.taipei 台北、data.ntpc 新北）
> - 圖表：2 種（RadialBar/Gauge — 即時百分比、Area — 24h 趨勢）
> - 地圖：✅ 有（人潮熱點，紅黃綠燈號）
> - AI Tool：`analyze_crowd`
> - 雙北切換：CT = `Taipei` / `Metro-Taipei`

---

## Phase 1：資料可達性

| 資料源 | URL | HTTP | 筆數 | 座標/欄位 | 狀態 |
|--------|-----|------|------|----------|------|
| Travel Taipei 官網 | `https://travel.taipei/stream/alert-of-crowds/json` | **403** | 0 | Cloudflare 封鎖 | ❌ 需後端代理 |
| data.taipei 點案 | `aed4342e-1318-494b-9721-3965689115b8` | 200 | 0 | 空資料集 | ❌ 無法使用 |
| data.ntpc.gov.tw | `012616DD-A347-49AD-A566-B10901763F7A` | 403 | 0 | WAF 封鎖 | ❌ 需跳板 |

**決策**：官方 API 均設有 Cloudflare/WAF 保護，前端直接訪問會被封鎖。本次驗證採 **Mock Fallback**，正式開發需在 Go 後端實作 Proxy 或使用定期同步機制。

---

## Phase 2：自包含 HTML 預覽

**預覽檔**：`/tmp/validate-component-2.html`

**包含內容**：
- ApexCharts (RadialBar + Area Chart)
- Mapbox GL JS + Carto Dark Matter 底圖
- 模擬 7 個熱門景點（西門町、101、故宮、淡水老街等）
- 聯動設計：點擊地圖圓點更新側邊儀表板與趨勢圖

---

## Phase 3：視覺驗證截圖

> 瀏覽器自動化截圖（2026-04-16 21:56）

**主要視圖（中山商圈點擊後狀態）**：

![組件 2 驗證截圖](component_2_after_click_1776347241123.png)

| 驗收項目 | 結果 |
|---------|------|
| Mapbox 底圖載入 | ✅ YES (Carto Dark) |
| Gauge 圖表渲染 | ✅ YES (顯示 62% 黃色) |
| Timeline 趨勢圖 | ✅ YES (Area chart 帶漸層) |
| KPI 列表 (排行榜) | ✅ YES (右側底部門欄列出所有景點) |
| 地圖連動功能 | ✅ YES (點擊點位更新側欄標題與 AI 內容) |
| AI 洞察摘要 | ✅ YES (根據點選景點動態生成建議) |

---

## Phase 4：合規檢查

| 項目 | 狀態 |
|------|------|
| ✅ 只用 ApexCharts（無禁用套件） | **PASS** |
| ✅ 無前端直接呼叫 AI API | **PASS** |
| ✅ 資料格式合規（Gauge + Area） | **PASS** |
| ✅ 無未核准 CDN 套件 | **PASS** |

---

## AI Tool Schema 審查

```json
{
  "name": "analyze_crowd",
  "input_schema": {
    "location": "string (景點名稱)",
    "time": "now | prediction"
  },
  "expected_output": "現況分析 + 預測預警 + 導流建議"
}
```

| 項目 | 狀態 |
|------|------|
| Tool 名稱合理 | ✅ YES |
| Input schema 結構清楚 | ✅ YES |
| 決策輔助深度 | ✅ 高 (包含副作用提示) |

---

## 阻礙項與解法

| 阻礙 | 嚴重度 | 解法 |
|------|--------|------|
| 官方 API Cloudflare 保護 | High | **必須** 由 Go Backend 做 Server-side fetch，前端不直接連線。 |
| 新北資料更新頻率不明 | Medium | 若新北 API 不穩，優先確保台北資料，新北以 demo static data 呈現。 |

---

## Ready for Harness?

### ✅ YES (Conditional)

**結論**：雖然資料源目前有 Cloudflare 屏障，但圖表邏輯（Gauge + Timeline）與地圖點位展示已具備高度可行性。建議在 Harness Phase 3 時優先處理後端 Proxy 邏輯。

---
*快速驗證 Skill 版本：1.0.0 | 組件：2 / 10 | 耗時：5m*
