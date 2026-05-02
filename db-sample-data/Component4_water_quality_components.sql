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
WHERE index = 'Component4_water_quality_ready';

WITH new_component AS (
  INSERT INTO public.components (index, name)
  VALUES ('hackathon_component_10_water_quality_overview', '淨水場水質檢測概況')
  RETURNING id, index
),
new_map AS (
  INSERT INTO public.component_maps
    (index, title, type, source, size, icon, paint, property)
  VALUES (
    'Component4_water_quality_ready',
    '淨水場水質檢測點位',
    'symbol',
    'geojson',
    NULL,
    'Water',
    '{}'::json,
    '[
      {"key":"plant","name":"淨水場"},
      {"key":"county","name":"縣市"},
      {"key":"township","name":"行政區"},
      {"key":"address","name":"地址"},
      {"key":"item","name":"檢測結果"},
      {"key":"itemid","name":"狀態代碼"},
      {"key":"_source","name":"來源"}
    ]'::json
  )
  RETURNING id
),
new_chart AS (
  INSERT INTO public.component_charts (index, color, types, unit)
  SELECT
    index,
    ARRAY['#8ED4A8', '#E9EEF6', '#8B95A7'],
    ARRAY['DistrictChart', 'TextUnitChart2'],
    '座'
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
    '{"mode":"byParam","byParam":{"xParam":"township","yParam":"item"}}'::json,
    'current',
    NULL::text,
    10,
    'minute',
    'Environment Agency',
    '顯示臺北市各行政區淨水場水質檢測結果。',
    '以行政區圖呈現淨水場水質檢測結果。資料目前皆為合格，未來若出現非 PASS 狀態，可用於快速定位需關注行政區。',
    '協助民眾與管理單位快速掌握淨水場水質檢測是否有異常。',
    ARRAY[]::text[],
    ARRAY[]::text[],
    now(),
    now(),
    'three_d',
    $$
      WITH plant_status AS (
        SELECT
          township,
          plant,
          BOOL_OR(itemid <> 'PASS') AS has_failed
        FROM public."Component4_water_quality_ready"
        WHERE county = '臺北市'
          AND township IS NOT NULL
          AND plant IS NOT NULL
        GROUP BY township, plant
      ),
      districts AS (
        SELECT township, COUNT(*)::integer AS plant_count
        FROM plant_status
        GROUP BY township
      ),
      statuses AS (
        SELECT '合格' AS y_axis, 'check_circle' AS icon, false AS has_failed
        UNION ALL
        SELECT '不合格' AS y_axis, 'warning' AS icon, true AS has_failed
      )
      SELECT
        d.township AS x_axis,
        s.y_axis,
        s.icon,
        COUNT(ps.plant)::integer AS data
      FROM districts d
      CROSS JOIN statuses s
      LEFT JOIN plant_status ps
        ON ps.township = d.township
       AND ps.has_failed = s.has_failed
      GROUP BY d.township, d.plant_count, s.y_axis, s.icon
      ORDER BY d.plant_count DESC, d.township,
        array_position(ARRAY['合格','不合格'], s.y_axis)
    $$,
    NULL::text,
    'taipei'
  FROM new_component c

  UNION ALL

  SELECT
    c.index,
    NULL::json,
    ARRAY[(SELECT id::integer FROM new_map)],
    '{"mode":"byParam","byParam":{"xParam":"township","yParam":"item"}}'::json,
    'current',
    NULL::text,
    10,
    'minute',
    'Environment Agency',
    '顯示雙北各行政區淨水場水質檢測結果。',
    '以行政區圖呈現雙北淨水場水質檢測結果。資料目前皆為合格，未來若出現非 PASS 狀態，可用於快速定位需關注行政區。',
    '協助民眾與管理單位快速掌握雙北淨水場水質檢測是否有異常。',
    ARRAY[]::text[],
    ARRAY[]::text[],
    now(),
    now(),
    'three_d',
    $$
      WITH plant_status AS (
        SELECT
          township,
          plant,
          BOOL_OR(itemid <> 'PASS') AS has_failed
        FROM public."Component4_water_quality_ready"
        WHERE township IS NOT NULL
          AND plant IS NOT NULL
        GROUP BY township, plant
      ),
      districts AS (
        SELECT township, COUNT(*)::integer AS plant_count
        FROM plant_status
        GROUP BY township
      ),
      statuses AS (
        SELECT '合格' AS y_axis, 'check_circle' AS icon, false AS has_failed
        UNION ALL
        SELECT '不合格' AS y_axis, 'warning' AS icon, true AS has_failed
      )
      SELECT
        d.township AS x_axis,
        s.y_axis,
        s.icon,
        COUNT(ps.plant)::integer AS data
      FROM districts d
      CROSS JOIN statuses s
      LEFT JOIN plant_status ps
        ON ps.township = d.township
       AND ps.has_failed = s.has_failed
      GROUP BY d.township, d.plant_count, s.y_axis, s.icon
      ORDER BY d.plant_count DESC, d.township,
        array_position(ARRAY['合格','不合格'], s.y_axis)
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
