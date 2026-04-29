-- hackathon_seed.sql
-- ============================================================
-- CIVIC NEXUS 黑客松組件元數據注入腳本
-- 目標資料庫：manager (DBManager，通常為 dashboard DB)
-- 執行方式：psql -U postgres -d dashboard -p 5433 -f hackathon_seed.sql
--
-- 注意：本腳本使用 ON CONFLICT DO NOTHING，可安全重複執行。
-- ============================================================

BEGIN;

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. components 表 — 組件基本資訊
-- ──────────────────────────────────────────────────────────────────────────────

INSERT INTO components (index, name) VALUES
  ('hackathon_c1_event_map',          '藝文活動地圖'),
  ('hackathon_c3_cultural_density',   '雙北文化設施密度'),
  ('hackathon_c5_library_map',        '雙北圖書館與閱讀資源'),
  ('hackathon_c8_shelter_gap',        '雙北避難收容缺口分析'),
  ('hackathon_d1_aed_map',            '雙北AED急救設備地圖'),
  ('hackathon_d2_food_inspection',    '雙北食品抽驗合格率趨勢'),
  ('hackathon_d3_death_cause',        '雙北主要死亡原因統計')
ON CONFLICT (index) DO NOTHING;

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. component_charts 表 — 圖表外觀設定
-- ──────────────────────────────────────────────────────────────────────────────

INSERT INTO component_charts (index, color, types, unit) VALUES
  ('hackathon_c1_event_map',
   ARRAY['#FF6B35','#E8B86D','#4ECDC4','#A8E6CF','#FFD93D','#6BCB77'],
   ARRAY['MapLegend'],
   '場次'),
  ('hackathon_c3_cultural_density',
   ARRAY['#7B2D8B','#A855B5','#C084FC','#D8B4FE','#F3E8FF','#3B82F6'],
   ARRAY['BarChart'],
   '處'),
  ('hackathon_c5_library_map',
   ARRAY['#059669','#10B981','#34D399','#6EE7B7','#1D4ED8','#60A5FA'],
   ARRAY['MapLegend'],
   '館'),
  ('hackathon_c8_shelter_gap',
   ARRAY['#DC2626','#F97316','#FACC15','#4ADE80'],
   ARRAY['BarChart'],
   '人'),
  ('hackathon_d1_aed_map',
   ARRAY['#EF4444','#22C55E','#F59E0B'],
   ARRAY['MapLegend'],
   '台'),
  ('hackathon_d2_food_inspection',
   ARRAY['#2563EB','#DC2626','#16A34A','#D97706'],
   ARRAY['TimelineSeparateChart'],
   '%'),
  ('hackathon_d3_death_cause',
   ARRAY['#7C3AED','#DB2777','#EA580C','#D97706','#16A34A','#0891B2','#4F46E5'],
   ARRAY['BarChart'],
   '人')
ON CONFLICT (index) DO NOTHING;

-- ──────────────────────────────────────────────────────────────────────────────
-- 3. query_charts 表 — SQL 查詢字串（BE 用來查 dashboard DB 資料）
--    每個組件需要 taipei + new_taipei 兩筆（city 欄位）
-- ──────────────────────────────────────────────────────────────────────────────

-- C1_藝文活動 (map_legend) ─────────────────────────────────────────────────────
INSERT INTO query_charts
  (index, city, query_type, query_chart,
   time_from, update_freq, update_freq_unit,
   source, short_desc, long_desc, use_case,
   links, contributors, created_at, updated_at)
