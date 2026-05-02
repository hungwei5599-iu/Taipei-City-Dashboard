# AI Guide 互動增強 BE Spec

> 目標：讓 AI 不只「讀 dashboard/chart 資料後回答」，還能透過結構化 payload 控制地圖物件、候選清單、互動卡片與後續事件。
>
> 本文件聚焦 BE contract。FE 不應解析自然語言來操作地圖，而是執行 BE 回傳的 `ui_actions` 與註冊 `interaction_model`。

---

## 0. TL;DR

目前 AI 可以根據 chart/component data 回答問題。要做到「跟地圖物件互動」，BE response 需要從純文字導覽升級成：

```json
{
  "answer": "...",
  "ui_actions": [],
  "interaction_model": {},
  "warnings": []
}
```

核心分工：

```txt
ui_actions         這一輪回答後 FE 需要立即執行的 UI 指令
interaction_model  FE 對這批地圖物件要綁定的 hover/click/filter/quick action 規則
GeoJSON properties 讓 FE 不打 BE 也能顯示 tooltip、popup、候選清單
/guide/event       使用者後續互動需要 BE 重新計算時才呼叫
```

重要原則：

```txt
LLM 負責判斷意圖與生成回答文字。
BE deterministic builder 負責排序、狀態判斷、GeoJSON、ui_actions。
FE 負責執行 command 與本地互動。
LLM 不直接產生 layerId、座標、Mapbox filter 或 route payload。
```

---

## 1. Route

### 1.1 Chat Guide

沿用既有 TWCC chat endpoint，透過 guide mode 回傳結構化 response。

```http
POST /api/v1/ai/chat/twai
```

建議 request 補上：

```json
{
  "session_id": "session_demo_001",
  "mode": "dashboard_guide",
  "topic": "emergency",
  "message": "幫我看附近哪間急診人比較少，還有空床",
  "context": {
    "dashboard_index": "health_response",
    "current_route": "/dashboard",
    "locale": "zh-TW",
    "timezone": "Asia/Taipei",
    "map": {
      "center": [121.5432, 25.0478],
      "zoom": 13.5,
      "bounds": [[121.48, 25.01], [121.59, 25.09]]
    },
    "visible_layers": ["component_9"],
    "selected_feature_id": null
  }
}
```

### 1.2 Interaction Event

使用者已拿到第一輪 AI guide response 後，若後續互動需要 BE 重新計算，呼叫：

```http
POST /api/v1/ai/guide/event
```

可以視前端既有 routing 另加 alias：

```http
POST /ai-guide/event
```

但 canonical route 以 `/api/v1/ai/guide/event` 為準。

---

## 2. Response Envelope

所有 guide response 使用一致 envelope：

```json
{
  "status": "success",
  "data": {
    "session_id": "session_demo_001",
    "request_id": "guide_20260502_143000_001",
    "answer": "已標出附近 3 間急診醫院。A 醫院目前等待人數較低且仍有空床。",
    "topic": "emergency",
    "module_key": "emergency",
    "component_key": "component_9",
    "data_timestamp": "2026-05-02T14:30:00+08:00",
    "tool_steps": [],
    "insight_cards": [],
    "mini_charts": [],
    "comparison_tables": [],
    "follow_up_questions": [],
    "ui_actions": [],
    "interaction_model": null,
    "warnings": [],
    "error_code": null,
    "debug": null
  }
}
```

Rules:

```txt
answer 必填，不可為空字串。
ui_actions 必填，無動作時回空陣列。
warnings 必填，無警告時回空陣列。
interaction_model 可為 null；若有 map.add_points，建議提供。
error_code 成功時為 null；no-data/partial failure 要給 machine-readable code。
debug 預設 null，只在 dev/test 模式回傳。
```

---

## 3. UI Actions

`ui_actions` 是「FE 收到 response 後立即依序執行」的命令列。順序有意義。

