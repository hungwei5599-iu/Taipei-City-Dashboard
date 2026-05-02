"""
standalone_etl.py
=================
不依賴 Airflow 的獨立 ETL 腳本，流程對應 template_dag.py。
資料來源：data.taipei / data.ntpc API
輸出：CSV 檔案 + PostgreSQL（hackathon 組件）

使用方式：
  # 執行預設資料集（etl_config.json 的 _default）
  python ETL.py

  # 指定 dag_id
  python ETL.py --dag-id 新北市文化資產

  （新增資料集請用 gen_config.py；新增 transform 策略請在 transforms/ 新增對應檔案）
"""

import importlib
import requests
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
import pandas as pd
import json
from datetime import datetime
import os
import argparse
from copy import deepcopy
from io import StringIO


from transform_utils import (
    TAIPEI_TZ,
    add_point_wkbgeometry_column_to_df,
    get_source_last_modified,
    transform_single,
)

_HERE        = os.path.dirname(os.path.abspath(__file__))
_DE_ROOT     = os.path.abspath(os.path.join(_HERE, "..", ".."))
OUTPUT_DIR   = os.path.join(_DE_ROOT, "data")
_CONFIG_PATH = os.path.join(_HERE, "etl_config.json")


def _load_configs() -> tuple[dict, str]:
    """載入 etl_config.json，回傳 (DATASET_CONFIGS, DEFAULT_DATASET)。"""
    with open(_CONFIG_PATH, encoding="utf-8") as f:
        raw = json.load(f)
    default = raw.pop("_default", "")
    for key, cfg in list(raw.items()):
        alias_of = cfg.get("alias_of")
        if alias_of:
            base = deepcopy(raw[alias_of])
            base.update(cfg)
            base.pop("alias_of", None)
            raw[key] = base
    for cfg in raw.values():
        cfg["output_dir"] = OUTPUT_DIR
    if not default or default not in raw:
        default = next(iter(raw), "")
    return raw, default


DATASET_CONFIGS, DEFAULT_DATASET = _load_configs()
CONFIG = DATASET_CONFIGS[DEFAULT_DATASET]

BASE_URL = "https://data.taipei/api/v1/dataset"
LIMIT    = 1000


# ─────────────────────────────────────────────
# 1. Extract
# 統一回傳 dict[source_id, DataFrame]
# ─────────────────────────────────────────────
def extract(config: dict) -> dict[str, pd.DataFrame]:
    source_type = config.get("source_type", "data.taipei API")
    dag_id      = config["dag_id"]

    if source_type == "merged":
        return _extract_merged(config)
    elif source_type == "open_api":
        return {dag_id: _extract_open_api(config["api_url"])}
    elif source_type == "open_api_post":
        return {dag_id: _extract_post_api(config["api_url"], config.get("api_body", {}))}
    elif source_type == "data.ntpc API":
        return {dag_id: _extract_ntpc(config["PAGE_ID"])}
    elif source_type == "data.taipei CSV":
        return {dag_id: _extract_data_taipei_csv(config["PAGE_ID"])}
    elif source_type == "other":
        return _extract_other(config)
    elif source_type == "open_api_csv":
    	return {dag_id: _extract_open_api_csv(config)}
    else:
        return {dag_id: _extract_data_taipei(config["RID"])}


def _extract_merged(config: dict) -> dict[str, pd.DataFrame]:
    """對每個子來源分別 extract，合併成一個 dict。"""
    results = {}
    for source_id in config["sources"]:
        results.update(extract(DATASET_CONFIGS[source_id]))
    return results

def _extract_other(config: dict) -> dict[str, pd.DataFrame]:
    """source_type='other' 的資料集，依 dag_id 動態載入 extract/{dag_id}.py。"""
    dag_id = config["dag_id"]
    try:
        mod = importlib.import_module(f"extract.{dag_id}")
        return {dag_id: mod.extract(config)}
    except ModuleNotFoundError:
        print(f"[警告] extract/{dag_id}.py 不存在，跳過。")
        return {}
