# AI Open Component Flow

This document explains how the current project lets the AI open a dashboard component list on the Mapbox map page. It is intended as handoff context for another agent that will build more advanced AI map interactions, such as nearest ER/pharmacy, GPS-based distance, fly-to, and routing.

## Goal

When a user asks a question such as:

- `我想去最近的急診室`
- `給我人數最少的急診室`
- `最近的藥局在哪裡`

the AI should decide whether a map/dashboard component should be opened. If yes, the frontend should automatically open the corresponding component card/list and turn on its map layer.

The key design point is:

> The frontend should not hard-code "急診 means open ER" or "藥局 means open pharmacy". The AI chooses from candidate components and returns a structured UI action. The frontend only executes that action.

## Current Architecture

The flow is:

```text
User message
-> FE chatStore calls vector search /vector/component
-> FE sends candidate components + chart data to /ai/chat/twai
-> AI returns strict JSON:
   {
     "answer": "...",
     "ui_actions": [
       {
         "type": "open_component",
         "component_index": "...",
         "component_name": "...",
         "dashboard_index": "hackathon_food_health",
         "city": "metrotaipei",
         "reason": "..."
       }
     ]
   }
-> FE parses ui_actions
-> FE stores an open-component request in uiActionStore + sessionStorage
-> FE navigates to /mapview with aiOpen query params
-> MapView receives the request
-> MapView finds the matching component in currentDashboard.components
-> MapView calls the existing handleToggle(true, map_config)
-> mapStore.addToMapLayerList(map_config) adds or shows the Mapbox layer
```

## Files Changed

### 1. `Taipei-City-Dashboard-FE/src/store/chatStore.js`

This is the AI chat pipeline and now owns the AI-side decision contract.

Important responsibilities:

- Calls `/vector/component` to get semantically related dashboard components.
- Deduplicates components by `index`, preferring `metrotaipei`.
- Builds `available_components` from the vector results.
- Prefetches chart data for the top 3 components as `database context`.
- Sends both `available_components` and `database context` to `/ai/chat/twai`.
- Instructs the AI to return strict JSON with:
  - `answer`
  - `ui_actions`
- Parses the AI response.
- Executes only AI-returned UI actions.

Important functions:

- `buildComponentContext(components)`

Creates the compact component list sent to AI:

```js
{
  id,
  index,
  name,
  city,
  score
}
```

- `parseAiDecision(aiResult)`

Parses the AI response. It accepts plain JSON or JSON inside a markdown code fence. If parsing fails, it falls back to plain text and no UI actions.

- `normalizeUiAction(action)`

Converts AI JSON shape:

```json
{
  "type": "open_component",
  "component_index": "hackathon_component_9_er_overview",
  "component_name": "急診待診人數和等候時間",
  "dashboard_index": "hackathon_food_health",
  "city": "metrotaipei",
  "reason": "..."
}
```

into frontend execution shape:

```js
{
  componentIndex,
  componentName,
  dashboardIndex,
  city,
  reason,
  source: "ai-ui-action"
}
```

- `executeUiActions(uiActions)`

For each AI-selected action:

```js
uiActionStore.requestComponentOpen(action);
routeToComponentOpenAction(action);
```

This is the bridge from AI decision to UI execution.

- `routeToComponentOpenAction(action)`

Navigates to MapView and encodes the requested component in the URL:

```text
/mapview?index=hackathon_food_health&city=metrotaipei&aiOpen=<componentIndex>&aiOpenTs=<timestamp>
```

This prevents lost actions during route/component mounting.

Important logs:

```text
AI components:
AI database context:
[ai-ui] AI selected component open action
```

If `[ai-ui] AI selected component open action` appears, the AI really returned an open-component decision.

### 2. `Taipei-City-Dashboard-FE/src/store/uiActionStore.js`

This file was added.

Purpose:

- Stores the current AI UI action request in Pinia.
- Also persists the request in `sessionStorage`.
- Lets MapView recover the request after route changes, reloads, or delayed mounting.

Main state:

```js
componentOpenRequest: null
```

Main actions:

- `requestComponentOpen(payload)`

Creates a request with `requestId`, stores it in Pinia, and writes it to:

```text
sessionStorage["aiComponentOpenRequest"]
```

- `clearComponentOpenRequest(requestId)`

Clears the request after MapView successfully opens the component.

- `getSavedComponentOpenRequest()`

Lets MapView recover a pending action from sessionStorage.

### 3. `Taipei-City-Dashboard-FE/src/views/MapView.vue`

This file executes the UI action.

It does not decide what the user meant. It only receives a normalized action and opens the component.

Important additions:

- Imports:

```js
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useUiActionStore } from "../store/uiActionStore";
```

- `getRouteAiOpenRequest()`

Reads URL query params:

```text
aiOpen
aiOpenTs
index
city
```

and converts them into an open-component request.

- `getComponentSection(componentIndex)`

Finds where the component currently lives in the MapView rendered lists:

```js
section: "hasMap" | "noMap" | "mapLayer" | "basicLayer"
arrayIdx: number
component: componentConfig
```

This matters because `toggleOn` is split into multiple arrays:

```js
toggleOn = {
  hasMap: [],
  noMap: [],
  mapLayer: [],
  basicLayer: []
}
```

- `openComponentFromAi(request, retryCount = 0)`

