# AI Guide BE Integration Spec

> 目的：把 `sample_HTML.html` prototype 轉成後端工程師可直接閱讀、實作、並融合進現有 `Vue + Mapbox + ApexCharts + Go/Gin + TWCC tool calling` 專案的契約。
>
> 本文件不是要 BE 寫前端 code。BE 的責任是回傳穩定、可驗證、可被 FE 轉成 ChatBox 小型儀表板與地圖互動的 JSON payload。

---

## 0. TL;DR 給 BE

這次要新增的是「AI 導覽員結構化回覆層」，不是另一個聊天機器人。

BE 要讓 AI 用 tools 查資料，再回傳：

```txt
answer               條列式文字回答
tool_steps           使用者看得懂的工具執行狀態
insight_cards        小型統計卡
mini_charts          可由 FE 轉成 ApexCharts 的小型圖表
comparison_tables    比較表
follow_up_questions  NotebookLM 風格延伸問題
ui_actions           立即執行的 Mapbox / chart / panel 指令
interaction_model    後續 hover / click / filter / quick action 怎麼互動
warnings             資料限制與民眾安全提醒
```

最重要的實作原則：

1. AI 只走 TWCC `llama3.3-ffm-70b-16k-chat`，不要加 OpenAI / Anthropic / Gemini。
2. 不新增 npm/go dependency；FE 已有 Vue 3、Mapbox、ApexCharts。
3. BE 不直接生成 Vue code，也不直接生成任意 ApexCharts options。
4. BE 回「語意化 chart blocks」，FE 再轉成既有 `VueApexCharts` 元件 options。
5. 數字、排序、狀態等判斷必須由 deterministic Go code 產生，不交給 LLM 自由猜。
6. `互動增強_spec.md` 保持為進階地圖互動設計，本文件定義「BE 最小可落地契約」。

---

## 1. 現有專案邊界

### 1.1 技術棧

```txt
FE: Vue 3.4 + Pinia + Mapbox GL 3.1 + vue3-apexcharts / ApexCharts 3.45
BE: Go 1.24 + Gin 1.9 + GORM
AI: TWCC llama3.3-ffm-70b-16k-chat
資料: query_charts + dashboard data tables
```

### 1.2 既有能力要沿用

現有 BE 已有：

```txt
POST /api/v1/ai/chat/twai
app/controllers/ai.go
app/services/ai/ai_service.go
app/services/ai/providers/twcc/twcc.go
app/services/ai/tools/registry.go
app/services/ai/tools/dataset_tools.go
app/models/componentData.go
```

現有 FE 已有：

```txt
VueApexCharts from vue3-apexcharts
MapContainer.vue / mapStore
dashboardComponent/components/BarChart.vue 等 ApexCharts wrapper
```

### 1.3 本次不做

```txt
不新增 AI provider。
不新增前端 chart library。
不讓 FE 直接打 TWCC。
不讓 LLM 自行編造統計數字、座標、等待人數、空床。
不把 prototype HTML 直接搬進正式 Vue component。
```

### 1.4 與現有 5 種 dashboard data format 的關係

`mini_charts`、`insight_cards`、`ui_actions` 是 AI 導覽 payload，不是要取代既有 dashboard component data format。

現有 `componentData.go` 的 5 種格式仍是 component chart data 的權威格式：

```txt
two_d
percent
three_d
map_legend
time
```

Guide service 可以讀取上述格式或 tool result，再轉成 ChatBox 需要的語意化小型儀表板 blocks。不要把 `mini_charts` 寫回 `query_charts.query_type`，也不要新增第 6 種 dashboard component format。

### 1.5 與現有 AI tool registry 的關係

現有 `tools.ToolFunc` 介面是：

```go
type ToolFunc func(ctx context.Context, args string) (string, error)
```

現有 `ai_service.go` 也主要把最後模型回答存成文字 answer。因此本次建議新增一層 `guide` builder/adapter：

```txt
tool raw string / component data
  -> parse/normalize in Go
  -> deterministic guide response builder
  -> optional TWCC answer wording
  -> structured GuideResponse
```

不要要求 tool function 本身直接回完整 `GuideResponse`。這會把 tool registry 和 UI payload 綁死。

---

## 2. 建議路由與融合方式

### 2.1 Integration decision

採用「既有 chat endpoint 擴充」作為 v1 canonical path：

```txt
POST /api/v1/ai/chat/twai
POST /api/v1/ai/guide/event
```

`/api/v1/ai/chat/twai` 已經是現有 TWCC chat gateway。Guide mode 只在 request 帶 `mode: "dashboard_guide"` 時啟用 structured guide payload，避免建立第二套 AI gateway。

可選：若 FE prototype 已先寫 `/ai-guide/chat` 或 `/api/v1/ai/guide/chat`，可以做 thin alias/facade，但它必須轉呼叫同一個 guide service，不要複製 TWCC gateway 邏輯。

Implementation note:

```txt
可在 AIChatInput 新增 Mode string `json:"mode,omitempty"`。
可在 controller normalizer 支援 guide request 的 message/topic/context，並轉成既有 llms messages。
mode != dashboard_guide 時維持既有 data.content response。
mode == dashboard_guide 時回本文件的 structured GuideResponse。
```

### 2.2 Route 分工

| Route | 用途 | 是否呼叫 LLM | 備註 |
| --- | --- | ---: | --- |
| `POST /api/v1/ai/chat/twai` + `mode=dashboard_guide` | 使用者送自然語言問題 | yes | 沿用現有 TWCC gateway，guide mode 回 structured payload |
| `POST /api/v1/ai/guide/event` | 使用者點 quick action、拖曳起點、要求下一順位 | optional | 能用 session/cache 解決的事件不必再叫 LLM |
| `POST /api/v1/ai/guide/chat` | optional alias | yes | 只允許當 thin facade，不另建 AI service |

