"""
extract/臺北市宗教概況(教會堂神職人員數).py
====================
從 tsis.dbas.gov.taipei 下載臺北市宗教概況(教會堂神職人員數)統計資料 CSV。
來源：data.taipei PAGE_ID = ad0385fc-2c90-4009-9486-194689641c93
"""
import requests
import urllib3
import pandas as pd
from io import StringIO

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

_URL = (
    "https://tsis.dbas.gov.taipei/statis/webMain.aspx?sys=220&ymf=8500&kind=21&type=0&funid=a05024703&cycle=4&outmode=12&compmode=0&outkind=1&deflst=2&nzo=1"
)


def extract(config: dict) -> pd.DataFrame:
    headers = {"User-Agent": "Mozilla/5.0"}
    resp = requests.get(_URL, headers=headers, timeout=30, verify=False)
    resp.raise_for_status()

    df = pd.read_csv(StringIO(resp.content.decode("utf-8-sig")))

    df.columns = (
        df.columns
        .str.replace(r"\[.*?\]", "", regex=True)
        .str.replace("/", "_", regex=False)
        .str.strip()
    )
    if "統計期" in df.columns:
        df = df.rename(columns={"統計期": "data_time"})
    df = df.sort_values("data_time").reset_index(drop=True)

    print(f"[Extract] 臺北市宗教概況(教會堂神職人員數)：共 {len(df)} 筆，欄位：{list(df.columns)}")
    return df