```ts
type UiAction = {
  id: string;
  type:
    | "map.clear_ai_overlay"
    | "map.add_points"
    | "map.fit_bounds"
    | "map.fly_to"
    | "map.open_card"
    | "map.highlight_feature"
    | "map.set_filter"
    | "map.add_route"
    | "chart.focus_component"
    | "panel.open_candidate_list"
    | "panel.open_compare"
    | "dialog.notify";
  payload: Record<string, unknown>;
};
```

Rules:

```txt
id 在單一 response 內不可重複。
FE 遇到未知 action type 應 console.warn 並略過，不可 crash。
地圖 overlay 建議順序：clear -> add_points -> fit_bounds -> open_card/panel。
BE 不回 Mapbox style 內部細節，除非它是明確 contract 的 payload。
```

### 3.1 `map.clear_ai_overlay`

清除上一輪 AI guide 建立的地圖圖層、source、route、highlight、popup。

```json
{
  "id": "cmd_clear_emergency",
  "type": "map.clear_ai_overlay",
  "payload": {
    "scope": "ai-guide"
  }
}
```

### 3.2 `map.add_points`

新增 AI guide 點位圖層。

```json
{
  "id": "cmd_add_emergency_points",
  "type": "map.add_points",
  "payload": {
    "sourceId": "ai-guide-emergency-hospitals",
    "layerId": "ai-guide-emergency-hospitals-circle",
    "featureIdProperty": "hospital_id",
    "geojson": {
      "type": "FeatureCollection",
      "features": []
    }
  }
}
```

Rules:

```txt
geojson 必須是 valid FeatureCollection。
Point coordinates 使用 [lng, lat]。
featureIdProperty 要對應每個 feature.properties 的唯一 id 欄位。
若 features 為空，不應回 fit_bounds/open_card。
```

### 3.3 `map.fit_bounds`

把地圖視角移到候選點集合。

```json
{
  "id": "cmd_fit_emergency",
  "type": "map.fit_bounds",
  "payload": {
    "bounds": [[121.5301, 25.0392], [121.552, 25.055]],
    "padding": 90,
    "duration": 800
  }
}
```

### 3.4 `map.fly_to`

飛到單一候選點。

```json
{
  "id": "cmd_fly_hospital_b",
  "type": "map.fly_to",
  "payload": {
    "center": [121.552, 25.055],
    "zoom": 15,
    "pitch": 35
  }
}
```

### 3.5 `map.open_card`

在地圖上開資訊卡。

```json
{
  "id": "cmd_open_hospital_a",
  "type": "map.open_card",
  "payload": {
    "coordinate": [121.5432, 25.0478],
    "feature_id": "hospital_a",
    "title": "待補醫院 A",
    "summary": "等待人數 18 人，急診空床 6 / 28，距離約 820 公尺。",
    "fields": [
      { "label": "等待人數", "value": "18" },
      { "label": "急診空床", "value": "6 / 28" }
    ]
  }
}
```

### 3.6 `map.highlight_feature`

高亮某個地圖點位，常用於「點聊天文字後同步地圖」。

```json
{
  "id": "cmd_highlight_hospital_a",
  "type": "map.highlight_feature",
  "payload": {
    "layerId": "ai-guide-emergency-hospitals-circle",
    "sourceId": "ai-guide-emergency-hospitals",
    "featureId": "hospital_a",
    "featureIdProperty": "hospital_id"
  }
}
```

### 3.7 `map.set_filter`

套用 Mapbox filter。若只是使用者按 filter chip，FE 可本地執行，不一定打 BE。

```json
{
  "id": "cmd_filter_has_beds",
  "type": "map.set_filter",
  "payload": {
    "layerId": "ai-guide-emergency-hospitals-circle",
    "filter": [">", ["get", "emergency_available_beds"], 0]
  }
}
```

### 3.8 `map.add_route`

若沒有真實路網服務，只能回直線輔助線，不能宣稱為實際道路路線。

