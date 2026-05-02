

對你最有用的是這幾個互動概念：

1. `MarkerTooltip`：滑鼠 hover 顯示短資訊，不需要開完整小卡。
2. `MarkerPopup` / `MapPopup`：點擊後開完整資訊小卡。
3. `MapControls`：定位、縮放、指南針、全螢幕。
4. `MapRoute`：候選點與使用者位置之間的路線或輔助線。
5. `MapClusterLayer`：藥局、環保餐廳這類大量點位需要 cluster。
6. marker drag callbacks：可做「拖曳查詢點」重新查附近資源；mapcn 的 marker props 包含 `onDragStart`、`onDrag`、`onDragEnd`。



---

# 互動性 v0.2：BE 需要支援的事件設計

你現在的 BE spec 不只要回 `map.add_points`，還要回「這些點可以怎麼互動」。否則 FE 只能畫點，不能做導覽感。

建議把 response 從：

```json
{
  "answer": "...",
  "ui_actions": []
}
```

升級成：

```json
{
  "answer": "...",
  "ui_actions": [],
  "interaction_model": {}
}
```

`ui_actions` 負責「立即執行」。
`interaction_model` 負責「使用者之後怎麼互動」。

---

# 1. 新增互動模型：`interaction_model`

急診範例：

```json
{
  "data": {
    "answer": "已標出附近 3 間急診醫院。A 醫院等待人數較低且仍有空床。",
    "module_key": "emergency",
    "component_key": "component_9",
    "data_timestamp": "2026-05-02T14:30:00+08:00",
    "ui_actions": [
      {
        "id": "cmd_clear_001",
        "type": "map.clear_ai_overlay",
        "payload": {
          "scope": "ai-guide"
        }
      },
      {
        "id": "cmd_points_001",
        "type": "map.add_points",
        "payload": {
          "sourceId": "ai-guide-emergency-hospitals",
          "layerId": "ai-guide-emergency-hospitals-circle",
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
          "bounds": [
            [121.5301, 25.0392],
            [121.5520, 25.0550]
          ],
          "padding": 90
        }
      },
      {
        "id": "cmd_card_001",
        "type": "map.open_card",
        "payload": {
          "coordinate": [121.5432, 25.0478],
          "feature_id": "hospital_a",
          "title": "待補醫院 A",
          "summary": "等待人數 18 人，急診空床 6 / 28。",
          "fields": []
        }
      }
    ],
    "interaction_model": {
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
        {
          "id": "recommended",
          "label": "推薦排序"
        },
        {
          "id": "distance",
          "label": "距離最近"
        },
        {
          "id": "beds",
          "label": "空床最多"
        },
        {
          "id": "waiting",
          "label": "等待人數最少"
        }
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
          "payload": {
            "limit": 3
          }
        }
      ]
    },
    "warnings": [
      "若有立即危及生命的狀況，請直接撥打 119。"
    ]
  }
}
```

---

# 2. 急診點位 properties 要升級