VALUES
  ('hackathon_c1_event_map', 'taipei', 'map_legend',
   'SELECT title AS name, location_name AS address, longitude, latitude,
           category AS legend_name, ''#FF6B35'' AS color
    FROM hackathon_component_1_event_map_ready
    WHERE city_scope = ''Taipei'' OR city_scope IS NULL
    ORDER BY data_time DESC LIMIT 500',
   'static', 24, 'hour',
   '文化部雲端藝文平台', '台北市近期藝文活動分布地圖',
   '整合文化部開放資料，呈現台北市各行政區當前進行中與即將登場的藝文活動空間分布，協助市民規劃文化參與路線。',
   '協助文化局掌握藝文活動空間熱點，支援場館配給決策。',
   ARRAY['https://cloud.culture.tw'], ARRAY['DE Team'],
   NOW(), NOW()),
  ('hackathon_c1_event_map', 'new_taipei', 'map_legend',
   'SELECT title AS name, location_name AS address, longitude, latitude,
           category AS legend_name, ''#4ECDC4'' AS color
    FROM hackathon_component_1_event_map_ready
    WHERE city_scope = ''NewTaipei''
    ORDER BY data_time DESC LIMIT 500',
   'static', 24, 'hour',
   '文化部雲端藝文平台', '新北市近期藝文活動分布地圖',
   '整合文化部開放資料，呈現新北市各行政區當前進行中與即將登場的藝文活動空間分布。',
   '協助文化局掌握藝文活動空間熱點，支援場館配給決策。',
   ARRAY['https://cloud.culture.tw'], ARRAY['DE Team'],
   NOW(), NOW())
ON CONFLICT DO NOTHING;

-- C3_文化設施密度 (three_d) ────────────────────────────────────────────────────
INSERT INTO query_charts
  (index, city, query_type, query_chart,
   time_from, update_freq, update_freq_unit,
   source, short_desc, long_desc, use_case,
   links, contributors, created_at, updated_at)
VALUES
  ('hackathon_c3_cultural_density', 'taipei', 'three_d',
   'SELECT district AS x_axis, asset_category AS y_axis, COUNT(*) AS data
    FROM hackathon_component_3_cultural_density_ready
    WHERE city_scope = ''Taipei''
    GROUP BY district, asset_category
    ORDER BY COUNT(*) DESC',
   'static', 168, 'hour',
   '臺北市文化局', '台北市各行政區文化資產類別分布',
   '按行政區與資產類別統計台北市文化資產密度，呈現文化資源分布不均現象。',
   '協助文化政策制定者識別文化資源不足地區，支援補助資源分配決策。',
   ARRAY['https://data.taipei'], ARRAY['DE Team'],
   NOW(), NOW()),
  ('hackathon_c3_cultural_density', 'new_taipei', 'three_d',
   'SELECT district AS x_axis, asset_category AS y_axis, COUNT(*) AS data
    FROM hackathon_component_3_cultural_density_ready
    WHERE city_scope = ''NewTaipei''
    GROUP BY district, asset_category
    ORDER BY COUNT(*) DESC',
   'static', 168, 'hour',
   '新北市文化局', '新北市各行政區文化資產類別分布',
   '按行政區與資產類別統計新北市文化資產密度，呈現文化資源分布不均現象。',
   '協助文化政策制定者識別文化資源不足地區，支援補助資源分配決策。',
   ARRAY['https://data.ntpc.gov.tw'], ARRAY['DE Team'],
   NOW(), NOW())
ON CONFLICT DO NOTHING;

-- C5_圖書館地圖 (map_legend) ───────────────────────────────────────────────────
INSERT INTO query_charts
  (index, city, query_type, query_chart,
   time_from, update_freq, update_freq_unit,
   source, short_desc, long_desc, use_case,
   links, contributors, created_at, updated_at)
