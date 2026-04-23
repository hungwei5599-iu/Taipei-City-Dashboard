#!/usr/bin/env bash
# 將淹水潛勢 GeoJSON 匯入 PostGIS
# 用法: ./import_flood_geojson.sh [geojson_file] [scenario_code]
# 範例: ./import_flood_geojson.sh flood_130mm.geojson 130mm

set -e

GEOJSON="${1:-flood_130mm.geojson}"
SCENARIO="${2:-130mm}"
DB_HOST="${DB_DASHBOARD_HOST:-localhost}"
DB_PORT="${DB_DASHBOARD_PORT:-5432}"
DB_USER="${DB_DASHBOARD_USER:-postgres}"
DB_NAME="${DB_DASHBOARD_DBNAME:-dashboard}"

echo "匯入 $GEOJSON 為 scenario=$SCENARIO ..."

# 用 ogr2ogr 直接寫入 PostGIS
ogr2ogr \
  -f "PostgreSQL" \
  "PG:host=$DB_HOST port=$DB_PORT user=$DB_USER dbname=$DB_NAME" \
  "$GEOJSON" \
  -nln flood_import_tmp \
  -overwrite \
  -lco GEOMETRY_NAME=geom \
  -lco FID=gid \
  -t_srs EPSG:4326

# 從暫存表搬移到 disaster_layers
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" <<SQL
INSERT INTO disaster_layers (layer_kind, scenario_code, source_dataset_key, source_feature_key, title, depth_cm, properties, geom)
SELECT
  'flood_polygon',
  '$SCENARIO',
  '121550',
  COALESCE("Name", gid::text),
  COALESCE("Name", '$SCENARIO 淹水潛勢'),
  CASE WHEN "depth" ~ '^[0-9]' THEN SPLIT_PART("depth", 'm', 1)::numeric * 100 ELSE NULL END,
  jsonb_build_object('depth', "depth", 'case', "case", 'year', "year"),
  geom
FROM flood_import_tmp
ON CONFLICT (layer_kind, source_dataset_key, source_resource_id, source_feature_key) DO NOTHING;

DROP TABLE IF EXISTS flood_import_tmp;
SQL

echo "完成！scenario=$SCENARIO 匯入成功"
