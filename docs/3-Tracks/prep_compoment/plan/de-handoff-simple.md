# DE 交接快速指南（給 daniel）

> 這是給你的「一頁紙合約」。你不需要讀任何其他文件，只要照這份做就對了。

---

## 你的任務清單（照順序做）

- [ ] **任務 1**：為 `ETL.py` 加入 `extract_api()` 函式，讓它能吃 `RID` 或 `endpoint` 參數直接拉資料
- [ ] **任務 2**：跑「文化共榮」資料集驗證（C1 藝文活動，見下方），確認資料可用
- [ ] **任務 3**：ETL 跑完後，加一步 `load_to_db()` 把結果寫進 PostgreSQL（表名格式：`hackathon_component_X_ready`）
- [ ] **任務 4**：C1 完成後，照同樣流程處理 C3、C8（見下方各組件規格）

---

## 組件對接表（你需要知道的 10 個組件）

### 🟢 可直接跑 ETL 的（資料已驗證）

| 組件 | 名稱 | 資料來源 | 端點 / RID | 輸出表名 |
|------|------|----------|-----------|---------|
| C1 | 雙北藝文活動地圖 | cloud.culture.tw | `https://cloud.culture.tw/frontsite/trans/SearchShowAction.do?method=doFindTypeJ&category=1` | `hackathon_component_1_event_map_ready` |
| C4 | AED 急救地圖 | data.taipei | RID: `cd050577-0f57-410a-9d95-885141040339` | `hackathon_component_4_aed_ready` |
| C5 | 急診即時壅塞 | 健保署 NHI | POST `https://info.nhi.gov.tw/api/inae4000/inae4001s01/SQL0002` | `hackathon_component_5_er_ready` |
| C8 | 避難收容缺口 | data.taipei + data.ntpc | 台北RID:`aaf97773` / 新北RID:`25E439AB` | `hackathon_component_8_shelter_gap_ready` |
| C9 | 淹水監測 | data.taipei | RID: `192f155c-15ba-4122-863a-23743f553a1c` | `hackathon_component_9_flood_risk_ready` |

### 🟡 需要欄位映射再跑（你來定義映射規則）

| 組件 | 名稱 | 問題 | 你要做什麼 |
|------|------|------|-----------|
| C3 | 文化設施密度比較 | 雙北欄位名稱不一致 | 統一欄位名稱後輸出 |
| C6 | 食安健康 | 雙北格式不同 | 定義映射表後輸出 |

### 🔴 不是資料問題，是邏輯問題（先跳過，等 PM 定義）

| 組件 | 說明 |
|------|------|
| C2 | 景點人潮——需要 BE Proxy，你不用動 |
| C7 | 防災情境切換——邏輯資料集，PM + BE 定義 |
| C10 | 決策建議——邏輯資料集，PM + BE 定義 |

---

## C1 藝文活動：第一個目標的詳細規格

### 資料來源
```
GET https://cloud.culture.tw/frontsite/trans/SearchShowAction.do?method=doFindTypeJ&category=1
```

### 你需要的欄位
```
title           → 活動名稱
showInfo[].latitude   → 緯度（WGS84）
showInfo[].longitude  → 經度（WGS84）
showInfo[].time       → 時間
showInfo[].locationName → 地點名稱
category        → 類別
onSales         → 是否售票中
```

### 輸出表結構（PostgreSQL）
```sql
CREATE TABLE hackathon_component_1_event_map_ready (
    id              SERIAL PRIMARY KEY,
    title           TEXT,
    location_name   TEXT,
    latitude        FLOAT,
    longitude       FLOAT,
    event_time      TEXT,
    category        TEXT,
    on_sales        BOOLEAN,
    source_trace    TEXT DEFAULT 'cloud.culture.tw',
    data_mode       TEXT DEFAULT 'real',
    last_updated    TIMESTAMP DEFAULT NOW()
);
```

### 驗收條件
- [ ] `SELECT COUNT(*) FROM hackathon_component_1_event_map_ready` 回傳 > 0
- [ ] `latitude` / `longitude` 不是 NULL
- [ ] BE 的 `summarize_events` tool 可以 query 到資料

---

## C8 避難收容缺口：最重要的組件

### 資料來源（兩個城市要合併）

**台北市收容處所**
```
RID: aaf97773-3631-40e2-b3cc-da87bf2ce1d5
GET https://data.taipei/api/v1/dataset/aaf97773-3631-40e2-b3cc-da87bf2ce1d5?scope=resourceAquire
```

**新北市收容處所**
```
RID: 25E439AB-49E7-4E5E-85CE-A25C13FD2770
GET https://data.ntpc.gov.tw/api/datasets/25E439AB-49E7-4E5E-85CE-A25C13FD2770/json?size=1000
```

**台北市人口結構**
```
RID: 64c8a3a0-3b9a-4f49-a13a-fb1eb2ffa4b1
欄位：區域別, 65歲以上數量
```

**新北市人口結構**
```
RID: 8308AB58-62D1-424E-8314-24B65B7AB492
欄位：field1（行政區）, percent28（65歲以上人口數）
```

### 衍生欄位計算
```python
capacity_gap_abs = vulnerable_population_65p - shelter_capacity
capacity_gap_ratio = capacity_gap_abs / vulnerable_population_65p  # 僅當分母 > 0

# support_status 判斷
if capacity_gap_abs <= 0:      status = 'surplus'
elif capacity_gap_ratio < 0.1: status = 'tight'
elif capacity_gap_ratio < 0.3: status = 'gap'
else:                          status = 'critical_gap'
```

### 輸出表結構
```sql
CREATE TABLE hackathon_component_8_shelter_gap_ready (
    id                        SERIAL PRIMARY KEY,
    city_scope                TEXT,       -- 'Taipei' or 'NewTaipei'
    district_name             TEXT,
    shelter_count             INT,
    shelter_capacity          INT,
    vulnerable_population_65p INT,
    capacity_gap_abs          INT,
    capacity_gap_ratio        FLOAT,
    support_status            TEXT,       -- surplus/tight/gap/critical_gap
    source_trace              TEXT,
    data_mode                 TEXT DEFAULT 'real',
    last_updated              TIMESTAMP DEFAULT NOW()
);
```

---

## 對接確認清單（你做完、我來驗）

每完成一個組件，在這邊打勾並告訴組長：

- [ ] C1 藝文活動：資料已寫入 DB，筆數 > 0
- [ ] C3 文化設施：欄位映射規則已定義
- [ ] C4 AED：資料已寫入 DB
- [ ] C5 急診：資料已寫入 DB（注意：需 POST 請求）
- [ ] C8 避難缺口：雙北合併資料已寫入 DB，`support_status` 有值
- [ ] C9 淹水：資料已寫入 DB

---

## 注意事項

1. **C5 急診** 是 POST 請求，不是 GET，記得在 `extract_api()` 支援 POST
2. **C2 景點人潮** 有 Cloudflare 保護，你不用處理，BE 那邊會直接 proxy
3. **輸出表名** 格式必須是 `hackathon_component_X_ready`，BE 會直接 query 這個表名
4. 有問題直接問組長，不要自己猜欄位映射

---

*最後更新：2026-04-21 | 組長：羅浚*
