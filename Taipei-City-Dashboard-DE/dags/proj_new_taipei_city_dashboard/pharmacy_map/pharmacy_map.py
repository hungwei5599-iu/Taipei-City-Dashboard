"""
pharmacy_map.py
===============
C7 雙北藥局分布與可及性分析 — 獨立 ETL 腳本
不依賴 Airflow，按 Extract → Transform → Load 順序執行。

執行方式
--------
  python pharmacy_map.py                  # 輸出 CSV
  python pharmacy_map.py --db             # 同時寫入 PostgreSQL
  python pharmacy_map.py --output ./data  # 指定輸出目錄

輸出 Schema
-----------
  data_time, id, name, address, telephone,
  longitude, latitude, district, city, nhi, pharmacy_per_10k
"""

import argparse
import json
import os
import re
import sys

import pandas as pd
import urllib3
from datetime import datetime
from zoneinfo import ZoneInfo

# 共用 extract / load 工具（與其他組件共用）
from utils.etl_utils import (
    extract_data_taipei,
    extract_ntpc,
    load_csv,
    load_db,
    TAIPEI_TZ,
)

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# ── 讀取 job_config_C7.json ────────────────────────────────────
_HERE        = os.path.dirname(os.path.abspath(__file__))
_CONFIG_PATH = os.path.join(_HERE, "job_config_C7.json")

with open(_CONFIG_PATH, encoding="utf-8") as f:
    _JOB = json.load(f)

DAG_INFOS  = _JOB["dag_infos"]
DATA_INFOS = _JOB["data_infos"]

# 輸出表名稱
OUTPUT_TABLE = DAG_INFOS["ready_data_default_table"]   # hackathon_component_7_pharmacy_map_ready
LOAD_BEHAVIOR = DAG_INFOS["load_behavior"]             # replace

# 各來源 PAGE_ID / RID（從 job_config_C7.json 的 data_infos.sources 讀取）
def _cfg(dag_id: str) -> dict:
    return next(s for s in DATA_INFOS["sources"] if s["dag_id"] == dag_id)

TP_RID        = _cfg("臺北市藥局")["RID"]
NTPC_NHI_ID   = _cfg("新北市健保特約藥局名單")["PAGE_ID"]
NTPC_NNHI_ID  = _cfg("新北市非健保特約藥局名單")["PAGE_ID"]


# ── 各區人口數（2024 年底）────────────────────────────────────
POPULATION = {
    "中正區": 153407, "大同區": 115490, "中山區": 203718, "松山區": 196685,
    "大安區": 289534, "萬華區": 183960, "信義區": 214340, "士林區": 279497,
    "北投區": 253124, "內湖區": 286977, "南港區": 114783, "文山區": 273278,
    "板橋區": 547894, "三重區": 384523, "中和區": 397154, "永和區": 226553,
    "新莊區": 426264, "蘆洲區": 205083, "樹林區": 188273, "鶯歌區":  83888,
    "三峽區": 102498, "淡水區": 185094, "汐止區": 200754, "瑞芳區":  43786,
    "新店區": 304010, "土城區": 238695, "林口區": 116396, "泰山區":  77027,
    "五股區":  73067, "深坑區":  25490, "石碇區":  10201, "坪林區":   6541,
    "三芝區":  23069, "石門區":  12249, "八里區":  40001, "平溪區":   6768,
    "雙溪區":   9785, "貢寮區":  12119, "金山區":  22155, "萬里區":  22705,
    "烏來區":   5484,
}


# ─────────────────────────────────────────────────────────────
# Step 1 — Extract
# 依賴關係：三個來源互相獨立，可並列執行（此處為循序以保持簡單）
# ─────────────────────────────────────────────────────────────