```json
{
  "id": "cmd_route_hospital_a",
  "type": "map.add_route",
  "payload": {
    "sourceId": "ai-guide-route",
    "layerId": "ai-guide-route-line",
    "route_type": "straight_line",
    "coordinates": [
      [121.54, 25.045],
      [121.5432, 25.0478]
    ],
    "summary": "直線距離約 820 公尺，非實際道路路線。"
  }
}
```

### 3.9 `panel.open_candidate_list`

開啟候選清單。清單 item 點擊後由 FE 執行 `map.fly_to + map.open_card`。

```json
{
  "id": "cmd_open_candidate_list",
  "type": "panel.open_candidate_list",
  "payload": {
    "title": "附近急診候選",
    "items": [
      {
        "feature_id": "hospital_a",
        "title": "待補醫院 A",
        "subtitle": "等待 18 人｜空床 6 / 28｜820 公尺",
        "status_level": "ok",
        "coordinate": [121.5432, 25.0478]
      }
    ]
  }
}
```

### 3.10 `panel.open_compare`

開啟比較表。

```json
{
  "id": "cmd_compare_top3",
  "type": "panel.open_compare",
  "payload": {
    "title": "急診候選比較",
    "columns": ["醫院", "等待人數", "空床", "距離", "資料時間"],
    "rows": [
      ["待補醫院 A", "18", "6 / 28", "820 公尺", "14:30"],
      ["待補醫院 B", "35", "2 / 24", "1.4 公里", "14:30"]
    ]
  }
}
```

### 3.11 `dialog.notify`

顯示提示或安全警告。

```json
{
  "id": "cmd_emergency_notice",
  "type": "dialog.notify",
  "payload": {
    "status": "info",
    "message": "若有立即危及生命的狀況，請直接撥打 119。"
  }
}
```

---

## 4. Interaction Model

`interaction_model` 描述這批地圖物件「之後怎麼互動」。

```ts
type InteractionModel = {
  version: 1;
  target_layer_id?: string;
  feature_id_property?: string;
  hover?: {
    type: "tooltip";
    template: string;
  };
  click?: {
    type: "open_card" | "emit_event";
    template?: string;
    event_type?: string;
  };
  select?: {
    enabled: boolean;
    mode: "single" | "multi";
  };
  filters?: InteractionFilter[];
  sorts?: InteractionSort[];
  quick_actions?: InteractionQuickAction[];
};
```

急診範例：

```json
{
  "version": 1,
  "target_layer_id": "ai-guide-emergency-hospitals-circle",
  "feature_id_property": "hospital_id",
  "hover": {
    "type": "tooltip",
    "template": "emergency_short"
  },
  "click": {
    "type": "open_card",
    "template": "emergency_detail"
  },
  "select": {
    "enabled": true,
    "mode": "single"
  },
  "filters": [
    {
      "id": "has_beds",
      "label": "只看有空床",
      "property": "emergency_available_beds",
      "operator": ">",
      "value": 0
    },
    {
      "id": "low_waiting",
      "label": "等待人數低於 20",
      "property": "emergency_waiting_count",
      "operator": "<",
      "value": 20
    }
  ],
  "sorts": [
    { "id": "recommended", "label": "推薦排序" },
    { "id": "distance", "label": "距離最近" },
    { "id": "beds", "label": "空床最多" },
    { "id": "waiting", "label": "等待人數最少" }
  ],
  "quick_actions": [
    {
      "id": "show_next",
      "label": "看第二順位",
      "event_type": "candidate.next"
    },
    {
      "id": "compare_top_3",
      "label": "比較前三間",
      "event_type": "candidate.compare_top",
      "payload": { "limit": 3 }
    }
  ]
}
```

Rules:

```txt
target_layer_id 要等於 map.add_points.payload.layerId。
feature_id_property 要等於 map.add_points.payload.featureIdProperty。
hover/click 若可由 properties 本地完成，不需打 BE。
quick_actions 的 event_type 必須是 /api/v1/ai/guide/event 支援的 event。
```

