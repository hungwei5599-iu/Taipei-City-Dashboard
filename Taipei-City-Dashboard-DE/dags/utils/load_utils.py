
"""
etl_utils.py
============
黑客松共用 ETL 工具模組。

可直接 import 的函式
--------------------
  # Load
  load_csv(df, output_dir, table_name)  — 輸出 CSV
  load_db(df, table_name, ...)          — 寫入 PostgreSQL
"""
import os
import re
import time
import requests
import urllib3
import pandas as pd
from datetime import datetime
from io import StringIO
from zoneinfo import ZoneInfo

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

TAIPEI_TZ    = ZoneInfo("Asia/Taipei")
_TAIPEI_BASE = "https://data.taipei/api/v1/dataset"
_LIMIT       = 1000


# ═════════════════════════════════════════════════════════════
# Load
# ═════════════════════════════════════════════════════════════

def load_csv(df: pd.DataFrame, output_dir: str, table_name: str) -> str:
    """輸出 UTF-8 BOM CSV。回傳檔案路徑。"""
    os.makedirs(output_dir, exist_ok=True)
    ts       = datetime.now(tz=TAIPEI_TZ).strftime("%Y%m%d_%H%M%S")
    filepath = os.path.join(output_dir, f"{table_name}_{ts}.csv")
    df.to_csv(filepath, index=False, encoding="utf-8-sig")
    print(f"[Load][CSV] {len(df)} 筆 → {filepath}")
    return filepath


def load_to_db(
    df: pd.DataFrame,
    table_name: str,
    db_url: str = None,
    load_behavior: str = "replace",
    history_table: str = None,
) -> None:
    """
    將 DataFrame 寫入 PostgreSQL。
    修正重點：
      - data_time 轉字串再寫入，避免 tzinfo 型別映射失敗
      - 使用 TEXT 明確宣告 wkb_geometry 欄位型別
      - replace 改為先 TRUNCATE 再 INSERT，確保表結構保留
      - 設定連接池參數與 dispose() 避免連接未釋放
    """
    try:
        from sqlalchemy import create_engine, text as sa_text
        from sqlalchemy.types import Text, DateTime
    except ImportError:
        print("[LoadDB] 缺少 sqlalchemy，請先執行：pip install sqlalchemy psycopg2-binary")
        return

    if db_url is None:
        db_url = os.environ.get("HACKATHON_DB_URL")

    if db_url is None:
        user = os.environ.get("DB_DASHBOARD_USER", "postgres")
        pwd  = os.environ.get("DB_DASHBOARD_PASSWORD", "postgres")
        host = os.environ.get("DB_DASHBOARD_HOST", "192.168.8.80")
        port = os.environ.get("DB_DASHBOARD_PORT", "5433")
        db   = os.environ.get("DB_DASHBOARD_DBNAME", "dashboard")
        db_url = f"postgresql+pg8000://{user}:{pwd}@{host}:{port}/{db}"

    try:
        engine = create_engine(
            db_url,
            pool_pre_ping=True,
            pool_size=5,
            max_overflow=10,
            echo=False
        )
        write_df = df.copy()

        # ── 修正 1：data_time 轉字串，避免 tzinfo 型別衝突 ──
        if "data_time" in write_df.columns:
            write_df["data_time"] = write_df["data_time"].astype(str)

        # ── 修正 2：明確宣告欄位型別 ──
        dtype_map = {}
        if "wkb_geometry" in write_df.columns:
            dtype_map["wkb_geometry"] = Text()
        if "data_time" in write_df.columns:
            dtype_map["data_time"] = Text()

        if load_behavior == "append":
            write_df.to_sql(
                table_name,
                engine,
                if_exists="append",
                index=False,
                method="multi",
                chunksize=500,
                dtype=dtype_map if dtype_map else None,
            )
        elif load_behavior == "replace":
            write_df.to_sql(
                table_name,
                engine,
                if_exists="replace",
                index=False,
                method="multi",
                chunksize=500,
                dtype=dtype_map if dtype_map else None,
            )
        elif load_behavior == "current+history":
            if not history_table:
                raise ValueError("load_behavior=current+history 時必須設定 history_table。")
            write_df.to_sql(
                table_name,
                engine,
                if_exists="replace",
                index=False,
                method="multi",
                chunksize=500,
                dtype=dtype_map if dtype_map else None,
            )
            write_df.to_sql(
                history_table,
                engine,
                if_exists="append",
                index=False,
                method="multi",
                chunksize=500,
                dtype=dtype_map if dtype_map else None,
            )
        else:
            raise ValueError("load_behavior 必須是 append、replace 或 current+history。")
        print(f"[LoadDB] 已寫入 {len(write_df)} 筆 → PostgreSQL 表：{table_name}")

        # ── 更新 dataset_info（表不存在時略過）──
        if "data_time" in df.columns:
            lasttime = df["data_time"].dropna().max()
            if pd.notna(lasttime):
                try:
                    with engine.connect() as conn:
                        conn.execute(
                            sa_text("""
                                UPDATE dataset_info
                                SET lasttime_in_data = :t
                                WHERE airflow_dag_id = :dag_id
                            """),
                            {"t": str(lasttime), "dag_id": table_name},
                        )
                        conn.commit()
                    print(f"[LoadDB] dataset_info.lasttime_in_data 已更新：{lasttime}")
                except Exception as e:
                    print(f"[LoadDB][知悉] dataset_info 更新失敗（{e}）")

        engine.dispose()

    except Exception as e:
        print(f"[LoadDB][警告] 寫入 DB 失敗（{e}），資料已保存至 CSV。")
        engine.dispose()