BE 回 `map.add_points` 時，不要只塞原始資料。要讓 FE 可以直接做 tooltip、卡片、排序、篩選、候選清單。

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
    "tooltip_lines": [
      "等待 18 人",
      "空床 6 / 28",
      "距離 820 公尺"
    ],

    "card_title": "待補醫院 A",
    "card_summary": "等待人數 18 人，急診空床 6 / 28，距離約 820 公尺。",
    "card_fields": [
      {
        "label": "狀態",
        "value": "可用"
      },
      {
        "label": "等待人數",
        "value": "18"
      },
      {
        "label": "急診空床",
        "value": "6 / 28"
      },
      {
        "label": "距離",
        "value": "820 公尺"
      },
      {
        "label": "地址",
        "value": "待補地址 A"
      },
      {
        "label": "電話",
        "value": "待補電話 A"
      }
    ],

    "last_updated": "2026-05-02T14:30:00+08:00",
    "source": "待補：雙北急診即時資料來源"
  }
}
```

FE 互動時可直接讀 `tooltip_*` 與 `card_*`，不需要每次 hover/click 都打 BE。

---

# 3. 新增互動 endpoint：`POST /ai-guide/event`

使用者點地圖、切篩選、點「看第二順位」、拖曳查詢點，才需要打這支。

## Request

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

## Response

沿用 `/ai-guide/chat` envelope：

```json
{
  "data": {
    "answer": "第二順位是待補醫院 B，等待人數 35 人，空床 2 / 24。",
    "module_key": "emergency",
    "component_key": "component_9",
    "ui_actions": [
      {
        "id": "cmd_fly_002",
        "type": "map.fly_to",
        "payload": {
          "center": [121.5520, 25.0550],
          "zoom": 15
        }
      },
      {
        "id": "cmd_card_002",
        "type": "map.open_card",
        "payload": {
          "coordinate": [121.5520, 25.0550],
          "feature_id": "hospital_b",
          "title": "待補醫院 B",
          "summary": "等待人數 35 人，急診空床 2 / 24。",
          "fields": [
            {
              "label": "等待人數",
              "value": "35"
            },
            {
              "label": "急診空床",
              "value": "2 / 24"
            }
          ]
        }
      }
    ]
  }
}
```

---

# 4. 建議支援的 event types

| event_type              | 來源                |     BE 是否需要處理 | 說明                       |
| ----------------------- | ----------------- | ------------: | ------------------------ |
| `feature.hover`         | marker hover      |            no | FE 本地顯示 tooltip          |
| `feature.click`         | marker click      |      optional | 若資料已在 properties，FE 本地開卡 |
| `feature.select`        | marker/list click |      optional | 可同步 chat 回答              |
| `filter.apply`          | 使用者按篩選 chip       | no / optional | 小篩選 FE 本地即可；需要重查才打 BE    |
| `sort.apply`            | 使用者切排序            | no / optional | 若候選清單已完整，FE 本地即可         |
| `candidate.next`        | quick action      |           yes | 需要依 session 上下文找下一個      |
| `candidate.compare_top` | quick action      |           yes | 回比較卡或 side panel         |
| `origin.drag_end`       | 使用者拖曳查詢點          |           yes | 重新計算附近醫院、藥局等             |
| `radius.change`         | 使用者改搜尋半徑          |           yes | 重新查資料                    |
| `route.request`         | 使用者要求路線           |           yes | 若 BE 有路線服務才支援            |

---

# 5. FE 可做的互動效果，不要求 BE 重算

## 5.1 hover tooltip

BE 只要在 feature properties 放：

```json
{
  "tooltip_title": "待補醫院 A",
  "tooltip_lines": [
    "等待 18 人",
    "空床 6 / 28",
    "距離 820 公尺"
  ]
}
```

FE hover 時本地顯示。

## 5.2 click open card

BE 只要放：

```json
{
  "card_title": "待補醫院 A",
  "card_summary": "等待人數 18 人，急診空床 6 / 28。",
  "card_fields": [
    {
      "label": "等待人數",
      "value": "18"
    }
  ]
}
```

FE click marker 時本地開 `map.open_card`，不必打 BE。

## 5.3 candidate list 同步 map

BE 在 feature 放 `rank`：

```json
{
  "rank": 1,
  "hospital_id": "hospital_a",
  "name": "待補醫院 A"
}
```

FE 左側或聊天窗下方產生候選清單：

```txt
1. 待補醫院 A：等待 18，人空床 6 / 28
2. 待補醫院 B：等待 35，人空床 2 / 24
3. 待補醫院 C：資料不足
```

點清單 item → FE `map.fly_to + map.open_card`。

## 5.4 filter chips

BE 回 filters：

```json
[
  {
    "id": "has_beds",
    "label": "只看有空床",
    "property": "emergency_available_beds",
    "operator": ">",
    "value": 0
  }
]
```

FE 本地套 Mapbox filter，不打 BE。

## 5.5 drag search origin

使用者拖曳「查詢起點」marker 後，FE 打：

```json
{
  "event": {
    "type": "origin.drag_end",
    "payload": {
      "origin": [121.5500, 25.0500],
      "module_key": "emergency",
      "radius_meters": 3000
    }
  }
}
```

BE 重新查候選急診，回新的 `map.clear_ai_overlay + map.add_points + map.fit_bounds + map.open_card`。

這個互動很值得做，因為它比單純聊天更像「AI 導覽員」。

---

# 6. 新增 UI actions：讓互動更完整

原本已經有：

```txt
map.clear_ai_overlay
map.add_points
map.fit_bounds
map.fly_to
map.open_card
dialog.notify
chart.focus_component
```

建議加：

```txt
map.highlight_feature
map.set_filter
map.add_route
panel.open_candidate_list
panel.open_compare
```

## 6.1 `map.highlight_feature`

```json
{
  "id": "cmd_highlight_001",
  "type": "map.highlight_feature",
  "payload": {
    "layerId": "ai-guide-emergency-hospitals-circle",
    "sourceId": "ai-guide-emergency-hospitals",
    "featureId": "hospital_a",
    "featureIdProperty": "hospital_id"
  }
}
```

用途：點聊天中的「A 醫院」時，地圖點位放大或加外圈。

## 6.2 `map.set_filter`

```json
{
  "id": "cmd_filter_001",
  "type": "map.set_filter",
  "payload": {
    "layerId": "ai-guide-emergency-hospitals-circle",
    "filter": [
      ">",
      ["get", "emergency_available_beds"],
      0
    ]
  }
}
```

用途：AI 回答「我先幫你只看有空床的醫院」。

## 6.3 `map.add_route`

如果沒有真實路網服務，先做直線輔助線，不要假裝是實際路線。

```json
{
  "id": "cmd_route_001",
  "type": "map.add_route",
  "payload": {
    "sourceId": "ai-guide-route",
    "layerId": "ai-guide-route-line",
    "route_type": "straight_line",
    "coordinates": [
      [121.5400, 25.0450],
      [121.5432, 25.0478]
    ],
    "summary": "直線距離約 820 公尺，非實際道路路線。"
  }
}
```

## 6.4 `panel.open_candidate_list`

```json
{
  "id": "cmd_panel_list_001",
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
      },
      {
        "feature_id": "hospital_b",
        "title": "待補醫院 B",
        "subtitle": "等待 35 人｜空床 2 / 24｜1.4 公里",
        "status_level": "busy",
        "coordinate": [121.5520, 25.0550]
      }
    ]
  }
}
```

## 6.5 `panel.open_compare`

```json
{
  "id": "cmd_compare_001",
  "type": "panel.open_compare",
  "payload": {
    "title": "急診候選比較",
    "columns": ["醫院", "等待人數", "空床", "距離", "資料時間"],
    "rows": [
      ["待補醫院 A", "18", "6 / 28", "820 公尺", "14:30"],
      ["待補醫院 B", "35", "2 / 24", "1.4 公里", "14:30"],
      ["待補醫院 C", "待補", "待補", "2.1 公里", "14:05"]
    ]
  }
}
```

---

# 7. 急診使用者旅程：高互動版

## Journey 1：問附近急診

```txt
1. 使用者輸入：「幫我看附近哪間急診人比較少，還有空床」
2. BE 回 answer + 急診點位 + interaction_model
3. FE 清除舊 AI overlay
4. FE 畫出急診點位
5. FE 顯示候選清單 panel
6. FE fit bounds 到候選醫院
7. FE 開第一順位醫院小卡
8. 使用者 hover 其他醫院 → tooltip 顯示等待人數、空床、距離
9. 使用者 click 其他醫院 → 小卡切換
10. 使用者點「只看有空床」→ FE 本地 filter
11. 使用者點「比較前三間」→ FE 打 /ai-guide/event
12. BE 回 panel.open_compare
```

## Journey 2：拖曳查詢點

```txt
1. 使用者點「改查詢位置」
2. FE 在地圖上放可拖曳 origin marker
3. 使用者拖到某捷運站或住家附近
4. FE 發 /ai-guide/event: origin.drag_end
5. BE 重新計算該點附近急診候選
6. FE 更新點位、候選清單、小卡
```

## Journey 3：從聊天文字控制地圖

```txt
1. AI 回答：「第一順位是 A 醫院，第二順位是 B 醫院」
2. 回答中的 A / B 是可點文字
3. 使用者點 B 醫院
4. FE dispatch map.fly_to + map.open_card
5. 若需要補資料，再打 /ai-guide/event: feature.select
```

---

# 8. BE 實作範例：高互動急診 response builder

```python
from __future__ import annotations