---

## 5. GeoJSON Feature Properties

BE 回 `map.add_points` 時，不要只塞原始資料。每個 feature 要包含 FE 本地互動需要的欄位。

### 5.1 Emergency Feature

```json
{
  "type": "Feature",
  "geometry": {
    "type": "Point",
    "coordinates": [121.5432, 25.0478]
  },
  "properties": {
    "module_key": "emergency",
    "hospital_id": "hospital_a",
    "rank": 1,
    "name": "待補醫院 A",
    "city": "臺北市",
    "district": "待補",
    "address": "待補地址 A",
    "phone": "待補電話 A",
    "emergency_waiting_count": 18,
    "emergency_available_beds": 6,
    "emergency_total_beds": 28,
    "distance_meters": 820,
    "status_level": "ok",
    "tooltip_title": "待補醫院 A",
    "tooltip_lines": ["等待 18 人", "空床 6 / 28", "距離 820 公尺"],
    "card_title": "待補醫院 A",
    "card_summary": "等待人數 18 人，急診空床 6 / 28，距離約 820 公尺。",
    "card_fields": [
      { "label": "狀態", "value": "可用" },
      { "label": "等待人數", "value": "18" },
      { "label": "急診空床", "value": "6 / 28" },
      { "label": "距離", "value": "820 公尺" },
      { "label": "地址", "value": "待補地址 A" },
      { "label": "電話", "value": "待補電話 A" }
    ],
    "last_updated": "2026-05-02T14:30:00+08:00",
    "source": "待補：雙北急診即時資料來源"
  }
}
```

### 5.2 Required Properties

地圖互動 v1 至少需要：

```txt
rank
name
status_level
tooltip_title
tooltip_lines
card_title
card_summary
card_fields
last_updated
source
```

領域 id 欄位依 topic 決定：

```txt
emergency: hospital_id
pharmacy: pharmacy_id
drinking_water: station_id
eco_restaurant: restaurant_id
```

### 5.3 Mapbox Serialization Note

Mapbox layer event 取回 `feature.properties` 時，array/object 可能被序列化成字串。FE 需對 `tooltip_lines`、`card_fields` 做 safe JSON parse。

BE 在 API JSON 中仍應回原生 array/object，不要預先 stringify。

---

## 6. Event Endpoint

### 6.1 Request

```json
{
  "session_id": "session_demo_001",
  "event": {
    "type": "candidate.next",
    "payload": {
      "current_feature_id": "hospital_a",
      "module_key": "emergency"
    }
  },
  "context": {
    "map": {
      "center": [121.5432, 25.0478],
      "zoom": 14
    },
    "selected_feature_id": "hospital_a"
  }
}
```

### 6.2 Response

沿用 guide response envelope。

```json
{
  "status": "success",
  "data": {
    "session_id": "session_demo_001",
    "request_id": "guide_event_20260502_143010_001",
    "answer": "第二順位是待補醫院 B，等待人數 35 人，空床 2 / 24。",
    "topic": "emergency",
    "module_key": "emergency",
    "component_key": "component_9",
    "ui_actions": [
      {
        "id": "cmd_fly_hospital_b",
        "type": "map.fly_to",
        "payload": {
          "center": [121.552, 25.055],
          "zoom": 15
        }
      },
      {
        "id": "cmd_open_hospital_b",
        "type": "map.open_card",
        "payload": {
          "coordinate": [121.552, 25.055],
          "feature_id": "hospital_b",
          "title": "待補醫院 B",
          "summary": "等待人數 35 人，急診空床 2 / 24。",
          "fields": [
            { "label": "等待人數", "value": "35" },
            { "label": "急診空床", "value": "2 / 24" }
          ]
        }
      }
    ],
    "interaction_model": null,
    "warnings": [],
    "error_code": null
  }
}
```

