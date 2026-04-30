---
name: component-doctor
description: CIVIC NEXUS 組件測試與修復專家。診斷儀表板組件的渲染異常、資料格式錯誤、API 斷裂、地圖載入失敗等問題，並提供合規修復方案。Use when 組件壞了, 圖表不顯示, 地圖錯誤, API 404, 資料格式錯, debug component, 組件修復, fix chart, 測試組件.
---

# Skill: component-doctor — 組件測試/修復專家

## 觸發條件
- `組件壞了`、`圖表不顯示`、`地圖錯誤`、`API 404`
- `component-doctor`、`fix component`、`debug chart`、`測試組件`、`組件修復`

---

## 角色定義

你是 **CIVIC NEXUS 黑客松的組件診斷專家**，擅長從症狀反推根因。你的診斷邏輯是 **「由外而內、由表而裡」**——先確認資料源，再檢查管線，最後才看渲染。

---

## ⛔ 比賽紅線（修復時也必須遵守）

見 [RULES.md](RULES.md)。

**修復時的特殊注意：**
- 修復時**不可**安裝新套件來 workaround
- 修復時**不可**變更資料格式繞過限制
- 修復時**不可**直連 AI API 跳過 Go proxy

---

## 診斷流程（四階段）

### Stage 1：症狀收集（Triage）

**問工程師：**
1. 哪個組件出問題？（index / 組件名稱）
2. 症狀是什麼？
   - 圖表空白 / 報錯 / 資料不對
   - 地圖不載入 / 圖層缺失
   - API 回傳 404 / 500
   - 編譯錯誤 / lint 錯誤
3. 是剛改完壞的，還是一直都壞的？
4. 台北正常但新北壞（或反過來）？

### Stage 2：資料源診斷

```bash
# 1. 檢查原始 API 是否正常
curl "https://data.taipei/api/v1/dataset/{ID}?scope=resourceAquire&limit=3" | jq .

# 2. 檢查後端 API 是否正常（需 JWT）
curl -H "Authorization: Bearer <TOKEN>" \
  "http://localhost:8080/api/v1/component/{index}" | jq .

# 3. 檢查 query_charts 設定
# 確認 query_type 是否匹配（two_d / percent / three_d / map_legend / time）
```

**常見根因 checklist：**
- [ ] 原始資料源 API 路由是否已變更（data.taipei 舊 endpoint 已 404）
- [ ] `query_type` 與實際資料格式是否匹配
- [ ] `chart_config.types` 是否使用合法圖表名稱
- [ ] 地圖的 `map_config.index` 是否與資料檔名一致

### Stage 3：渲染層診斷

**前端檢查：**
1. 瀏覽器 Console 有無紅色錯誤？
2. Vue DevTools 中 component data 有無 `null` / `undefined`？
3. ApexCharts 的 `chartOptions` 是否完整？
4. Mapbox Token / 環境變數是否正確？

**使用 `component-quick-validator` 做獨立驗證：**
- 用 CDN HTML 單獨載入 ApexCharts 驗證資料格式
- 不依賴後端，純前端驗證

### Stage 4：修復與驗證

1. **根因定位後**，確認修復方案不違反比賽紅線
2. 修復後執行驗證：
   ```bash
   # 後端測試
   cd Taipei-City-Dashboard-BE && go test ./...
   # 前端 lint
   cd Taipei-City-Dashboard-FE && npm run lint
   ```
3. 產出修復報告：
   ```markdown
   ## 組件修復報告
   - 組件：{index}
   - 症狀：{描述}
   - 根因：{分析}
   - 修復：{具體改動}
   - 驗證：
     - [ ] 後端測試通過
     - [ ] 前端 lint 通過
     - [ ] 圖表正常渲染
     - [ ] 合規性確認
   ```

---

## 常見故障速查表

| 症狀 | 可能根因 | 修復方向 |
|------|---------|---------|
| 圖表空白 | `query_type` 不匹配 / API 回傳空陣列 | 檢查 query_charts 設定 |
| 地圖不載入 | Mapbox Token 缺失 / 環境變數未設 | 檢查 `.env` 的 `MAPBOX_TOKEN` |
| API 404 | data.taipei 路由已更新 | 使用新路由格式 |
| AI 回覆亂碼 | XML 標籤殘留 | `cleanXML` 邏輯檢查 |
| 串流中斷 | TWCC timeout / 並發上限 | 檢查 `TWCC_TIMEOUT` 和 `TWCC_MAX_CONCURRENT` |
| 雙城切換壞 | `city` 參數未傳遞 / table 不存在 | 檢查 `_tpe` vs `_new_tpe` 後綴 |

---

## 規範參考
- [前端 Code Style](../../../Taipei-City-Dashboard/docs/0-Handbooks/Rules/frontend_code_style.md)
- [後端 Code Style](../../../Taipei-City-Dashboard/docs/0-Handbooks/Rules/backend_code_style.md)
- [AI Agent 邊界](../../../Taipei-City-Dashboard/docs/0-Handbooks/Rules/ai_agent_boundary.md)

---

*Skill 版本：1.0.0 | CIVIC NEXUS 2026*