from datetime import datetime
from typing import Any


def build_emergency_interaction_model() -> dict[str, Any]:
    return {
        "target_layer_id": "ai-guide-emergency-hospitals-circle",
        "feature_id_property": "hospital_id",
        "hover": {
            "type": "tooltip",
            "template": "emergency_short",
        },
        "click": {
            "type": "open_card",
            "template": "emergency_detail",
        },
        "select": {
            "enabled": True,
            "mode": "single",
        },
        "filters": [
            {
                "id": "has_beds",
                "label": "只看有空床",
                "property": "emergency_available_beds",
                "operator": ">",
                "value": 0,
            },
            {
                "id": "low_waiting",
                "label": "等待人數低於 20",
                "property": "emergency_waiting_count",
                "operator": "<",
                "value": 20,
            },
        ],
        "sorts": [
            {"id": "recommended", "label": "推薦排序"},
            {"id": "distance", "label": "距離最近"},
            {"id": "beds", "label": "空床最多"},
            {"id": "waiting", "label": "等待人數最少"},
        ],
        "quick_actions": [
            {
                "id": "show_next",
                "label": "看第二順位",
                "event_type": "candidate.next",
            },
            {
                "id": "compare_top_3",
                "label": "比較前三間",
                "event_type": "candidate.compare_top",
                "payload": {"limit": 3},
            },
        ],
    }


