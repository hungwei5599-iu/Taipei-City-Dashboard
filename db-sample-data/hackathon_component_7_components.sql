BEGIN;

WITH old_components AS (
  SELECT id::integer AS id
  FROM public.components
  WHERE index = 'hackathon_component_7_pharmacy_overview'
)
UPDATE public.dashboards d
SET components = COALESCE((
    SELECT array_agg(component_id ORDER BY ord)::integer[]
    FROM unnest(COALESCE(d.components, ARRAY[]::integer[])) WITH ORDINALITY AS u(component_id, ord)
    WHERE NOT EXISTS (
      SELECT 1 FROM old_components old WHERE old.id = u.component_id
    )
  ), ARRAY[]::integer[]),
  updated_at = now()
WHERE EXISTS (
  SELECT 1
  FROM old_components old
  WHERE old.id = ANY(COALESCE(d.components, ARRAY[]::integer[]))
);

DELETE FROM public.query_charts
WHERE index = 'hackathon_component_7_pharmacy_overview';

DELETE FROM public.component_charts
WHERE index = 'hackathon_component_7_pharmacy_overview';

DELETE FROM public.components
WHERE index = 'hackathon_component_7_pharmacy_overview';

DELETE FROM public.component_maps
WHERE index = 'hackathon_component_7_pharmacy_map_ready';

WITH new_component AS (
  INSERT INTO public.components (index, name)
  VALUES ('hackathon_component_7_pharmacy_overview', '藥局資源分布概況')
  RETURNING id, index
),
new_map AS (
  INSERT INTO public.component_maps
    (index, title, type, source, size, icon, paint, property)
  VALUES (
    'hackathon_component_7_pharmacy_map_ready',
    '藥局點位',
    'symbol',
    'geojson',
    NULL,
    'Pharmacy',
    '{}'::json,
    '[
      {"key":"name","name":"藥局"},
      {"key":"city","name":"縣市"},
      {"key":"district","name":"行政區"},
      {"key":"address","name":"地址"},
      {"key":"telephone","name":"電話"},
      {"key":"nhi","name":"健保特約"},
      {"key":"pharmacy_per_10k","name":"每萬人藥局數"}
    ]'::json
  )
  RETURNING id
),
new_chart AS (
  INSERT INTO public.component_charts (index, color, types, unit)
  SELECT
    index,
    ARRAY['#C7D2F4', '#B7C1E0', '#A6B0CC', '#959FB9', '#848EA6', '#737D92', '#626C7F', '#515B6C'],
    ARRAY['DistrictChart', 'BarChart'],
    '家'
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
    '{"mode":"byParam","byParam":{"xParam":"district"}}'::json,
    'current',
    NULL,
    10,
    'minute',
    '臺北市政府衛生局 / 新北市政府衛生局',
    '顯示臺北市各行政區藥局數量。',
    '彙整藥局點位資料，呈現各行政區藥局數量與空間分布，並可連動地圖點位。',
    '協助民眾快速掌握鄰近藥局資源分布。',
    ARRAY[]::text[],
    ARRAY[]::text[],
    now(),
    now(),
    'two_d',
    $$
      SELECT
        district AS x_axis,
        COUNT(*)::numeric AS data
      FROM public.hackathon_component_7_pharmacy_map_ready
      WHERE city = '臺北市'
        AND district IS NOT NULL
        AND district <> 'unknown'
      GROUP BY district
      ORDER BY data DESC, district
    $$,
    NULL::text,
    'taipei'
  FROM new_component c

  UNION ALL

  SELECT
    c.index,
    NULL::json,
    ARRAY[(SELECT id::integer FROM new_map)],
    '{"mode":"byParam","byParam":{"xParam":"district"}}'::json,
    'current',
    NULL,
    10,
    'minute',
    '臺北市政府衛生局 / 新北市政府衛生局',
    '顯示雙北各行政區藥局數量。',
    '彙整雙北藥局點位資料，呈現各行政區藥局數量與空間分布，並可連動地圖點位。',
    '協助民眾比較不同行政區藥局資源密度。',
    ARRAY[]::text[],
    ARRAY[]::text[],
    now(),
    now(),
    'two_d',
    $$
      SELECT
        CONCAT(city, district) AS x_axis,
        COUNT(*)::numeric AS data
      FROM public.hackathon_component_7_pharmacy_map_ready
      WHERE district IS NOT NULL
        AND district <> 'unknown'
      GROUP BY city, district
      ORDER BY data DESC, x_axis
      LIMIT 20
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
    'restaurant',
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
WHERE c.index = 'hackathon_component_7_pharmacy_overview'
ORDER BY q.city;

SELECT m.id, m.index, m.title, m.type, m.source, m.size, m.icon
FROM public.component_maps m
WHERE m.index = 'hackathon_component_7_pharmacy_map_ready';

SELECT d.id, d.index, d.name, d.components, dg.group_id
FROM public.dashboards d
JOIN public.dashboard_groups dg ON dg.dashboard_id = d.id
WHERE d.index = 'hackathon_food_health'
ORDER BY dg.group_id;
