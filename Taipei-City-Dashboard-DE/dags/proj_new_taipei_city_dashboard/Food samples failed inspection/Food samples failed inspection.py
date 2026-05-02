
"""
food_inspection.py
==================
C12 臺北市衛生局食品抽驗不合格清冊 — 獨立 ETL 腳本
不依賴 Airflow，按 Extract → Transform → Load 順序執行。

執行方式
--------
  python food_inspection.py
  python food_inspection.py --db
  python food_inspection.py --output ./data

資料來源（merged，三個年度獨立擷取後合併）
------------------------------------------
  民國 111 年  RID: bc24a40f-5687-4338-8f9a-449de248ab93
  民國 112 年  RID: bb347e3d-626a-46e5-bb96-9061e8d08c26
  民國 113 年  RID: 3fc106cb-c8aa-4f74-8dbc-3272c7ffcae0

輸出 Schema
-----------
  data_time, year, product_category, district,
  inspection_result, shop_name, original_location,
  failure_reasons, updated_at
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


from utils.extract_utils import (
	extract_data_taipei,
    TAIPEI_TZ,
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

DAG_INFOS     = _JOB["dag_infos"]
OUTPUT_TABLE  = DAG_INFOS["ready_data_default_table"]
LOAD_BEHAVIOR = DAG_INFOS["load_behavior"]
SOURCES       = _JOB["data_infos"]["sources"]   # list，共 3 個年度

# ── 郵遞區號 → 中文區名 ────────────────────────────────────────
POSTAL_TO_DISTRICT = {
    100: "中正", 103: "大同", 104: "中山", 105: "松山", 106: "大安",
    108: "南港", 110: "信義", 111: "士林", 112: "北投", 114: "內湖",
    115: "南山", 116: "文山",
}


# ─────────────────────────────────────────────────────────────
# Step 1 — Extract
# 三個年度來源互相獨立，無前置依賴，依序擷取後以 dag_id 為鍵回傳
# ─────────────────────────────────────────────────────────────

def step_extract() -> dict[str, pd.DataFrame]:
    """
    分別擷取 111/112/113 年不合格清冊。
    三個子任務獨立（無互相依賴），合併後供 step_transform 使用。
    """
    print("[Step 1] Extract 開始（3 個年度獨立擷取）")
    raw = {}
    for src in SOURCES:
        dag_id = src["dag_id"]
        rid    = src["RID"]
        year   = src["year"]
        print(f"  [{dag_id}] 民國 {year} 年，RID={rid[:8]}…")
        df = extract_data_taipei(rid)
        raw[dag_id] = df
        print(f"    → {len(df)} 筆")
    print("[Step 1] Extract 完成\n")
    return raw


# ─────────────────────────────────────────────────────────────
# Step 2 — Transform
# 依賴：step_extract() 輸出（raw dict）
# ─────────────────────────────────────────────────────────────

def _extract_year(date_str) -> int | None:
    """抽驗日期（YYYYMMDD）→ 西元年份。"""
    try:
        return int(str(date_str)[:4])
    except Exception:
        return None


def _get_district(postal_code) -> str:
    """郵遞區號 → 中文區名，無法對應時回傳「其他」。"""
    try:
        return POSTAL_TO_DISTRICT.get(int(postal_code), "其他")
    except Exception:
        return "其他"


def _clean_location(location_str) -> str:
    """從抽驗地點字串擷取店家名稱（取「/」前段）。"""
    if pd.isna(location_str):
        return "未知地點"
    s = str(location_str).strip()
    return s.split("/")[0].strip() if "/" in s else s


def _extract_failure_reasons(reason_str) -> str:
    """
    從不符合規定原因字串提取農藥/物質名稱清單。
    回傳 JSON array string，方便寫入資料庫文字欄位。
    """
    if pd.isna(reason_str):
        return "[]"
    items = str(reason_str).strip().replace("\\n", "\n").split("\n")
    reasons = []
    for item in items:
        item = item.strip()
        if not item:
            continue
        # 移除括號後內容
        item = item.split("(")[0].strip()
        # 移除尾部數字與單位
        while item and (item[-1].isdigit() or item.endswith(("ppm", "ppb"))):
            item = item[:-3].strip() if item.endswith(("ppm", "ppb")) else item[:-1].strip()
        if item:
            reasons.append(item)
    return json.dumps(reasons, ensure_ascii=False)


def step_transform(raw: dict[str, pd.DataFrame]) -> pd.DataFrame:
    """
    合併三年度資料 → 衍生欄位 → 重命名 → 清理空值

    子流程依賴：
      concat         → 依賴全部三個 raw df 完成
      derive columns → 依賴 concat 完成
      rename/clean   → 依賴 derive 完成
    """
    print("[Step 2] Transform 開始")

    # ── 2a. 合併三年度（依賴 step 1 三個子任務全部完成）────────
    dfs = [df for df in raw.values() if not df.empty]
    if not dfs:
        print("  [警告] 所有來源均為空，中止")
        return pd.DataFrame()

    df = pd.concat(dfs, ignore_index=True)
    print(f"  合併後：{len(df)} 筆")

    # ── 2b. 衍生欄位（依賴 2a concat 完成）──────────────────────
    df["year"]            = df["抽驗日期"].apply(_extract_year)
    df["district"]        = df.get("抽驗行政郵遞區號", pd.Series(dtype=str)).apply(_get_district)
    df["shop_name"]       = df.get("抽驗地點", pd.Series(dtype=str)).apply(_clean_location)
    df["failure_reasons"] = df.get("不符合規定原因", pd.Series(dtype=str)).apply(_extract_failure_reasons)

    # ── 2c. 重命名 & 選出輸出欄位（依賴 2b 完成）────────────────
    rename_map = {
        "分類":   "product_category",
        "檢驗結果": "inspection_result",
        "抽驗地點": "original_location",
    }
    df = df.rename(columns={k: v for k, v in rename_map.items() if k in df.columns})

    out_cols = [
        "year", "product_category", "district",
        "inspection_result", "shop_name", "original_location",
        "failure_reasons",
    ]
    exist = [c for c in out_cols if c in df.columns]
    df_out = df[exist].copy()

    # ── 2d. 系統欄位 ───────────────────────────────────────────
    now_str          = datetime.now(tz=TAIPEI_TZ).isoformat()
    df_out["data_time"]  = now_str
    df_out["updated_at"] = now_str

    # ── 2e. 清理空值 ───────────────────────────────────────────
    df_out = df_out.fillna("")

    # 最終欄位順序
    final_cols = ["data_time", "year", "product_category", "district",
                  "inspection_result", "shop_name", "original_location",
                  "failure_reasons", "updated_at"]
    df_out = df_out[[c for c in final_cols if c in df_out.columns]].reset_index(drop=True)

    # 統計輸出
    if "year" in df_out.columns:
        yr_dist = df_out["year"].value_counts().sort_index().to_dict()
        print(f"  年度分布：{yr_dist}")
    if "district" in df_out.columns:
        print(f"  行政區數：{df_out['district'].nunique()}")

    print(f"[Step 2] Transform 完成 — 共 {len(df_out)} 筆\n")
    return df_out


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
