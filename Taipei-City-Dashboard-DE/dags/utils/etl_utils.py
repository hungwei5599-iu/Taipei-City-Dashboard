"""
etl_utils.py
============
黑客松共用 ETL 工具模組。

可直接 import 的函式
--------------------
  # Extract
  extract_data_taipei(rid)              — data.taipei API（自動分頁）
  extract_ntpc(page_id)                 — data.ntpc API（自動分頁）
  extract_open_api(url)                 — 一般 GET JSON API
  extract_open_api_post(url, body)      — POST JSON API
  extract_open_api_csv_paged(...)       — 分頁 CSV API（環保署等）
  extract_data_taipei_csv(page_id, rid) — data.taipei CSV 下載

  # Transform utilities（替代 transform_utils 相依）
  convert_str_to_time_format(series)    — 統一時間字串格式
  geocode_address(address)              — ArcGIS 單筆地理編碼
  batch_geocode(df, address_col)        — 批量地理編碼

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
# Extract
# ═════════════════════════════════════════════════════════════

def extract_data_taipei(rid: str) -> pd.DataFrame:
    """data.taipei RESTful API 分頁擷取。"""
    records, offset = [], 0
    while True:
        url    = f"{_TAIPEI_BASE}/{rid}"
        params = {"scope": "resourceAquire", "limit": _LIMIT, "offset": offset}
        resp   = requests.get(url, params=params, timeout=30, verify=False)
        resp.raise_for_status()
        data  = resp.json()
        batch = data if isinstance(data, list) else data.get("result", {}).get("results", [])
        if not batch:
            break
        records.extend(batch)
        offset += len(batch)
        if len(batch) < _LIMIT:
            break
    df = pd.DataFrame(records)
    print(f"[Extract][data.taipei] {rid[:8]}… → {len(records)} 筆，欄位：{list(df.columns)}")
    return df


def extract_ntpc(page_id: str, size: int = 1000) -> pd.DataFrame:
    """data.ntpc.gov.tw API 分頁擷取。"""
    records, page = [], 0
    url = f"https://data.ntpc.gov.tw/api/datasets/{page_id}/json"
    while True:
        try:
            resp = requests.get(url, params={"page": page, "size": size},
                                timeout=30, verify=False)
            resp.raise_for_status()
            batch = resp.json()
        except Exception as e:
            print(f"[Extract][ntpc] 第 {page} 頁失敗：{e}"); break
        if not batch:
            break
        records.extend(batch)
        print(f"[Extract][ntpc] {page_id[:8]}… 第 {page} 頁 → 累計 {len(records)} 筆")
        if len(batch) < size:
            break
        page += 1
        time.sleep(0.3)
    df = pd.DataFrame(records)
    print(f"[Extract][ntpc] 完畢 → {len(records)} 筆，欄位：{list(df.columns)}")
    return df


def extract_open_api(api_url: str) -> pd.DataFrame:
    """直接 GET JSON API。"""
    resp = requests.get(api_url, timeout=30, verify=False)
    resp.raise_for_status()
    data = resp.json()
    if isinstance(data, list):
        records = data
    elif isinstance(data, dict):
        for key in ("result", "data", "results", "records"):
            if key in data and isinstance(data[key], list):
                records = data[key]; break
        else:
            records = [data]
    else:
        records = []
    print(f"[Extract][open_api] {api_url[:60]} → {len(records)} 筆")
    return pd.DataFrame(records)


def extract_open_api_post(api_url: str, json_body: dict = None) -> pd.DataFrame:
    """POST JSON API。"""
    headers = {"Content-Type": "application/json"}
    resp    = requests.post(api_url, json=json_body or {},
                            headers=headers, timeout=30, verify=False)
    resp.raise_for_status()
    data = resp.json()
    if isinstance(data, list):
        records = data
    elif isinstance(data, dict):
        for key in ("result", "data", "results", "records", "DATA", "Result"):
            if key in data and isinstance(data[key], list):
                records = data[key]; break
        else:
            records = [data]
    else:
        records = []
    print(f"[Extract][post_api] {api_url[:60]} → {len(records)} 筆")
    return pd.DataFrame(records)


def extract_open_api_csv_paged(
    api_url: str,
    api_params: dict = None,
    encoding: str = "utf-8",
    pagination_type: str = "offset",
    max_pages: int = 100,
) -> pd.DataFrame:
    """
    分頁 CSV API 擷取（環保署等 CSV 格式端點）。

    pagination_type: "offset"（offset+limit）| "page"（page+pagesize）| "none"
    """
    params    = (api_params or {}).copy()
    headers   = {"User-Agent": "Mozilla/5.0", "Accept": "text/csv, */*"}
    all_recs  = []
    page_count = 0

    if pagination_type == "offset":
        limit, offset = params.get("limit", 1000), 0
        while page_count < max_pages:
            page_count += 1
            try:
                resp = requests.get(api_url, params={**params, "offset": offset, "limit": limit},
                                    headers=headers, timeout=60, verify=False)
                resp.raise_for_status(); resp.encoding = encoding
                df = pd.read_csv(StringIO(resp.text))
                if df.empty: break
                all_recs.extend(df.to_dict("records"))
                print(f"[Extract][csv_api] 第 {page_count} 頁 offset={offset} → {len(df)} 筆")
                if len(df) < limit: break
                offset += limit
            except Exception as e:
                print(f"[Extract][csv_api] 第 {page_count} 頁失敗：{e}"); break

    elif pagination_type == "page":
        pagesize = params.get("pagesize", params.get("limit", 1000))
        page = 1
        while page <= max_pages:
            try:
                resp = requests.get(api_url, params={**params, "page": page, "pagesize": pagesize},
                                    headers=headers, timeout=60, verify=False)
                resp.raise_for_status(); resp.encoding = encoding
                df = pd.read_csv(StringIO(resp.text))
                if df.empty: break
                all_recs.extend(df.to_dict("records"))
                print(f"[Extract][csv_api] 第 {page} 頁 → {len(df)} 筆")
                if len(df) < pagesize: break
                page += 1
                page_count = page
            except Exception as e:
                print(f"[Extract][csv_api] 第 {page} 頁失敗：{e}"); break

    else:
        try:
            resp = requests.get(api_url, params=params, headers=headers, timeout=60, verify=False)
            resp.raise_for_status(); resp.encoding = encoding
            df = pd.read_csv(StringIO(resp.text))
            all_recs = df.to_dict("records")
        except Exception as e:
            print(f"[Extract][csv_api] 失敗：{e}")

    result = pd.DataFrame(all_recs)
    print(f"[Extract][csv_api] 完畢 → {len(result):,} 筆")
    return result


def extract_data_taipei_csv(page_id: str, rid: str = None) -> pd.DataFrame:
    """data.taipei CSV 下載。優先使用 rid，否則透過 meta API 查詢 CSV rid。"""
    headers = {"User-Agent": "Mozilla/5.0"}
    if rid:
        url  = f"https://data.taipei/api/frontstage/tpeod/dataset/resource.download?rid={rid}"
        resp = requests.get(url, headers=headers, timeout=60, verify=False)
        resp.raise_for_status()
        df   = pd.read_csv(StringIO(resp.content.decode("utf-8-sig")))
        print(f"[Extract][tp_csv] rid={rid[:8]}… → {len(df)} 筆")
        return df
    meta      = requests.get(f"https://data.taipei/api/v1/dataset/{page_id}",
                             headers=headers, timeout=30, verify=False)
    meta.raise_for_status()
    resources = meta.json().get("result", {}).get("resources", [])
    csv_rid   = next((r["id"] for r in resources if r.get("format","").upper()=="CSV"), None)
    if not csv_rid:
        raise ValueError(f"找不到 CSV 資源，page_id={page_id}")
    url  = f"https://data.taipei/api/frontstage/tpeod/dataset/resource.download?rid={csv_rid}"
    resp = requests.get(url, headers=headers, timeout=60, verify=False)
    resp.raise_for_status()
    df   = pd.read_csv(StringIO(resp.content.decode("utf-8-sig")))
    print(f"[Extract][tp_csv] page_id={page_id[:8]}… → {len(df)} 筆")
    return df


# ═════════════════════════════════════════════════════════════
# Transform Utilities
# ═════════════════════════════════════════════════════════════

def convert_str_to_time_format(series: pd.Series) -> pd.Series:
    """
    將各種時間字串統一轉換為帶時區的 ISO 8601 字串。
    替代 transform_utils.convert_str_to_time_format。
    """
    _fmts = ("%Y/%m/%d %H:%M:%S", "%Y-%m-%d %H:%M:%S",
             "%Y%m%d%H%M%S", "%Y/%m/%d", "%Y-%m-%d", "%Y%m%d")
    def _parse(val):
        if pd.isna(val) or str(val).strip() == "":
            return None
        s = str(val).strip()
        for fmt in _fmts:
            try:
                return datetime.strptime(s, fmt).replace(tzinfo=TAIPEI_TZ).isoformat()
            except ValueError:
                pass
        try:
            return pd.to_datetime(s).tz_localize(TAIPEI_TZ).isoformat()
        except Exception:
            return None
    return series.apply(_parse)


def geocode_address(address: str) -> dict:
    """
    ArcGIS REST API 單筆地理編碼（台灣地址）。

    回傳 {"lat": float | None, "lng": float | None}
    每次呼叫加 0.3 秒延遲以避免 rate limit。
    """
    if not address or pd.isna(address):
        return {"lat": None, "lng": None}
    clean = re.sub(r'[\(（].*?[\)）]', '', str(address))
    clean = re.sub(r'(\d+樓|B\d+).*', '', clean, flags=re.IGNORECASE).strip()
    if not any(c in clean for c in ("新北市", "台北市", "臺北市")):
        clean = f"臺北市{clean}"
    url    = ("https://geocode.arcgis.com/arcgis/rest/services/"
              "World/GeocodeServer/findAddressCandidates")
    params = {"f": "json", "singleLine": clean, "maxLocations": 1, "outFields": "Addr_type"}
    try:
        time.sleep(0.3)
        resp = requests.get(url, params=params,
                            headers={"User-Agent": "Mozilla/5.0"}, timeout=10)
        resp.raise_for_status()
        cands = resp.json().get("candidates", [])
        if cands:
            loc = cands[0]["location"]
            return {"lat": loc["y"], "lng": loc["x"]}
    except Exception as e:
        print(f"[Geocode] ⚠ ({clean[:30]}…)：{e}")
    return {"lat": None, "lng": None}


def batch_geocode(df: pd.DataFrame, address_col: str) -> pd.DataFrame:
    """
    批量地理編碼。

    回傳含 latitude / longitude 欄位的 DataFrame（index 與輸入一致）。
    用法：df[["latitude", "longitude"]] = batch_geocode(df, "address")
    """
    print(f"[Geocode] 批量編碼 {len(df)} 筆…")
    results, total = [], len(df)
    for i, (_, row) in enumerate(df.iterrows(), 1):
        coords = geocode_address(row[address_col])
        print(f"  [{i}/{total}] {str(row[address_col])[:35]} {'✓' if coords['lat'] else '✗'}")
        results.append({"latitude": coords["lat"], "longitude": coords["lng"]})
    out = pd.DataFrame(results, index=df.index)
    ok  = out["latitude"].notna().sum()
    print(f"[Geocode] 完畢：{ok}/{total} 筆成功（{100*ok/max(total,1):.1f}%）")
    return out


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


def load_db(
    df: pd.DataFrame,
    table_name: str,
    db_url: str = None,
    load_behavior: str = "replace",
    history_table: str = None,
) -> None:
    """
    寫入 PostgreSQL。

    db_url 未傳入時讀取環境變數：
      HACKATHON_DB_URL（完整字串，優先）
      DB_DASHBOARD_USER / PASSWORD / HOST / PORT / DBNAME
    """
    try:
        from sqlalchemy import create_engine
        from sqlalchemy.types import Text
    except ImportError:
        print("[Load][DB] 請安裝：pip install sqlalchemy pg8000"); return

    if db_url is None:
        db_url = os.environ.get("HACKATHON_DB_URL")
    if db_url is None:
        u = os.environ.get("DB_DASHBOARD_USER",     "postgres")
        p = os.environ.get("DB_DASHBOARD_PASSWORD", "postgres")
        h = os.environ.get("DB_DASHBOARD_HOST",     "192.168.8.80")
        o = os.environ.get("DB_DASHBOARD_PORT",     "5433")
        d = os.environ.get("DB_DASHBOARD_DBNAME",   "dashboard")
        db_url = f"postgresql+pg8000://{u}:{p}@{h}:{o}/{d}"

    engine   = create_engine(db_url, pool_pre_ping=True, echo=False)
    write_df = df.copy()
    if "data_time" in write_df.columns:
        write_df["data_time"] = write_df["data_time"].astype(str)
    dtype_map = {c: Text() for c in ("wkb_geometry", "data_time") if c in write_df.columns}
    _kw = dict(index=False, method="multi", chunksize=500, dtype=dtype_map or None)

    try:
        if load_behavior == "append":
            write_df.to_sql(table_name, engine, if_exists="append", **_kw)
        elif load_behavior == "replace":
            write_df.to_sql(table_name, engine, if_exists="replace", **_kw)
        elif load_behavior == "current+history":
            if not history_table:
                raise ValueError("current+history 需提供 history_table")
            write_df.to_sql(table_name,    engine, if_exists="replace", **_kw)
            write_df.to_sql(history_table, engine, if_exists="append",  **_kw)
        else:
            raise ValueError(f"未知 load_behavior：{load_behavior}")
        print(f"[Load][DB] {len(write_df)} 筆 → {table_name}")
    except Exception as e:
        print(f"[Load][DB] 寫入失敗：{e}")
    finally:
        engine.dispose()