BEGIN;

WITH old_components AS (
  SELECT id
  FROM public.components
  WHERE index = 'hackathon_c11_env_restaurant_overview'
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
WHERE index = 'hackathon_c11_env_restaurant_overview';

DELETE FROM public.component_charts
WHERE index = 'hackathon_c11_env_restaurant_overview';

DELETE FROM public.components
WHERE index = 'hackathon_c11_env_restaurant_overview';

DELETE FROM public.component_maps
WHERE index = 'Component5_env_protect_restaurant_ready';

WITH new_component AS (
  INSERT INTO public.components (index, name)
  VALUES ('hackathon_c11_env_restaurant_overview', '環保餐廳分布概況')
  RETURNING id, index
),
new_map AS (
  INSERT INTO public.component_maps
    (index, title, type, source, size, icon, paint, property)
  VALUES (
    'Component5_env_protect_restaurant_ready',
    '環保餐廳點位',
    'symbol',
    'geojson',
    NULL,
    'Restaurant',
    '{}'::json,
    '[
      {"key":"name","name":"餐廳"},
      {"key":"city","name":"縣市"},
      {"key":"district","name":"行政區"},
      {"key":"address","name":"地址"},
      {"key":"phone","name":"電話"},
      {"key":"certification_level","name":"認證狀態"},
      {"key":"data_source","name":"來源"}
    ]'::json
  )
  RETURNING id
),
new_chart AS (
  INSERT INTO public.component_charts (index, color, types, unit)
  SELECT
    index,
    ARRAY[
      '#104680',
      '#1d5f99',
      '#317cb7',
      '#4a94c4',
      '#6dadd1',
      '#91c2dd',
      '#b6d7e8',
      '#d1e4ed',
      '#e9f1f4',
      '#f4eadf',
      '#fbe3d5',
      '#f9cbb4',
      '#f6b293',
      '#eb8f75',
      '#dc6d57',
      '#cf4c47',
      '#b72230',
      '#941323',
      '#6d011f'
    ],
    ARRAY['TreemapChart'],
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
    '臺北市環保局 / 新北市環保局',
    '顯示臺北市各行政區環保餐廳數量。',
    '彙整環保餐廳點位資料，呈現各行政區環保餐廳分布，並可連動地圖點位。',
    '協助民眾快速尋找附近具有環保餐廳認證的店家。',
    ARRAY[]::text[],
    ARRAY[]::text[],
    now(),
    now(),
    'two_d',
    $$
      SELECT
        district AS x_axis,
        COUNT(*)::numeric AS data
      FROM public."Component5_env_protect_restaurant_ready"
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
    '臺北市環保局 / 新北市環保局',
    '顯示雙北各行政區環保餐廳數量。',
    '彙整雙北環保餐廳點位資料，呈現各行政區環保餐廳分布，並可連動地圖點位。',
    '協助民眾快速尋找附近具有環保餐廳認證的店家。',
    ARRAY[]::text[],
    ARRAY[]::text[],
    now(),
    now(),
    'two_d',
    $$
      SELECT
        CONCAT(city, district) AS x_axis,
        COUNT(*)::numeric AS data
      FROM public."Component5_env_protect_restaurant_ready"
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
WHERE c.index = 'hackathon_c11_env_restaurant_overview'
ORDER BY q.city;

SELECT d.id, d.index, d.name, d.components, dg.group_id
FROM public.dashboards d
JOIN public.dashboard_groups dg ON dg.dashboard_id = d.id
WHERE d.index = 'hackathon_food_health'
ORDER BY dg.group_id;