### 6.3 Supported Event Types

| event_type | BE required | 說明 |
| --- | ---: | --- |
| `feature.hover` | no | FE 本地顯示 tooltip |
| `feature.click` | optional | 若 properties 足夠，FE 本地開卡 |
| `feature.select` | optional | 可讓 chat 同步描述已選 feature |
| `filter.apply` | no / optional | 小篩選 FE 本地；需要重查才打 BE |
| `sort.apply` | no / optional | 候選清單已完整時 FE 本地排序 |
| `candidate.next` | yes | 根據 session candidates 找下一個 |
| `candidate.compare_top` | yes | 回 `panel.open_compare` |
| `origin.drag_end` | yes | 依新座標重新查附近資源 |
| `radius.change` | yes | 依新半徑重新查附近資源 |
| `route.request` | optional | 有路線服務才做；沒有則回 straight_line |

### 6.4 Session Candidate Cache

`candidate.next` 與 `candidate.compare_top` 需要 BE 記住上一輪候選清單。

```txt
cache key: session_id + topic
value: ordered candidates + source layer ids + timestamp
ttl: 10 minutes
storage v1: process-local cache
storage future: Redis
```

Cache miss response：

```json
{
  "status": "success",
  "data": {
    "answer": "目前沒有可延續的候選清單，請先重新查詢附近急診。",
    "ui_actions": [],
    "interaction_model": null,
    "warnings": [],
    "error_code": "NO_SESSION_CANDIDATES"
  }
}
```

---

## 7. Deterministic Emergency Logic

急診排序與狀態不可交給 LLM 自由判斷。

### 7.1 Status

```txt
unknown  缺等待人數或缺空床
critical 空床 <= 0
busy     等待人數 >= 40 或空床 <= 2
ok       其他
```

### 7.2 Sort

建議排序：

```txt
1. known before unknown
2. has available beds before no beds
3. lower waiting_count first
4. shorter distance first
5. stable tie-breaker by hospital_id
```

### 7.3 Safety Text

急診 topic 必須帶安全提示：

```txt
若有立即危及生命的狀況，請直接撥打 119。
急診等待人數與空床狀態可能快速變動，請以現場與官方資訊為準。
```

---

## 8. Go Type Sketch

```go
type GuideResponseData struct {
	SessionID        string             `json:"session_id"`
	RequestID        string             `json:"request_id"`
	Answer           string             `json:"answer"`
	Topic            string             `json:"topic"`
	ModuleKey        string             `json:"module_key"`
	ComponentKey     string             `json:"component_key"`
	DataTimestamp    string             `json:"data_timestamp"`
	ToolSteps        []ToolStep         `json:"tool_steps"`
	InsightCards     []InsightCard      `json:"insight_cards"`
	MiniCharts       []MiniChart        `json:"mini_charts"`
	ComparisonTables []ComparisonTable  `json:"comparison_tables"`
	FollowUps        []FollowUpQuestion `json:"follow_up_questions"`
	UIActions        []UIAction         `json:"ui_actions"`
	InteractionModel *InteractionModel  `json:"interaction_model"`
	Warnings         []string           `json:"warnings"`
	ErrorCode        *string            `json:"error_code"`
	Debug            any                `json:"debug"`
}

type UIAction struct {
	ID      string         `json:"id"`
	Type    string         `json:"type"`
	Payload map[string]any `json:"payload"`
}

type InteractionModel struct {
	Version           int                       `json:"version"`
	TargetLayerID     string                    `json:"target_layer_id,omitempty"`
	FeatureIDProperty string                    `json:"feature_id_property,omitempty"`
	Hover             *InteractionHover         `json:"hover,omitempty"`
	Click             *InteractionClick         `json:"click,omitempty"`
	Select            *InteractionSelect        `json:"select,omitempty"`
	Filters           []InteractionFilter       `json:"filters,omitempty"`
	Sorts             []InteractionSort         `json:"sorts,omitempty"`
	QuickActions      []InteractionQuickAction  `json:"quick_actions,omitempty"`
}
```

