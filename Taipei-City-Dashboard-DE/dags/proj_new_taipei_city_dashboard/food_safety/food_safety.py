"""
food_safety.py
==============
D2 雙北食品抽驗 — 獨立 ETL 腳本
不依賴 Airflow，按 Extract → Transform → Load 順序執行。

執行方式
--------
  python food_safety.py
  python food_safety.py --db
  python food_safety.py --output ./data

資料來源（merged，兩來源獨立擷取）
------------------------------------
  1. 臺北市食品衛生管理查驗工作  ← data.taipei CSV（page_id）
  2. 市售食品抽驗合格率          ← data.ntpc API

輸出 Schema
-----------
  data_time, city_scope, city, year, period,
  total_inspected, total_failed,
  pass_rate, fail_rate, fail_reason,
  source_trace, data_mode
"""

import argparse
import json
import os
import re
import pandas as pd
from datetime import datetime

from etl_utils import (
    extract_data_taipei_csv,
    extract_ntpc,
    load_csv,
    load_db,
    TAIPEI_TZ,
)

# ── 讀取 job_config_D2.json ────────────────────────────────────
_HERE = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(_HERE, "job_config_D2.json"), encoding="utf-8") as f:
    _JOB = json.load(f)

DAG_INFOS    = _JOB["dag_infos"]
OUTPUT_TABLE = DAG_INFOS["ready_data_default_table"]
LOAD_BEHAVIOR = DAG_INFOS["load_behavior"]

def _cfg(dag_id: str) -> dict:
    return next(s for s in _JOB["data_infos"]["sources"] if s["dag_id"] == dag_id)

TP_PAGE_ID  = _cfg("臺北市食品衛生管理查驗工作")["PAGE_ID"]
NTPC_ID     = _cfg("市售食品抽驗合格率")["PAGE_ID"]

# ── 台北市：不符原因欄位對應表 ─────────────────────────────────
_TP_REASON_MAP = {
    "與規定不符件數按原因別_違規標示":            "違規標示",
    "與規定不符件數按原因別_違規廣告":            "違規廣告",
    "與規定不符件數按原因別_食品添加物":          "食品添加物",
    "與規定不符件數按原因別_食品器皿容器包裝檢驗": "包裝器皿",
    "與規定不符件數按原因別_微生物":              "微生物",
    "與規定不符件數按原因別_真菌毒素":            "真菌毒素",
    "與規定不符件數按原因別_黃麴毒素":            "真菌毒素",
    "與規定不符件數按原因別_農藥殘留量":          "農藥殘留",
    "與規定不符件數按原因別_動物用藥殘留":        "動物用藥",
    "與規定不符件數按原因別_化學成分":            "化學成分",
    "與規定不符件數按原因別_成分分析":            "成分分析",
    "與規定不符件數按原因別_異物":               "異物",
    "與規定不符件數按原因別_其他":               "其他",
}


# ─────────────────────────────────────────────────────────────
# Step 1 — Extract
# 兩個來源互相獨立，無前置依賴
# ─────────────────────────────────────────────────────────────

def step_extract() -> dict[str, pd.DataFrame]:
    print("[Step 1] Extract 開始（兩來源獨立擷取）")

    # 1a. 臺北市 CSV（data.taipei，page_id 查 CSV 資源再下載）
    tp_df   = extract_data_taipei_csv(page_id=TP_PAGE_ID)

    # 1b. 新北市 API
    ntpc_df = extract_ntpc(NTPC_ID)

    raw = {"臺北市食品衛生管理查驗工作": tp_df, "市售食品抽驗合格率": ntpc_df}
    for name, df in raw.items():
        print(f"  [{name}] {len(df)} 筆")
    print("[Step 1] Extract 完成\n")
    return raw


# ─────────────────────────────────────────────────────────────
# Step 2 — Transform
# 依賴：step_extract() 輸出（兩子函式可各自獨立處理）
# ─────────────────────────────────────────────────────────────

def _to_float(val):
    try:
        v = float(str(val).replace("%", "").replace(",", "").strip())
        return None if v != v else v
    except (TypeError, ValueError):
        return None

def _to_int(val):
    f = _to_float(val)
    return int(f) if f is not None else None


def _top_reason(row, avail_cols: list) -> str | None:
    """找件數最多的不符原因。"""
    best_label, best_val = None, 0
    for col in avail_cols:
        v = _to_int(row.get(col, 0)) or 0
        if v > best_val:
            best_val = v
            best_label = _TP_REASON_MAP.get(col)
    return best_label


