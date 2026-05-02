BEGIN;

WITH old_components AS (
  SELECT id::integer AS id
  FROM public.components
  WHERE index = 'hackathon_component_2_food_safety_overview'
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
WHERE index = 'hackathon_component_2_food_safety_overview';

DELETE FROM public.component_charts
WHERE index = 'hackathon_component_2_food_safety_overview';

DELETE FROM public.components
WHERE index = 'hackathon_component_2_food_safety_overview';

WITH new_component AS (
  INSERT INTO public.components (index, name)
  VALUES ('hackathon_component_2_food_safety_overview', '食品抽驗合格率')
  RETURNING id, index
),
new_chart AS (
  INSERT INTO public.component_charts (index, color, types, unit)
  SELECT
    index,
    ARRAY['#9ADFB1', '#EEF2F8', '#8F98A9'],
    ARRAY['TextUnitChart2', 'BarPercentChart'],
    '%'
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
    '臺北市政府主計處 / 新北市政府衛生局',
    '顯示臺北市食品抽驗合格率與不合格率。',
    '以最新年度資料呈現臺北市食品抽驗合格率與不合格率，協助民眾快速掌握食品安全抽驗結果。',
    '民眾可藉由食品抽驗合格率快速了解當期食品安全狀況，作為日常消費與風險判讀參考。',
    ARRAY[]::text[],
    ARRAY[]::text[],
    now(),
    now(),
    'three_d',
    $$
      WITH latest AS (
        SELECT MAX(year) AS year
        FROM public."Component1_food_safety_ready"
        WHERE city = '臺北市'
      )
      SELECT
        '臺北市' AS x_axis,
        metric AS y_axis,
        '%' AS icon,
        ROUND(value)::integer AS data
      FROM public."Component1_food_safety_ready" f
      CROSS JOIN LATERAL (
        VALUES
          ('合格率', f.pass_rate::double precision),
          ('不合格率', f.fail_rate::double precision)
      ) AS metrics(metric, value)
      WHERE f.city = '臺北市'
        AND f.year = (SELECT year FROM latest)
        AND value IS NOT NULL
      ORDER BY array_position(ARRAY['合格率', '不合格率'], metric)
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
    '臺北市政府主計處 / 新北市政府衛生局',
    '顯示雙北食品抽驗合格率與不合格率。',
    '以最新年度資料彙整臺北市與新北市食品抽驗合格率與不合格率，協助民眾快速掌握雙北食品安全抽驗結果。',
    '民眾可藉由雙北食品抽驗合格率快速掌握整體食品安全趨勢，作為日常消費與風險判讀參考。',
    ARRAY[]::text[],
    ARRAY[]::text[],
    now(),
    now(),
    'three_d',
    $$
      WITH latest AS (
        SELECT MAX(year) AS year
        FROM public."Component1_food_safety_ready"
      ),
      summary AS (
        SELECT
          ROUND(AVG(pass_rate)::numeric, 0)::integer AS pass_rate,
          ROUND(AVG(fail_rate)::numeric, 0)::integer AS fail_rate
        FROM public."Component1_food_safety_ready"
        WHERE year = (SELECT year FROM latest)
          AND city IN ('臺北市', '新北市')
      )
      SELECT
        '雙北' AS x_axis,
        metric AS y_axis,
        '%' AS icon,
        value AS data
      FROM summary
      CROSS JOIN LATERAL (
        VALUES
          ('合格率', pass_rate),
          ('不合格率', fail_rate)
      ) AS metrics(metric, value)
      WHERE value IS NOT NULL
      ORDER BY array_position(ARRAY['合格率', '不合格率'], metric)
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
WHERE c.index = 'hackathon_component_2_food_safety_overview'
ORDER BY q.city;

SELECT d.id, d.index, d.name, d.components, dg.group_id
FROM public.dashboards d
JOIN public.dashboard_groups dg ON dg.dashboard_id = d.id
WHERE d.index = 'hackathon_food_health'
ORDER BY dg.group_id;
