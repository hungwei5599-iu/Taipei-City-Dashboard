# Reference: 官方圖表決策矩陣、地圖型態與 PRD 模板

## 跨技能注意事項 (Cross-Skill Considerations & Design Guide)
在設計圖表與組件時，必須綜合考量官方前端設計準則 (`front-end-en/design-guide.md`) 與資料驗證機制：

1. **極簡與使用者中心 (Minimalism & User-Centricity)**：
   - 嚴格禁止無意義的圖表濫用。只呈現最具決策價值的核心數據。
   - 標題必須具體無歧義（例如：「信義區每小時人潮統計」而非「人潮變化」）。
2. **資訊層級 (Information Hierarchy)**：
   - 每個視覺化組件必須清楚標示：**標題 (Title)**、**資料來源 (Source)**、**最後更新時間 (Update Time)**、以及**標籤 (Tags)**。
3. **視覺規範 (Visual Standards)**：
   - **深色主題**：背景底色使用 `#090909`、框線使用 `#494b4e`、強調色使用亮藍色 `#5a9cf8`。
   - **資料配色**：使用中低飽和度色彩。連續數值使用漸層 (Gradients)，獨立類別使用相異色 (Distinct colors)。
   - **字體層級**：主標題為 `1.25rem` (`--font-l`)，副標題/重點為 `1rem` (`--font-m`)，一般描述/標籤為 `0.75rem` (`--font-s`)。
4. **資料驅動 UI (Data-Driven UI)**：
   - 若 `/data-assessment` 發現資料延遲嚴重（Staleness），禁止使用即時倒數組件，應改為靜態總結。
   - 地圖圖徵若超過 10,000 點，提醒需使用叢集或熱區圖，以免 WebGL 崩潰。

---

## 官方支援組件與圖表矩陣 (Supported Chart Types)

決策時請優先從以下官方現有組件中挑選，以確保實作相容性：

### 1. 比較與分佈 (Comparison & Distribution)
- **`BarChart` / `ColumnChart` (長條/柱狀圖)**：用於類別數值比較。**致命傷**：`ColumnChart` 最多只適合 12 個項目以內，過多會擠壓視覺。
- **`DonutChart` (甜甜圈圖)**：用於整體佔比。**致命傷**：切片超過 6 個極難閱讀，官方規範超過者需自動 Grouping。
- **`TreemapChart` (矩陣樹狀圖)**：用於大量面積或階層資料的相對佔比。**致命傷**：無法清楚表示時間變化。
- **`BarPercentChart`**：以極簡長條圖顯示單一百分比。

### 2. 時序資料 (Temporal Data)
- **`TimelineSeparateChart` / `TimelineStackedChart` (分離/堆疊時間線)**：用於顯示不同類別隨時間變化的趨勢或總量。**致命傷**：若資料點不連續，容易產生誤導。
- **`ColumnLineChart` (柱狀與折線複合圖)**：用於雙Y軸的不同性質數據（例如：溫度與降雨量）。**致命傷**：容易造成視覺錯覺。
- **`RidgelineAreaChart` / 分層面積圖（ApexCharts `area` small multiples）**：用多個同步 X 軸的 2D 面積圖呈現多個類別在同一時間或數值軸上的分佈形態，適合比較「不同族群/行政區/主題類別的曲線形狀」而非總量堆疊。**合規做法**：只能使用 ApexCharts `area`，以 CSS 垂直分層模擬 2.5D 視覺；資料格式對應 `three_d`（`x_axis` = 時間或數值區間、`y_axis` = 分層類別、`data` = 數值）。**致命傷**：不是真正 3D ridge/joyplot，也不是 additive stacked total；若使用者想比較精準數值大小，應優先使用 `TimelineSeparateChart` 或 `BarChart`。

