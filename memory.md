# Memory

## Project overview

- `postgres-data` stores ETL output / actual data tables.
- `postgres-manager` stores dashboard configuration data.

## New ER component

- New DE DAG folder:
  - `Taipei-City-Dashboard-DE/dags/proj_city_dashboard/er_room_realtime/`
- New data table:
  - `postgres-data -> database: dashboard -> table: er_room_realtime`
- New manager-side component:
  - `components.id = 301`
  - `components.index = er_room_realtime`
  - `components.name = 急診室即時資訊`
- Attached dashboard:
  - `dashboards.index = health_safety_metrotaipei`
  - dashboard components now include `301`

## Manager DB config added

- `component_maps`
  - `id = 1`
  - `index = er_room_realtime`
- `component_charts`
  - `index = er_room_realtime`
  - currently configured for `BarChart`
- `query_charts`
  - two rows added:
    - `city = taipei`
    - `city = metrotaipei`

## Airflow / DE setup that was missing

- Airflow web login did not originally match the DE `.env` expectation.
- Existing Airflow user found:
  - `User / airflowadmin@example.com`
- Added Airflow admin user:
  - username: `admin`
  - password: `admin`
- Added Airflow connection:
  - `conn_id = postgres_default`
  - host: `postgres-data`
  - schema: `dashboard`
  - login: `postgres`
  - password: `admin`
  - port: `5432`
- Added Airflow variable:
  - `DEFAULT_EMAIL_LIST = ['admin@example.com']`

## Important architecture notes

### When adding a new component

1. Create or confirm the source table in `postgres-data`.
2. Make sure DE / Airflow actually writes data into that table.
3. Add manager-side config in `postgres-manager`:
   - `components`
   - `component_charts`
   - `query_charts`
   - `component_maps` if map layer is needed
   - `dashboards` to attach the component

### Which table controls what

- `components`
  - basic identity of a component
  - fields like `id`, `index`, `name`
- `component_charts`
  - chart appearance
  - chart types, colors, unit
- `query_charts`
  - SQL query logic
  - city version
  - update frequency
  - query type
- `component_maps`
  - mapbox layer config
  - only needed if the component should render on the map
- `dashboards`
  - decides which component ids appear on which dashboard

## UI / chart customization notes

- To limit displayed rows:
  - update `query_charts.query_chart`
  - example: add `LIMIT 6`
- To filter out zero values:
  - update `query_charts.query_chart`
  - example: `AND COALESCE(wait_general, 0) > 0`
- To add more selectable chart types:
  - update `component_charts.types`
  - this is an array
- To change chart colors:
  - update `component_charts.color`
  - this is an array

## Code changes made in repo

- Backend fix in:
  - `Taipei-City-Dashboard-BE/app/models/dashboard.go`
- Purpose:
  - avoid API 500 when a component has empty / null `map_config`
  - treat empty `map_config` as `[]`

## Files with local modifications / additions

- Modified:
  - `Taipei-City-Dashboard-BE/app/models/dashboard.go`
  - `start_dashboard.bat`
- Added / untracked:
  - `Taipei-City-Dashboard-DE/dags/proj_city_dashboard/er_room_realtime/`
  - `docs/`
  - `Taipei-City-Dashboard-FE/src/dashboardComponent/components/test.vue`
  - `.claude/`
  - `docs.zip`
  - `docs.rar`
  - `test1.png`

## Important warning before pushing

- `start_dashboard.bat` was already modified before final review here; verify whether you want that change included.
- `test.vue`, `docs.zip`, `docs.rar`, `test1.png`, and `.claude/` look like local / temporary artifacts; confirm whether they should be committed.
- The broader Airflow environment still shows unrelated broken DAGs due missing deps like `fiona` and missing variables like `SPATIAL_MAPPINGS`.
- The new `er_room_realtime` DAG files were repaired locally because the working copies showed corrupted JSON / Python content.

## If resuming tomorrow

- First check whether the DAG run succeeded:
  - `proj_city_dashboard_er_room_realtime`
- Then verify data exists in:
  - `postgres-data -> dashboard -> er_room_realtime`
- Then verify front-end card behavior in:
  - `health_safety_metrotaipei`
