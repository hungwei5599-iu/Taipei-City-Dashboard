# BE 資料庫對接指南

> 給後端工程師的一頁紙。DE 已跑好資料，你只需要做這三件事。

---

## Step 1：設定 .env

在 `Taipei-City-Dashboard-BE/.env` 加入（或確認已有）：

```env
DB_DASHBOARD_HOST=10.101.3.177
DB_DASHBOARD_PORT=5433
DB_DASHBOARD_USER=postgres
DB_DASHBOARD_PASSWORD=postgres
DB_DASHBOARD_DBNAME=dashboard
DB_DASHBOARD_SSLMODE=disable
```

> 這對應 `global/global.go` 的 `PostgresDashboard`，`database.go` 的 `DBDashboard` 就是這條連線。

---

## Step 2：在 query_charts 新增 SQL query

BE 透過 `query_charts` table 抓 SQL，不用改 Go 程式碼。

### C1：雙北藝文活動地圖

```sql
-- 在 postgres-manager (port 5432, DB: dashboard_manager) 執行
INSERT INTO query_charts (index, city, query_type, query_chart)
VALUES (
  'hackathon_c1',   -- 對應 components.index
  'Taipei',
  'map_legend',
  'SELECT title AS name, ''symbol'' AS type, ''art'' AS icon, 1 AS value
   FROM hackathon_component_1_event_map_ready
   LIMIT 500'
);
```

> ⚠️ C1 是地圖組件，前端需要完整資料（含座標），建議改用 custom API endpoint（見 Step 3）。

### C8：避難收容缺口

```sql
INSERT INTO query_charts (index, city, query_type, query_chart)
VALUES (
  'hackathon_c8',
  'Taipei',
  'two_d',
  'SELECT district_name AS x_axis, capacity_gap_abs AS data
   FROM hackathon_component_8_shelter_gap_ready
   WHERE city_scope = ''Taipei''
   ORDER BY capacity_gap_abs DESC'
);
```

---

## Step 3：C1 地圖需要 custom endpoint（座標用）

C1 沒有 `wkb_geometry`，前端需要 lat/lng 自組 GeoJSON。在 `componentData.go` 加：

```go
// EventMapData — C1 藝文活動地圖點位
type EventMapData struct {
    Title        string  `gorm:"column:title"         json:"title"`
    LocationName string  `gorm:"column:location_name" json:"location_name"`
    Latitude     float64 `gorm:"column:latitude"      json:"latitude"`
    Longitude    float64 `gorm:"column:longitude"     json:"longitude"`
    EventTime    string  `gorm:"column:event_time"    json:"event_time"`
    OnSales      bool    `gorm:"column:on_sales"      json:"on_sales"`
}

func GetEventMapData() ([]EventMapData, error) {
    var result []EventMapData
    err := DBDashboard.
        Table("hackathon_component_1_event_map_ready").
        Select("title, location_name, latitude, longitude, event_time, on_sales").
        Where("latitude IS NOT NULL AND longitude IS NOT NULL").
        Find(&result).Error
    return result, err
}
```

在 `controllers/componentData.go` 或新增 controller 加：

```go
func GetCulturalEventMap(c *gin.Context) {
    data, err := models.GetEventMapData()
    if err != nil {
        c.JSON(500, gin.H{"error": err.Error()})
        return
    }
    c.JSON(200, gin.H{"data": data})
}
```

在 `routes/router.go` 掛路由：

```go
r.GET("/api/v1/hackathon/cultural-events", GetCulturalEventMap)
```

---

## Step 4：快速驗證

```bash
# 確認 DB 有資料
psql -h 10.101.3.177 -p 5433 -U postgres -d dashboard \
  -c "SELECT COUNT(*) FROM hackathon_component_1_event_map_ready;"
# 期望：645

psql -h 10.101.3.177 -p 5433 -U postgres -d dashboard \
  -c "SELECT COUNT(*) FROM hackathon_component_8_shelter_gap_ready;"
# 期望：21

# 啟動 BE 後測試 API
curl http://localhost:8080/api/v1/hackathon/cultural-events | jq '.data | length'
```

---

## 連線資訊速查

| | postgres-data（ETL 資料） | postgres-manager（儀表板設定） |
|---|---|---|
| Host | `10.101.3.177` | `10.101.3.177` |
| Port | `5433` | `5432` |
| DB | `dashboard` | `dashboard_manager` |
| User/Pass | `postgres` / `postgres` | `postgres` / `postgres` |
| pgAdmin | `http://10.101.3.177:8889`（admin@admin.com / admin123） | |

---

*更新：2026-04-22 ｜ 如有問題找 PM：羅浚*