### 3. 特規視覺化與基礎組件 (Specialized & Others)
- **`MetroChart` (捷運車廂圖)**：專門用於捷運車廂擁擠度之 2D 密度視覺化。
- **`DistrictChart` (行政區數據圖)**：將數據直接 Mapping 到雙北行政區域。
- **`HeatmapChart` (熱區圖)**：用於 3D 或網格化的事件密集度呈現。
- **`IndicatorChart` (燈號/指標圖)**：透過彩色燈號顯示數值是否落在特定預警範圍內。
- **`TextUnitChart` (文字與單位)**：極簡展示核心 KPI（數值＋單位＋描述）。**致命傷**：缺乏歷史對照 (YoY/MoM) 時無意義。
- **其他可用**：`GaugeChart`, `RadarChart`, `PolarAreaChart`, `BarChartWithGoal`, `IconPercentChart`。

---

## 官方支援地圖型態 (Supported Map Types)

若概念涉及地圖（Mapbox / Three.js），請從以下型態中挑選：

### 1. 基礎幾何 (Basic Geometry)
- **`Circle` (圓點)**：支援 `small`, `big`, 與 `heatmap` 變體。適合散佈數據。
- **`Fill` (多邊形)**：適合行政區或特定勢力範圍的上色。
- **`Line` (線段)**：支援 `wide` 與 `dash`。適合道路、管線。

### 2. 進階 3D (3D & Advanced)
- **`Fill-extrusion` (3D 建築/區塊)**：將平面區塊依數據高度擠出立體長方體。
- **`Symbol-3d` (3D 模型)**：搭配 Three.js 使用，如動態捷運模型。
- **`Arc` (3D 弧線)**：顯示兩點間的飛線關聯，支援漸層與流動動畫。

### 3. 資料驅動圖徵 (Data-Driven)
- **`Symbol` (圖示點)**：用於特定設施標示（如 `metro`, `youbike`, `bus`, `cctv`）。
- **`Voronoi` (沃羅諾伊圖/勢力範圍)**：依據點位自動生成最近服務範圍邊界。
- **`Isoline` (等高線)**：依據連續數值產生漸層等高線（如降雨量、溫度）。

---

## PRD 產出模板 (PRD Draft Template)

當概念收斂後，請嚴格按照以下格式輸出 PRD 草稿。這將作為移交 `/component-quick-validator` 的依據：

```markdown
# [專案名稱/組件名稱] PRD 草稿

## 1. 核心目標與資訊層級 (Core Objective & Hierarchy)
- **標題 (Title)**：[具體無歧義的標題]
- **目標受眾 (Audience)**：[誰要看這張圖？解決什麼痛點？]
- **資料來源 (Source)**：[API 或資料集名稱]
- **標籤 (Tags)**：[相關的分類標籤]

## 2. 視覺決策 (Visual Decision)
- **選定官方組件 (Chart Type)**：[例如：`ColumnLineChart` / 地圖 `Symbol-3d`]
- **選擇原因**：[為何選它？]
- **捨棄的方案與原因**：[簡述為何不用其他類型]

## 3. 數據規格與健康度前提 (Data Specification & Health)
- **維度 (X軸/分類)**：[例如：時間、行政區]
- **指標 (Y軸/數值)**：[例如：溫度、人數]
- **資料健康度前提 (Data Gate)**：[需確保 API 延遲正常，且已通過 `/data-assessment` 檢測孤兒率/偏移率]

## 4. 互動與樣式需求 (Interaction & Styling)
- **配色策略**：[符合深色底 `#090909`、強調亮藍 `#5a9cf8` 的原則]
- **互動**：[例如：Hover 時顯示詳細數據 Tooltip]

## 5. 跨技能設計注意事項 (Design Considerations)
- **排版與 RWD**：[提醒字體層級使用 `1.25rem` 或 `1rem`，以及手機版折疊策略]
- **無障礙與效能**：[地圖圖徵過多時的效能考量，或避免僅用紅綠區分的色盲考量]

## 6. 交接指示 (Handoff)
- [固定保留此段]：請攜帶本 PRD 草稿，呼叫 `/component-quick-validator` 進行原型組件的實作與驗證。
```
