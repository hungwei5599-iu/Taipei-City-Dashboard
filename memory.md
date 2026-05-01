# Memory

## Project structure

- `postgres-data`
  - stores ETL output / business data tables
- `postgres-manager`
  - stores dashboard configuration

## General component workflow

### 1. DE / ETL side

- DE is responsible for:
  - finding the data source
  - deciding update frequency
  - cleaning / transforming data
  - writing the result into `postgres-data`
- For hackathon ETL under `Taipei-City-Dashboard-DE/dags/ETL/`:
  - `etl_config.json` defines dataset source and output table
  - `ETL.py` is the actual ETL runner
  - `transforms/{dag_id}.py` only handles transformation logic
- `ETL.py` flow:
  - extract data
  - run transform
  - export CSV
  - if `output_table` starts with `hackathon_`, write to PostgreSQL with `to_sql(if_exists="replace")`
- Important:
  - transform scripts do not directly create tables by themselves
  - the table is created / replaced when `ETL.py` runs `load_to_db()`

### 2. Manager-side component setup

- A normal component is configured mainly in `postgres-manager`
- Main tables:
  - `components`
  - `component_charts`
  - `query_charts`
  - `component_maps` if map is needed
  - `dashboards`
- Meaning of each table:
  - `components`
    - component identity
  - `component_charts`
    - chart type, color, unit
  - `query_charts`
    - SQL query, city version, descriptions, update frequency, query type
  - `component_maps`
    - map layer config
  - `dashboards`
    - which component ids appear on which dashboard

### 3. Mapbox side

- Most map components in this project use:
  - `component_maps.source = 'geojson'`
  - front-end file under `Taipei-City-Dashboard-FE/public/mapData/*.geojson`
- Important:
  - having latitude / longitude in DB does not automatically make Mapbox render points
  - if `source = 'geojson'`, FE still needs a matching `.geojson` file
- FE map rendering concept:
  - DB decides component config
  - GeoJSON file provides actual point / line / polygon features

## Chart / Mapbox notes

- `MapLegend` is not a bar chart or donut chart
- `MapLegend` only shows:
  - legend item
  - icon / color
  - value + unit
- So if `component_charts.types = ARRAY['MapLegend']`, the component card will not render:
  - `BarChart`
  - `DonutChart`
  - other ApexCharts
- `MapLegend` layout and animation are mainly controlled in:
  - `Taipei-City-Dashboard-FE/src/dashboardComponent/components/MapLegend.vue`
- DB can control:
  - legend color
  - unit
  - legend item content / count via `query_charts.query_chart`
- FE controls:
  - alignment
  - spacing
  - animation
  - special visual effects

## Existing ER realtime component

### Data / ETL

- Table in `postgres-data.dashboard`:
  - `er_room_realtime`
- ETL / DE path:
  - `Taipei-City-Dashboard-DE/dags/proj_city_dashboard/er_room_realtime/`

### Manager config

- `components`
  - `id = 301`
  - `index = er_room_realtime`
  - `name = 急診室即時資訊`
- attached dashboard:
  - `dashboards.index = health_safety_metrotaipei`

### Airflow setup that had been fixed earlier

- added Airflow admin user:
  - username: `admin`
  - password: `admin`
- added connection:
  - `conn_id = postgres_default`
  - host: `postgres-data`
  - schema: `dashboard`
  - login: `postgres`
  - password: `admin`
  - port: `5432`
- added variable:
  - `DEFAULT_EMAIL_LIST = ['admin@example.com']`

### Backend fix

- file:
  - `Taipei-City-Dashboard-BE/app/models/dashboard.go`
- purpose:
  - avoid API 500 when `map_config` is empty / null
  - treat empty `map_config` as `[]`

### Chart behavior learned

- `component_charts.types` controls selectable chart types
- `DonutChart` must be spelled exactly `DonutChart`
- `query_charts.query_chart` for normal 2D charts must alias columns as:
  - `x_axis`
  - `data`
- limiting displayed rows should be done in `query_charts.query_chart`, not `component_charts`

### Mapbox behavior learned

- `component_maps` for `er_room_realtime` was already configured
- `query_charts.map_config_ids` for both city rows already pointed to the map layer
- the missing piece was the FE GeoJSON file
- created file:
  - `Taipei-City-Dashboard-FE/public/mapData/er_room_realtime.geojson`
- current state:
  - map can show hospital points

## C1 component: 藝文活動地圖

### Source and ETL

- transform file:
  - `Taipei-City-Dashboard-DE/dags/ETL/transforms/C1_藝文活動.py`