### 2.3 資料流

```txt
ChatBox.vue
  -> POST /api/v1/ai/chat/twai with mode=dashboard_guide
    -> Guide controller validates request
    -> Guide service resolves topic/component/context
    -> Tool layer fetches dashboard data
    -> Deterministic builder creates cards/charts/tables/map actions
    -> Optional TWCC answer text generation
    -> Response envelope returned to FE
  -> FE renders text/cards/ApexCharts/table/follow-ups
  -> FE dispatches ui_actions to mapStore/chartStore/panelStore
```

---

## 3. Request Contract

### 3.1 `POST /api/v1/ai/chat/twai` guide mode

```json
{
  "session_id": "8d8f89f2-4e51-4d5b-9f8b-6f2d5fbb1f3c",
  "message": "附近哪間急診人比較少且還有空床？",
  "topic": "emergency",
  "mode": "dashboard_guide",
  "context": {
    "dashboard_index": "health_guard",
    "dashboard_city": "metrotaipei",
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

Rules:

```txt
message 必填，不接受空字串。
若沿用既有 chat/twai message array，也必須能從最後一則 user message 取得 message。
topic 預設 overview，但 emergency / pharmacy / drinking_water 等主題要能明確進入對應 tool path。
dashboard_city 預設 metrotaipei。
locale 固定先支援 zh-TW。
map.center 若缺失，BE 仍可回答總覽，但不可假裝有「附近」排序。
「附近」v1 預設半徑為 3000 meters；request 可在 event payload 覆蓋 `radius_meters`。
`session_id` 與既有 `/api/v1/ai/chat/twai` 的 `session` 是同一個概念；guide route 對外使用 `session_id`，轉呼叫既有 service 時可映射到 `session`。
```

### 3.2 `POST /api/v1/ai/guide/event`

```json
{
  "session_id": "8d8f89f2-4e51-4d5b-9f8b-6f2d5fbb1f3c",
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

Supported v1 event types:

| Event | BE required | Behavior |
| --- | ---: | --- |
| `candidate.next` | yes | 用 session 候選清單回下一順位，並回 `map.fly_to` + `map.open_card` |
| `candidate.compare_top` | yes | 回前三名比較表與 `panel.open_compare` |
| `origin.drag_end` | yes | 依新起點重新查附近資源 |
| `radius.change` | yes | 依新半徑重新查候選點 |
| `feature.hover` | no | FE 用 properties 本地 tooltip |
| `feature.click` | optional | properties 足夠時 FE 本地 open card |
| `filter.apply` | optional | 小篩選 FE 本地 Mapbox filter；需要重查才打 BE |
| `sort.apply` | optional | 候選清單完整時 FE 本地排序 |

Session state rule:

```txt
candidate.next / candidate.compare_top 依賴上一輪候選清單。
BE v1 可用 Redis 或 process-local cache，但 key 必須包含 session_id + topic。
建議 TTL: 10 minutes。
cache miss 時回 NO_SESSION_CANDIDATES，不要讓 LLM 猜上一輪候選。
```

---

## 4. Response Envelope

所有 guide endpoints 回同一種 envelope。

```json
{
  "status": "success",
  "data": {
    "session_id": "8d8f89f2-4e51-4d5b-9f8b-6f2d5fbb1f3c",
    "request_id": "guide_20260502_143000_001",
    "answer": "- 結論：...\n- 依據：...\n- 觀察：...\n- 限制：...\n- 下一步：...",
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

Response rules:

```txt
answer 必填，且要能單獨閱讀；小卡/圖表不能取代文字回答。
tool_steps 必填，可為空陣列。
insight_cards / mini_charts / comparison_tables / follow_up_questions / ui_actions 可為空陣列。
warnings 可為空陣列；急診情境必須包含安全提醒。
error_code 成功時為 null 或省略；no-data/partial failure 可填 machine-readable code。
debug 預設 null；只有 dev/test mode 才回。
tool_steps v1 是 final response 一次回完；未來若做 streaming，再另定 SSE event contract。
未知欄位 FE 應忽略；缺少必填欄位視為 BE contract error。
```

---

## 5. Topic 與 Component Mapping

v1 先支援健康守護相關 topic。

Identifier definitions:

```txt
topic: FE chat tab / user-facing domain key，例如 emergency。
module_key: BE domain module key，v1 可與 topic 相同，但 BE logic 以 module_key 為準。
component_key: dashboard component identity，例如 component_9；用於 query_charts/component data 對應。
```

| topic | 中文 | 預設 component_key | 主要用途 |
| --- | --- | --- | --- |
| `overview` | 總覽 | `health_guard` | 整理健康守護摘要 |
| `food_sampling` | 食安抽驗 | 待 BE 對應 | 合格率、趨勢、雙北比較 |
| `emergency` | 急診 | `component_9` | 等待人數、空床、附近候選排序 |
| `pharmacy` | 藥局 | 待 BE 對應 | 點位可及性、區域缺口 |
| `drinking_water` | 飲用水 | 待 BE 對應 | 監測異常、趨勢 |
| `eco_restaurant` | 環保餐廳 | 待 BE 對應 | 點位分布、附近查詢 |

BE 可以先只完整實作 `emergency`，其他 topic 回總覽式 answer + no-data warning，但 response schema 必須一致。

---

## 6. Tool Steps

`tool_steps` 是給使用者看的狀態，不是內部 log dump。

```ts
type ToolStepStatus = "pending" | "running" | "done" | "error";

type ToolStep = {
  id: string;
  label: string;
  status: ToolStepStatus;
  tool_name?: string;
  duration_ms?: number;
  error_message?: string;
};
```

急診範例：

```json
[
  {
    "id": "fetch_component_9",
    "label": "讀取雙北緊急救護服務效能資料",
    "status": "done",
    "tool_name": "get_component_chart_data",
    "duration_ms": 83
  },
  {
    "id": "calculate_er_capacity",
    "label": "計算等待人數與急診空床狀態",
    "status": "done",
    "duration_ms": 2
  },
  {
    "id": "rank_er_candidates",
    "label": "排序候選急診醫院",
    "status": "done",
    "duration_ms": 1
  }
]
```

Rules:

```txt
label 不顯示 SQL、table name、tool raw args。
error step 可以存在；answer 必須明確說明資料不足或部分失敗。
tool_name 是 debug/telemetry 用，FE 可以不顯示。
```

---

## 7. Mini Dashboard Blocks

### 7.1 Insight Cards

```ts
type InsightCard = {
  id: string;
  title: string;
  subtitle?: string;
  accent?: "blue" | "green" | "orange" | "red" | "violet" | "cyan";
  stats: {
    label: string;
    value: string | number;
    unit?: string;
    note?: string;
    status_level?: "ok" | "busy" | "critical" | "unknown";
  }[];
};
```

```json
{
  "id": "er_capacity_summary",
  "title": "急診容量摘要",
  "subtitle": "雙北候選急診醫院",
  "accent": "cyan",
  "stats": [
    { "label": "候選醫院", "value": 3, "unit": "間" },
    { "label": "有空床", "value": 2, "unit": "間", "status_level": "ok" },
    { "label": "最低等待人數", "value": 18, "unit": "人" }
  ]
}
```

### 7.2 Mini Charts

BE 回語意化 chart block；FE 轉 ApexCharts。

不要讓 BE 回完整任意 Apex options，原因：

```txt
1. Apex options 是 FE presentation detail，會綁死樣式與安全邊界。
2. BE 較適合保證資料、單位、排序、狀態與來源。
3. FE 已有 vue3-apexcharts 與既有 wrapper，可集中處理 theme / tooltip / responsive。
```

Schema：

```ts
type MiniChart = {
  id: string;
  title: string;
  chart_family: "apex";
  data_format: "two_d" | "three_d" | "percent" | "time" | "map_legend";
  chart_type:
    | "bar"
    | "horizontal_bar"
    | "line"
    | "sparkline"
    | "donut"
    | "comparison";
  unit?: string;
  data: {
    label: string;
    value: number;
    group?: string;
    color_key?: "ok" | "busy" | "critical" | "unknown" | "primary" | "secondary";
  }[];
  source?: {
    label: string;
    updated_at?: string;
  };
  apex_hint?: {
    preferred_component?: "BarChart" | "ColumnChart" | "TimelineSeparateChart" | "DonutChart";
    stacked?: boolean;
  };
};
```

急診範例：

```json
{
  "id": "er_waiting_bar",
  "title": "候選急診等待人數",
  "chart_family": "apex",
  "data_format": "two_d",
  "chart_type": "horizontal_bar",
  "unit": "人",
  "data": [
    { "label": "待補醫院 A", "value": 18, "color_key": "ok" },
    { "label": "待補醫院 B", "value": 35, "color_key": "busy" },
    { "label": "待補醫院 C", "value": 52, "color_key": "critical" }
  ],
  "source": {
    "label": "雙北緊急救護服務效能資料",
    "updated_at": "2026-05-02T14:30:00+08:00"
  },
  "apex_hint": {
    "preferred_component": "BarChart"
  }
}
```

FE conversion rule:

```txt
horizontal_bar -> VueApexCharts type="bar" + plotOptions.bar.horizontal = true
line/sparkline -> VueApexCharts type="line"
donut -> VueApexCharts type="donut"
comparison -> render as table or compact grouped bar, depending on FE space
```

### 7.3 Comparison Tables

```ts
type ComparisonTable = {
  id: string;
  title: string;
  columns: string[];
  rows: (string | number | null)[][];
  highlight?: {
    row_index?: number;
    col_index?: number;
    reason?: string;
  }[];
};
```

```json
{
  "id": "er_top3_compare",
  "title": "急診候選比較",
  "columns": ["醫院", "等待人數", "空床", "距離", "狀態"],
  "rows": [
    ["待補醫院 A", "18", "6 / 28", "820 公尺", "可用"],
    ["待補醫院 B", "35", "2 / 24", "1.4 公里", "偏忙"],
    ["待補醫院 C", "52", "0 / 20", "2.1 公里", "壅塞"]
  ],
  "highlight": [
    { "row_index": 0, "reason": "等待人數較低且仍有空床" }
  ]
}
```

---

## 8. `ui_actions`

`ui_actions` 是「收到 response 後立即做」的 UI command。ChatBox 只 dispatch，不直接操作 Mapbox。

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
id 必須在單次 response 內唯一。
FE 必須依 ui_actions 陣列順序執行，因為 clear -> add_points -> fit_bounds -> open_card 有依賴。
未知 action type：FE console.warn，不 crash。
map.add_route 若沒有真實路網，只能標 route_type = straight_line，不可假裝是實際路線。
dialog.notify 可用於急診 119 提醒、資料過期提醒、部分 tool 失敗提醒。
```

### 8.1 `map.add_points`

```json
{
  "id": "cmd_points_001",
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

GeoJSON feature properties 必須包含 FE 本地互動要用的欄位：

```json
{
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
  "source": "雙北緊急救護服務效能資料"
}
```

Mapbox note:

```txt
Mapbox layer event 取回 properties 時，array/object 可能被序列化為字串。
FE 必須能 safe JSON parse tooltip_lines/card_fields。
BE 仍應在 JSON response 內回真正 array/object，不要預先 stringify。
```

---

## 9. `interaction_model`

`interaction_model` 是「使用者之後怎麼互動」。它不代表立刻執行。

v1 schema version 固定為 `1`。FE 若收到更高版本，應盡量使用已知欄位並忽略未知欄位。

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
hover/click/filter/sort 若可用 response 既有資料完成，FE 本地處理。
quick_actions 需要 session 上下文，打 `/api/v1/ai/guide/event`。
interaction_model 只描述能力，不混入 answer 文案。
filters/sorts/quick_actions 是全 topic 共通 schema；v1 只有 emergency 必須完整支援。
```

---

## 10. Answer Format

所有 `answer` 優先用條列式。

```txt
- 結論：一句話說明主要發現。
- 依據：資料來源與資料時間。
- 觀察：
  - 2 到 4 個具體觀察。
- 限制：資料缺口、更新延遲或不可推論處。
- 下一步：1 個可操作探索方向。
```

急診禁止事項：

```txt
禁止說「一定去某醫院」。
禁止把排序說成醫療建議或保證。
禁止省略 119 提醒。
禁止用 LLM 猜缺漏數字。
```

---

## 11. Deterministic Rules

### 11.1 急診狀態分級

由 Go code 產生，不給 LLM 判斷。

```txt
unknown: 缺等待人數或缺空床
critical: emergency_available_beds <= 0
busy: emergency_waiting_count >= 40 或 emergency_available_beds <= 2
ok: 其他
```

### 11.2 急診推薦排序

推薦排序 deterministic score：

```txt
排除 unknown 嗎：不排除，但 unknown 排最後。
優先：有空床 > 等待人數低 > 距離近。
tie-breaker：rank source order / hospital_id 字典序，避免每次回覆不同。
```

Pseudo formula:

```txt
score =
  has_beds_weight
  - waiting_count_weight
  - distance_weight
  - unknown_penalty
```

v1 可直接排序：

```txt
1. unknown 最後
2. emergency_available_beds > 0 在前
3. emergency_waiting_count 小在前
4. distance_meters 小在前
5. hospital_id 小在前
```

---

## 12. Go Struct Sample

這些 struct 可放在新檔案，例如：

```txt
app/services/ai/guide/types.go
app/services/ai/guide/responseBuilder.go
app/controllers/aiGuide.go
```

命名可依 repo 慣例調整；重點是 JSON contract。

```go
package guide

type GuideChatRequest struct {
	Session   string       `json:"session,omitempty"` // existing chat/twai compatibility
	SessionID string       `json:"session_id"`
	Message   string       `json:"message" binding:"required"`
	Topic     string       `json:"topic"`
	Mode      string       `json:"mode"`
	Context   GuideContext `json:"context"`
}

type GuideContext struct {
	DashboardIndex    string     `json:"dashboard_index"`
	DashboardCity     string     `json:"dashboard_city"`
	CurrentRoute      string     `json:"current_route"`
	Locale            string     `json:"locale"`
	Timezone          string     `json:"timezone"`
	Map               *MapState  `json:"map,omitempty"`
	VisibleLayers     []string   `json:"visible_layers"`
	SelectedFeatureID *string    `json:"selected_feature_id,omitempty"`
}

type MapState struct {
	Center [2]float64    `json:"center"`
	Zoom   float64       `json:"zoom"`
	Bounds [][2]float64  `json:"bounds,omitempty"`
}

type GuideResponse struct {
	SessionID         string             `json:"session_id"`
	RequestID         string             `json:"request_id"`
	Answer            string             `json:"answer"`
	Topic             string             `json:"topic"`
	ModuleKey         string             `json:"module_key"`
	ComponentKey      string             `json:"component_key"`
	DataTimestamp     string             `json:"data_timestamp"`
	ToolSteps         []ToolStep         `json:"tool_steps"`
	InsightCards      []InsightCard      `json:"insight_cards"`
	MiniCharts        []MiniChart        `json:"mini_charts"`
	ComparisonTables  []ComparisonTable  `json:"comparison_tables"`
	FollowUpQuestions []FollowUpQuestion `json:"follow_up_questions"`
	UIActions         []UIAction         `json:"ui_actions"`
	InteractionModel  *InteractionModel  `json:"interaction_model,omitempty"`
	Warnings          []string           `json:"warnings"`
	ErrorCode         string             `json:"error_code,omitempty"`
	Debug             any                `json:"debug,omitempty"`
}

type ToolStep struct {
	ID           string `json:"id"`
	Label        string `json:"label"`
	Status       string `json:"status"`
	ToolName     string `json:"tool_name,omitempty"`
	DurationMS   int    `json:"duration_ms,omitempty"`
	ErrorMessage string `json:"error_message,omitempty"`
}

type InsightCard struct {
	ID       string      `json:"id"`
	Title    string      `json:"title"`
	Subtitle string      `json:"subtitle,omitempty"`
	Accent   string      `json:"accent,omitempty"`
	Stats    []CardStat  `json:"stats"`
}

type CardStat struct {
	Label       string `json:"label"`
	Value       any    `json:"value"`
	Unit        string `json:"unit,omitempty"`
	Note        string `json:"note,omitempty"`
	StatusLevel string `json:"status_level,omitempty"`
}

type MiniChart struct {
	ID          string          `json:"id"`
	Title       string          `json:"title"`
	ChartFamily string          `json:"chart_family"`
	DataFormat  string          `json:"data_format"`
	ChartType   string          `json:"chart_type"`
	Unit        string          `json:"unit,omitempty"`
	Data        []MiniChartItem `json:"data"`
	Source      *BlockSource    `json:"source,omitempty"`
	ApexHint    *ApexHint       `json:"apex_hint,omitempty"`
}

type MiniChartItem struct {
	Label    string  `json:"label"`
	Value    float64 `json:"value"`
	Group    string  `json:"group,omitempty"`
	ColorKey string  `json:"color_key,omitempty"`
}

type BlockSource struct {
	Label     string `json:"label"`
	UpdatedAt string `json:"updated_at,omitempty"`
}

type ApexHint struct {
	PreferredComponent string `json:"preferred_component,omitempty"`
	Stacked            bool   `json:"stacked,omitempty"`
}

type ComparisonTable struct {
	ID        string           `json:"id"`
	Title     string           `json:"title"`
	Columns   []string         `json:"columns"`
	Rows      [][]any          `json:"rows"`
	Highlight []TableHighlight `json:"highlight,omitempty"`
}

type TableHighlight struct {
	RowIndex int    `json:"row_index,omitempty"`
	ColIndex int    `json:"col_index,omitempty"`
	Reason   string `json:"reason,omitempty"`
}

type FollowUpQuestion struct {
	ID     string `json:"id"`
	Label  string `json:"label"`
	Prompt string `json:"prompt"`
	Topic  string `json:"topic,omitempty"`
}

type UIAction struct {
	ID      string         `json:"id"`
	Type    string         `json:"type"`
	Payload map[string]any `json:"payload"`
}

type InteractionModel struct {
	Version           int                    `json:"version"`
	TargetLayerID     string                 `json:"target_layer_id,omitempty"`
	FeatureIDProperty string                 `json:"feature_id_property,omitempty"`
	Hover             map[string]any         `json:"hover,omitempty"`
	Click             map[string]any         `json:"click,omitempty"`
	Select            map[string]any         `json:"select,omitempty"`
	Filters           []InteractionFilter    `json:"filters,omitempty"`
	Sorts             []InteractionSort      `json:"sorts,omitempty"`
	QuickActions      []InteractionQuickAction `json:"quick_actions,omitempty"`
}
```

---

## 13. Go Builder Sample: Emergency

這段是 BE 可以直接照著改的 shape。實際資料來源請接 `query_charts` / tool result，不要硬寫 mock。

```go
package guide

import (
	"fmt"
	"sort"
	"time"
)

type EmergencyHospital struct {
	HospitalID     string
	Name           string
	City           string
	District       string
	Address        string
	Phone          string
	Lng            float64
	Lat            float64
	WaitingCount   *int
	AvailableBeds  *int
	TotalBeds      *int
	DistanceMeters *int
	LastUpdated    time.Time
	Source         string
}

func BuildEmergencyGuideResponse(sessionID string, hospitals []EmergencyHospital, dataTime time.Time) GuideResponse {
	SortEmergencyHospitals(hospitals)

	features := make([]map[string]any, 0, len(hospitals))
	for i, h := range hospitals {
		features = append(features, MakeEmergencyFeature(h, i+1))
	}

	response := GuideResponse{
		SessionID:     sessionID,
		RequestID:     fmt.Sprintf("guide_%d", time.Now().UnixMilli()),
		Topic:         "emergency",
		ModuleKey:     "emergency",
		ComponentKey:  "component_9",
		DataTimestamp: dataTime.Format(time.RFC3339),
		ToolSteps: []ToolStep{
			{ID: "fetch_component_9", Label: "讀取雙北緊急救護服務效能資料", Status: "done", ToolName: "get_component_chart_data"},
			{ID: "calculate_er_capacity", Label: "計算等待人數與急診空床狀態", Status: "done"},
			{ID: "rank_er_candidates", Label: "排序候選急診醫院", Status: "done"},
		},
		InsightCards:      BuildEmergencyCards(hospitals),
		MiniCharts:        BuildEmergencyCharts(hospitals, dataTime),
		ComparisonTables:  BuildEmergencyTables(hospitals),
		FollowUpQuestions: BuildEmergencyFollowUps(),
		UIActions:         BuildEmergencyUIActions(features),
		InteractionModel:  BuildEmergencyInteractionModel(),
		Warnings: []string{
			"急診等待人數與空床狀態可能快速變動，請以現場與官方資訊為準。",
			"若有立即危及生命的狀況，請直接撥打 119。",
		},
	}

	response.Answer = BuildEmergencyAnswer(hospitals, dataTime)
	return response
}

func EmergencyStatus(h EmergencyHospital) string {
	if h.WaitingCount == nil || h.AvailableBeds == nil {
		return "unknown"
	}
	if *h.AvailableBeds <= 0 {
		return "critical"
	}
	if *h.WaitingCount >= 40 || *h.AvailableBeds <= 2 {
		return "busy"
	}
	return "ok"
}

func SortEmergencyHospitals(hospitals []EmergencyHospital) {
	sort.SliceStable(hospitals, func(i, j int) bool {
		a := hospitals[i]
		b := hospitals[j]
		aUnknown := EmergencyStatus(a) == "unknown"
		bUnknown := EmergencyStatus(b) == "unknown"
		if aUnknown != bUnknown {
			return !aUnknown
		}

		aBeds := intValue(a.AvailableBeds, -1)
		bBeds := intValue(b.AvailableBeds, -1)
		if (aBeds > 0) != (bBeds > 0) {
			return aBeds > 0
		}

		aWait := intValue(a.WaitingCount, 999999)
		bWait := intValue(b.WaitingCount, 999999)
		if aWait != bWait {
			return aWait < bWait
		}

		aDistance := intValue(a.DistanceMeters, 999999)
		bDistance := intValue(b.DistanceMeters, 999999)
		if aDistance != bDistance {
			return aDistance < bDistance
		}

		return a.HospitalID < b.HospitalID
	})
}

func MakeEmergencyFeature(h EmergencyHospital, rank int) map[string]any {
	waitingText := intText(h.WaitingCount)
	bedsText := bedsText(h.AvailableBeds, h.TotalBeds)
	distanceText := distanceText(h.DistanceMeters)
	status := EmergencyStatus(h)

	return map[string]any{
		"type": "Feature",
		"geometry": map[string]any{
			"type": "Point",
			"coordinates": []float64{h.Lng, h.Lat},
		},
		"properties": map[string]any{
			"module_key": "emergency",
			"hospital_id": h.HospitalID,
			"rank": rank,
			"name": h.Name,
			"city": fallback(h.City, "待補"),
			"district": fallback(h.District, "待補"),
			"address": fallback(h.Address, "待補"),
			"phone": fallback(h.Phone, "待補"),
			"emergency_waiting_count": h.WaitingCount,
			"emergency_available_beds": h.AvailableBeds,
			"emergency_total_beds": h.TotalBeds,
			"distance_meters": h.DistanceMeters,
			"status_level": status,
			"tooltip_title": h.Name,
			"tooltip_lines": []string{
				"等待 " + waitingText + " 人",
				"空床 " + bedsText,
				"距離 " + distanceText,
			},
			"card_title": h.Name,
			"card_summary": "等待人數 " + waitingText + " 人，急診空床 " + bedsText + "，距離約 " + distanceText + "。",
			"card_fields": []map[string]string{
				{"label": "狀態", "value": statusLabel(status)},
				{"label": "等待人數", "value": waitingText},
				{"label": "急診空床", "value": bedsText},
				{"label": "距離", "value": distanceText},
				{"label": "地址", "value": fallback(h.Address, "待補")},
				{"label": "電話", "value": fallback(h.Phone, "待補")},
			},
			"last_updated": h.LastUpdated.Format(time.RFC3339),
			"source": fallback(h.Source, "雙北緊急救護服務效能資料"),
		},
	}
}

func BuildEmergencyCharts(hospitals []EmergencyHospital, dataTime time.Time) []MiniChart {
	items := make([]MiniChartItem, 0, len(hospitals))
	for _, h := range hospitals {
		if h.WaitingCount == nil {
			continue
		}
		items = append(items, MiniChartItem{
			Label: h.Name,
			Value: float64(*h.WaitingCount),
			ColorKey: EmergencyStatus(h),
		})
	}
	return []MiniChart{{
		ID: "er_waiting_bar",
		Title: "候選急診等待人數",
		ChartFamily: "apex",
		DataFormat: "two_d",
		ChartType: "horizontal_bar",
		Unit: "人",
		Data: items,
		Source: &BlockSource{Label: "雙北緊急救護服務效能資料", UpdatedAt: dataTime.Format(time.RFC3339)},
		ApexHint: &ApexHint{PreferredComponent: "BarChart"},
	}}
}
```

Helper functions can be local private helpers:

```go
func intValue(value *int, fallback int) int {
	if value == nil {
		return fallback
	}
	return *value
}

func intText(value *int) string {
	if value == nil {
		return "待補"
	}
	return fmt.Sprintf("%d", *value)
}

func bedsText(available *int, total *int) string {
	if available == nil || total == nil {
		return "待補"
	}
	return fmt.Sprintf("%d / %d", *available, *total)
}

func distanceText(meters *int) string {
	if meters == nil {
		return "待補"
	}
	if *meters >= 1000 {
		return fmt.Sprintf("%.1f 公里", float64(*meters)/1000)
	}
	return fmt.Sprintf("%d 公尺", *meters)
}

func fallback(value string, fallback string) string {
	if value == "" {
		return fallback
	}
	return value
}

func statusLabel(status string) string {
	switch status {
	case "ok":
		return "可用"
	case "busy":
		return "偏忙"
	case "critical":
		return "壅塞"
	default:
		return "資料不足"
	}
}
```

---

## 14. Full Emergency Response Sample

```json
{
  "status": "success",
  "data": {
    "session_id": "8d8f89f2-4e51-4d5b-9f8b-6f2d5fbb1f3c",
    "request_id": "guide_20260502_143000_001",
    "answer": "- 結論：目前附近候選急診中，待補醫院 A 等待人數較低且仍有空床。\n- 依據：使用雙北緊急救護服務效能資料，資料時間為 2026-05-02 14:30。\n- 觀察：\n  - 待補醫院 A：等待 18 人，急診空床 6 / 28。\n  - 待補醫院 B：等待 35 人，急診空床 2 / 24，狀態偏忙。\n  - 待補醫院 C：等待 52 人，急診空床 0 / 20，狀態壅塞。\n- 限制：急診等待人數與空床會快速變動，請以現場與官方資訊為準。\n- 下一步：可只看有空床或比較前三間候選醫院。",
    "topic": "emergency",
    "module_key": "emergency",
    "component_key": "component_9",
    "data_timestamp": "2026-05-02T14:30:00+08:00",
    "tool_steps": [
      {
        "id": "fetch_component_9",
        "label": "讀取雙北緊急救護服務效能資料",
        "status": "done",
        "tool_name": "get_component_chart_data"
      },
      {
        "id": "calculate_er_capacity",
        "label": "計算等待人數與急診空床狀態",
        "status": "done"
      },
      {
        "id": "rank_er_candidates",
        "label": "排序候選急診醫院",
        "status": "done"
      }
    ],
    "insight_cards": [
      {
        "id": "er_capacity_summary",
        "title": "急診容量摘要",
        "subtitle": "雙北候選急診醫院",
        "accent": "cyan",
        "stats": [
          { "label": "候選醫院", "value": 3, "unit": "間" },
          { "label": "有空床", "value": 2, "unit": "間" },
          { "label": "最低等待人數", "value": 18, "unit": "人" }
        ]
      }
    ],
    "mini_charts": [
      {
        "id": "er_waiting_bar",
        "title": "候選急診等待人數",
        "chart_family": "apex",
        "data_format": "two_d",
        "chart_type": "horizontal_bar",
        "unit": "人",
        "data": [
          { "label": "待補醫院 A", "value": 18, "color_key": "ok" },
          { "label": "待補醫院 B", "value": 35, "color_key": "busy" },
          { "label": "待補醫院 C", "value": 52, "color_key": "critical" }
        ],
        "apex_hint": { "preferred_component": "BarChart" }
      }
    ],
    "comparison_tables": [
      {
        "id": "er_top3_compare",
        "title": "急診候選比較",
        "columns": ["醫院", "等待人數", "空床", "距離", "狀態"],
        "rows": [
          ["待補醫院 A", "18", "6 / 28", "820 公尺", "可用"],
          ["待補醫院 B", "35", "2 / 24", "1.4 公里", "偏忙"],
          ["待補醫院 C", "52", "0 / 20", "2.1 公里", "壅塞"]
        ],
        "highlight": [
          { "row_index": 0, "reason": "等待人數較低且仍有空床" }
        ]
      }
    ],
    "follow_up_questions": [
      {
        "id": "follow_er_beds_only",
        "label": "只看有空床",
        "prompt": "請只列出目前仍有急診空床的醫院，並依等待人數排序。",
        "topic": "emergency"
      },
      {
        "id": "follow_er_compare_top3",
        "label": "比較前三間",
        "prompt": "請比較前三間候選急診醫院的人數、空床、距離與資料時間。",
        "topic": "emergency"
      },
      {
        "id": "follow_er_map",
        "label": "標到地圖上",
        "prompt": "請把這些急診醫院標示到地圖上，並開啟最推薦的一間小卡。",
        "topic": "emergency"
      }
    ],
    "ui_actions": [
      {
        "id": "cmd_clear_001",
        "type": "map.clear_ai_overlay",
        "payload": { "scope": "ai-guide" }
      },
      {
        "id": "cmd_points_001",
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
      },
      {
        "id": "cmd_bounds_001",
        "type": "map.fit_bounds",
        "payload": {
          "bounds": [[121.5301, 25.0392], [121.552, 25.055]],
          "padding": 90
        }
      },
      {
        "id": "cmd_panel_001",
        "type": "panel.open_candidate_list",
        "payload": {
          "title": "急診候選清單",
          "eventTypes": ["candidate.next", "candidate.compare_top"]
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
    "debug": null
  }
}
```

---

## 15. Error Response

### 15.1 API error

```json
{
  "status": "error",
  "error_code": "AI_GUIDE_SERVICE_ERROR",
  "message": "後端服務或資料來源暫時無法連線。",
  "data": {
    "answer": "- 狀態：資料查詢失敗。\n- 原因：後端服務或資料來源暫時無法連線。\n- 下一步：請稍後重試，或改查其他健康守護主題。",
    "error_code": "AI_GUIDE_SERVICE_ERROR",
    "tool_steps": [
      {
        "id": "fetch_component_9",
        "label": "讀取雙北緊急救護服務效能資料",
        "status": "error",
        "error_message": "query execution failed"
      }
    ],
    "warnings": ["若有立即危及生命的狀況，請直接撥打 119。"]
  }
}
```

### 15.2 No data

```json
{
  "status": "success",
  "data": {
    "answer": "- 結論：目前查無符合條件的資料。\n- 限制：可能是資料來源未更新、查詢範圍過窄或該組件不含空間資料。\n- 下一步：可放寬查詢條件或切換其他主題。",
    "error_code": "NO_MATCHING_DATA",
    "tool_steps": [],
    "insight_cards": [],
    "mini_charts": [],
    "comparison_tables": [],
    "follow_up_questions": [],
    "ui_actions": [],
    "warnings": ["可能是資料來源未更新、查詢範圍過窄或該組件不含空間資料。"]
  }
}
```

### 15.3 Partial tool failure

```txt
保留已成功的資料卡。
失敗 tool step 顯示 error。
answer 明確標示「待補」或「資料不足」。
warnings 說明哪個資料來源或哪段計算不足。
```

---

## 16. FE Integration Notes

這段是給 BE 理解 payload 會怎麼被消費，不要求 BE 寫 FE。

### 16.1 與既有 DashboardComponent 的相容 adapter

正式 FE 可以把 `mini_charts` 轉成現有 dashboard component 所熟悉的 `chart_config` / `chart_data` shape。BE 不必直接回完整 Apex options，但可以回足夠語意讓 adapter 穩定轉換。

Example adapter output:

```json
{
  "block_type": "chart",
  "data_format": "two_d",
  "chart_type": "BarChart",
  "title": "候選急診等待人數",
  "source": "雙北緊急救護服務效能資料",
  "city": "metrotaipei",
  "chart_config": {
    "color": ["#7ccf8a", "#f2a65a", "#ff6b5f"],
    "types": ["BarChart"],
    "unit": "人",
    "categories": ["待補醫院 A", "待補醫院 B", "待補醫院 C"]
  },
  "chart_data": [
    {
      "name": "等待人數",
      "data": [18, 35, 52]
    }
  ],
  "history_config": null,
  "map_config": null,
  "map_filter": null
}
```

Practical rule:

```txt
BE 回 mini_charts semantic payload。
FE adapter 負責把 mini_charts 轉成 VueApexCharts 或既有 DashboardComponent-compatible block。
若未來 BE 直接回 blocks，也必須仍是 semantic chart_config/chart_data，不可回任意 Apex options。
```

### 16.2 Mini chart to ApexCharts

```js
function toApexSeries(miniChart) {
  return [
    {
      name: miniChart.title,
      data: miniChart.data.map((item) => item.value),
    },
  ];
}

function toApexOptions(miniChart) {
  return {
    chart: { toolbar: { show: false } },
    plotOptions: {
      bar: { horizontal: miniChart.chart_type === "horizontal_bar" },
    },
    xaxis: {
      categories: miniChart.data.map((item) => item.label),
    },
    tooltip: {
      y: {
        formatter: (value) => `${value} ${miniChart.unit || ""}`.trim(),
      },
    },
  };
}
```

### 16.3 Dispatching `ui_actions`

```js
function handleGuideResponse(data) {
  renderAnswer(data.answer);
  renderInsightCards(data.insight_cards);
  renderMiniCharts(data.mini_charts);
  renderTables(data.comparison_tables);

  for (const action of data.ui_actions || []) {
    aiGuideStore.dispatchUiCommand(action);
  }

  aiGuideStore.registerInteractionModel(data.interaction_model);
}
```

---

## 17. Compatibility With `互動增強_spec.md`

`互動增強_spec.md` 不需要改，它是更高互動層的設計草案。本文件與它的關係：

| Topic | `互動增強_spec.md` | 本文件 |
| --- | --- | --- |
| `interaction_model` | 詳細定義 hover/click/filter/quick action | 採用同方向，收斂成 BE v1 contract |
| `POST /ai-guide/event` | 使用 prototype route | 正式建議 `/api/v1/ai/guide/event`，可保留 alias |
| BE sample code | Python-style builder | Go-style structs/builder，方便 BE 直接搬 |
| 地圖互動 | 高互動完整構想 | v1 只要求急診 marker/card/list/filter/quick action |
| chart blocks | 不是主軸 | 新增 ApexCharts-friendly `mini_charts` semantic payload |

目前唯一需要 BE 注意的矛盾/差異：

```txt
1. route prefix：舊文件寫 `/ai-guide/*`；正式 chat turn 走 `/api/v1/ai/chat/twai` + `mode=dashboard_guide`，stateful event 走 `/api/v1/ai/guide/event`。
2. sample code 語言：舊文件是 Python pseudo，正式請以本文件 Go struct 為準。
3. chart payload：本文件新增 mini_charts，且要求 BE 回語意資料，不回任意 Apex options。
```

---

## 18. Acceptance Criteria

BE 完成後應能通過以下驗收。

### 18.1 Contract

```txt
POST /api/v1/ai/chat/twai 在 mode=dashboard_guide 時回 status=success 與 guide data envelope。
data.answer 必填且為條列式。
急診情境包含 tool_steps、insight_cards、mini_charts、comparison_tables、follow_up_questions。
mini_charts 必須包含 chart_family=apex、data_format、chart_type、data。
急診情境包含至少 map.clear_ai_overlay、map.add_points、map.fit_bounds。
急診情境包含 interaction_model.hover/click/filters/quick_actions。
no-data / partial failure 必須包含 machine-readable error_code。
```

### 18.2 Safety

```txt
急診回答包含 119 提醒。
急診排序不宣稱醫療建議或保證。
缺資料時回 unknown/待補，不用 LLM 猜數字。
TWCC model 仍是唯一 AI 出口。
```

### 18.3 FE consumability

```txt
mini_charts 可轉成 VueApexCharts。
map.add_points payload 是合法 GeoJSON FeatureCollection。
feature properties 包含 tooltip/card/list/filter 所需欄位。
未知 ui_action 不影響 response 基本閱讀。
```

### 18.4 Event flow

```txt
candidate.next 可用前一輪 session 候選清單回下一順位。
candidate.compare_top 可回 comparison table 或 panel.open_compare。
session candidate cache miss 回 NO_SESSION_CANDIDATES。
origin.drag_end / radius.change 可重新查附近候選資料。
feature.hover/filter.apply/sort.apply 不強制打 BE。
```

---

## 19. Suggested Implementation Order

1. 新增 guide response structs 與 builder，不接 route。
2. 用 mock emergency hospitals 寫 unit test，驗證排序、status、payload shape。
3. 接 `POST /api/v1/ai/chat/twai` 的 `mode=dashboard_guide`，先讓 emergency 回完整 mock-like structured response。
4. 把 emergency hospitals 改成真 tool/query result。
5. 接 `POST /api/v1/ai/guide/event` 的 `candidate.next` 與 `candidate.compare_top`。
6. FE 接 ChatBox rendering：answer/cards/mini_charts/tables/followups/action dispatch。
7. 再做 `origin.drag_end`、`radius.change`、更多 topic。

---

## 20. Test Cases

### 20.1 Unit tests

```txt
EmergencyStatus:
  nil waiting -> unknown
  nil beds -> unknown
  available_beds = 0 -> critical
  waiting_count = 40 -> busy
  available_beds = 2 -> busy
  waiting_count = 18 and available_beds = 6 -> ok

SortEmergencyHospitals:
  has beds before no beds
  lower waiting before higher waiting
  lower distance as tie-breaker
  unknown last

BuildEmergencyGuideResponse:
  answer exists
  data_timestamp is RFC3339
  mini_charts[0].chart_family = apex
  mini_charts[0].data_format is one of the 5 allowed data formats
  map.add_points has valid FeatureCollection
  interaction_model target_layer_id matches map.add_points layerId
  interaction_model version = 1
```

### 20.2 API tests

```txt
empty message -> 400
unknown topic -> 200 with overview/no-data style answer
emergency nearby question -> 200 with full guide payload
candidate.next without session candidates -> 400 or no-data answer
candidate.next with session candidates -> 200 with fly/open_card action
```

### 20.3 Manual FE smoke

```txt
ChatBox first answer renders text + card + Apex mini chart + table.
Click follow-up chip sends another request and preserves chat history.
map.add_points creates markers.
marker hover shows tooltip from properties.
marker click opens card from properties.
filter chip "只看有空床" applies local Mapbox filter.
```
