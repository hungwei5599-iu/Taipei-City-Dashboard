-- 競賽 MVP 資料庫結構計畫
-- 最後更新：2026-05-01
-- 這是合約草案，不是 migration。
-- 只描述官方 fork 的競賽重建目標；不得直接複製賽前程式碼。

-- DE 將 ready data 寫入 postgres-data / dashboard。
-- BE 將 component / query 設定寫入 postgres-manager / dashboardmanager。

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
