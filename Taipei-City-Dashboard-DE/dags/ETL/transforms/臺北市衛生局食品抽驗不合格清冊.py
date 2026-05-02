"""
transforms/臺北市衛生局食品抽驗不合格清冊.py
=====================================================
合併台北市衛生局食品抽驗不合格清冊三個年份（民國111、112、113年）。

最終策略：
  - 直接合併三年的資料（每年一個 DataFrame）
  - 移除系統欄位（_id, _importdate）
  - 加入 data_time（帶時區）
"""

import pandas as pd
from transform_utils import convert_str_to_time_format


def transform(
    raw: dict[str, pd.DataFrame],
    data_time: str,
    config: dict,
    dataset_configs: dict,
) -> pd.DataFrame:
    """
    合併三年的食品抽驗不合格資料。

    raw 中應包含：
      - 臺北市衛生局食品抽驗不合格清冊_111
      - 臺北市衛生局食品抽驗不合格清冊_112
      - 臺北市衛生局食品抽驗不合格清冊_113
    """

    dfs = []
    source_keys = [
        "臺北市衛生局食品抽驗不合格清冊_111",
        "臺北市衛生局食品抽驗不合格清冊_112",
        "臺北市衛生局食品抽驗不合格清冊_113",
    ]

    for key in source_keys:
        if key in raw:
            df = raw[key].copy()
            dfs.append(df)
            print(f"[Transform] {key}: {len(df)} 筆")

    if not dfs:
        print("[Transform] 警告：無資料可合併")
        return pd.DataFrame()

    # 合併三年資料
    result = pd.concat(dfs, ignore_index=True)

    # 移除系統欄位
    drop_cols = ["_id", "_importdate"]
    result = result.drop(columns=[c for c in drop_cols if c in result.columns], errors="ignore")

    # 加入 data_time
    result["data_time"] = data_time

    print(f"[Transform] 臺北市衛生局食品抽驗不合格清冊完成，共 {len(result)} 筆")
    return result.reset_index(drop=True)
