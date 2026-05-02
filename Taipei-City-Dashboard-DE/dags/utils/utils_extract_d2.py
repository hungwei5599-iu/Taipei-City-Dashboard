"""
utils_extract_d2.py
===================
D2 組件專用的特殊 Extract 模組。

臺北市食品衛生管理查驗工作的資料來源為 tsis.dbas.gov.taipei，
分兩段年份下載 CSV 後合併，無法以標準 data.taipei / ntpc API 擷取。

使用方式（在 food_safety.py 中引用）：
    from utils_extract_d2 import extract_taipei_food_inspection
"""

import requests
import urllib3
import pandas as pd
from io import StringIO

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# 兩段年份的 CSV 下載網址
_TAIPEI_FOOD_URLS = [
    # 民國 81~94 年
    (
        "https://tsis.dbas.gov.taipei/statis/webMain.aspx"
        "?sys=220&ymf=8100&ymt=9400&kind=21&type=0&funid=a05032001"
        "&cycle=4&outmode=12&compmode=0&outkind=1&deflst=2&nzo=1"
    ),
    # 民國 95 年至今
    (
        "https://tsis.dbas.gov.taipei/statis/webMain.aspx"
        "?sys=220&ymf=9500&kind=21&type=0&funid=a05032002"
        "&cycle=4&outmode=12&compmode=0&outkind=1&deflst=2&nzo=1"
    ),
]


def extract_taipei_food_inspection() -> pd.DataFrame:
    """
    從 tsis.dbas.gov.taipei 下載兩段年份（民國 81~94、95~今）的
    食品衛生查驗統計 CSV，合併後統一清洗欄位名稱。

    欄位處理規則：
      - 移除欄位名中的 [件] [%] 等單位括號
      - 斜線「/」替換為底線「_」
      - 「統計期」重命名為「data_time」
      - 依 data_time 排序

    回傳
    ----
    pd.DataFrame — 合併且欄位已標準化的完整年度統計表
    """
    headers = {"User-Agent": "Mozilla/5.0"}
    dfs = []

    for i, url in enumerate(_TAIPEI_FOOD_URLS, 1):
        print(f"[Extract][D2-臺北] 下載第 {i} 段 URL…")
        try:
            resp = requests.get(url, headers=headers, timeout=30, verify=False)
            resp.raise_for_status()
            df = pd.read_csv(StringIO(resp.content.decode("utf-8-sig")))
            print(f"  → {len(df)} 筆，欄位：{list(df.columns)}")
            dfs.append(df)
        except Exception as e:
            print(f"  [警告] 第 {i} 段下載失敗：{e}")

    if not dfs:
        print("[Extract][D2-臺北] 所有 URL 均失敗，回傳空 DataFrame")
        return pd.DataFrame()

    # outer join 合併（兩段欄位可能略有差異）
    combined = pd.concat(dfs, axis=0, ignore_index=True, join="outer")

    # 統一欄位名：移除 [件][%] 等單位、斜線換底線
    combined.columns = (
        combined.columns
        .str.replace(r"\[.*?\]", "", regex=True)
        .str.replace("/", "_", regex=False)
        .str.strip()
    )
    combined = combined.rename(columns={"統計期": "data_time"})
    combined = combined.sort_values("data_time").reset_index(drop=True)

    print(f"[Extract][D2-臺北] 合併完成：共 {len(combined)} 筆，"
          f"欄位：{list(combined.columns)}")
    return combined