VALUES
  ('hackathon_c5_library_map', 'taipei', 'map_legend',
   'SELECT library_name AS name, address, longitude, latitude,
           CASE WHEN available_seats IS NOT NULL
                THEN ''有座位資訊'' ELSE ''一般分館'' END AS legend_name,
           ''#059669'' AS color
    FROM hackathon_component_c5_library_ready
    WHERE city_scope = ''Taipei''
    ORDER BY library_name',
   'current', 1, 'hour',
   '臺北市立圖書館', '台北市圖書館分布與即時座位地圖',
   '整合台北市立圖書館分館基本資料與即時座位狀況，呈現閱讀資源空間分布。',
   '協助市民找到鄰近有空位的圖書館，支援閱讀資源均衡配置政策評估。',
   ARRAY['https://seat.tpml.edu.tw'], ARRAY['DE Team'],
   NOW(), NOW()),
  ('hackathon_c5_library_map', 'new_taipei', 'map_legend',
   'SELECT library_name AS name, address, longitude, latitude,
           ''一般分館'' AS legend_name, ''#1D4ED8'' AS color
    FROM hackathon_component_c5_library_ready
    WHERE city_scope = ''NewTaipei''
    ORDER BY library_name',
   'static', 168, 'hour',
   '新北市立圖書館', '新北市圖書館分布地圖',
   '呈現新北市立圖書館各分館空間分布，協助市民掌握閱讀資源地理覆蓋率。',
   '協助市民找到鄰近圖書館，支援閱讀資源均衡配置政策評估。',
   ARRAY['https://data.ntpc.gov.tw'], ARRAY['DE Team'],
   NOW(), NOW())
ON CONFLICT DO NOTHING;

-- C8_避難收容缺口 (percent) ────────────────────────────────────────────────────
INSERT INTO query_charts
  (index, city, query_type, query_chart,
   time_from, update_freq, update_freq_unit,
   source, short_desc, long_desc, use_case,
   links, contributors, created_at, updated_at)
VALUES
  ('hackathon_c8_shelter_gap', 'taipei', 'percent',
   'SELECT district_name AS x_axis,
           ROUND(capacity_gap_ratio::numeric * 100, 1) AS data,
           support_status AS y_axis
    FROM hackathon_component_8_shelter_gap_ready
    WHERE city_scope = ''Taipei''
    ORDER BY capacity_gap_ratio DESC',
   'static', 168, 'hour',
   '臺北市教育局 + 民政局', '台北市各行政區避難收容缺口率',
   '計算台北市各行政區 65 歲以上弱勢人口相對於收容容量的缺口比率，負值代表容量充足，正值代表缺口嚴重。',
   '協助民政局識別收容容量最不足的行政區，支援防災預算分配與場所擴充決策。',
   ARRAY['https://data.taipei'], ARRAY['DE Team'],
   NOW(), NOW()),
  ('hackathon_c8_shelter_gap', 'new_taipei', 'percent',
   'SELECT district_name AS x_axis,
           ROUND(capacity_gap_ratio::numeric * 100, 1) AS data,
           support_status AS y_axis
    FROM hackathon_component_8_shelter_gap_ready
    WHERE city_scope = ''NewTaipei''
    ORDER BY capacity_gap_ratio DESC',
   'static', 168, 'hour',
   '新北市社會局 + 主計處', '新北市各行政區避難收容缺口率',
   '計算新北市各行政區 65 歲以上弱勢人口相對於收容容量的缺口比率。',
   '協助民政局識別收容容量最不足的行政區，支援防災預算分配決策。',
   ARRAY['https://data.ntpc.gov.tw'], ARRAY['DE Team'],
   NOW(), NOW())
ON CONFLICT DO NOTHING;

-- D1_AED地圖 (map_legend) ──────────────────────────────────────────────────────
INSERT INTO query_charts
  (index, city, query_type, query_chart,
   time_from, update_freq, update_freq_unit,
   source, short_desc, long_desc, use_case,
   links, contributors, created_at, updated_at)