def make_emergency_feature_v2(hospital: dict[str, Any], rank: int) -> dict[str, Any]:
    waiting = hospital.get("emergency_waiting_count")
    available = hospital.get("emergency_available_beds")
    total = hospital.get("emergency_total_beds")
    distance = hospital.get("distance_meters")

    waiting_text = "待補" if waiting is None else str(waiting)
    beds_text = "待補" if available is None or total is None else f"{available} / {total}"
    distance_text = "待補" if distance is None else (
        f"{distance / 1000:.1f} 公里" if distance >= 1000 else f"{distance} 公尺"
    )

    return {
        "type": "Feature",
        "geometry": {
            "type": "Point",
            "coordinates": [hospital["lng"], hospital["lat"]],
        },
        "properties": {
            "module_key": "emergency",
            "hospital_id": hospital["hospital_id"],
            "rank": rank,
            "name": hospital["name"],
            "city": hospital.get("city", "待補"),
            "district": hospital.get("district", "待補"),
            "address": hospital.get("address", "待補"),
            "phone": hospital.get("phone", "待補"),

            "emergency_waiting_count": waiting,
            "emergency_available_beds": available,
            "emergency_total_beds": total,
            "distance_meters": distance,
            "status_level": hospital.get("status_level", "unknown"),

            "tooltip_title": hospital["name"],
            "tooltip_lines": [
                f"等待 {waiting_text} 人",
                f"空床 {beds_text}",
                f"距離 {distance_text}",
            ],

            "card_title": hospital["name"],
            "card_summary": f"等待人數 {waiting_text} 人，急診空床 {beds_text}，距離約 {distance_text}。",
            "card_fields": [
                {"label": "等待人數", "value": waiting_text},
                {"label": "急診空床", "value": beds_text},
                {"label": "距離", "value": distance_text},
                {"label": "地址", "value": hospital.get("address", "待補")},
                {"label": "電話", "value": hospital.get("phone", "待補")},
                {"label": "資料時間", "value": hospital.get("last_updated_text", "待補")},
                {"label": "資料來源", "value": hospital.get("source", "待補")},
            ],

            "last_updated": hospital.get("last_updated", "待補"),
            "source": hospital.get("source", "待補"),
        },
    }


