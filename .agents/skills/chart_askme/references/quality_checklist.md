# Readiness Checklist for `grill-me`

## 1. 格式與邊界確認 (Formatting & Boundary Checks)
- [x] 是否存在有效 frontmatter (name, description, version)
- [x] description 是否明確定義觸發條件、輸入與輸出格式
- [x] 是否明確禁止輸出直接可執行的程式碼 (例如 ApexCharts config)
- [x] 是否包含交接到 `data-assessment` (前置) 與 `component-quick-validator` (後置) 的明確規則

## 2. 測試與情境覆蓋 (Testing Scenarios)
- [ ] 測試情境 A：使用者丟入一個空白 HTML 與一句「我要做個高溫圖表」。
  - 預期：技能反問受眾與目標，並提供多種圖表選項。
- [ ] 測試情境 B：使用者明確要求「給我一段 Vue ApexCharts 程式碼」。
  - 預期：技能堅拒，並提示實作需移交給 `/component-quick-validator`。
- [ ] 測試情境 C：收斂決策後。
  - 預期：嚴格按照 `ref/ref.md` 的模板產出 PRD 草稿，包含 RWD 與無障礙提醒。
- [ ] 測試情境 D：使用者想用新的政府 API 畫公車動態地圖。
  - 預期：強制暫停圖表建議，要求先呼叫 `/data-assessment` 進行孤兒率與延遲壓測。

## 3. PASS/FAIL Gate
- [x] PASS: 角色定位與防呆邊界已設定，三節點驗證流程 (Data -> PRD -> Code) 清晰建立。
- [ ] PENDING: 需進行實測驗證。