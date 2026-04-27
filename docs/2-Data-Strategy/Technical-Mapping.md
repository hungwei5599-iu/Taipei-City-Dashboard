# 資料對接對位表與 RID 註冊庫 (Data Mapping & RID Registry) 🛰️

本文件為雙北儀表板資料整合的「唯一真值來源 (Single Source of Truth)」，旨在取代早期驗證中發現的過時或失效連結。

## 0. 查證與合規規則

- **Gemini research lane**：只能作為外部資料搜尋/整理助理，不可成為產品 AI，也不可直接決定資料是否進入正式組件。
- **Codex integration lane**：以本文件、官方資料頁、HTTP 抽樣、欄位 join proof 與比賽紅線做最後判斷。
- **產品 AI 邊界**：Demo/產品 AI 仍只允許 TWCC `llama3.3-ffm-70b-16k-chat` via Go proxy `/api/v1/ai/chat/twai`。
- **資料輸出格式**：正式組件只能映射到 `two_d`、`percent`、`three_d`、`map_legend`、`time`。
- **Mock/scenario 標示**：任何 mock、scenario、爬蟲補償或半靜態資料，都必須在 UI、資料欄位、Demo script 與 AI 回覆中明確標示。
- **data.taipei 注意**：舊式 `getDatasetInfo` / 部分 `/api/v1/dataset?...scope=resourceAquire` 不再可作為唯一驗證依據。優先使用官方 detail 頁揭露的 download/resource URL，並以 HTTP 抽樣確認。

---

## 🔴 核心即時軌跡 (Real-Time Tracks)

| 關鍵指標 | 負責單位 | RID / API 端點 | 資料格式 | 狀態 |
| :--- | :--- | :--- | :--- | :--- |
| **即時淹水感測** | 台北水利處 | `192f155c-15ba-4122-863a-23743f553a1c` | JSON/API | ✅ 已驗證 (含預埋雨水下水道備援) |
| **景點人潮燈號** | 台北觀傳局 | `https://travel.taipei/stream/alert-of-crowds/json` | JSON/API | ⚠️ 受阻 (Cloudflare 保護中，需 BE Proxy) |
| **全國急診即時** | 健保署 (NHI) | `https://info.nhi.gov.tw/api/inae4000/inae4001s01/SQL0002` | JSON/POST | ✅ 已驗證 (改用後端直接介接) |
| **台北市 AED** | 台北衛生局 | `cd050577-115f-4299-b37a-012ff490a632` / `438c61ad-24f6-4e54-a1cc-e2cfe0e7051e` | CSV download | ✅ 已驗證。`/api/v1/dataset?...scope=resourceAquire` 回 `[]`，正式 ETL 請用 download URL |
| **新北市 AED** | 新北衛生局 | `61B29F27-219A-4394-9722-AF97A5707598` | JSON/API | ✅ 已抽樣 200。現行欄位偏地址/行政區，座標需以官方頁或 API 全量再確認 |

---

## 🟠 熱島 / 高溫暴露與涼適資源

| 指標 | 負責單位 | RID / API 端點 | Join Key | 格式映射 | 狀態 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **高溫/熱暴露觀測** | 中央氣象署 | `O-A0001` 自動氣象站、`O-A0038` 溫度分布/格點資料（需 API key） | 測站座標或格點座標 → 行政區/里空間 join | `time` / `map_legend` | ⚠️ 候選。官方文件可證明欄位與產品類型，但需 API key 與 join proof |
| **台北市涼適點** | 台北環保局 | `a98a3e0e-a36f-43fa-82f8-b09a3011a47a` / `ae7e5986-859d-4294-b289-7c1b2e7c23f1` | `行政區`, `經度`, `緯度` | `map_legend` / `two_d` | ✅ 已抽樣 200，778 行含表頭，Big5 CSV |
| **新北涼適點** | 新北市府 | 未找到對等官方資料集 | - | - | 🚨 缺口。不可把台北涼適點直接宣稱為雙北資源 |
| **新北可替代冷卻/公共服務點** | 新北研考會 / 相關機關 | `04958686-1B92-4B74-889D-9F34409B272B` 新北市 NewTaipei 熱點、其他公共設施資料 | `district`, `latitude`, `longitude` | `map_legend` | ⚠️ 只能當「公共服務點 proxy」，不能宣稱冷卻資源 |

**Gate 判斷**：熱島首選題只有在「CWA 熱暴露層 + 雙北脆弱人口 + 台北涼適點/新北可解釋資源 proxy」能完成行政區或座標 join 時才可進入正式開發。若熱暴露或新北資源 proxy 無法成立，切換到災防/避難收容備案。