- output table:
  - `hackathon_component_1_event_map_ready`
- source:
  - `cloud.culture.tw`
- ETL command used successfully:
  - inside Airflow container:
    - `python ETL.py --dag-id C1_藝文活動`
- Because Airflow container did not have the correct DB env at first, this working command was used:
  - `HACKATHON_DB_URL='postgresql+psycopg2://postgres:admin@postgres-data:5432/dashboard' python ETL.py --dag-id C1_藝文活動`
- ETL result:
  - extracted `675` raw records
  - transformed into `646` valid rows with coordinates
  - wrote `646` rows into `postgres-data.dashboard.hackathon_component_1_event_map_ready`

### Important understanding about C1 transform

- `C1_藝文活動.py` does perform cleaning, but only:
  - parse `showInfo`
  - explode multiple show entries
  - extract venue / time / latitude / longitude
  - coerce coordinates to numeric
  - drop rows without coordinates
  - add metadata columns
- It does **not** filter for Taipei / New Taipei only
- So the current dataset is actually nationwide, not dual-Taipei only

### Current data status

- table exists in `postgres-data`
  - `hackathon_component_1_event_map_ready`
- verified sample columns match the expected schema:
  - `data_time`
  - `title`
  - `location_name`
  - `latitude`
  - `longitude`
  - `event_time`
  - `category`
  - `on_sales`
  - `source_trace`
  - `data_mode`
- note:
  - although teammate originally described it as dual-Taipei cultural event map, the actual current data contains events across Taiwan

### Manager-side component config created

- new ids used:
  - `components.id = 302`
  - `component_maps.id = 202`
- `components`
  - `id = 302`
  - `index = c1_event_map`
  - `name = 雙北藝文活動地圖`
- `component_charts`
  - `index = c1_event_map`
  - `types = ARRAY['MapLegend']`
- `component_maps`
  - `id = 202`
  - `index = c1_event_map`
  - `title = 藝文活動`
  - `type = symbol`
  - `source = geojson`
  - `icon = triangle_green`
- `query_charts`
  - `index = c1_event_map`
  - `city = metrotaipei`
  - `map_config_ids = {202}`
  - `query_type = map_legend`
- `dashboards`
  - attached to:
    - `map-layers-metrotaipei`
  - dashboard components now include `302`

### Why the card showed only legend, not bar / donut

- `component_charts.types` was set to `MapLegend`
- `query_charts.query_type` was set to `map_legend`
- therefore the component correctly rendered only:
  - legend item
  - icon
  - count (`646 場`)
- this is expected behavior, not a rendering bug

### GeoJSON created for FE

- file created:
  - `Taipei-City-Dashboard-FE/public/mapData/c1_event_map.geojson`
- generated from:
  - `hackathon_component_1_event_map_ready`
- file status:
  - valid `FeatureCollection`
  - `646` point features

## Team / DB collaboration notes

- Git does not automatically include live PostgreSQL data
- Changing data in pgAdmin does not get pushed by `git push`
- Good distinction:
  - `postgres-data`
    - business / ETL data
  - `postgres-manager`
    - dashboard configuration
- Recommended collaboration model:
  - local DB for development
  - SQL files committed to repo for reproducibility
  - optional shared dev DB only if network allows

## Networking lesson from attempted shared DB

- local ports on host worked:
  - `8889` pgAdmin
  - `5432` postgres-manager
  - `5433` postgres-data
- attempted teammate direct DB access via local hotspot / `172.20.10.x` failed
- teammate BE logs showed:
  - `connect: connection refused`
- conclusion:
  - this was a network / hotspot isolation issue, not repo config issue
- practical fallback:
  - use SQL / branch / exported files instead of relying on shared local DB

## Local repo modifications currently relevant

- modified:
  - `Taipei-City-Dashboard-FE/vite.config.js`
    - enabled Vite polling for Docker on Windows
- added:
  - `Taipei-City-Dashboard-FE/public/mapData/er_room_realtime.geojson`
  - `Taipei-City-Dashboard-FE/public/mapData/c1_event_map.geojson`

## Useful reminders

- If a map component uses `source = 'geojson'`, always check:
  1. matching `component_maps.index`
  2. matching `query_charts.map_config_ids`
  3. matching FE file under `public/mapData/{index}.geojson`
- If a chart component shows no normal chart:
  - check whether its type is actually `MapLegend`
- If ETL runs but DB write fails:
  - check `HACKATHON_DB_URL` or `DB_DASHBOARD_*` inside the execution container
