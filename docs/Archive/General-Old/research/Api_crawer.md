結論先講：

**不要先寫畫面爬蟲。先做「API inventory crawler」。GitHub 有一半答案，但沒有完整的 live inventory。**

原因很直接。

官方文件已明確寫出，組件不是散落在前端檔案，而是由資料庫中的四張表組成：`components`、`query_charts`、`component_charts`、`component_maps`。其中 `component_charts.types` 本身就是陣列，代表**一個組件可以對應多種圖表型態**；`query_charts` 也同時帶有 `history_config`、`map_config`、`map_filter`、`update_freq`、`source`、`use_case`、`city` 等欄位。換句話說，GitHub/官方文件很適合拿來理解**結構**，但不保證你能只靠 repo 還原**目前站上所有實際在跑的組件清單**。([臺北城市儀表板][1])

而且前端不是讀本地 JSON。前端 store 會呼叫 `/dashboard/`、`/dashboard/{index}`、`/component/{id}/chart`、`/component/{id}/history` 去拉資料；後端 controller 也確實是從資料庫取 dashboard 與 component 設定再回傳。這表示正式站上的內容是**runtime inventory**，不是單純 repo 內一份靜態設定檔。  

所以答案是：

## 你應該做什麼

### 1. 先用 GitHub / 官方文件，建立「欄位模型」

這一步不是為了盤點全部，而是為了知道之後要抓哪些欄位。至少抓：

* dashboard index
* dashboard name
* city
* component id
* component index
* component name
* chart types
* map config type
* history_config
* update_freq / update_freq_unit
* source
* use_case
* short_desc / long_desc
* contributors
* links

這些欄位都已在官方文件的 component DB 結構裡。([臺北城市儀表板][1])

### 2. 再寫「API inventory crawler」

不要爬 DOM，不要先上 Playwright。先走 API。

原因：

* 穩定
* 結構化
* 可直接拿來做缺口分析
* 不會被前端版型或 lazy-load 影響
* 能抓到 chart type / history / source / update freq，這些畫面上常看不到

### 3. 只有在 API 拿不到時，才補「畫面截圖爬蟲」

畫面爬蟲只適合補：

* 卡片排序
* 實際呈現版型
* 是否有圖表 / 地圖同頁並存
* 截圖留證

它不適合當主 inventory source。

---

## GitHub 到底有沒有

**有，但不完整。**

GitHub/官方文件有的是：

* 系統目的與定位：協助政策決策、對市民公開重要城市統計、推廣開放資料應用。([GitHub][2])
* 組件資料模型：component / chart / map / query 的 schema。([臺北城市儀表板][1])
* 後端 API 路由與控制器邏輯：dashboard、component、chart、history 都是從資料庫動態取。 

GitHub/官方文件**沒有保證**給你的：

* 目前 production 上全部 dashboard 的完整實際清單
* 每個 dashboard 目前掛了哪些 component
* 哪些組件已下架、隱藏、換城市版本
* 現在 live 站真的顯示哪些 chart 組合

所以你的最佳策略不是「GitHub 或爬蟲二選一」，而是：

**GitHub 定義模型，API crawler 抓實際 inventory。**

---

## 你真正要找的「缺口」怎麼定義

你現在不是在找「還能做什麼炫的圖表」，你是在找：

**現有儀表板沒有覆蓋、覆蓋不完整、或只展示但不能支持決策的部分。**

我建議把缺口分成 6 類。

### 1. 主題缺口 Topic Gap

這個政府關心的主題，有沒有被做成 dashboard / component。

從官方站可見的公共主題來看，核心類別包含：

* 捷運系統
* 道路交通
* 共享單車
* 都市規劃
* 城市建設
* 婦幼資源
* 為民服務
* 氣候變遷
* 防災都市
* 健康守護
* 商圈活化
* 圖資資訊
  雙北也有務實交通、防災都市、健康守護、商圈活化、圖資資訊。這已經很清楚反映政府想看的 dashboard 核心不是娛樂型資料，而是**交通、風險、健康、空間治理、民生服務、商業活力**。([臺北城市儀表板][3])

### 2. 決策缺口 Decision Gap

有資料展示，但不能支援決策。

例如只有：

* 當前值
* 地圖點位
* 排行榜

卻沒有：

* 閾值判斷
* 歷史比較
* 行動建議
* 區域優先序
* 跨局處協同意義