def step_extract() -> dict[str, pd.DataFrame]:
    """
    擷取三個來源的原始資料，回傳 {source_id: DataFrame}。

    執行順序（獨立、無前置依賴）：
      1. 臺北市藥局         ← data.taipei API (RID)
      2. 新北市健保特約藥局  ← data.ntpc API (PAGE_ID)
      3. 新北市非健保特約藥局 ← data.ntpc API (PAGE_ID)
    """
    print("[Step 1] Extract 開始")

    tp_df       = extract_data_taipei(TP_RID)
    nhi_df      = extract_ntpc(NTPC_NHI_ID)
    non_nhi_df  = extract_ntpc(NTPC_NNHI_ID)

    raw = {
        "臺北市藥局":            tp_df,
        "新北市健保特約藥局名單":  nhi_df,
        "新北市非健保特約藥局名單": non_nhi_df,
    }

    for name, df in raw.items():
        print(f"  [{name}] {len(df)} 筆")

    print("[Step 1] Extract 完成\n")
    return raw


# ─────────────────────────────────────────────────────────────
# Step 2 — Transform
# 依賴：必須在 step_extract() 完成後執行
# ─────────────────────────────────────────────────────────────

def _extract_district(address: str) -> str:
    """從地址字串擷取行政區（xxx區 / xxx鄉 / xxx鎮）。"""
    m = re.search(r'([^\s市]+(?:區|鄉|鎮))', str(address))
    return m.group(1) if m else "未知"

def _clean_phone(phone) -> str:
    """統一清洗電話格式：移除空格與連字號。"""
    if pd.isna(phone):
        return ""
    return str(phone).strip().replace("-", "").replace(" ", "")


def _normalize_taipei(df: pd.DataFrame) -> pd.DataFrame:
    """臺北市藥局欄位標準化。原始欄位：機構名稱, 地址, 電話, x, y"""
    out = pd.DataFrame({
        "name":      df["機構名稱"].str.strip(),
        "address":   df["地址"].str.strip(),
        "telephone": df["電話"].apply(_clean_phone),
        "longitude": pd.to_numeric(df["x"], errors="coerce"),
        "latitude":  pd.to_numeric(df["y"], errors="coerce"),
        "city":      "臺北市",
        "nhi":       True,   # 臺北市藥局清冊全為健保特約
    })
    out["district"] = out["address"].apply(_extract_district)
    return out


def _normalize_ntpc_nhi(df: pd.DataFrame) -> pd.DataFrame:
    """新北市健保特約藥局欄位標準化。原始欄位：name, address, district, longitude_wgs84ax, latitude_wgs84ay"""
    out = pd.DataFrame({
        "name":      df["name"].str.strip(),
        "address":   df["address"].str.strip(),
        "telephone": df["telephone"].apply(_clean_phone),
        "longitude": pd.to_numeric(df["longitude_wgs84ax"], errors="coerce"),
        "latitude":  pd.to_numeric(df["latitude_wgs84ay"],  errors="coerce"),
        "city":      "新北市",
        "nhi":       True,
    })
    # 優先使用原始 district 欄，缺值再從地址抽取
    out["district"] = (
        df["district"].str.strip()
        .where(df["district"].notna(), out["address"].apply(_extract_district))
    )
    return out


def _normalize_ntpc_non_nhi(df: pd.DataFrame) -> pd.DataFrame:
    """新北市非健保特約藥局欄位標準化。原始欄位：name, address, wgs84ax_longitude, wgs84ay"""
    out = pd.DataFrame({
        "name":      df["name"].str.strip(),
        "address":   df["address"].str.strip(),
        "telephone": df["telephone"].apply(_clean_phone),
        "longitude": pd.to_numeric(df["wgs84ax_longitude"], errors="coerce"),
        "latitude":  pd.to_numeric(df["wgs84ay"],           errors="coerce"),
        "city":      "新北市",
        "nhi":       False,
    })
    out["district"] = out["address"].apply(_extract_district)
    return out


def _attach_pharmacy_per_10k(df: pd.DataFrame) -> pd.DataFrame:
    """計算各行政區每萬人藥局數，並 merge 回主表。"""
    counts = (
        df.groupby(["city", "district"])["id"]
        .count()
        .reset_index(name="pharmacy_count")
    )
    counts["population"] = counts["district"].map(POPULATION)
    counts["pharmacy_per_10k"] = (
        counts["pharmacy_count"] / counts["population"] * 10_000
    ).where(counts["population"].notna()).round(2)

    return df.merge(
        counts[["city", "district", "pharmacy_per_10k"]],
        on=["city", "district"],
        how="left",
    )


