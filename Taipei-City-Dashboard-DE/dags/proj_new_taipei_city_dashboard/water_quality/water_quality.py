"""
water_quality.py
================
C10 水質檢測資訊 — 獨立 ETL 腳本
不依賴 Airflow，按 Extract → Transform → Load 順序執行。

執行方式
--------
  python water_quality.py
  python water_quality.py --db
  python water_quality.py --output ./data

資料來源
--------
  行政院環境保護署 CSV API（offset 分頁，約 110 頁）
  GET https://data.moenv.gov.tw/api/v2/dws_p_28

輸出 Schema
-----------
  data_time, county, township, plant, address,
  latitude, longitude, ckdate, itemid, item, itemval, standards,
  _fetch_time, _source
"""

import argparse
import json
import os
import pandas as pd
from datetime import datetime
from pathlib import Path
import sys


# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent))
from utils.etl_utils import (
    extract_open_api_csv_paged,
    geocode_address,
    load_csv,
    load_to_db,
    TAIPEI_TZ,
)

# ── 讀取 job_config.json ────────────────────────────────────
_HERE        = os.path.dirname(os.path.abspath(__file__))
_CONFIG_PATH = os.path.join(_HERE, "job_config.json")

with open(_CONFIG_PATH, encoding="utf-8") as f:
    _JOB = json.load(f)

DAG_INFOS    = _JOB["dag_infos"]
OUTPUT_TABLE = DAG_INFOS["ready_data_default_table"]
LOAD_BEHAVIOR = DAG_INFOS["load_behavior"]
_SRC         = _JOB["data_infos"]["sources"][0]

# ── 淨水場靜態座標（高信心度）─────────────────────────────────
WATER_PLANT_COORDS = {
    "板新淨水廠": (24.940313, 121.356482),
    "貢寮淨水場": (25.010992, 121.920722),
    "老梅淨水場": (25.254823, 121.551272),
    "萬里淨水場": (25.179375, 121.688809),
    "中幅淨水場": (25.165400, 121.675186),
    "烏來淨水場": (24.864725, 121.552571),
}


# ─────────────────────────────────────────────────────────────
# Step 1 — Extract
# 依賴：無
# ─────────────────────────────────────────────────────────────

def step_extract() -> pd.DataFrame:
    print("[Step 1] Extract 開始")
    df = extract_open_api_csv_paged(
        api_url        = _SRC["api_url"],
        api_params     = _SRC["api_params"],
        encoding       = _SRC.get("encoding", "utf-8"),
        pagination_type= _SRC.get("pagination_type", "offset"),
        max_pages      = _SRC.get("max_pages", 110),
    )
    print(f"  原始筆數：{len(df):,}，欄位：{list(df.columns)}")
    print("[Step 1] Extract 完成\n")
    return df


# ─────────────────────────────────────────────────────────────
# Step 2 — Transform
# 依賴：step_extract() 輸出
# ─────────────────────────────────────────────────────────────

def _attach_coords(df: pd.DataFrame) -> pd.DataFrame:
    """
    座標補齊流程（兩階段）：
      1. 靜態字典（高信心度淨水場）
      2. ArcGIS 地理編碼（剩餘淨水場，使用 address 欄位）
    """
    df = df.copy()
    df["latitude"]  = None
    df["longitude"] = None

    if "plant" not in df.columns:
        return df

    # Phase 1：靜態座標
    for plant, (lat, lng) in WATER_PLANT_COORDS.items():
        mask = df["plant"] == plant
        df.loc[mask, "latitude"]  = lat
        df.loc[mask, "longitude"] = lng

    # Phase 2：ArcGIS 地理編碼（處理沒有靜態座標的淨水場）
    need_geocode = df[df["latitude"].isna()]["plant"].unique()
    if len(need_geocode) > 0 and "address" in df.columns:
        print(f"  [Geocode] 需編碼：{list(need_geocode)}")
        # 每個淨水場只編碼一次
        plant_addr = (
            df[df["plant"].isin(need_geocode)]
            .drop_duplicates(subset=["plant"])[["plant", "address"]]
        )
        geocoded = {}
        for _, row in plant_addr.iterrows():
            coords = geocode_address(row["address"])
            geocoded[row["plant"]] = coords
            print(f"    {row['plant']}: lat={coords['lat']}, lng={coords['lng']}")

        for plant, coords in geocoded.items():
            mask = df["plant"] == plant
            df.loc[mask, "latitude"]  = coords["lat"]
            df.loc[mask, "longitude"] = coords["lng"]

    ok = df["latitude"].notna().sum()
    print(f"  座標補齊：{ok}/{len(df)} 筆")
    return df


