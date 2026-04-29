# TDD 開發流程 — 組件生產線

所有組件開發必須遵循 **「測試先行」** 原則，確保開發成果完美契合黑客松資料格式與 AI Proxy 邏輯。

## Phase -1：測試契約定義 (Test Definition)

在撰寫任何實作程式碼（後端或前端）之前，必須建立：

1. **後端工具測試 (BE Tool Test)**：`Taipei-City-Dashboard-BE/app/services/ai/tools/{name}_test.go`
   - 模擬外部 API（如 data.taipei）。
   - 斷言回傳的 JSON 結構符合 llama3.3 的 InputSchema。
   - 斷言空資料或異常資料的處理邏輯。

2. **前端組件模擬 (FE Component Mock)**：`Taipei-City-Dashboard-FE/tests/components/{ComponentName}.spec.js`
   - 定義符合 `componentData.go` 類型的 Mock Data。
   - 斷言 ApexCharts 接收到正確的 `series` 與 `options`。

## 執行循環

1. **紅燈 (Red)**：執行測試，確認其失敗（尚未實作）。
2. **綠燈 (Green)**：撰寫最小實作邏輯（例如在 Go Tool 中先回傳 Mock 資料）。
3. **重構 (Refactor)**：對接真實 API，優化 UI/UX 細節。

## 自動化驗證 (Automated Verification)

在 **Phase 5 (整合驗收)** 階段，以下指令必須全數通過：
```bash
go test ./app/services/ai/tools/...
npm run test:unit -- {ComponentName}
```
