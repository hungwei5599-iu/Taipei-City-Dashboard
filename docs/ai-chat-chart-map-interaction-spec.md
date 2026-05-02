# AI Chat Chart Data and Map Interaction Spec

## Conclusion

This is doable.

The current chat flow already covers the first required capability:

1. Search related dashboard components with `/vector/component`.
2. Fetch the matched component chart data with `/component/{id}/chart`.
3. Put the chart data into the AI prompt so the answer is based on real chart values instead of only returning a component name.

The missing capability is the second part: converting the selected chart/component into an interactive map action. That requires a small controlled action contract from Chat AI to the frontend, plus map-ready data with coordinates.

## Target User Story

User asks:

```text
哪間還有急診？
```

Expected behavior:

1. AI finds the emergency-related component, for example `hackathon_component_9_er_overview`.
2. Frontend fetches chart data from `/component/{id}/chart`.
3. AI summarizes current emergency status from chart data.
4. Frontend also loads map-ready GeoJSON, for example `/mapData/Component2_er_ready.geojson`.
5. Map displays hospitals as points, styled by `patient_count`.
6. User can click a point and see hospital name, waiting count, waiting time, and data time.

## Capability Split

### 1. Chart Data Analysis

This is already mostly implemented in `Taipei-City-Dashboard-FE/src/store/chatStore.js`.

Required rules:

- Use `/vector/component` to find relevant components.
- Use `/component/{id}/chart` to fetch real chart data.
- Put chart data into the AI context before calling `/ai/chat/twai`.
- Do not let the model answer only with component index, score, or tool names.
- Do not use `datasetCatalog` whitelist for chart questions.

This solves questions like:

- 急診待診人數和等候時間？
- 哪間醫院等待最久？
- 哪些地區藥局密度比較低？
- 淹水風險最高是哪裡？

### 2. Map Interaction

This needs an explicit action layer.

Minimum frontend action contract:

```json
{
  "type": "show_map_layer",
  "layer_id": "ai-er-patient-count",
  "source": "local_geojson",
  "url": "/mapData/Component2_er_ready.geojson",
  "value_key": "patient_count",
  "popup_fields": [
    "hospital_name",
    "patient_count",
    "waiting_time",
    "data_time"
  ]
}
```

Longer term, the BE should return this action from `/api/v1/ai/chat/twai`. For the first implementation, the FE can deterministically trigger the action when the query or selected component is emergency-related.

## Data Requirement

Map interaction requires coordinates. For the current hackathon components, the needed coordinates already exist in FE `mapData`.

Each component that wants map interaction needs one of:

- A local GeoJSON under `Taipei-City-Dashboard-FE/public/mapData`.
- A backend map layer API result with geometry.
- A chart API response that includes `longitude` and `latitude`.

For emergency and pharmacy, these are available now:

```text
Taipei-City-Dashboard-FE/public/mapData/Component2_er_ready.geojson
Taipei-City-Dashboard-FE/public/mapData/Component3_pharmacy_map_ready.geojson
```

Important fields:

- `geometry.coordinates`
- `properties.hospital_name`
- `properties.patient_count`
- `properties.waiting_time`
- `properties.data_time`

## Recommended Architecture

Short term:

```text
ChatBox question
  -> chatStore.searchRelatedComponents()
  -> chatStore.buildDatabaseContext()
  -> chatStore.askTWCCAI()
  -> chatStore.tryRunMapInteraction()
  -> mapStore.showAIInsightLayer()
```

Medium term:

```text
/api/v1/ai/chat/twai
  -> classify intent
  -> fetch component chart data
  -> build answer
  -> return map_actions[]
```

Frontend then only executes `map_actions`.

## Component Registry Needed

We should maintain a small registry that maps a component or intent to map data:

```js
{
  emergency_access: {
    componentIndexes: ["hackathon_component_9_er_overview"],
    keywords: ["急診", "待診", "等候", "醫院"],
    mapUrl: "/mapData/Component2_er_ready.geojson",
    valueKey: "patient_count",
  },
  pharmacy_access: {
    componentIndexes: ["hackathon_component_7_pharmacy_map"],
    keywords: ["藥局", "健保藥局"],
    mapUrl: "/mapData/Component3_pharmacy_map_ready.geojson",
    valueKey: "pharmacy_per_10k",
  },
}
```

This prevents the model from inventing map layers and makes the interaction deterministic.

## First Implementation Scope

Implement emergency and pharmacy first:

- Detect emergency-related questions or component matches.
- Detect pharmacy-related questions or component matches.
- Load `Component2_er_ready.geojson`.
- Load `Component3_pharmacy_map_ready.geojson`.
- Add a Mapbox circle layer named `ai-er-patient-count`.
- Add a Mapbox circle layer named `ai-pharmacy-access`.
- Style circle radius and color by `patient_count`.
- Style pharmacy circles by `pharmacy_per_10k`.
- Register popup fields through existing `MapPopup.vue`.
- Fly the map to the selected layer bounds.
- Add a short bot message telling the user the map has been updated.

## Known Limits

- If the user is not on a page where Mapbox is mounted, the map action cannot render immediately. The chat should still answer with chart data and can tell the user to open the map/dashboard view.
- Current source documents have encoding issues, so prompts should be rewritten in clean UTF-8.
- Hospital names in the current GeoJSON appear partially garbled in this workspace output. The interaction can still work technically, but data encoding should be fixed for demo quality.
- Other components can only support map interaction after they have a reliable coordinate-bearing data source.
