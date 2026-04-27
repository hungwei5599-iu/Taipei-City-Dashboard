# Heat Family Worker Walkthrough — TDD + DDD Harness

Date: 2026-04-27
Component: `heat-family-worker`
Formal module: `HackathonDashboardView` module `11`

## Phase -1 TDD Contract

- BE contract test added: `Taipei-City-Dashboard-BE/app/services/ai/tools/heat_family_worker_test.go`
- FE mock contract test added: `Taipei-City-Dashboard-FE/tests/components/HeatFamilyWorker.spec.js`
- FE test command added: `npm run test`

## DDD Mapping

| Ubiquitous language | Formal implementation |
| --- | --- |
| AI 洞察面板 | `HackathonDashboardView.vue` calls `/api/v1/ai/chat/twai` and falls back to static text when auth/backend is unavailable |
| 資料源 | `heatFamilyWorkerDataContracts` maps only to `two_d`, `percent`, `three_d`, `map_legend`, `time` |
| 城市語境 | `defaultCity: "metrotaipei"` with 台北 / 雙北 selector |
| 圖表組件 | `vue3-apexcharts` only, with 5 chart shells |
| AI 工具 | `analyze_heat_family_worker` registered in BE tool registry |
| 地圖圖層 | Mapbox GL GeoJSON features from `heatFamilyWorkerFeatures` |

## Verification Evidence

### Passing

```bash
cd Taipei-City-Dashboard/Taipei-City-Dashboard-FE
npm run test
```

Result: passed. The mock contract verified module id `11`, 5 ApexCharts configs, approved data formats, Go AI proxy endpoint, and map feature coverage.

```bash
playwright /hackathon DOM check
```

Result:

```text
title: 雙北高溫家庭與戶外工作者安全
active_button: 高溫安全
apexcharts: 5
chart_shells: 5
map_canvas: 1
visible_features_label: 最後更新：2026-04-27 17:30 · 可見圖徵 7
ai_status: fallback
```

Screenshot: `/tmp/heat-family-worker-hackathon.png`

### Blocked / Pre-existing

```bash
cd Taipei-City-Dashboard/Taipei-City-Dashboard-BE
go test ./app/services/ai/tools/...
```

Blocked: local `go` and `gofmt` binaries are not available in PATH in this Codex session.

```bash
cd Taipei-City-Dashboard/Taipei-City-Dashboard-FE
npm run build:test
```

Blocked by pre-existing lint issues outside this component:

- `src/components/dialogs/RoutePlannerDialog.vue`: unused `_`, empty block
- `src/store/scenarioStore.js`: `console` statement
- `vite.config.js`: duplicate `server` key

## Compliance Report

- ApexCharts only: pass. Source import scan found no ECharts / Chart.js / D3 / Recharts / Highcharts imports in FE source/package.
- AI boundary: pass. Component uses `/api/v1/ai/chat/twai`; no OpenAI / Anthropic / Gemini app calls were found in FE source or BE app scan.
- Data formats: pass. Heat-family-worker contracts are restricted to `two_d`, `percent`, `three_d`, `map_legend`, `time`.
- New dependency: none added. Existing optional native Vite dependencies were restored locally for visual verification.

## Remaining Risks

- AI panel shows `fallback` in local verification because the Go proxy requires backend/auth; this is compliant because the front end still targets the Go proxy and does not call an external AI API.
- Heat exposure is still a CWA warning +示意區 layer, not a complete urban heat island science model.
- New Taipei resource layer remains `official_proxy`; do not rename it as official New Taipei cooling-site coverage without a stronger source.
