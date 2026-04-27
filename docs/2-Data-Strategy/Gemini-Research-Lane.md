# Gemini Research Lane — 官方資料深挖與 Codex 審核流程

本文件把「Gemini 作為資料搜尋助理、Codex 作為統籌審核者」落成可交接流程。它不改變比賽 AI 紅線：產品與 Demo 內的 AI 只能使用 TWCC `llama3.3-ffm-70b-16k-chat`，Gemini 只可作為開發期外部研究助理。

## 1. 分工邊界

| Lane | 可以做 | 不可以做 | 產出 |
| :--- | :--- | :--- | :--- |
| Gemini research lane | 搜尋官方資料頁、整理候選資料欄位、標記 API key/Cloudflare/爬蟲風險 | 決定正式採用、替產品產生 AI 回覆、替代 TWCC | 候選資料表、待查證清單 |
| Codex integration lane | 讀 repo 規格、查官方來源、HTTP 抽樣、決定格式映射、更新文件 | 不可把未查證的 Gemini 結論直接寫成「已驗證」 | `Technical-Mapping.md`、題目 gate、資料缺口表 |

## 2. Gemini 呼叫紀錄

- 指令：`./scripts/ask-gemini-safe.sh "<official-source research prompt>"`
- 時間：2026-04-23
- 結果：Gemini CLI 在本輪互動呼叫超過 2 分鐘未回覆，已中止。
- 判讀：符合既有風險，`oauth-personal` / TTY 模式可能在 Codex 子程序卡住。不得把這次 Gemini 呼叫視為已完成研究。
- 替代路徑：由 Codex 直接用官方資料頁與 HTTP 抽樣完成本輪查證。

## 3. 官方候選資料表

| 主題 | 資料 | URL / ID | 更新頻率 | Join Key | 格式映射 | 風險 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 熱島 | CWA 自動氣象站 / 溫度分布 | `O-A0001`, `O-A0038` | 依 CWA 產品 | 測站/格點座標 | `time`, `map_legend` | 需 API key；需把測站/格點轉行政區或里 |
| 熱島 | 臺北市涼適點 | `a98a3e0e-a36f-43fa-82f8-b09a3011a47a` | 不定期 | 行政區、經緯度 | `map_legend`, `two_d` | Big5 CSV；新北缺對等資料 |
| 熱島 | 新北市各里人數排行榜 | `5333CCA8-F9A7-446F-9B9A-92FEDE2FE04E` | 每月 | district, village | `two_d`, `percent` | 只有總人口，不含年齡 |
| 災防 | 臺北市可供避難收容處所 | `aaf97773-3631-40e2-b3cc-da87bf2ce1d5` | 不定期 | 鄉鎮、村里、地址 | `map_legend`, `two_d` | 地址需正規化 |
| 災防 | 新北市避難收容處所一覽表 | `25E439AB-49E7-4E5E-85CE-A25C13FD2770` | 每年 | district, village, address | `map_legend`, `two_d`, `percent` | 可用；最穩備案核心資料 |
| 災防 | 新北市避難收容處所優先排序自主檢核表 | `E49BCBA9-47D0-436D-90CD-1F4EF12EC5C6` | 每年 | district, village | `two_d`, `map_legend` | AI 只能解釋既有排序，不可重排 |
| 災防 | 新北市防空疏散避難設施數量及容量 | `3A9D87F0-9490-4021-8FC9-5045ECDD8D22` | 不定期 | village, address, lat/lon | `map_legend`, `two_d` | 防空用途與災害收容用途不同，需標示 |
| AED/急診 | 臺北市 AED | `cd050577-115f-4299-b37a-012ff490a632` | 每月 | 行政區域代碼、緯度、經度 | `map_legend`, `two_d` | `/api/v1/dataset` 回空，需用 download URL |
| AED/急診 | 新北市公共場所 AED | `61B29F27-219A-4394-9722-AF97A5707598` | 不定期 | district, address | `map_legend`, `two_d` | 抽樣未見座標，需全量/metadata 複查 |
| AED/急診 | NHI 急診即時 | `info.nhi.gov.tw/api/inae4000/.../SQL0002` | 15 分鐘級 | hospital name | `three_d`, `time` | 僅後端介接；不可宣稱 AI 自動調度 |

## 4. 題目通行 Gate

1. **熱島 + 脆弱族群 + 涼適/避難資源**
   - 通行條件：CWA 熱暴露層可轉行政區/里，且新北資源 proxy 可被清楚標示。
   - 降級條件：找不到新北對等涼適資料時，必須改稱「台北涼適點 + 新北公共/避難資源 proxy」，不可宣稱完整雙北涼適點。

2. **災防 + 避難收容缺口**
   - 通行條件：雙北避難收容容量、服務里、災型適用欄位可正規化。
   - 推薦狀態：最穩備案。官方性、雙北價值、AI 邊界都清楚。

3. **AED + 急診韌性**
   - 通行條件：雙北 AED 座標/地址 join 可用，NHI 急診只能作現況或壓力測試背景。
   - 降級條件：新北 AED 座標缺漏時改地址 geocode 或只做行政區統計，不做精準點位地圖。

## 5. 下一步

- 先補 CWA API key 與熱暴露 join proof。
- 若熱島 join proof 無法在一個工作段落內完成，切到災防/避難收容缺口。
- 將所有 mock/scenario 欄位加入 `source_mode`：`official`, `official_proxy`, `scenario`, `mock`, `derived`。
