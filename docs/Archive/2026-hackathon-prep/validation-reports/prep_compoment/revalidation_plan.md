# 資料工程師重新驗證計畫：熱島主題組件 (Heat Island & Resilience)

此計畫旨在重新檢核 10 個組件原型的資料鏈路，並診斷「實體關聯斷鏈 (Joinability)」、「空間位移 (Spatial Drift)」與「時間新鮮度 (Temporal Health)」等核心缺口。

## User Review Required

> [!IMPORTANT]
> **資料來源編碼與格式一致性**：台北市部分資料集（如人口統計）採 `BIG-5` 編碼且為 CSV，與新北市的 JSON/API 格式不一，需在 DE 層強制標準化。
>
> **即時性缺口**：AED 與 避難收容所均為「靜態資料」（季/年更新），無法支援動態災情下的「即時剩餘容量」顯示。

## Proposed Changes

### 1. 資料壓測與完整性檢測 (Data Profiling)
使用 `data_profiler.py` 對關鍵組件進行深度掃描：

- **[組件 1 & 3] 文化設施與活動**：
    - 檢測 `cloud.culture.tw` 的活動點位是否準確落在雙北邊界內。
    - 檢查「活動資料」與「場館資料」的 ID 關聯性（Orphan Rate）。
- **[組件 4 & 8] AED 與 避難收容所**：
    - 執行 `boundary` 檢測，確保無飛往海外的錯誤座標。
    - 執行 `join` 檢測，驗證「收容所地址」是否能與「行政區統計資料 (District Mapping)」百分之百對齊。
- **[組件 9] 淹水感測**：
    - 執行 `time-drift` 檢測，驗證 API `e73305a4` 的資料更新頻率是否真的維持在 10 分鐘內。

---

### 2. 組件特定資料缺口分析 (Component-Specific Gaps)

#### [組件 9] 即時淹水與跨區影響監測
- **現狀**：原型使用 Mock 資料。
- **缺口**：點位式感測器 (Point) 無法直接生成「淹水範圍 (Polygon)」。
- **補強方案**：引入 NCDR 的「潛勢淹水圖層 (Static Polygon)」與即時感測器連動，當感測器觸發時高亮對應的潛勢區。

#### [組件 10] 決策副作用與外溢分析 (★ 核心挑戰)
- **現狀**：副作用判定純屬 AI 推論，缺乏資料證據。
- **缺口**：缺乏「跨區人口流動」或「路段即時壓力」基準值。
- **補強方案**：
    1. 引入 **TDX 路段擁擠度 (VD Data)** 以支援「交通外溢」分析。
    2. 引入 **電信探針人潮 (Crowd Data)** 以支援「導流壓力」分析。

---

### 3. 資料工程最佳實務補強 (DE Best Practices)
- **[NEW] [validation-report-v2.md](file:///Users/ro9air/projects/Taipei_Dashdorad/docs/hackathon/01_heat_island/execute/validation-reports/validation-report-v2.md)**
    - 建立統一的資料健康度矩陣。
- **[MODIFY] [data_profiler.py](file:///Users/ro9air/projects/Taipei_Dashdorad/docs/data_source/data_assessment/data_profiler.py)**
    - 增加 BIG-5 偵測與自動轉碼邏輯。

## Open Questions

> [!CAUTION]
> 是否允許在缺少即時 API 的情況下，使用「歷史災情經驗係數」來模擬組件 10 的副作用？（例如：關閉大直橋，固定增加內湖區 30% 交通係數）。

## Verification Plan

### Automated Tests
- 執行 `python docs/data_source/data_assessment/data_profiler.py` 產出所有 10 個組件的自動化壓測報告。
- 驗證 CSV 下載腳本是否能處理編碼錯誤。

### Manual Verification
- 手動檢查 Mapbox 上繪製的點位，確保新北市與台北市的行政邊界無縫接合。