急診資料：

```go
type EmergencyHospital struct {
	HospitalID    string
	Name          string
	City          string
	District      string
	Address       string
	Phone         string
	Lng           float64
	Lat           float64
	WaitingCount  *int
	AvailableBeds *int
	TotalBeds     *int
	DistanceMeters *int
	LastUpdated   time.Time
	Source        string
}
```

---

## 9. BE Builder Flow

```txt
HandleGuideChat
  -> classify topic/intent
  -> query component/tool data
  -> normalize domain records
  -> deterministic rank/status
  -> build GeoJSON features
  -> build ui_actions
  -> build interaction_model
  -> cache ordered candidates by session_id + topic
  -> optional LLM answer wording using evidence summary
  -> validate response contract
  -> return
```

Event flow：

```txt
HandleGuideEvent
  -> validate event type
  -> load session candidates when needed
  -> candidate.next: find next item, return fly_to + open_card
  -> candidate.compare_top: return panel.open_compare
  -> origin.drag_end/radius.change: re-query data and rebuild full map response
  -> route.request: return route action or straight_line fallback
```

---

## 10. Full Emergency Response Example

```json
{
  "status": "success",
  "data": {
    "session_id": "session_demo_001",
    "request_id": "guide_20260502_143000_001",
    "answer": "已標出附近 3 間急診醫院。待補醫院 A 目前排序最高，等待人數 18 人且急診空床 6 / 28。",
    "topic": "emergency",
    "module_key": "emergency",
    "component_key": "component_9",
    "data_timestamp": "2026-05-02T14:30:00+08:00",
    "tool_steps": [
      {
        "id": "fetch_component_9",
        "label": "讀取急診即時資料",
        "status": "done",
        "tool_name": "get_component_chart_data",
        "duration_ms": 83
      },
      {
        "id": "rank_er_candidates",
        "label": "排序附近急診候選",
        "status": "done",
        "duration_ms": 2
      }
    ],
    "insight_cards": [],
    "mini_charts": [],
    "comparison_tables": [],
    "follow_up_questions": [],
    "ui_actions": [
      {
        "id": "cmd_clear_emergency",
        "type": "map.clear_ai_overlay",
        "payload": { "scope": "ai-guide" }
      },
      {
        "id": "cmd_add_emergency_points",
        "type": "map.add_points",
        "payload": {
          "sourceId": "ai-guide-emergency-hospitals",
          "layerId": "ai-guide-emergency-hospitals-circle",
          "featureIdProperty": "hospital_id",
          "geojson": {
            "type": "FeatureCollection",
            "features": [
              {
                "type": "Feature",
                "geometry": {
                  "type": "Point",
                  "coordinates": [121.5432, 25.0478]
                },
                "properties": {
                  "module_key": "emergency",
                  "hospital_id": "hospital_a",
                  "rank": 1,
                  "name": "待補醫院 A",
                  "city": "臺北市",
                  "district": "待補",
                  "address": "待補地址 A",
                  "phone": "待補電話 A",
                  "emergency_waiting_count": 18,
                  "emergency_available_beds": 6,
                  "emergency_total_beds": 28,
                  "distance_meters": 820,
                  "status_level": "ok",
                  "tooltip_title": "待補醫院 A",
                  "tooltip_lines": ["等待 18 人", "空床 6 / 28", "距離 820 公尺"],
                  "card_title": "待補醫院 A",
                  "card_summary": "等待人數 18 人，急診空床 6 / 28，距離約 820 公尺。",
                  "card_fields": [
                    { "label": "狀態", "value": "可用" },
                    { "label": "等待人數", "value": "18" },
                    { "label": "急診空床", "value": "6 / 28" },
                    { "label": "距離", "value": "820 公尺" }
                  ],
                  "last_updated": "2026-05-02T14:30:00+08:00",
                  "source": "待補：雙北急診即時資料來源"
                }
              }
            ]
          }
        }
      },
      {
        "id": "cmd_fit_emergency",
        "type": "map.fit_bounds",
        "payload": {
          "bounds": [[121.5301, 25.0392], [121.552, 25.055]],
          "padding": 90,
          "duration": 800
        }
      },
      {
        "id": "cmd_open_top_emergency_card",
        "type": "map.open_card",
        "payload": {
          "coordinate": [121.5432, 25.0478],
          "feature_id": "hospital_a",
          "title": "待補醫院 A",
          "summary": "等待人數 18 人，急診空床 6 / 28，距離約 820 公尺。",
          "fields": [
            { "label": "等待人數", "value": "18" },
            { "label": "急診空床", "value": "6 / 28" }
          ]
        }
      },
      {
        "id": "cmd_open_candidate_list",
        "type": "panel.open_candidate_list",
        "payload": {
          "title": "附近急診候選",
          "items": [
            {
              "feature_id": "hospital_a",
              "title": "待補醫院 A",
              "subtitle": "等待 18 人｜空床 6 / 28｜820 公尺",
              "status_level": "ok",
              "coordinate": [121.5432, 25.0478]
            }
          ]
        }
      },
      {
        "id": "cmd_emergency_notice",
        "type": "dialog.notify",
        "payload": {
          "status": "info",
          "message": "若有立即危及生命的狀況，請直接撥打 119。"
        }
      }
    ],
    "interaction_model": {
      "version": 1,
      "target_layer_id": "ai-guide-emergency-hospitals-circle",
      "feature_id_property": "hospital_id",
      "hover": { "type": "tooltip", "template": "emergency_short" },
      "click": { "type": "open_card", "template": "emergency_detail" },
      "select": { "enabled": true, "mode": "single" },
      "filters": [
        {
          "id": "has_beds",
          "label": "只看有空床",
          "property": "emergency_available_beds",
          "operator": ">",
          "value": 0
        }
      ],
      "sorts": [
        { "id": "recommended", "label": "推薦排序" },
        { "id": "distance", "label": "距離最近" },
        { "id": "beds", "label": "空床最多" },
        { "id": "waiting", "label": "等待人數最少" }
      ],
      "quick_actions": [
        {
          "id": "show_next",
          "label": "看第二順位",
          "event_type": "candidate.next"
        },
        {
          "id": "compare_top_3",
          "label": "比較前三間",
          "event_type": "candidate.compare_top",
          "payload": { "limit": 3 }
        }
      ]
    },
    "warnings": [
      "急診等待人數與空床狀態可能快速變動，請以現場與官方資訊為準。",
      "若有立即危及生命的狀況，請直接撥打 119。"
    ],
    "error_code": null,
    "debug": null
  }
}
```

