# 雙北儀表板資料完整性報告 V2 (Data integrity Report)

> **版本**：v2.0 (Engineering Audit)  
> **評估官**：Antigravity (資料工程師模式)  
> **驗證日期**：2026-04-20

## 1. 核心診斷：資料源健康度矩陣

| 組件 ID | 主題 | 關鍵資料源 | 現狀狀態 | 致命缺口 |
| :--- | :--- | :--- | :--- | :--- |
| **C1** | 藝文地圖 | cloud.culture.tw | 🟡 PARTIAL | **30% 座標缺失**；全國資料混雜，需精確過濾雙北 location。 |
| **C4** | AED 地圖 | data.taipei (cd050577) | ❌ CRITICAL | **API 回傳為空**；原規格 RID 已失效，急需尋找替代 Dataset。 |
| **C5** | 急診壅塞 | data.gov.tw (125195) | ❌ CRITICAL | **HTTP 404**；衛福部 API 路由變更導致鏈路斷裂。 |
| **C8** | 避難缺口 | data.taipei (aaf97773) | ✅ PASS | 資料可達，但為靜態 CSV。 |
| **C9** | 淹水監測 | data.taipei (e73305a4) | ❌ CRITICAL | **API 逾時/無資料**；無法獲取即時水位。 |

## 2. 深度技術缺口分析

### A. 編碼與轉碼風險 (Encoding Conflict)
- **發現**：台北市部分的 Open Data（如人口與避難所）仍維持 `BIG-5` 編碼。
- **影響**：前端直接讀取會產生亂碼。
- **建議方案**：必須在 Go 後端或 Airflow DE 層加入 `iconv` 轉碼模組，將所有內容標準化為 `UTF-8`。

### B. 空間解析度斷層 (Spatial Granularity Gap)
- **發現**：感測器是「點 (Point)」，人口統計是「行政區 (District)」。
- **問題**：無法精確計算「受淹水影響的脆弱人口數」。
- **建議方案**：採用「空間關聯估演算法」，若區內有 2 個以上感測器觸發警戒，則將該行政區整體標示為高風險。

### C. 導流與外溢推論之證據確度 (Side-Effect Evidence)
- **發現**：目前 `hackathon.go` 中的副作用（如：關閉 A 橋導致 B 路段壅塞）全為 **AI Mock**，無資料支持。
- **建議方案**：必須串接 **TDX (交通部) 路段資訊**。若無實體 API，需建立預定義的「壓力係數矩陣 (Pressure Matrix)」。

## 3. 補強行動建議 (Roadmap)

1. **[Phase A] 修復斷鏈**：尋找 `data.taipei` 最新的淹水與 AED 資料集 ID，取代 specs 中的舊 ID。
2. **[Phase B] 更新工具**：已完成 `data_profiler.py` 升級，支援嵌套路徑（Nested Path）如 `showInfo.0.latitude`。
3. **[Phase C] 邏輯填補**：在 `hackathon.go` 中將硬編碼改為呼叫 `global.DB` 中的聚合結果。

---

*資料評估報告結束 | 請依此報告修正實作計畫*
