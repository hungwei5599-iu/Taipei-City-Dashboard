-- Competition MVP DB schema plan
-- Last updated: 2026-05-01
-- This is a contract draft, not a migration.

-- DE writes ready data to postgres-data / dashboard.
-- BE writes component/query settings to postgres-manager / dashboardmanager.

CREATE TABLE hackathon_mvp_situation_map_ready (
  city_scope text NOT NULL,
  district_name text NOT NULL,
  latitude double precision,
  longitude double precision,
  category text NOT NULL,
  value double precision NOT NULL,
  status_level text NOT NULL,
  source_trace jsonb NOT NULL,
  data_mode text NOT NULL,
  last_validated_at timestamptz NOT NULL,
  lasttime_in_data timestamptz
);

CREATE INDEX idx_hackathon_mvp_situation_map_scope
  ON hackathon_mvp_situation_map_ready (city_scope, district_name);

CREATE TABLE hackathon_mvp_trend_ready (
  city_scope text NOT NULL,
  district_name text NOT NULL,
  x_axis timestamptz NOT NULL,
  y_axis text NOT NULL,
  data double precision NOT NULL,
  anomaly_flag boolean NOT NULL DEFAULT false,
  source_trace jsonb NOT NULL,
  data_mode text NOT NULL,
  last_validated_at timestamptz NOT NULL,
  lasttime_in_data timestamptz
);

CREATE INDEX idx_hackathon_mvp_trend_scope_time
  ON hackathon_mvp_trend_ready (city_scope, district_name, x_axis);

CREATE TABLE hackathon_mvp_compare_ready (
  city_scope text NOT NULL,
  district_name text NOT NULL,
  metric_name text NOT NULL,
  x_axis text NOT NULL,
  data double precision NOT NULL,
  rank_order integer NOT NULL,
  source_trace jsonb NOT NULL,
  data_mode text NOT NULL,
  last_validated_at timestamptz NOT NULL,
  lasttime_in_data timestamptz
);

CREATE INDEX idx_hackathon_mvp_compare_scope_metric
  ON hackathon_mvp_compare_ready (city_scope, metric_name, rank_order);