def step_transform(df: pd.DataFrame) -> pd.DataFrame:
    """
    過濾縣市 → 篩選 PASS → 去重 → 補座標 → 整理欄位

    依賴：step_extract() 的輸出
    """
    print("[Step 2] Transform 開始")

    # ── 2a. 過濾雙北 ──────────────────────────────────────────
    if "county" in df.columns:
        df["county"] = df["county"].astype(str).str.strip()
        df = df[df["county"].isin(["臺北市", "台北市", "新北市"])]
        print(f"  過濾雙北後：{len(df):,} 筆")

    if df.empty:
        print("  [警告] 過濾後無資料"); return pd.DataFrame()

    # ── 2b. 只保留 itemid=PASS ────────────────────────────────
    if "itemid" in df.columns:
        df = df[df["itemid"] == "PASS"]
        print(f"  PASS 筆數：{len(df):,}")

    if df.empty:
        print("  [警告] 無 PASS 紀錄"); return pd.DataFrame()

    # ── 2c. 去重與清洗 ────────────────────────────────────────
    df = df.drop_duplicates()
    df.columns = df.columns.str.strip()

    # plant + 採樣日期去重（每個淨水場每天只保留一筆）
    if "plant" in df.columns and "ckdate" in df.columns:
        df["ckdate"] = pd.to_datetime(df["ckdate"], errors="coerce", format="%Y%m%d")
        df = df.drop_duplicates(subset=["plant", "ckdate"], keep="first")
        print(f"  plant+ckdate 去重後：{len(df):,} 筆")

    # 數值清洗
    if "itemval" in df.columns:
        df["itemval"] = pd.to_numeric(df["itemval"], errors="coerce")
    text_cols = df.select_dtypes(include=["object"]).columns
    df[text_cols] = df[text_cols].apply(lambda s: s.astype(str).str.strip())

    # ── 2d. 補齊座標（靜態 + ArcGIS）────────────────────────
    df = _attach_coords(df)

    # ── 2e. 系統欄位 ──────────────────────────────────────────
    df["data_time"]   = datetime.now(tz=TAIPEI_TZ).isoformat()
    df["_fetch_time"] = df["data_time"]
    df["_source"]     = "Environment Agency"

    # ── 2f. 欄位順序 ──────────────────────────────────────────
    priority = ["data_time", "county", "township", "plant", "address",
                "latitude", "longitude", "ckdate", "itemid", "item",
                "itemval", "standards", "_fetch_time", "_source"]
    exist_p = [c for c in priority if c in df.columns]
    others  = [c for c in df.columns if c not in exist_p]
    df = df[exist_p + others].reset_index(drop=True)

    print(f"[Step 2] Transform 完成 — 共 {len(df):,} 筆\n")
    return df


# ─────────────────────────────────────────────────────────────
# Step 3 — Load
# 依賴：step_transform() 輸出
# ─────────────────────────────────────────────────────────────

def step_load(df: pd.DataFrame, output_dir: str) -> str:
    print("[Step 3] Load 開始")
    filepath = load_csv(df, output_dir, OUTPUT_TABLE)
    load_to_db(df, table_name=OUTPUT_TABLE, load_behavior=LOAD_BEHAVIOR)  # 無條件寫入
    print("[Step 3] Load 完成\n")
    return filepath


# ─────────────────────────────────────────────────────────────
# 主流程
# ─────────────────────────────────────────────────────────────

def main(output_dir: str = "./data"):
    print("=" * 55)
    print(f"ETL 開始：{DAG_INFOS['dag_id']}")
    print("=" * 55)

    df_raw = step_extract()
    if df_raw is None or df_raw.empty:
        print("[ETL] Extract 無資料，中止。"); return

    df = step_transform(df_raw)
    if df.empty:
        print("[ETL] Transform 結果為空，中止。"); return

    step_load(df, output_dir=output_dir)

    print("=" * 55)
    print("ETL 完成")
    print("=" * 55)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default="./data")
    args = parser.parse_args()
    main(output_dir=args.output)