def step_transform(raw: dict[str, pd.DataFrame]) -> pd.DataFrame:
    """
    標準化、合併、驗證座標、去重，並計算每萬人藥局數。

    依賴：step_extract() 的輸出（raw dict）
    """
    print("[Step 2] Transform 開始")

    parts = []
    if not raw["臺北市藥局"].empty:
        parts.append(_normalize_taipei(raw["臺北市藥局"]))
    if not raw["新北市健保特約藥局名單"].empty:
        parts.append(_normalize_ntpc_nhi(raw["新北市健保特約藥局名單"]))
    if not raw["新北市非健保特約藥局名單"].empty:
        parts.append(_normalize_ntpc_non_nhi(raw["新北市非健保特約藥局名單"]))

    if not parts:
        print("[Step 2] ⚠️ 所有來源均無資料，中止。")
        return pd.DataFrame()

    df = pd.concat(parts, ignore_index=True)

    # 座標驗證：台灣合理範圍
    df = df.dropna(subset=["longitude", "latitude"])
    df = df[
        df["longitude"].between(119.0, 122.5) &
        df["latitude"].between(21.5,  25.5)
    ]

    # 去重（以名稱 + 地址為唯一鍵）
    df = df.drop_duplicates(subset=["name", "address"]).reset_index(drop=True)

    # 流水號 + data_time
    df.insert(0, "id", df.index + 1)
    df["data_time"] = datetime.now(tz=TAIPEI_TZ).strftime("%Y-%m-%d %H:%M:%S")

    # 每萬人藥局數
    df = _attach_pharmacy_per_10k(df)

    # 最終欄位排序
    col_order = ["data_time", "id", "name", "address", "telephone",
                 "longitude", "latitude", "district", "city", "nhi", "pharmacy_per_10k"]
    df = df[col_order]

    print(f"[Step 2] Transform 完成 — 共 {len(df)} 筆")
    print(f"  城市分布：{df['city'].value_counts().to_dict()}")
    print(f"  健保特約：{df['nhi'].sum()} 家  |  非健保：{(~df['nhi']).sum()} 家\n")
    return df


# ─────────────────────────────────────────────────────────────
# Step 3 — Load
# 依賴：必須在 step_transform() 完成後執行
# ─────────────────────────────────────────────────────────────

def step_load(df: pd.DataFrame, output_dir: str, write_db: bool = False) -> str:
    """
    將清洗後的 DataFrame 輸出至 CSV，可選擇同時寫入 PostgreSQL。

    依賴：step_transform() 的輸出（df）
    """
    print("[Step 3] Load 開始")

    # ── 3a. 輸出 CSV（一定執行）──
    filepath = load_csv(df, output_dir, OUTPUT_TABLE)

    # ── 3b. 寫入 PostgreSQL（可選）──
    if write_db:
        load_db(df, table_name=OUTPUT_TABLE, load_behavior=LOAD_BEHAVIOR)

    print("[Step 3] Load 完成\n")
    return filepath


# ─────────────────────────────────────────────────────────────
# 主流程
# ─────────────────────────────────────────────────────────────

def main(output_dir: str = "./data", write_db: bool = False):
    print("=" * 55)
    print(f"ETL 開始：{DAG_INFOS['dag_id']}")
    print(f"輸出目錄：{output_dir}  |  寫入DB：{write_db}")
    print("=" * 55)

    # 1. Extract（無前置依賴）
    raw = step_extract()
    if all(df.empty for df in raw.values()):
        print("[ETL] 所有來源均無資料，中止。")
        return

    # 2. Transform（依賴 step 1）
    df = step_transform(raw)
    if df.empty:
        print("[ETL] Transform 結果為空，中止。")
        return

    # 3. Load（依賴 step 2）
    step_load(df, output_dir=output_dir, write_db=write_db)

    print("=" * 55)
    print("ETL 完成")
    print("=" * 55)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="C7 雙北藥局分布與可及性分析 ETL")
    parser.add_argument("--output", type=str, default="./data",
                        help="CSV 輸出目錄（預設 ./data）")
    parser.add_argument("--db", action="store_true",
                        help="同時寫入 PostgreSQL（需設定環境變數或 HACKATHON_DB_URL）")
    args = parser.parse_args()

    main(output_dir=args.output, write_db=args.db)