---

## 11. FE Consumption Rules

### 11.1 Dispatch `ui_actions`

```js
function handleGuideResponse(data) {
  renderAnswer(data.answer);
  renderWarnings(data.warnings);

  for (const action of data.ui_actions || []) {
    aiGuideStore.dispatchUiCommand(action);
  }

  if (data.interaction_model) {
    aiGuideStore.registerInteractionModel(data.interaction_model);
  }
}
```

### 11.2 Hover Tooltip

```js
function safeParseJsonArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
```

FE hover 時讀：

```txt
tooltip_title
tooltip_lines
```

FE click 時讀：

```txt
card_title
card_summary
card_fields
```

---

## 12. Scope by Topic

| topic | v1 map interaction | 備註 |
| --- | --- | --- |
| `emergency` | yes | 第一優先，點位少，不需 cluster |
| `pharmacy` | yes | 點位多，建議 v2 加 cluster |
| `drinking_water` | yes | 監測站適合 tooltip + card |
| `eco_restaurant` | yes | 點位多，建議 cluster |
| `food_sampling` | partial | 主要 chart/table，只有有地址資料時才上 map |
| `overview` | partial | 可用 `chart.focus_component`，不強制 map |

---

## 13. Implementation Order

第一階段，只做急診高互動：

```txt
1. GuideResponse 加 ui_actions + interaction_model
2. Emergency builder 產生 GeoJSON features
3. map.clear_ai_overlay + map.add_points + map.fit_bounds + map.open_card
4. feature properties 加 tooltip/card 欄位
5. panel.open_candidate_list
6. FE hover tooltip + click card 本地互動
7. /api/v1/ai/guide/event: candidate.next
```

