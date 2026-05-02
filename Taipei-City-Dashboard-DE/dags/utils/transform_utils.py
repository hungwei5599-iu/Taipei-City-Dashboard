
"""
etl_utils.py
============
黑客松共用 ETL 工具模組。

可直接 import 的函式
--------------------
  # Transform utilities（替代 transform_utils 相依）
  convert_str_to_time_format(series)    — 統一時間字串格式
  geocode_address(address)              — ArcGIS 單筆地理編碼
  batch_geocode(df, address_col)        — 批量地理編碼

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