這種就是「看得到，決不了」。

### 3. 時間缺口 Temporal Gap

有 current，但沒有：

* history
* trend
* forecast
* event before/after comparison

而官方 schema 本來就有 `history_config`、`time_from`、`time_to`、`update_freq`，所以這類缺口是可以被明確盤點的。([臺北城市儀表板][1])

### 4. 空間缺口 Spatial Gap

有數值沒有地圖，或有地圖沒有行政區／里／熱區切換。

對政府來說，空間判讀通常比單純 KPI 更重要，因為資源配置、巡查、應變、稽查都落在地理位置上。官方現有主題大量使用 map / tune map，也顯示空間圖層是核心語言。([臺北城市儀表板][3])

### 5. 行動缺口 Operational Gap

有圖，但沒有 operational meaning。

例如缺少：

* 資料更新頻率
* 資料來源可信度
* 使用場景 use_case
* 責任單位／貢獻者
* 連外部處置流程

而這些欄位其實都在 schema 裡，所以可以被盤點成「有欄位但沒被用好」。([臺北城市儀表板][1])

### 6. 受眾缺口 Audience Gap

同一組資料，市民要看的和局處長官要看的不一樣。

官方 repo 明講平台同時有兩個目的：**政策決策**與**市民資訊公開**。這代表同一主題若只做成公眾展示，很可能還缺少「決策版」視角。([GitHub][2])

---

## 政府想看的儀表板核心是什麼

從官方定位與現有主題結構來看，核心不是「有很多圖」，而是下面五件事：

### 1. 現況監測

現在發生什麼。
例如運量、壅塞、風險點、設施分布、當前狀態。([臺北城市儀表板][3])

### 2. 空間定位

問題發生在哪裡。
政府最需要把問題投到地圖上，而不是只看一個總平均。([臺北城市儀表板][3])

### 3. 趨勢變化

比昨天、上週、過去一段時間是變好還是變差。
這對政策成效與異常監測都必要，而 schema 也預留了 history config。([臺北城市儀表板][1])

### 4. 資源配置

哪裡要優先投資、稽查、巡檢、應變、宣導。
這是「dashboard 走向治理工具」的關鍵。

### 5. 對外說明

除了局處內部用，還要能對民眾說明城市狀態與治理成果。官方站明確把這點寫成平台目的之一。([GitHub][2])

---

## 最佳實作路線

### 路線判定

**先不要寫 Selenium / Playwright 視覺爬蟲。**
先寫一支能輸出 CSV/JSON 的 API crawler。

### 你要產出的 inventory 表

至少這些欄位：

```text
topic
dashboard_city
dashboard_index
dashboard_name
component_id
component_index
component_name
chart_types
map_layer_count
map_layer_types
has_history
update_freq
source
use_case
short_desc
links
contributors
```

### 你做完後能回答的問題

* 這個主題以前做過沒有
* 做到哪一層：KPI / trend / map / resource / action
* 哪些主題在台北有、雙北沒有
* 哪些組件只有展示、沒有決策性
* 哪些組件有資料但沒有歷史軸
* 哪些政府核心主題完全沒被覆蓋

---

## 最小決策

**現在就做，但做 API inventory crawler，不做 DOM crawler。**

因為：

* GitHub 有 schema，沒有完整 live inventory。([臺北城市儀表板][1])
* 組件與圖表配置本來就在 DB 表中，而且圖表型態可多值。([臺北城市儀表板][1])
* 前後端都是靠 API 動態取 dashboard / component / chart / history。  
* 你的目標是找缺口，不是做視覺還原。API inventory 才能直接進到缺口分析。

下一步最合理的是：我直接幫你定義這支 crawler 的輸出 schema、掃描流程、以及「缺口分析矩陣」。

[1]: https://citydashboard.taipei/documentation/back-end/components-db?utm_source=chatgpt.com "文件｜臺北城市儀表板"
[2]: https://github.com/taipei-doit/Taipei-City-Dashboard?utm_source=chatgpt.com "GitHub - taipei-doit/Taipei-City-Dashboard: The Open-Source Repository of Taipei City Dashboard. Try it out by clicking the link below!"
[3]: https://citydashboard.taipei/mapview?city=taipei&index=planning&utm_source=chatgpt.com "臺北城市儀表板"