def _extract_open_api_csv(config: dict) -> pd.DataFrame:
    """
    從 CSV 格式的 Open API 分頁抓取資料
    
    配置範例：
    {
        "api_url": "https://data.moenv.gov.tw/api/v2/dws_p_28",
        "api_params": {
            "api_key": "xxx",
            "limit": 1000,  # 每頁筆數
            "sort": "ImportDate desc",
            "format": "CSV"
        },
        "encoding": "utf-8",
        "pagination_type": "offset",  # 可選：offset, page, none
        "max_pages": 10  # 可選：最多抓幾頁（避免無限迴圈）
    }
    """
    api_url = config["api_url"]
    api_params = config.get("api_params", {}).copy()
    encoding = config.get("encoding", "utf-8")
    pagination_type = config.get("pagination_type", "offset")  # 預設 offset
    max_pages = config.get("max_pages", 100)  # 預設最多 100 頁
    
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": "https://data.moenv.gov.tw/",
        "Accept": "text/csv, */*"
    }
    
    print(f"[Extract] 開始從 CSV API 分頁抓取：{api_url}")
    print(f"[Extract] 分頁方式：{pagination_type}")
    
    all_records = []
    page_count = 0
    
    # ===== 分頁抓取邏輯 =====
    if pagination_type == "offset":
        # 方式1：offset/limit 分頁
        limit = api_params.get("limit", 1000)
        offset = 0
        
        while page_count < max_pages:
            page_count += 1
            params = api_params.copy()
            params["offset"] = offset
            params["limit"] = limit
            
            print(f"[Extract] 第 {page_count} 頁（offset={offset}, limit={limit}）...")
            
            try:
                resp = requests.get(api_url, params=params, headers=headers, timeout=60, verify=False)
                resp.raise_for_status()
                resp.encoding = encoding
                
                # 解析 CSV
                df = pd.read_csv(StringIO(resp.text), encoding=encoding)
                
                if df.empty:
                    print(f"[Extract] 第 {page_count} 頁無資料，停止分頁")
                    break
                
                print(f"[Extract]   ✅ 取得 {len(df)} 筆")
                all_records.extend(df.to_dict('records'))
                
                # 如果本頁資料少於 limit，代表已是最後一頁
                if len(df) < limit:
                    print(f"[Extract] 資料不足 {limit} 筆，停止分頁")
                    break
                
                offset += limit
                
            except Exception as e:
                print(f"[Extract] 第 {page_count} 頁抓取失敗：{e}")
                break
    
    elif pagination_type == "page":
        # 方式2：page/pagesize 分頁
        pagesize = api_params.get("pagesize", api_params.get("limit", 1000))
        page = 1
        
        while page <= max_pages:
            params = api_params.copy()
            params["page"] = page
            params["pagesize"] = pagesize
            
            print(f"[Extract] 第 {page} 頁（page={page}, pagesize={pagesize}）...")
            
            try:
                resp = requests.get(api_url, params=params, headers=headers, timeout=60, verify=False)
                resp.raise_for_status()
                resp.encoding = encoding
                
                df = pd.read_csv(StringIO(resp.text), encoding=encoding)
                
                if df.empty:
                    print(f"[Extract] 第 {page} 頁無資料，停止分頁")
                    break
                
                print(f"[Extract]   ✅ 取得 {len(df)} 筆")
                all_records.extend(df.to_dict('records'))
                
                if len(df) < pagesize:
                    print(f"[Extract] 資料不足 {pagesize} 筆，停止分頁")
                    break
                
                page += 1
                
            except Exception as e:
                print(f"[Extract] 第 {page} 頁抓取失敗：{e}")
                break
    
    else:  # pagination_type == "none"
        # 方式3：單次抓取（不分頁）
        print(f"[Extract] 單次抓取（無分頁）...")
        
        try:
            resp = requests.get(api_url, params=api_params, headers=headers, timeout=60, verify=False)
            resp.raise_for_status()
            resp.encoding = encoding
            
            df = pd.read_csv(StringIO(resp.text), encoding=encoding)
            
            print(f"[Extract]   ✅ 取得 {len(df)} 筆")
            return df
            
        except Exception as e:
            print(f"[Extract] 抓取失敗：{e}")
            raise
    
    # ===== 合併所有頁的資料 =====
    if all_records:
        result_df = pd.DataFrame(all_records)
        print(f"\n[Extract] 分頁完成：共 {page_count} 頁，{len(result_df):,} 筆資料")
        print(f"[Extract] 欄位：{list(result_df.columns)}")
        return result_df
    else:
        print(f"[Extract] 無資料")
        return pd.DataFrame()