VALUES
  ('hackathon_d1_aed_map', 'taipei', 'map_legend',
   'SELECT device_name AS name, address, longitude, latitude,
           COALESCE(device_status, ''正常'') AS legend_name,
           CASE WHEN device_status = ''異常'' THEN ''#EF4444''
                ELSE ''#22C55E'' END AS color
    FROM hackathon_component_d1_aed_ready
    WHERE city_scope = ''Taipei''
    ORDER BY device_name',
   'static', 720, 'hour',
   '臺北市消防局', '台北市AED設備分布地圖',
   '整合台北市消防局公開的 AED 自動體外心臟去顫器設備清單，呈現設備空間分布與狀態。',
   '協助緊急救護人員快速定位最近的 AED 設備，支援心臟驟停急救黃金時間決策。',
   ARRAY['https://data.taipei'], ARRAY['DE Team'],
   NOW(), NOW()),
  ('hackathon_d1_aed_map', 'new_taipei', 'map_legend',
   'SELECT device_name AS name, address, longitude, latitude,
           COALESCE(device_status, ''正常'') AS legend_name,
           ''#F59E0B'' AS color
    FROM hackathon_component_d1_aed_ready
    WHERE city_scope = ''NewTaipei''
    ORDER BY device_name',
   'static', 720, 'hour',
   '新北市消防局', '新北市AED設備分布地圖',
   '整合新北市消防局公開的 AED 設備清單，呈現設備空間分布。',
   '協助緊急救護人員快速定位最近的 AED 設備，支援心臟驟停急救黃金時間決策。',
   ARRAY['https://data.ntpc.gov.tw'], ARRAY['DE Team'],
   NOW(), NOW())
ON CONFLICT DO NOTHING;

-- D2_食品抽驗 (time) ───────────────────────────────────────────────────────────
INSERT INTO query_charts
  (index, city, query_type, query_chart,
   time_from, update_freq, update_freq_unit,
   source, short_desc, long_desc, use_case,
   links, contributors, created_at, updated_at)
VALUES
  ('hackathon_d2_food_inspection', 'taipei', 'time',
   'SELECT year::text AS data_time,
           ROUND(pass_rate::numeric, 1) AS data,
           ''台北市合格率'' AS label
    FROM hackathon_component_d2_food_inspect_ready
    WHERE city_scope = ''Taipei'' AND pass_rate IS NOT NULL
    ORDER BY year ASC',
   'static', 8760, 'hour',
   '臺北市衛生局', '台北市食品抽驗年度合格率趨勢',
   '呈現台北市歷年食品抽驗合格率變化趨勢，含不合格主因分類（違規標示、有害物質殘留等）。',
   '協助衛生稽查人員評估食安政策成效，識別高風險食品類別以集中稽查資源。',
   ARRAY['https://data.taipei'], ARRAY['DE Team'],
   NOW(), NOW()),
  ('hackathon_d2_food_inspection', 'new_taipei', 'time',
   'SELECT year::text AS data_time,
           ROUND(pass_rate::numeric, 1) AS data,
           ''新北市合格率'' AS label
    FROM hackathon_component_d2_food_inspect_ready
    WHERE city_scope = ''NewTaipei'' AND pass_rate IS NOT NULL
    ORDER BY year ASC',
   'static', 8760, 'hour',
   '新北市衛生局', '新北市食品抽驗年度合格率趨勢',
   '呈現新北市歷年食品抽驗合格率變化趨勢。',
   '協助衛生稽查人員評估食安政策成效，識別高風險食品類別。',
   ARRAY['https://data.ntpc.gov.tw'], ARRAY['DE Team'],
   NOW(), NOW())
ON CONFLICT DO NOTHING;

-- D3_主要死因 (three_d) ────────────────────────────────────────────────────────
INSERT INTO query_charts
  (index, city, query_type, query_chart,
   time_from, update_freq, update_freq_unit,
   source, short_desc, long_desc, use_case,
   links, contributors, created_at, updated_at)