def build_emergency_ai_response_v2(
    hospitals: list[dict[str, Any]],
    data_timestamp: datetime,
) -> dict[str, Any]:
    features = [
        make_emergency_feature_v2(hospital, rank=index + 1)
        for index, hospital in enumerate(hospitals)
    ]

    top = features[0] if features else None

    ui_actions = [
        {
            "id": "cmd_clear_emergency",
            "type": "map.clear_ai_overlay",
            "payload": {"scope": "ai-guide"},
        },
        {
            "id": "cmd_add_emergency_points",
            "type": "map.add_points",
            "payload": {
                "sourceId": "ai-guide-emergency-hospitals",
                "layerId": "ai-guide-emergency-hospitals-circle",
                "geojson": {
                    "type": "FeatureCollection",
                    "features": features,
                },
            },
        },
    ]

    if features:
        lngs = [f["geometry"]["coordinates"][0] for f in features]
        lats = [f["geometry"]["coordinates"][1] for f in features]

        ui_actions.append(
            {
                "id": "cmd_fit_emergency",
                "type": "map.fit_bounds",
                "payload": {
                    "bounds": [
                        [min(lngs), min(lats)],
                        [max(lngs), max(lats)],
                    ],
                    "padding": 90,
                    "duration": 800,
                },
            }
        )

        props = top["properties"]
        ui_actions.append(
            {
                "id": "cmd_open_top_emergency_card",
                "type": "map.open_card",
                "payload": {
                    "coordinate": top["geometry"]["coordinates"],
                    "feature_id": props["hospital_id"],
                    "title": props["card_title"],
                    "summary": props["card_summary"],
                    "fields": props["card_fields"],
                },
            }
        )

        ui_actions.append(
            {
                "id": "cmd_open_candidate_list",
                "type": "panel.open_candidate_list",
                "payload": {
                    "title": "附近急診候選",
                    "items": [
                        {
                            "feature_id": f["properties"]["hospital_id"],
                            "title": f["properties"]["name"],
                            "subtitle": "｜".join(f["properties"]["tooltip_lines"]),
                            "status_level": f["properties"]["status_level"],
                            "coordinate": f["geometry"]["coordinates"],
                        }
                        for f in features
                    ],
                },
            }
        )

    ui_actions.append(
        {
            "id": "cmd_emergency_notice",
            "type": "dialog.notify",
            "payload": {
                "status": "info",
                "message": "若有立即危及生命的狀況，請直接撥打 119。",
            },
        }
    )

    answer = (
        f"已標出附近 {len(features)} 間急診醫院。"
        f"{top['properties']['name']} 目前排序最高。"
        if top
        else "目前查無可用急診資料。"
    )

    return {
        "data": {
            "answer": answer,
            "module_key": "emergency",
            "component_key": "component_9",
            "data_timestamp": data_timestamp.isoformat(),
            "ui_actions": ui_actions,
            "interaction_model": build_emergency_interaction_model(),
            "warnings": [
                "急診等待人數與空床狀態可能快速變動，請以現場與官方資訊為準。",
                "若有立即危及生命的狀況，請直接撥打 119。",
            ],
        }
    }