---

## 🟡 社經與脆弱性指標

### 1. 台北市人口結構 (高齡統計)
- **資料集 ID**: `64c8a3a0-3b9a-4f49-a13a-fb1eb2ffa4b1`
- **欄位對應**: `區域別` (行政區), `65歲以上數量` (計算各年齡加總)。

### 2. 新北市人口結構 (高齡統計)
- **資料集 ID**: `8308AB58-62D1-424E-8314-24B65B7AB492`
- **欄位對應**:
    - `field1`: 行政區 (District)
    - `percent2`: 總人口數
    - `percent28`: 65歲以上人口數 (Vulnerable Count)
    - `percent33`: 老化指數 (Aging Index)

### 3. 新北市各里人口 (里級 join 補強)
- **資料集 ID**: `5333CCA8-F9A7-446F-9B9A-92FEDE2FE04E`
- **欄位對應**:
    - `district`: 隸屬區
    - `village`: 里名
    - `home`: 戶數
    - `male` / `female` / `total`: 人口
- **狀態**: ✅ 已抽樣 200；可支援里級人口分母，但不含年齡結構。若要做高齡脆弱性，仍以年齡分配表為主。

---

## 🟢 韌性基礎設施處所

| 圖層屬性 | 負責單位 | RID / URL | Join Key | 格式映射 | 狀態 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **台北避難處所** | 台北教育局 | `aaf97773-3631-40e2-b3cc-da87bf2ce1d5` / `4c92dbd4-d259-495a-8390-52628119a4dd` | `鄉鎮`, `村里`, `門牌地址`, `容納人數` | `map_legend` / `two_d` | ✅ 既有驗證可用 |
| **新北避難收容處所** | 新北社會局 | `25E439AB-49E7-4E5E-85CE-A25C13FD2770` | `district`, `village`, `address`, `person`, `suit_for_weak`, 災型欄位 | `map_legend` / `two_d` / `percent` | ✅ 已抽樣 200 |
| **新北避難優先排序** | 新北社會局 | `E49BCBA9-47D0-436D-90CD-1F4EF12EC5C6` | `district`, `village`, `the_first_evacuation_shelter` | `two_d` / `map_legend` | ✅ 已抽樣 200；適合做里級避難推薦的「資料解釋」，不讓 AI 重新決定排序 |
| **新北防空疏散避難設施容量** | 新北警察局 | `3A9D87F0-9490-4021-8FC9-5045ECDD8D22` | `village`, `address`, `longitude`, `latitude`, `capacity` | `map_legend` / `two_d` | ✅ 已抽樣 200；容量大但用途不同，需標示為防空避難，不混同災害收容 |

**備案判斷**：災防/避難收容是目前最穩的正式開發題。資料官方性、雙北價值、join key、AI 邊界都比熱島更容易說清楚。

---

## 🔵 AED 與急診韌性

| 指標 | 負責單位 | RID / API 端點 | Join Key | 格式映射 | 狀態 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **台北 AED** | 台北衛生局 | `cd050577-115f-4299-b37a-012ff490a632` | `場所名稱`, `行政區域代碼`, `緯度`, `經度` | `map_legend` / `two_d` | ✅ 已抽樣 200，2775 行含表頭 |
| **新北 AED** | 新北衛生局 | `61B29F27-219A-4394-9722-AF97A5707598` | `std_name`: `location`<br>`std_addr`: `hosp_addr`<br>`std_district`: `district`<br>`std_lat`: `lat` (DE 補強)<br>`std_lng`: `lng` (DE 補強) | `map_legend` / `two_d` | ✅ DE 已完成座標補強。 |

---

## 🛠️ 雙北資料欄位標準對位表 (Schema Alignment)

為了確保 UI 與 AI 工具能無縫讀取雙北異質資料，定義以下標準映射規則：

### 1. AED 設施對位
| 標準欄位 (Standard) | 台北市原始欄位 | 新北市原始欄位 | 處理邏輯 |
| :--- | :--- | :--- | :--- |
| **std_id** | `_id` | `seqno` | ID 正規化 |
| **std_name** | `場所名稱` | `location` | UI 顯示標題 |
| **std_addr** | `場所地址` | `hosp_addr` | 詳細地址 |
| **std_district** | `行政區域代碼` | `district` | 台北需代碼轉中文 (e.g., 63000010 -> 松山區) |
| **std_lat** | `緯度` | `lat` | 新北由 DE Geocoding 補入 |
| **std_lng** | `經度` | `lng` | 新北由 DE Geocoding 補入 |
| **std_type** | `場所類型` | `type` | 設施分類 |

