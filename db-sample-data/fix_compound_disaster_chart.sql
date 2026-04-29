-- 1. 更新組件配置：加入 ColumnChart 並設定顏色與單位
-- 使用 PostgreSQL 陣列語法解決 malformed array literal 錯誤
UPDATE component_charts 
SET types = ARRAY['ColumnChart', 'MapLegend'], 
    color = ARRAY['#0072E3', '#66B3FF', '#80FFFF', '#4EFEB3', '#4F9D9D'],
    unit = '公頃'
WHERE index = 'compound_disaster_map';

-- 2. 設定資料查詢 SQL：統計不同降雨情境的淹水總面積
-- 修正欄位名稱：將 chart 改為 query_chart
-- 修正查詢邏輯：同時更新 query_type 為 'two_d' (支援圖表+地圖)
UPDATE query_charts
SET query_chart = 'SELECT scenario_code as name, ROUND((SUM(ST_Area(geom::geography)) / 10000)::numeric, 2) as value FROM disaster_layers WHERE layer_kind = ''flood_polygon'' GROUP BY scenario_code ORDER BY scenario_code',
    query_type = 'two_d'
WHERE index = 'compound_disaster_map';
