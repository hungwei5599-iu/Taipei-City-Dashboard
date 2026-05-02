BEGIN;

WITH old_components AS (
  SELECT id
  FROM public.components
  WHERE index LIKE 'hackathon_component_9_er_%'
)
UPDATE public.dashboards d
SET components = COALESCE((
    SELECT array_agg(component_id ORDER BY ord)::integer[]
    FROM unnest(COALESCE(d.components, ARRAY[]::integer[])) WITH ORDINALITY AS u(component_id, ord)
    WHERE NOT EXISTS (
      SELECT 1 FROM old_components old WHERE old.id = u.component_id
    )
  ), ARRAY[]::integer[]),
  updated_at = now();

DELETE FROM public.dashboard_groups
WHERE dashboard_id IN (
  SELECT id FROM public.dashboards WHERE index = 'hackathon_food_health'
);

DELETE FROM public.dashboards
WHERE index = 'hackathon_food_health';

DELETE FROM public.query_charts
WHERE index LIKE 'hackathon_component_9_er_%';

DELETE FROM public.component_charts
WHERE index LIKE 'hackathon_component_9_er_%';

DELETE FROM public.components
WHERE index LIKE 'hackathon_component_9_er_%';

DELETE FROM public.component_maps
WHERE index = 'Component2_er_ready';

WITH new_component AS (
  INSERT INTO public.components (index, name)
  VALUES ('hackathon_component_9_er_overview', '急診待診人數和等候時間')
  RETURNING id, index
),
new_map AS (
  INSERT INTO public.component_maps
    (index, title, type, source, size, icon, paint, property)
  VALUES (
    'Component2_er_ready',
    '急診即時壅塞地圖',
    'symbol',
    'geojson',
    NULL,
    'hospital',
    '{}'::json,
    '[
      {"key":"hospital_name","name":"醫院"},
      {"key":"city_scope","name":"範圍"},
      {"key":"patient_count","name":"待診人數"},
      {"key":"waiting_time","name":"等候時間"},
      {"key":"bed_utilization","name":"病床使用"}
    ]'::json
  )
  RETURNING id
),
new_chart AS (
  INSERT INTO public.component_charts (index, color, types, unit)
  SELECT
    index,
    ARRAY['#4CB495', '#F28E5C'],
    ARRAY['ColumnLineChart'],
    '人 / 分鐘'
  FROM new_component
),
new_queries AS (
  INSERT INTO public.query_charts (
    index, history_config, map_config_ids, map_filter,
    time_from, time_to, update_freq, update_freq_unit,
    source, short_desc, long_desc, use_case, links, contributors,
    created_at, updated_at, query_type, query_chart, query_history, city
  )
  SELECT
    c.index,
    NULL::json,
    ARRAY[(SELECT id::integer FROM new_map)],
    '{"mode":"byParam","byParam":{"xParam":"hospital_name"}}'::json,
    'current',
    NULL,
    10,
    'minute',
    '健保署 NHI',
    '顯示急診院所待診人數與等候時間。',
    '整合急診待診人數與等候時間，協助掌握院所急診壅塞程度。',
    '用於比較臺北市或雙北急診院所即時負載。',
    ARRAY[]::text[],
    ARRAY[]::text[],
    now(),
    now(),
    'three_d',
    $$
      SELECT hospital_name AS x_axis, '待診人數' AS y_axis, COALESCE(patient_count, 0)::integer AS data
      FROM public."Component2_er_ready"
      WHERE city_scope = 'Taipei'
      UNION ALL
      SELECT hospital_name AS x_axis, '等候時間' AS y_axis, COALESCE(waiting_time, 0)::integer AS data
      FROM public."Component2_er_ready"
      WHERE city_scope = 'Taipei'
      ORDER BY x_axis, y_axis
    $$,
    NULL::text,
    'taipei'
  FROM new_component c

  UNION ALL

  SELECT
    c.index,
    NULL::json,
    ARRAY[(SELECT id::integer FROM new_map)],
    '{"mode":"byParam","byParam":{"xParam":"hospital_name"}}'::json,
    'current',
    NULL,
    10,
    'minute',
    '健保署 NHI',
    '顯示雙北急診院所待診人數與等候時間。',
    '整合急診待診人數與等候時間，協助掌握雙北院所急診壅塞程度。',
    '用於比較雙北急診院所即時負載。',
    ARRAY[]::text[],
    ARRAY[]::text[],
    now(),
    now(),
    'three_d',
    $$
      SELECT hospital_name AS x_axis, '待診人數' AS y_axis, COALESCE(patient_count, 0)::integer AS data
      FROM public."Component2_er_ready"
      UNION ALL
      SELECT hospital_name AS x_axis, '等候時間' AS y_axis, COALESCE(waiting_time, 0)::integer AS data
      FROM public."Component2_er_ready"
      ORDER BY x_axis, y_axis
    $$,
    NULL::text,
    'metrotaipei'
  FROM new_component c
),
new_dashboard AS (
  INSERT INTO public.dashboards (index, name, components, icon, updated_at, created_at)
  SELECT
    'hackathon_food_health',
    '食安健康',
    ARRAY[id::integer],
    'local_hospital',
    now(),
    now()
  FROM new_component
  RETURNING id
)
INSERT INTO public.dashboard_groups (dashboard_id, group_id)
SELECT id, 3
FROM new_dashboard;

COMMIT;

SELECT c.id, c.index, c.name, cc.types, cc.unit, q.city, q.query_type, q.map_config_ids
FROM public.components c
JOIN public.component_charts cc ON cc.index = c.index
JOIN public.query_charts q ON q.index = c.index
WHERE c.index = 'hackathon_component_9_er_overview'
ORDER BY q.city;