def _extract_data_taipei(rid: str) -> pd.DataFrame:
    """分頁取回 data.taipei 資料集。"""
    records = []
    offset  = 0

    while True:
        url    = f"{BASE_URL}/{rid}"
        params = {"scope": "resourceAquire", "limit": LIMIT, "offset": offset}
        resp   = requests.get(url, params=params, timeout=30, verify=False)
        resp.raise_for_status()

        data  = resp.json()
        if isinstance(data, list):
            batch = data
        else:
            batch = data.get("result", {}).get("results", [])
        if not batch:
            break

        records.extend(batch)
        offset += len(batch)
        if len(batch) < LIMIT:
            break

    df = pd.DataFrame(records)
    print(f"[Extract] 共取得 {len(records)} 筆原始資料，欄位：{list(df.columns)}")
    return df


def _extract_data_taipei_csv(page_id: str, rid: str = None) -> pd.DataFrame:
    """
    下載 data.taipei CSV 資料集。
    優先使用 rid 直接下載；沒有 rid 才嘗試 meta API 查詢。
    """
    from io import StringIO
    headers = {"User-Agent": "Mozilla/5.0"}

    #  方法一：直接用 rid 下載（推薦）
    if rid:
        url = f"https://data.taipei/api/frontstage/tpeod/dataset/resource.download?rid={rid}"
        print(f"[Extract] 直接下載 CSV：{url}")
        resp = requests.get(url, headers=headers, timeout=60, verify=False)
        resp.raise_for_status()
        df = pd.read_csv(StringIO(resp.content.decode("utf-8-sig")))
        print(f"[Extract] 共取得 {len(df)} 筆，欄位：{list(df.columns)}")
        return df

    #  方法二：用 v1 API 查 resources（備用）
    meta_url = f"https://data.taipei/api/v1/dataset/{page_id}"
    resp = requests.get(meta_url, headers=headers, timeout=30, verify=False)
    print(f"[Extract] meta status: {resp.status_code}, url: {meta_url}")
    resp.raise_for_status()
    
    data = resp.json()
    # v1 回傳格式: {"result": {"resources": [...]}}
    resources = data.get("result", {}).get("resources", [])
    csv_rid = None
    for res in resources:
        if res.get("format", "").upper() == "CSV":
            csv_rid = res.get("id")
            break
    if not csv_rid:
        available = [r.get("format") for r in resources]
        raise ValueError(f"[Extract] 無 CSV 資源，可用格式：{available}")

    url = f"https://data.taipei/api/frontstage/tpeod/dataset/resource.download?rid={csv_rid}"
    resp2 = requests.get(url, headers=headers, timeout=60, verify=False)
    resp2.raise_for_status()
    df = pd.read_csv(StringIO(resp2.content.decode("utf-8-sig")))
    print(f"[Extract] 共取得 {len(df)} 筆，欄位：{list(df.columns)}")
    return df

def _extract_open_api(api_url: str) -> pd.DataFrame:
    """直接 GET 即時 API 並轉為 DataFrame。"""
    resp = requests.get(api_url, timeout=30, verify=False)
    resp.raise_for_status()
    data = resp.json()

    if isinstance(data, list):
        records = data
    elif isinstance(data, dict):
        for key in ("result", "data", "results", "records"):
            if key in data and isinstance(data[key], list):
                records = data[key]
                break
        else:
            records = [data]
    else:
        records = []

    print(f"[Extract] 共取得 {len(records)} 筆原始資料（Open API）")
    return pd.DataFrame(records)


def _extract_post_api(api_url: str, json_body: dict) -> pd.DataFrame:
    """POST 請求 API 並轉為 DataFrame（用於 C5 急診等需要 POST 的端點）。"""
    headers = {"Content-Type": "application/json"}
    resp = requests.post(api_url, json=json_body, headers=headers, timeout=30, verify=False)
    resp.raise_for_status()
    data = resp.json()

    if isinstance(data, list):
        records = data
    elif isinstance(data, dict):
        for key in ("result", "data", "results", "records", "DATA", "Result"):
            if key in data and isinstance(data[key], list):
                records = data[key]
                break
        else:
            records = [data]
    else:
        records = []

    print(f"[Extract] 共取得 {len(records)} 筆原始資料（POST API）")
    return pd.DataFrame(records)


