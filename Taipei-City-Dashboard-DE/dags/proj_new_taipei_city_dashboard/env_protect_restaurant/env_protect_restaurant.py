"""
eco_restaurant.py
=================
C11 雙北環保餐廳地圖 — 獨立 ETL 腳本
不依賴 Airflow，按 Extract → Transform → Load 順序執行。

執行方式
--------
  python eco_restaurant.py
  python eco_restaurant.py --db
  python eco_restaurant.py --output ./data

資料來源（merged，兩個來源獨立擷取）
--------------------------------------
  1. 臺北市環保餐廳  ← data.taipei API
  2. 新北市環保餐廳  ← data.ntpc API

輸出 Schema
-----------
  data_time, city, district, name, address,
  latitude, longitude, phone, certification_level,
  eco_attributes, data_source
"""

import argparse
import json
import os
import re
import pandas as pd
from datetime import datetime
from pathlib import Path
import sys

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from utils.extract_utils import (
	extract_data_taipei,
    extract_ntpc,
    TAIPEI_TZ,
)
from utils.transform_utils import (
	batch_geocode,
)
from utils.load_utils import (
	load_csv,
	load_to_db,
)

# ── 讀取 job_config.json ────────────────────────────────────
_HERE        = os.path.dirname(os.path.abspath(__file__))
_CONFIG_PATH = os.path.join(_HERE, "job_config.json")

with open(_CONFIG_PATH, encoding="utf-8") as f:
    _JOB = json.load(f)

DAG_INFOS    = _JOB["dag_infos"]
OUTPUT_TABLE = DAG_INFOS["ready_data_default_table"]
LOAD_BEHAVIOR = DAG_INFOS["load_behavior"]

def _cfg(dag_id: str) -> dict:
    return next(s for s in _JOB["data_infos"]["sources"] if s["dag_id"] == dag_id)

TP_RID    = _cfg("臺北市環保餐廳")["RID"]
NTPC_ID   = _cfg("新北市環保餐廳")["PAGE_ID"]

# ── 行政區列表 ─────────────────────────────────────────────────
_TP_DISTRICTS = [
    "松山區","信義區","大安區","中山區","中正區","大同區","萬華區",
    "文山區","南港區","內湖區","士林區","北投區",
]
_NTPC_DISTRICTS = [
    "板橋區","中和區","新店區","蘆洲區","三重區","永和區","汐止區",
    "瑞芳區","五股區","八里區","淡水區","林口區","深坑區","石碇區",
    "坪林區","烏來區","金山區","萬里區","平溪區","雙溪區","貢寮區",
    "新莊區","泰山區","土城區","樹林區","三峽區","鶯歌區","大溪區",
]


# ─────────────────────────────────────────────────────────────
# Step 1 — Extract
# 兩個來源互相獨立，無前置依賴
# ─────────────────────────────────────────────────────────────

def step_extract() -> dict[str, pd.DataFrame]:
    print("[Step 1] Extract 開始（兩來源獨立擷取）")

    tp_df   = extract_data_taipei(TP_RID)    # 1a. 臺北市
    ntpc_df = extract_ntpc(NTPC_ID)          # 1b. 新北市

    raw = {"臺北市環保餐廳": tp_df, "新北市環保餐廳": ntpc_df}
    for name, df in raw.items():
        print(f"  [{name}] {len(df)} 筆")
    print("[Step 1] Extract 完成\n")
    return raw


# ─────────────────────────────────────────────────────────────
# Step 2 — Transform（per-city）
# 依賴：step_extract() 輸出
# ─────────────────────────────────────────────────────────────

def _clean_address(addr) -> str:
    if pd.isna(addr) or not addr:
        return ""
    a = re.sub(r'[\(（].*?[\)）]', '', str(addr))
    a = re.sub(r'(\d+樓|B\d+).*', '', a, flags=re.IGNORECASE)
    return re.sub(r'\s+', ' ', a).strip()


def _clean_phone(phone) -> str:
    if pd.isna(phone) or not phone:
        return ""
    return re.sub(r'[^\d\-+()/]', '', str(phone)).strip()


def _extract_district(address: str, city: str) -> str:
    districts = _TP_DISTRICTS if city == "臺北市" else _NTPC_DISTRICTS
    for d in districts:
        if d in str(address):
            return d
    return "unknown"


def _certification_level(eco_list) -> str:
    """依環保作為數量計算認證等級。"""
    if not eco_list:
        return "認證中"
    n = len(eco_list)
    if n >= 6:
        return "鑽石級"
    elif n >= 4:
        return "金級"
    return "銀級"


