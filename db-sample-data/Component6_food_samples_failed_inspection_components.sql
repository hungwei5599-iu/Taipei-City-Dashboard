BEGIN;

WITH old_components AS (
  SELECT id::integer AS id
  FROM public.components
  WHERE index = 'hackathon_c12_food_failed_category_overview'
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
WHERE index = 'hackathon_c12_food_failed_category_overview';

DELETE FROM public.component_charts
WHERE index = 'hackathon_c12_food_failed_category_overview';

DELETE FROM public.components
WHERE index = 'hackathon_c12_food_failed_category_overview';

WITH new_component AS (
  INSERT INTO public.components (index, name)
  VALUES ('hackathon_c12_food_failed_category_overview', '不合格食品類別')
  RETURNING id, index
),
new_chart AS (
  INSERT INTO public.component_charts (index, color, types, unit)
  SELECT
    index,
    ARRAY['#F28482', '#F2A65A', '#F5C860', '#7BDCA8', '#5C86F2', '#9C7CF4'],
    ARRAY['DonutChart', 'BarChart'],
    '件'
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
    NULL::integer[],
    NULL::json,
    'static',
    NULL::text,
    NULL::integer,
    NULL::text,
    '臺北市政府衛生局',
    '顯示臺北市食品抽驗不合格案件的食品類別分布。',
    '彙整食品抽驗不合格清冊，依食品類別統計案件數，協助民眾快速掌握較常出現不合格案件的食品種類。',
    '用於觀察不合格食品類別分布，作為食品安全宣導與稽查重點參考。',
    ARRAY[]::text[],
    ARRAY[]::text[],
    now(),
    now(),
    'two_d',
    $$
      SELECT
        COALESCE(NULLIF(product_category, ''), '未分類') AS x_axis,
        COUNT(*)::numeric AS data
      FROM public."Components6_Food_samples_failed_inspection_ready"
      WHERE product_category IS NOT NULL
      GROUP BY COALESCE(NULLIF(product_category, ''), '未分類')
      ORDER BY data DESC, x_axis
      LIMIT 10
    $$,
    NULL::text,
    'taipei'
  FROM new_component c

  UNION ALL

  SELECT
    c.index,
    NULL::json,
    NULL::integer[],
    NULL::json,
    'static',
    NULL::text,
    NULL::integer,
    NULL::text,
    '臺北市政府衛生局',
    '顯示食品抽驗不合格案件的食品類別分布。',
    '目前資料來源為臺北市食品抽驗不合格清冊，依食品類別統計案件數。雙北模式下仍呈現目前可用的不合格食品類別資料。',
    '用於觀察不合格食品類別分布，作為食品安全宣導與稽查重點參考。',
    ARRAY[]::text[],
    ARRAY[]::text[],
    now(),
    now(),
    'two_d',
    $$
      SELECT
        COALESCE(NULLIF(product_category, ''), '未分類') AS x_axis,
        COUNT(*)::numeric AS data
      FROM public."Components6_Food_samples_failed_inspection_ready"
      WHERE product_category IS NOT NULL
      GROUP BY COALESCE(NULLIF(product_category, ''), '未分類')
      ORDER BY data DESC, x_axis
      LIMIT 10
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
WHERE c.index = 'hackathon_c12_food_failed_category_overview'
ORDER BY q.city;

SELECT d.id, d.index, d.name, d.components, dg.group_id
FROM public.dashboards d
JOIN public.dashboard_groups dg ON dg.dashboard_id = d.id
WHERE d.index = 'hackathon_food_health'
ORDER BY dg.group_id;
