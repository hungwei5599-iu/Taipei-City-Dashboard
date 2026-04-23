-- Migration: disaster_layers table for compound disaster map component
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS disaster_layers (
  id                  BIGSERIAL PRIMARY KEY,
  layer_kind          TEXT NOT NULL CHECK (layer_kind IN ('flood_polygon', 'road_closure', 'rainfall')),
  scenario_code       TEXT NOT NULL,
  source_dataset_key  TEXT NOT NULL DEFAULT '',
  source_resource_id  TEXT,
  source_feature_key  TEXT NOT NULL DEFAULT '',
  title               TEXT,
  depth_cm            NUMERIC(6,2),
  properties          JSONB NOT NULL DEFAULT '{}'::jsonb,
  geom                geometry(Geometry, 4326) NOT NULL,
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  valid_from          TIMESTAMPTZ,
  valid_to            TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT disaster_layers_geom_kind_chk CHECK (
    (layer_kind = 'flood_polygon' AND GeometryType(geom) IN ('POLYGON', 'MULTIPOLYGON')) OR
    (layer_kind = 'road_closure'  AND GeometryType(geom) IN ('LINESTRING', 'MULTILINESTRING')) OR
    (layer_kind = 'rainfall'      AND GeometryType(geom) IN ('POINT', 'MULTIPOINT'))
  ),
  CONSTRAINT disaster_layers_source_uniq UNIQUE (layer_kind, source_dataset_key, source_resource_id, source_feature_key)
);

CREATE INDEX IF NOT EXISTS disaster_layers_geom_gix   ON disaster_layers USING GIST (geom);
CREATE INDEX IF NOT EXISTS disaster_layers_lookup_idx ON disaster_layers (layer_kind, scenario_code, is_active);