def _extract_ntpc(ntpc_id: str) -> pd.DataFrame:
    """分頁取回 data.ntpc.gov.tw 資料集（修正版）。"""
    import time
    records = []
    page = 0
    size = 1000  # 建議設定 1000，若仍被截斷請改 100
    url = f"https://data.ntpc.gov.tw/api/datasets/{ntpc_id}/json"

    while True:
        # 新北市 API 通常使用 page 與 size 參數
        params = {
            "page": page,
            "size": size
        }
        
        try:
            resp = requests.get(url, params=params, timeout=30, verify=False)
            resp.raise_for_status()
            batch = resp.json()

            if not batch or len(batch) == 0:
                break

            records.extend(batch)
            print(f"[Extract] 正在抓取第 {page} 頁，目前累計 {len(records)} 筆...")

            # 如果取得的數量小於請求數量，代表已經是最後一頁
            if len(batch) < size:
                break

            page += 1
            # 增加微小延遲，避免 API 頻率限制 (Rate Limit)
            time.sleep(0.5) 

        except Exception as e:
            print(f"[Error] 抓取第 {page} 頁失敗: {e}")
            break

    df = pd.DataFrame(records)
    print(f"[Extract] 完畢！共取得 {len(records)} 筆資料，欄位：{list(df.columns)}")
    return df


def extract_api(
    rid: str = None,
    endpoint: str = None,
    method: str = "GET",
    json_body: dict = None,
    ntpc: bool = False,
) -> pd.DataFrame:
    """
    公開的 API 擷取介面，供 transform 或外部腳本直接呼叫。

    - rid     : data.taipei RID（自動分頁）；ntpc=True 時改用 data.ntpc
    - endpoint: 直接 URL（GET 或 POST）
    - method  : 'GET'（預設）或 'POST'
    - json_body: POST 時的請求 body
    - ntpc    : True 時以 data.ntpc 模式解析 rid
    """
    if rid:
        if ntpc:
            return _extract_ntpc(rid)
        return _extract_data_taipei(rid)
    elif endpoint:
        if method.upper() == "POST":
            return _extract_post_api(endpoint, json_body or {})
        return _extract_open_api(endpoint)
    else:
        raise ValueError("extract_api() 需要提供 rid 或 endpoint 其中之一")
    

# ─────────────────────────────────────────────
# 2. Transform
# 有專屬策略檔 → 用 importlib 動態載入
# 無專屬策略檔 → 走 transform_single 通用清洗
# ─────────────────────────────────────────────
def transform(raw: dict[str, pd.DataFrame], data_time: str, config: dict) -> pd.DataFrame:
    """
    依 transform_module 或 dag_id 尋找 transforms/{module}.py。
    找到則呼叫其 transform(raw, data_time, config)。
    找不到則以 transform_single 通用清洗。
    """
    module_name = config.get("transform_module") or config["dag_id"]
    try:
        mod = importlib.import_module(f"transforms.{module_name}")
        return mod.transform(raw, data_time, config)
    except ModuleNotFoundError:
        df = next(iter(raw.values()))
        return transform_single(df, data_time, config)


def add_wkb_geometry_if_possible(df: pd.DataFrame, config: dict) -> pd.DataFrame:
    """
    對齊 DAG 的 ready-data 習慣：若輸出資料有經緯度但尚無 wkb_geometry，
    自動產生 EPSG:4326 point geometry 欄位。
    """
    if df.empty or "wkb_geometry" in df.columns:
        return df

    lon_candidates = config.get("longitude_cols", ["longitude", "lng", "lon", "經度", "x"])
    lat_candidates = config.get("latitude_cols", ["latitude", "lat", "緯度", "y"])
    lower_cols = {c.lower(): c for c in df.columns}

    lon_col = next((lower_cols[c.lower()] for c in lon_candidates if c.lower() in lower_cols), None)
    lat_col = next((lower_cols[c.lower()] for c in lat_candidates if c.lower() in lower_cols), None)
    if not lon_col or not lat_col:
        return df

    gdf = add_point_wkbgeometry_column_to_df(
        df,
        x=df[lon_col],
        y=df[lat_col],
        from_crs=config.get("from_crs", 4326),
    )
    return pd.DataFrame(gdf.drop(columns=["geometry"], errors="ignore"))