```

---

# 9. FE event handler 範例：把 mapcn pattern 轉成 Vue + Mapbox

## hover tooltip

```js
bindAiLayerInteractions(layerId) {
	if (!this.map || this.aiLayerClickHandlers[layerId]) return;

	const hoverPopup = new mapboxGl.Popup({
		closeButton: false,
		closeOnClick: false,
		offset: 12,
	});

	const onMouseEnter = (event) => {
		this.map.getCanvas().style.cursor = "pointer";

		const feature = event.features?.[0];
		if (!feature) return;

		const props = feature.properties || {};
		const coordinates = feature.geometry.coordinates.slice();

		const root = document.createElement("div");
		root.className = "ai-tooltip";

		const title = document.createElement("strong");
		title.textContent = props.tooltip_title || props.name || "資訊";
		root.appendChild(title);

		const lines = safeParseJsonArray(props.tooltip_lines);
		for (const line of lines) {
			const p = document.createElement("p");
			p.textContent = String(line);
			root.appendChild(p);
		}

		hoverPopup
			.setLngLat(coordinates)
			.setDOMContent(root)
			.addTo(this.map);
	};

	const onMouseLeave = () => {
		this.map.getCanvas().style.cursor = "";
		hoverPopup.remove();
	};

	const onClick = (event) => {
		const feature = event.features?.[0];
		if (!feature) return;

		const props = feature.properties || {};
		const coordinate = feature.geometry.coordinates.slice();

		this.aiOpenCard({
			coordinate,
			feature_id: props.hospital_id,
			title: props.card_title || props.name || "AI 導覽資訊",
			summary: props.card_summary || "",
			fields: safeParseJsonArray(props.card_fields),
		});
	};

	this.map.on("mouseenter", layerId, onMouseEnter);
	this.map.on("mouseleave", layerId, onMouseLeave);
	this.map.on("click", layerId, onClick);

	this.aiLayerClickHandlers[layerId] = {
		onMouseEnter,
		onMouseLeave,
		onClick,
	};
}

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

注意：Mapbox GeoJSON properties 若經過 layer event 取回，array/object 可能被序列化成字串；FE 要能 parse。

## filter chip

```js
applyAiFilter(layerId, filterSpec) {
	if (!this.map || !this.map.getLayer(layerId)) return;

	const { property, operator, value } = filterSpec;

	const mapboxFilter = [operator, ["get", property], value];

	this.map.setFilter(layerId, mapboxFilter);
}
```

## candidate list item click

```js
handleCandidateClick(item) {
	const mapStore = useMapStore();

	mapStore.executeAiMapCommand({
		type: "map.fly_to",
		payload: {
			center: item.coordinate,
			zoom: 15,
			pitch: 35,
		},
	});

	mapStore.executeAiMapCommand({
		type: "map.open_card",
		payload: {
			coordinate: item.coordinate,
			feature_id: item.feature_id,
			title: item.title,
			summary: item.subtitle,
			fields: item.fields || [],
		},
	});
}
```

---

# 10. 對 BE 的最小新增要求

BE 這次不用做很多。只要加四件事。

第一，`map.add_points` 的 feature properties 加上：

```txt
rank
tooltip_title
tooltip_lines
card_title
card_summary
card_fields
```

第二，response 加 `interaction_model`：

```txt
hover tooltip
click open_card
filters
sorts
quick_actions
```

第三，新增 `/ai-guide/event`：

```txt
candidate.next
candidate.compare_top
origin.drag_end
radius.change
```

第四，急診資料排序與狀態要 deterministic，不讓 LLM 自由判斷：

```txt
unknown: 缺等待人數或缺空床
critical: 空床 <= 0
busy: 等待人數 >= 40 或空床 <= 2
ok: 其他
```

---

# 11. 實作優先順序

第一階段，只做急診高互動：

```txt
1. marker hover tooltip
2. marker click detail card
3. candidate list
4. filter chip：只看有空床
5. quick action：看第二順位
```

第二階段，再做：

```txt
6. 比較前三間
7. 拖曳查詢點
8. 搜尋半徑調整
9. 直線 route / 實際 route
10. cluster：藥局、環保餐廳
```

藥局與環保餐廳再導入 cluster。急診醫院數量有限，不需要 cluster。飲用水監測站可用 tooltip + card。食品抽驗趨勢主要用 chart focus，不要硬塞 map。