This is the main executor.

It:

1. Keeps the request in `pendingAiComponentOpen`.
2. If not on the requested dashboard, navigates to `/mapview`.
3. Waits for `currentDashboard.components` to load.
4. Finds the component.
5. Waits if the map layer is still loading or the map is preloading.
6. Calls:

```js
handleToggle(true, mapConfig);
toggleSwitchBtn(true, target.section, target.arrayIdx);
```

This reuses the exact same path as manual toggle, so manual and AI-opened behavior stay consistent.

Important watchers:

- Watches `uiActionStore.componentOpenRequest`.
- Watches route query `aiOpen` / `aiOpenTs`.
- Watches `contentStore.currentDashboard.components`.
- Watches dashboard index/city, component count, `mapStore.isPreloading`, and `mapStore.loadingLayers.length`.

These are needed because component data and map layers arrive asynchronously.

Important logs:

```text
[ai-ui] open request
[ai-ui] target component not ready
[ai-ui] target map layer still loading
[ai-ui] component opened
```

If `[ai-ui] component opened` appears, MapView has called the same toggle path as manual opening.

### 4. `Taipei-City-Dashboard-BE/app/routes/router.go`

This was changed earlier so guests can use the AI endpoint.

Before, `/api/v1/ai/chat/twai` was protected by:

```go
aiRoutes.Use(middleware.IsLoggedIn())
```

That caused guest users to get:

```text
403 Unauthorized
```

The login middleware was removed from the AI route, while rate-limit middleware was kept:

```go
aiRoutes.Use(middleware.LimitAPIRequests(...))
aiRoutes.Use(middleware.LimitTotalRequests(...))
aiRoutes.POST("/chat/twai", controllers.ChatWithTWCC)
```

This is not directly responsible for opening the list, but it is required for guest users to ask AI questions.

## What Was Removed

The first working prototype used frontend keyword rules such as:

```text
急診 -> hackathon_component_9_er_overview
藥局 -> hackathon_component_7_pharmacy_overview
```

That was removed because the requirement is for AI to decide.

The current frontend no longer has an `inferComponentOpenAction()` keyword router. The frontend only executes `ui_actions` returned by AI.

## How To Verify

1. Hard refresh the frontend:

```text
Ctrl + F5
```

2. Ask:

```text
我想去最近的急診室
```

or:

```text
最近的藥局在哪裡
```

3. Check F12 console.

Expected logs:

```text
[ai-ui] AI selected component open action
[ai-ui] open request
[ai-ui] component opened
```

Expected URL shape:

```text
/mapview?index=hackathon_food_health&city=metrotaipei&aiOpen=<componentIndex>&aiOpenTs=<timestamp>
```

Expected mapStore logs after opening:

```text
[map-debug] addToMapLayerList
[map-debug] fetchLocalGeoJson
[map-debug] layer added
```

## Known Current Behavior

The UI action executes after AI returns its response because the AI must decide which component to open.

This is different from the earlier prototype, which opened immediately after typing because it used frontend keyword rules.

## Current Limitations

- AI can only choose from `available_components` returned by vector search.
- If vector search does not include the right component, AI cannot open it because the prompt says not to invent component indexes.
- AI currently returns JSON in `content`; the frontend parses it. A cleaner future design would have the backend return a separate `ui_actions` field.
- Debug logs are still present:
  - `[ai-ui] ...`
  - `[map-debug] ...`
  These are useful now but can be moved behind a dev flag later.

## Recommended Next Steps

### 1. Move UI Action Parsing To Backend

Cleaner API response:

```json
{
  "status": "success",
  "data": {
    "content": "...",
    "ui_actions": [
      {
        "type": "open_component",
        "component_index": "hackathon_component_9_er_overview",
        "dashboard_index": "hackathon_food_health",
        "city": "metrotaipei"
      }
    ]
  }
}
```

Then the frontend does not need to parse JSON out of natural language content.

### 2. Add GPS / Nearest-Point Action

After component opening works, extend AI actions:

```json
{
  "type": "open_component",
  "component_index": "hackathon_component_9_er_overview",
  "dashboard_index": "hackathon_food_health",
  "city": "metrotaipei"
}
```

plus:

```json
{
  "type": "find_nearest_feature",
  "layer_index": "hackathon_component_9_flood_risk_ready",
  "source": "geojson",
  "from": "user_gps"
}
```

### 3. Add Map Fly-To Action

Future action:

```json
{
  "type": "fly_to_feature",
  "feature_id": "...",
  "zoom": 16
}
```

This should be implemented in MapView/mapStore after the target map layer has loaded.

### 4. Add Route / Straight-Line Navigation

Future action:

```json
{
  "type": "draw_line_to_feature",
  "from": "user_gps",
  "to": {
    "lng": 121.5,
    "lat": 25.0
  }
}
```

Use existing Mapbox source/layer mechanisms or add a dedicated temporary route layer.

## Key Concept For The Next Agent

Do not bypass the current successful manual-toggle path.

The reliable integration point is:

```js
handleToggle(true, mapConfig);
toggleSwitchBtn(true, target.section, target.arrayIdx);
```

This is what makes AI-opened behavior match manual user behavior.

The AI should decide **what** action to perform.
MapView should decide **how** to perform it using existing UI/map logic.