def normalize_output_tables(result, config: dict) -> tuple[tuple[pd.DataFrame, ...], list[str]]:
    """統一處理單表或多表輸出，並檢查 output_tables 設定。"""
    if isinstance(result, tuple):
        dfs = result
        output_tables = config.get("output_tables") or []
        if isinstance(output_tables, str):
            output_tables = [output_tables]
        if not output_tables:
            base = config["output_table"]
            output_tables = [
                base.replace("_map_ready", "_stats_ready") if "_map_ready" in base else f"{base}_stats",
                base,
            ]
        if len(output_tables) != len(dfs):
            raise ValueError(
                f"output_tables 數量 ({len(output_tables)}) 與 transform 輸出數量 ({len(dfs)}) 不一致。"
            )
        return dfs, output_tables

    return (result,), [config["output_table"]]


# ─────────────────────────────────────────────
# 3. Load — CSV
# ─────────────────────────────────────────────
def load(df: pd.DataFrame, output_dir: str, table_name: str) -> str:
    os.makedirs(output_dir, exist_ok=True)
    ts       = datetime.now(tz=TAIPEI_TZ).strftime("%Y%m%d_%H%M%S")
    filename = f"{table_name}_{ts}.csv"
    filepath = os.path.join(output_dir, filename)
    df.to_csv(filepath, index=False, encoding="utf-8-sig")
    print(f"[Load] 已輸出 {len(df)} 筆 → {filepath}")
    return filepath


# ─────────────────────────────────────────────
# 3b. Load — PostgreSQL
# ─────────────────────────────────────────────
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
        #db_url = f"postgresql+pg8000://{user}:{pwd}@{host}:{port}/{db}"

    try:
        engine = create_engine(db_url)
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

    except Exception as e:
        print(f"[LoadDB][警告] 寫入 DB 失敗（{e}），資料已保存至 CSV。")


# ─────────────────────────────────────────────
# 4. Update metadata
# ─────────────────────────────────────────────
def update_meta(df: pd.DataFrame, output_path: str, config: dict):
    meta_dir  = os.path.dirname(output_path)
    meta_path = os.path.join(meta_dir, "etl_meta.csv")

    if "data_time" in df.columns:
        lasttime = df["data_time"].dropna().max() if len(df["data_time"].dropna()) > 0 else ""
    else:
        lasttime = ""
    meta = {
        "dag_id":           config["dag_id"],
        "output_file":      os.path.basename(output_path),
        "rows":             len(df),
        "lasttime_in_data": lasttime,
        "run_at":           datetime.now(tz=TAIPEI_TZ).isoformat(),
    }

    meta_df = pd.DataFrame([meta])
    if os.path.exists(meta_path):
        meta_df.to_csv(meta_path, mode="a", header=False, index=False, encoding="utf-8-sig")
    else:
        meta_df.to_csv(meta_path, index=False, encoding="utf-8-sig")

    print(f"[Meta] ETL 紀錄已寫入 → {meta_path}")


# ─────────────────────────────────────────────
# 主流程
# ─────────────────────────────────────────────
def main(config: dict):
    print("=" * 50)
    print(f"ETL 開始：{config['dag_id']}")
    print("=" * 50)

    raw = extract(config)
    if not raw:
        print("[警告] 無資料，ETL 中止。")
        return

    # merged 類型各子來源的 data_time 由策略檔各自處理
    if config.get("source_type") == "merged":
        data_time = datetime.now(tz=TAIPEI_TZ).isoformat()
    else:
        data_time = get_source_last_modified(config.get("PAGE_ID", ""))

    result = transform(raw, data_time, config)
    dfs, output_tables = normalize_output_tables(result, config)

    for ready_df, table_name in zip(dfs, output_tables):
        ready_df = add_wkb_geometry_if_possible(ready_df, config)
        output_path = load(ready_df, config["output_dir"], table_name)
        update_meta(ready_df, output_path, config)

        # hackathon 組件自動寫入 DB
        if table_name.startswith("hackathon_"):
            load_to_db(
                ready_df,
                table_name,
                load_behavior=config.get("load_behavior", "replace"),
                history_table=config.get("history_table"),
            )

    print("=" * 50)
    print("ETL 完成")
    print("=" * 50)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Taipei Dashboard ETL")
    parser.add_argument("--dag-id", type=str, default="", help="指定要執行的 dag_id（留空使用預設）")
    args = parser.parse_args()

    if args.dag_id:
        if args.dag_id not in DATASET_CONFIGS:
            print(f"[錯誤] dag_id「{args.dag_id}」不存在於 etl_config.json。")
            print(f"       可用：{list(DATASET_CONFIGS.keys())}")
        else:
            main(DATASET_CONFIGS[args.dag_id])
    else:
        main(CONFIG)
