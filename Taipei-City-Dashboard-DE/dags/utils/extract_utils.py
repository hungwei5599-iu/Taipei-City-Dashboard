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
