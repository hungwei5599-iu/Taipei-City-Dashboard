BEGIN;

WITH old_components AS (
  SELECT id
  FROM public.components
  WHERE index = 'hackathon_component_10_water_quality_overview'
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

DELETE FROM public.query_charts
WHERE index = 'hackathon_component_10_water_quality_overview';

DELETE FROM public.component_charts
WHERE index = 'hackathon_component_10_water_quality_overview';

DELETE FROM public.components
WHERE index = 'hackathon_component_10_water_quality_overview';

DELETE FROM public.component_maps
WHERE index = 'hackathon_component_10_water_quality_ready';

WITH new_component AS (
  INSERT INTO public.components (index, name)
  VALUES ('hackathon_component_10_water_quality_overview', '淨水場水質檢測概況')
  RETURNING id, index
),
new_map AS (
  INSERT INTO public.component_maps
    (index, title, type, source, size, icon, paint, property)
  VALUES (
    'hackathon_component_10_water_quality_ready',
    '淨水場水質檢測點位',
    'circle',
    'geojson',
    'big',
    NULL,
    '{
      "circle-color": [
        "interpolate", ["linear"], ["get", "measured_count"],
        0, "#8C8C8C",
        5, "#F5C860",
        10, "#4CB495",
        15, "#2F80ED"
      ],
      "circle-radius": [
        "interpolate", ["linear"], ["get", "item_count"],
        10, 6,
        30, 11,
        60, 16
      ],
      "circle-opacity": 0.86,
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 1
    }'::json,
    '[
      {"key":"plant","name":"淨水場"},
      {"key":"county","name":"縣市"},
      {"key":"township","name":"行政區"},
      {"key":"address","name":"地址"},
      {"key":"item_count","name":"檢測項目"},
      {"key":"measured_count","name":"有效數值"},
      {"key":"source","name":"來源"}
    ]'::json
  )
  RETURNING id
),
new_chart AS (
  INSERT INTO public.component_charts (index, color, types, unit)
  SELECT
    index,
    ARRAY['#4CB495', '#2F80ED', '#F5C860'],
    ARRAY['BarChart', 'ColumnChart'],
    '項'
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
    '{"mode":"byParam","byParam":{"xParam":"plant"}}'::json,
    'current',
    NULL,
    10,
    'minute',
    'Environment Agency',
    '顯示臺北市各淨水場水質檢測項目數。',
    '彙整淨水場水質檢測資料，呈現各淨水場目前可觀測的檢測項目數，並連動地圖點位。',
    '協助民眾快速掌握不同淨水場水質檢測資訊是否完整。',
    ARRAY[]::text[],
    ARRAY[]::text[],
    now(),
    now(),
    'two_d',
    $$
      SELECT
        plant AS x_axis,
        COUNT(DISTINCT item)::numeric AS data
      FROM public.hackathon_component_10_water_quality_ready
      WHERE county = '臺北市'
      GROUP BY plant
      ORDER BY data DESC, plant
    $$,
    NULL::text,
    'taipei'
  FROM new_component c

  UNION ALL

  SELECT
    c.index,
    NULL::json,
    ARRAY[(SELECT id::integer FROM new_map)],
    '{"mode":"byParam","byParam":{"xParam":"plant"}}'::json,
    'current',
    NULL,
    10,
    'minute',
    'Environment Agency',
    '顯示雙北各淨水場水質檢測項目數。',
    '彙整雙北淨水場水質檢測資料，呈現各淨水場目前可觀測的檢測項目數，並連動地圖點位。',
    '協助民眾快速掌握不同淨水場水質檢測資訊是否完整。',
    ARRAY[]::text[],
    ARRAY[]::text[],
    now(),
    now(),
    'two_d',
    $$
      SELECT
        plant AS x_axis,
        COUNT(DISTINCT item)::numeric AS data
      FROM public.hackathon_component_10_water_quality_ready
      GROUP BY plant
      ORDER BY data DESC, plant
    $$,
    NULL::text,
    'metrotaipei'
  FROM new_component c
),
target_dashboard AS (
  SELECT id
  FROM public.dashboards
  WHERE index = 'hackathon_food_health'
),
created_dashboard AS (
  INSERT INTO public.dashboards (index, name, components, icon, updated_at, created_at)
  SELECT
    'hackathon_food_health',
    '食安健康',
    ARRAY[]::integer[],
    'water_drop',
    now(),
    now()
  WHERE NOT EXISTS (SELECT 1 FROM target_dashboard)
  RETURNING id
),
dashboard_to_update AS (
  SELECT id FROM target_dashboard
  UNION ALL
  SELECT id FROM created_dashboard
),
updated_dashboard AS (
  UPDATE public.dashboards d
  SET components = COALESCE(d.components, ARRAY[]::integer[]) || ARRAY(
      SELECT nc.id::integer
      FROM new_component nc
      WHERE NOT nc.id = ANY(COALESCE(d.components, ARRAY[]::integer[]))
    ),
    name = '食安健康',
    updated_at = now()
  FROM dashboard_to_update t
  WHERE d.id = t.id
  RETURNING d.id
)
INSERT INTO public.dashboard_groups (dashboard_id, group_id)
SELECT id, 3
FROM updated_dashboard
WHERE NOT EXISTS (
  SELECT 1
  FROM public.dashboard_groups dg
  WHERE dg.dashboard_id = updated_dashboard.id
    AND dg.group_id = 3
);

COMMIT;

SELECT c.id, c.index, c.name, cc.types, cc.unit, q.city, q.query_type, q.map_config_ids
FROM public.components c
JOIN public.component_charts cc ON cc.index = c.index
JOIN public.query_charts q ON q.index = c.index
WHERE c.index = 'hackathon_component_10_water_quality_overview'
ORDER BY q.city;

SELECT d.id, d.index, d.name, d.components, dg.group_id
FROM public.dashboards d
JOIN public.dashboard_groups dg ON dg.dashboard_id = d.id
WHERE d.index = 'hackathon_food_health'
ORDER BY dg.group_id;