### 2. 避難收容處所對位
| 標準欄位 (Standard) | 台北市原始欄位 | 新北市原始欄位 | 處理邏輯 |
| :--- | :--- | :--- | :--- |
| **std_id** | `編號` | `no` | ID 正規化 |
| **std_name** | `場所名稱` | `name` | UI 顯示標題 |
| **std_addr** | `詳細地址` | `address` | 詳細地址 |
| **std_district** | `行政區` | `district` | 行政區名稱 |
| **std_village** | `里別` | `village` | 村里名稱 |
| **std_capacity** | `容納人數` | `person` | 數值型態轉換 |
| **std_lat** | `緯度` | `lat` | 新北由 DE Geocoding 補入 |
| **std_lng** | `經度` | `lng` | 新北由 DE Geocoding 補入 |

---

## 🛠️ 開發修復紀錄 (Data Engineering & BE Logic)

| **全國急診即時** | 健保署 | `https://info.nhi.gov.tw/api/inae4000/inae4001s01/SQL0002` | `hosP_NAME` → 醫院母表 join | `three_d` / `time` | ✅ 既有修補紀錄；只可做官方現況與 scenario 壓力測試 |
| **急診統計年資料** | 衛福部統計處 / data.gov.tw | `32030`, `32031`, `32032`, `32033` 等急診統計 | 年度、性別、年齡別、疾病別 | `time` / `three_d` | ⚠️ 年度統計，不支援即時調度；可當基準背景 |

---

## 🛠️ 開發修復紀錄 (Data Engineering & BE Logic)

為了確保上述資料在儀表板中能即時呈現，我們針對後端與資料處理層做了以下修補：

### 1. 後端工具處理器 (BE Tool Handler)
- **修改檔案**：`Taipei-City-Dashboard-BE/app/services/ai/tools/hackathon.go`
- **關鍵改動**：
    - **急診即時度 (C5)**：建立 `fetchNHIERStatus()` 函數。由於健保署 API 需使用 `POST` 請求並帶入特定的 JSON Body，我們放棄了現有 DAG 的靜態抓取，改由後端直接介接 JSON POST API 以獲取 15 分鐘一跳的即時數據。
    - **AED 點位 (C4)**：更新 RID 至 `cd050577`/`438c61ad`。修復了因資料庫舊 RID 404 導致的地圖空白問題。
    - **淹水監測 (C9)**：整合了淹水感測器與水位站的雙軌邏輯，確保在非颱風期間仍能顯示監測點位。

### 2. 資料診斷工具 (DE Helper Script)
- **新建立腳本**：`docs/2-Data-Strategy/Strategic-Assessment/data_profiler.py`
- **功能描述**：此 Python 腳本用於快速診斷政府資料集（data.taipei / data.ntpc）的連通性與編碼問題。支援自動轉碼（UTF-8/Big5）檢查，並能解析嵌套的 JSON 路徑，幫助隊友在開發前確認 RID 是否仍然有效。

### 3. 2026-04-23 抽樣查證紀錄

| 資料 | HTTP | 抽樣結果 | 主要發現 |
| :--- | :---: | :--- | :--- |
| 台北涼適點 download | 200 | 65,743 bytes / 778 CSV 行含表頭 | Big5；欄位含行政區、經緯度、開放時間、冷氣、飲水、座位、無障礙 |
| 台北 AED download | 200 | 473,723 bytes / 2775 CSV 行含表頭 | UTF-8 BOM；欄位含行政區域代碼、緯度、經度 |
| 台北 AED `/api/v1/dataset?...scope=resourceAquire` | 200 | `[]` | 不可當成資料不可用；需使用官方 detail download URL |
| 新北 AED JSON | 200 | `size=5` sample | 抽樣欄位偏地址/行政區/效期；正式前需確認座標欄是否在全量或 metadata 中 |
| 新北避難收容 JSON | 200 | `size=5` sample | 欄位含區、里、地址、容量、弱勢適用、災型適用 |
| 新北避難優先排序 JSON | 200 | `size=5` sample | 欄位含里名與一二三順位避難處所；適合做規則來源 |
| 新北防空避難容量 JSON | 200 | `size=5` sample；`data_profiler.py boundary size=50` | 欄位含村里、地址、經緯度、容量；50 筆抽樣 0% 缺漏、0% 海外漂移、100% 落在雙北樞紐範圍；與災害收容用途需分開 |
| 新北各里人口 JSON | 200 | `size=5` sample | 欄位含區、里、戶數、男女與總人口 |

---
**核對日期**: 2026-04-23
**核對人**: Codex 統籌 + Gemini research lane 嘗試（Gemini CLI 本輪未完成，官方來源由 Codex 直接查證）