VALUES
  ('hackathon_d3_death_cause', 'taipei', 'three_d',
   'SELECT cause_of_death AS x_axis,
           year::text AS y_axis,
           SUM(death_count) AS data
    FROM hackathon_component_d3_death_cause_ready
    WHERE city_scope = ''Taipei'' AND year >= EXTRACT(YEAR FROM NOW()) - 5
    GROUP BY cause_of_death, year
    ORDER BY year DESC, SUM(death_count) DESC',
   'static', 8760, 'hour',
   '臺北市主計處', '台北市近五年主要死亡原因統計',
   '呈現台北市近五年十大主要死亡原因年度變化，以雙北對比視角評估公共健康趨勢。',
   '協助衛生局制定疾病防治優先順序，支援預防醫學資源配置決策。',
   ARRAY['https://data.taipei'], ARRAY['DE Team'],
   NOW(), NOW()),
  ('hackathon_d3_death_cause', 'new_taipei', 'three_d',
   'SELECT cause_of_death AS x_axis,
           year::text AS y_axis,
           SUM(death_count) AS data
    FROM hackathon_component_d3_death_cause_ready
    WHERE city_scope = ''NewTaipei'' AND year >= EXTRACT(YEAR FROM NOW()) - 5
    GROUP BY cause_of_death, year
    ORDER BY year DESC, SUM(death_count) DESC',
   'static', 8760, 'hour',
   '新北市主計處', '新北市近五年主要死亡原因統計',
   '呈現新北市近五年十大主要死亡原因年度變化。',
   '協助衛生局制定疾病防治優先順序，支援預防醫學資源配置決策。',
   ARRAY['https://data.ntpc.gov.tw'], ARRAY['DE Team'],
   NOW(), NOW())
ON CONFLICT DO NOTHING;

-- ──────────────────────────────────────────────────────────────────────────────
-- 4. dashboards 表 — 建立黑客松 Public Dashboard
-- ──────────────────────────────────────────────────────────────────────────────

-- 先取得剛插入的 component IDs
DO $$
DECLARE
  v_c1   BIGINT;
  v_c3   BIGINT;
  v_c5   BIGINT;
  v_c8   BIGINT;
  v_d1   BIGINT;
  v_d2   BIGINT;
  v_d3   BIGINT;
BEGIN
  SELECT id INTO v_c1 FROM components WHERE index = 'hackathon_c1_event_map';
  SELECT id INTO v_c3 FROM components WHERE index = 'hackathon_c3_cultural_density';
  SELECT id INTO v_c5 FROM components WHERE index = 'hackathon_c5_library_map';
  SELECT id INTO v_c8 FROM components WHERE index = 'hackathon_c8_shelter_gap';
  SELECT id INTO v_d1 FROM components WHERE index = 'hackathon_d1_aed_map';
  SELECT id INTO v_d2 FROM components WHERE index = 'hackathon_d2_food_inspection';
  SELECT id INTO v_d3 FROM components WHERE index = 'hackathon_d3_death_cause';

  -- SYS.06 文化共融 Dashboard
  INSERT INTO dashboards (index, name, components, icon, created_at, updated_at)
  VALUES (
    'hackathon-sys06-culture',
    'SYS.06 文化共融',
    ARRAY[v_c1, v_c3, v_c5],
    'emoji_events',
    NOW(), NOW()
  ) ON CONFLICT (index) DO NOTHING;

  -- SYS.04 食安健康 Dashboard
  INSERT INTO dashboards (index, name, components, icon, created_at, updated_at)
  VALUES (
    'hackathon-sys04-food',
    'SYS.04 食安健康',
    ARRAY[v_d2, v_d3],
    'restaurant',
    NOW(), NOW()
  ) ON CONFLICT (index) DO NOTHING;

  -- SYS.02 韌性防災 Dashboard
  INSERT INTO dashboards (index, name, components, icon, created_at, updated_at)
  VALUES (
    'hackathon-sys02-disaster',
    'SYS.02 韌性防災',
    ARRAY[v_c8, v_d1],
    'emergency',
    NOW(), NOW()
  ) ON CONFLICT (index) DO NOTHING;
END $$;

COMMIT;

-- ──────────────────────────────────────────────────────────────────────────────
-- 驗證查詢
-- ──────────────────────────────────────────────────────────────────────────────
SELECT 'components' AS table_name, COUNT(*) AS inserted
FROM components WHERE index LIKE 'hackathon_%'
UNION ALL
SELECT 'component_charts', COUNT(*)
FROM component_charts WHERE index LIKE 'hackathon_%'
UNION ALL
SELECT 'query_charts', COUNT(*)
FROM query_charts WHERE index LIKE 'hackathon_%'
UNION ALL
SELECT 'dashboards', COUNT(*)
FROM dashboards WHERE index LIKE 'hackathon-%';