第二階段：

```txt
8. candidate.compare_top -> panel.open_compare
9. filter chips -> FE local map.set_filter
10. origin.drag_end -> BE 重新查詢
11. radius.change -> BE 重新查詢
12. map.add_route straight_line fallback
```

第三階段：

```txt
13. pharmacy/eco_restaurant cluster
14. route service integration
15. Redis session candidate cache
16. more topics
```

---

## 14. Acceptance Criteria

### 14.1 Contract

```txt
chat guide response 必須包含 data.answer、data.ui_actions、data.warnings。
急診 map response 必須包含 map.clear_ai_overlay、map.add_points、map.fit_bounds。
map.add_points payload 必須是 valid GeoJSON FeatureCollection。
interaction_model.version 必須是 1。
interaction_model.target_layer_id 必須等於 map.add_points.payload.layerId。
interaction_model.feature_id_property 必須等於 map.add_points.payload.featureIdProperty。
```

### 14.2 Feature Properties

```txt
每個急診 feature 必須有 hospital_id、rank、name、status_level。
每個急診 feature 必須有 tooltip_title、tooltip_lines。
每個急診 feature 必須有 card_title、card_summary、card_fields。
coordinates 必須是 [lng, lat]。
```

### 14.3 Event Flow

```txt
candidate.next 有 session candidates 時，回 map.fly_to + map.open_card。
candidate.next cache miss 時，回 error_code=NO_SESSION_CANDIDATES。
candidate.compare_top 有 candidates 時，回 panel.open_compare。
origin.drag_end/radius.change 回完整重查後的 map actions。
```

### 14.4 Safety

```txt
急診回答必須包含 119 提醒。
空床、等待人數、排序不可由 LLM 自由捏造。
資料缺漏要顯示 unknown/待補，不可編造。
沒有實際路網服務時，route_type 必須是 straight_line。
```

---

## 15. Test Cases

### 15.1 Unit Tests

```txt
EmergencyStatus:
  nil waiting -> unknown
  nil beds -> unknown
  available_beds = 0 -> critical
  waiting_count = 40 -> busy
  available_beds = 2 -> busy
  waiting_count = 18 and available_beds = 6 -> ok

SortEmergencyHospitals:
  known before unknown
  has beds before no beds
  lower waiting before higher waiting
  lower distance as tie-breaker

BuildEmergencyGuideResponse:
  answer exists
  ui_actions order starts clear -> add_points
  map.add_points has valid FeatureCollection
  interaction_model target_layer_id matches layerId
  feature properties include tooltip/card fields
```

### 15.2 API Tests

```txt
empty message -> 400
unknown topic -> 200 with no-data style answer
emergency nearby question -> 200 with map.add_points and interaction_model
candidate.next without session candidates -> success with error_code=NO_SESSION_CANDIDATES
candidate.next with session candidates -> 200 with fly_to + open_card
candidate.compare_top with session candidates -> 200 with panel.open_compare
```

### 15.3 Manual FE Smoke

```txt
AI answer renders text and warnings.
map.add_points creates markers.
marker hover shows tooltip from properties.
marker click opens card from properties.
candidate list item click flies to marker and opens card.
filter chip "只看有空床" applies local Mapbox filter.
quick action "看第二順位" calls /api/v1/ai/guide/event and updates map card.
```
