"""
er_realtime.py
==============
C9 急診室即時資訊 — 獨立 ETL 腳本
不依賴 Airflow，按 Extract → Transform → Load 順序執行。

執行方式
--------
  python er_realtime.py
  python er_realtime.py --db
  python er_realtime.py --output ./data

資料來源
--------
  健保署 NHI POST API（每 10 分鐘更新）
  POST https://info.nhi.gov.tw/api/inae4000/inae4001s01/SQL0002

輸出 Schema
-----------
  data_time, hospital_name, hospital_id,
  patient_count, bed_utilization, waiting_time,
  latitude, longitude, city_scope, source_trace, data_mode
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
    extract_open_api_post,
    convert_str_to_time_format,
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
API_URL      = _SRC["api_url"]
API_BODY     = _SRC.get("api_body", {})
SOURCE_DEPT  = _SRC["source_dept"]

# ── 輸出欄位 ──────────────────────────────────────────────────
_OUTPUT_COLS = [
    "data_time", "hospital_name", "hospital_id",
    "patient_count", "bed_utilization", "waiting_time",
    "latitude", "longitude",
    "city_scope", "source_trace", "data_mode",
]

# ── 白名單（醫院名稱 → 城市 + 靜態座標）────────────────────────
HOSPITAL_WHITELIST = {
    "聯醫仁愛":  {"city": "Taipei",    "lat": 25.0381, "lon": 121.5494},
    "北市聯醫":  {"city": "Taipei",    "lat": 25.0505, "lon": 121.5050},
    "部立臺北":  {"city": "NewTaipei", "lat": 25.0423, "lon": 121.4623},
    "臺大":      {"city": "Taipei",    "lat": 25.0416, "lon": 121.5186},
    "台大兒醫":  {"city": "Taipei",    "lat": 25.0435, "lon": 121.5175},
    "北榮":      {"city": "Taipei",    "lat": 25.1197, "lon": 121.5211},
    "三總":      {"city": "Taipei",    "lat": 25.0689, "lon": 121.5936},
    "台北國泰":  {"city": "Taipei",    "lat": 25.0375, "lon": 121.5492},
    "台北馬偕":  {"city": "Taipei",    "lat": 25.0594, "lon": 121.5233},
    "馬偕兒醫":  {"city": "Taipei",    "lat": 25.0596, "lon": 121.5228},
    "新光":      {"city": "Taipei",    "lat": 25.0934, "lon": 121.5204},
    "振興":      {"city": "Taipei",    "lat": 25.1158, "lon": 121.5213},
    "北醫":      {"city": "Taipei",    "lat": 25.0261, "lon": 121.5613},
    "萬芳":      {"city": "Taipei",    "lat": 24.9995, "lon": 121.5582},
    "亞東":      {"city": "NewTaipei", "lat": 24.9967, "lon": 121.4526},
    "台北慈濟":  {"city": "NewTaipei", "lat": 24.9858, "lon": 121.5374},
    "淡水馬偕":  {"city": "NewTaipei", "lat": 25.1376, "lon": 121.4611},
    "土城醫院":  {"city": "NewTaipei", "lat": 24.9823, "lon": 121.4426},
    "耕莘":      {"city": "NewTaipei", "lat": 24.9748, "lon": 121.5323},
    "部立雙和":  {"city": "NewTaipei", "lat": 24.9936, "lon": 121.4924},
    "輔大":      {"city": "NewTaipei", "lat": 25.0366, "lon": 121.4334},
}

_LAT_MIN, _LAT_MAX = 24.95, 25.35
_LON_MIN, _LON_MAX = 121.35, 121.70


# ─────────────────────────────────────────────────────────────
# Step 1 — Extract
# 依賴：無（單一 POST API 來源）
# ─────────────────────────────────────────────────────────────

def step_extract() -> pd.DataFrame:
    print("[Step 1] Extract 開始")
    df = extract_open_api_post(API_URL, API_BODY)
    print(f"  原始欄位：{list(df.columns)}")
    print(f"  原始筆數：{len(df)}")
    print("[Step 1] Extract 完成\n")
    return df


# ─────────────────────────────────────────────────────────────
# Step 2 — Transform
# 依賴：step_extract() 輸出
# ─────────────────────────────────────────────────────────────

def _normalize_hospital_name(name) -> str:
    """標準化醫院名稱：移除括號內容。"""
    if pd.isna(name):
        return ""
    s = str(name).strip()
    return s.split("(")[0].split("（")[0].strip()


def _find_rename(df: pd.DataFrame, candidates: list[str], target: str):
    """在 df 中找到第一個存在的候選欄位並重命名為 target。"""
    for c in candidates:
        if c in df.columns:
            return df.rename(columns={c: target})
    return df


def step_transform(df: pd.DataFrame) -> pd.DataFrame:
    """
    白名單篩選 → 欄位標準化 → 空間過濾 → 補座標 → 城市標籤

    依賴：step_extract() 的輸出
    """
    print("[Step 2] Transform 開始")
    df = df.copy()

    # ── 2a. 尋找醫院名稱欄位並標準化 ──────────────────────────
    name_col = next((c for c in ("hosP_NAME","hospital_name","hospital","院所名稱","醫院名稱")
                     if c in df.columns), None)
    if name_col is None:
        print("  [警告] 找不到醫院名稱欄位，中止")
        return pd.DataFrame(columns=_OUTPUT_COLS)

    df["_norm_name"] = df[name_col].apply(_normalize_hospital_name)

    # ── 2b. 白名單篩選 ─────────────────────────────────────────
    before = len(df)
    df = df[df["_norm_name"].isin(HOSPITAL_WHITELIST)].copy()
    print(f"  白名單篩選：{before} → {len(df)} 筆")
    if df.empty:
        return pd.DataFrame(columns=_OUTPUT_COLS)

    df["hospital_name"] = df["_norm_name"]
    df = df.drop(columns=["_norm_name"])

    # ── 2c. 時間欄位 ───────────────────────────────────────────
    time_col = next((c for c in ("data_time","time","資料時間","更新時間","timestamp")
                     if c in df.columns), None)
    if time_col:
        df["data_time"] = convert_str_to_time_format(df[time_col])
        if time_col != "data_time":
            df = df.drop(columns=[time_col])
    else:
        df["data_time"] = datetime.now(tz=TAIPEI_TZ).isoformat()

    # ── 2d. 欄位重命名（健保署原始欄位名）────────────────────────
    df = _find_rename(df, ["hosP_ID",        "hosp_id"],        "hospital_id")
    df = _find_rename(df, ["waiT_SEE_CNT",   "wait_see_count"], "patient_count")
    df = _find_rename(df, ["waiT_BED_CNT",   "wait_bed_count"], "bed_utilization")
    df = _find_rename(df, ["waiT_GENERAL_CNT","wait_general_count"], "waiting_time")

    for col in ("hospital_id", "patient_count", "bed_utilization", "waiting_time"):
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")
        else:
            df[col] = None

    # ── 2e. 座標（從白名單靜態座標補齊）──────────────────────────
    df["latitude"]  = df["hospital_name"].map(
        lambda x: HOSPITAL_WHITELIST.get(x, {}).get("lat"))
    df["longitude"] = df["hospital_name"].map(
        lambda x: HOSPITAL_WHITELIST.get(x, {}).get("lon"))

    # ── 2f. 空間範圍過濾 ───────────────────────────────────────
    df = df[
        df["latitude"].between(_LAT_MIN, _LAT_MAX) &
        df["longitude"].between(_LON_MIN, _LON_MAX)
    ].copy()
    if df.empty:
        print("  [警告] 空間篩選後無資料")
        return pd.DataFrame(columns=_OUTPUT_COLS)

    # ── 2g. 補充欄位 ───────────────────────────────────────────
    df["city_scope"]  = df["hospital_name"].map(
        lambda x: HOSPITAL_WHITELIST.get(x, {}).get("city", "Unknown"))
    df["source_trace"] = SOURCE_DEPT
    df["data_mode"]    = "real"

    # ── 2h. 選出輸出欄位 ───────────────────────────────────────
    out = df[[c for c in _OUTPUT_COLS if c in df.columns]].reset_index(drop=True)
    print(f"  城市分布：{out['city_scope'].value_counts().to_dict()}")
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
    if df_raw.empty:
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