def _parse_taipei(df: pd.DataFrame) -> pd.DataFrame:
    """
    臺北市年度食品抽驗統計。
    原始資料：row 0 = 最新年（民國114/2025），依序遞減。
    """
    print(f"  [臺北市] 原始 {len(df)} 筆")
    df = df.copy()
    # 推算西元年（row 0 = 2025）
    df["year"] = [114 - i + 1911 for i in range(len(df))]
    avail_cols = [c for c in _TP_REASON_MAP if c in df.columns]

    rows = []
    for _, r in df.iterrows():
        fail_rate = _to_float(r.get("不符規定比率"))
        pass_rate = round(100 - fail_rate, 4) if fail_rate is not None else None
        total     = _to_int(r.get("查驗件數_總計"))
        failed    = _to_int(r.get("與規定不符件數_總計"))
        # 若無現成 fail_rate 欄位，自行計算
        if fail_rate is None and total and failed and total > 0:
            fail_rate = round(failed / total * 100, 4)
            pass_rate = round(100 - fail_rate, 4)
        rows.append({
            "city_scope":      "Taipei",
            "city":            "臺北市",
            "year":            int(r["year"]),
            "period":          str(int(r["year"])),
            "total_inspected": total,
            "total_failed":    failed,
            "pass_rate":       pass_rate,
            "fail_rate":       fail_rate,
            "fail_reason":     _top_reason(r, avail_cols),
            "source_trace":    "data.taipei（臺北市食品衛生管理查驗工作，主計處）",
        })

    result = pd.DataFrame(rows)
    print(f"  → {len(result)} 筆（{result['year'].min()}~{result['year'].max()}）")
    return result


def _parse_ntpc_quarterly(df: pd.DataFrame) -> pd.DataFrame:
    """
    新北市季度合格率 → 年均化。
    只保留有 pass_rate 的記錄（無法進年度折線圖的批次直接跳過）。
    """
    print(f"  [新北市] 原始 {len(df)} 筆")
    rows = []
    for _, r in df.iterrows():
        fn = str(r.get("filename", ""))
        m_y = re.search(r'(\d+)年', fn)
        if not m_y:
            continue
        pass_rate = _to_float(r.get("percent"))
        if pass_rate is None:
            continue                   # 無合格率就不收
        year    = int(m_y.group(1)) + 1911
        m_q     = re.search(r'截至(\d+)月底', fn)
        quarter = (int(m_q.group(1)) - 1) // 3 + 1 if m_q else None
        rows.append({"year": year, "quarter": quarter, "pass_rate": pass_rate})

    if not rows:
        print("  → 無有效資料")
        return pd.DataFrame()

    tmp = pd.DataFrame(rows)
    agg = (tmp.groupby("year")
              .agg(pass_rate=("pass_rate", "mean"), n_q=("quarter", "count"))
              .round({"pass_rate": 4})
              .reset_index())

    result_rows = []
    for _, a in agg.iterrows():
        year      = int(a["year"])
        pass_rate = round(float(a["pass_rate"]), 4)
        result_rows.append({
            "city_scope":      "NewTaipei",
            "city":            "新北市",
            "year":            year,
            "period":          str(year),
            "total_inspected": None,
            "total_failed":    None,
            "pass_rate":       pass_rate,
            "fail_rate":       round(100 - pass_rate, 4),
            "fail_reason":     None,
            "source_trace":    f"data.ntpc（市售食品抽驗合格率，衛生局，{int(a['n_q'])}季均）",
        })

    result = pd.DataFrame(result_rows)
    print(f"  → 年均化後 {len(result)} 筆（{sorted(result['year'].tolist())}）")
    return result


def step_transform(raw: dict[str, pd.DataFrame]) -> pd.DataFrame:
    """
    臺北年度 + 新北季度年均化 → 合併

    子流程依賴：
      _parse_taipei()         → 依賴 臺北市 raw df
      _parse_ntpc_quarterly() → 依賴 新北市 raw df
      concat → 依賴以上兩者完成
    """
    print("[Step 2] Transform 開始")

    tp_df   = _parse_taipei(raw["臺北市食品衛生管理查驗工作"])
    ntpc_df = _parse_ntpc_quarterly(raw["市售食品抽驗合格率"])

    final = pd.concat([tp_df, ntpc_df], ignore_index=True)
    final["data_time"] = datetime.now(tz=TAIPEI_TZ).isoformat()
    final["data_mode"] = "real"

    # 最終欄位排序
    col_order = [
        "data_time", "city_scope", "city", "year", "period",
        "total_inspected", "total_failed",
        "pass_rate", "fail_rate", "fail_reason",
        "source_trace", "data_mode",
    ]
    final = final[[c for c in col_order if c in final.columns]].reset_index(drop=True)

    by_city = final.groupby("city_scope").size().to_dict()
    print(f"[Step 2] Transform 完成 — 共 {len(final)} 筆，城市：{by_city}\n")
    return final


# ─────────────────────────────────────────────────────────────
# Step 3 — Load
# 依賴：step_transform() 輸出
# ─────────────────────────────────────────────────────────────

def step_load(df: pd.DataFrame, output_dir: str, write_db: bool = False) -> str:
    print("[Step 3] Load 開始")
    filepath = load_csv(df, output_dir, OUTPUT_TABLE)
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
    print("=" * 55)

    raw = step_extract()
    if all(df.empty for df in raw.values()):
        print("[ETL] 所有來源無資料，中止。"); return

    df = step_transform(raw)
    if df.empty:
        print("[ETL] Transform 結果為空，中止。"); return

    step_load(df, output_dir=output_dir, write_db=write_db)
    print("=" * 55)
    print("ETL 完成")
    print("=" * 55)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="D2 雙北食品抽驗 ETL")
    parser.add_argument("--output", default="./data")
    parser.add_argument("--db", action="store_true")
    args = parser.parse_args()
    main(output_dir=args.output, write_db=args.db)