def _transform_taipei(df: pd.DataFrame, data_time: str) -> pd.DataFrame:
    """臺北市環保餐廳欄位標準化。原始欄位：餐廳名稱, 餐廳地址, 餐廳電話, 類別環保作為"""
    if df.empty:
        return df
    df = df.copy()
    df.columns = df.columns.str.strip()
    df = df.dropna(axis=1, how="all")
    before = len(df)
    df = df.drop_duplicates(subset=["餐廳名稱", "餐廳地址"])
    print(f"  [臺北市] 去重：{before - len(df)} 筆 → 剩 {len(df)} 筆")

    df["name"]    = df.get("餐廳名稱", pd.Series(dtype=str)).astype(str).str.strip()
    df["address"] = df.get("餐廳地址", pd.Series(dtype=str)).apply(_clean_address)
    df["phone"]   = df.get("餐廳電話", pd.Series(dtype=str)).apply(_clean_phone)
    df["city"]    = "臺北市"
    df["district"] = df["address"].apply(lambda x: _extract_district(x, "臺北市"))

    # 環保作為 → tuple，再轉 JSON string 存資料庫
    def _to_eco_tuple(x):
        if pd.isna(x) or not x:
            return ()
        return tuple(a.strip() for a in str(x).split(",")
                     if a.strip() and a.strip() != "--")

    eco_col = df.get("類別環保作為", pd.Series(dtype=str, index=df.index)).fillna("")
    df["_eco_tuple"] = eco_col.apply(_to_eco_tuple)
    df["eco_attributes"]      = df["_eco_tuple"].apply(lambda t: str(list(t)))
    df["certification_level"] = df["_eco_tuple"].apply(
        lambda t: _certification_level(list(t)))

    df["data_source"] = "臺北市環保局"
    df["data_time"]   = data_time
    return df


def _transform_ntpc(df: pd.DataFrame, data_time: str) -> pd.DataFrame:
    """新北市環保餐廳欄位標準化。原始欄位：name, address, localcallservice"""
    if df.empty:
        return df
    df = df.copy()
    df.columns = df.columns.str.strip()
    df = df.dropna(axis=1, how="all")
    before = len(df)
    df = df.drop_duplicates(subset=["name", "address"])
    print(f"  [新北市] 去重：{before - len(df)} 筆 → 剩 {len(df)} 筆")

    df["name"]    = df.get("name", pd.Series(dtype=str)).astype(str).str.strip()
    df["address"] = df.get("address", pd.Series(dtype=str)).apply(_clean_address)
    df["phone"]   = df.get("localcallservice", pd.Series(dtype=str)).apply(_clean_phone)
    df["city"]    = "新北市"
    df["district"] = df["address"].apply(lambda x: _extract_district(x, "新北市"))

    df["eco_attributes"]      = str(["認證中"])
    df["certification_level"] = "認證中"
    df["data_source"] = "新北市環保局"
    df["data_time"]   = data_time
    return df


def step_transform(raw: dict[str, pd.DataFrame]) -> pd.DataFrame:
    """
    臺北 + 新北分別標準化 → 合併 → ArcGIS 地理編碼

    依賴：step_extract() 的輸出
    ⚠ 地理編碼每筆 0.3 秒，視資料量耗時約數分鐘
    """
    print("[Step 2] Transform 開始")
    data_time = datetime.now(tz=TAIPEI_TZ).isoformat()

    # ── 2a. per-city 標準化（獨立，無互相依賴）───────────────────
    df_tp   = _transform_taipei(raw["臺北市環保餐廳"], data_time)
    df_ntpc = _transform_ntpc(raw["新北市環保餐廳"],   data_time)

    # ── 2b. 合併 ──────────────────────────────────────────────
    _cols = ["data_time","city","district","name","address","phone",
             "certification_level","eco_attributes","data_source"]
    combined = pd.concat(
        [df_tp[[c for c in _cols if c in df_tp.columns]],
         df_ntpc[[c for c in _cols if c in df_ntpc.columns]]],
        ignore_index=True
    )
    print(f"  合併後：{len(combined)} 筆")

    # ── 2c. ArcGIS 地理編碼（依賴 2a+2b 完成）────────────────────
    print("  [Geocode] 開始批量地理編碼…")
    geo = batch_geocode(combined, "address")
    combined["latitude"]  = geo["latitude"].values
    combined["longitude"] = geo["longitude"].values

    # ── 2d. 最終欄位排序 ──────────────────────────────────────
    out_cols = ["data_time","city","district","name","address",
                "latitude","longitude","phone",
                "certification_level","eco_attributes","data_source"]
    out = combined[[c for c in out_cols if c in combined.columns]].reset_index(drop=True)

    ok = out["latitude"].notna().sum()
    print(f"  座標完成率：{ok}/{len(out)} ({100*ok/max(len(out),1):.1f}%)")
    print(f"  城市分布：{out['city'].value_counts().to_dict()}")
    print(f"[Step 2] Transform 完成 — 共 {len(out)} 筆\n")
    return out


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
    if not df_raw or all(df.empty for df in df_raw.values()):
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