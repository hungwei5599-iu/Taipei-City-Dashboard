"""
transforms/C9_急診室人數.py
============================
急診室人數資料轉換策略：
1. 白名單篩選：保留指定的醫療院所
2. 資料清洗：標準化欄位名稱，轉換資料型別
3. 空間篩選：限制於雙北地區（若有座標欄位）
4. 時間規範化：轉換為帶時區的 ISO 格式

輸出表：hackathon_component_9_er_ready
"""

import pandas as pd
from transform_utils import TAIPEI_TZ, convert_str_to_time_format

# ── 輸出欄位 ──────────────────────────────────────────────────────────────────
_OUTPUT_COLS = [
    "data_time", "hospital_name", "hospital_id",
    "patient_count", "bed_utilization", "waiting_time",
    "latitude", "longitude",
    "city_scope", "source_trace", "data_mode",
]

# ── 白名單設定：允許通過的醫療院所 ────────────────────────────────────────────
# 根據 CSV 中的醫院名稱進行映射，支援簡稱和全稱
HOSPITAL_WHITELIST = {
    "聯醫仁愛": {"city": "Taipei", "lat": 25.0381, "lon": 121.5494},
    "北市聯醫": {"city": "Taipei", "lat": 25.0505, "lon": 121.5050},
    "部立臺北": {"city": "NewTaipei", "lat": 25.0423, "lon": 121.4623},
    "臺大": {"city": "Taipei", "lat": 25.0416, "lon": 121.5186},
    "台大兒醫": {"city": "Taipei", "lat": 25.0435, "lon": 121.5175},
    "北榮": {"city": "Taipei", "lat": 25.1197, "lon": 121.5211},
    "三總": {"city": "Taipei", "lat": 25.0689, "lon": 121.5936},
    "台北國泰": {"city": "Taipei", "lat": 25.0375, "lon": 121.5492},
    "台北馬偕": {"city": "Taipei", "lat": 25.0594, "lon": 121.5233},
    "馬偕兒醫": {"city": "Taipei", "lat": 25.0596, "lon": 121.5228},
    "新光": {"city": "Taipei", "lat": 25.0934, "lon": 121.5204},
    "振興": {"city": "Taipei", "lat": 25.1158, "lon": 121.5213},
    "北醫": {"city": "Taipei", "lat": 25.0261, "lon": 121.5613},
    "萬芳": {"city": "Taipei", "lat": 24.9995, "lon": 121.5582},
    "亞東": {"city": "NewTaipei", "lat": 24.9967, "lon": 121.4526},
    "台北慈濟": {"city": "NewTaipei", "lat": 24.9858, "lon": 121.5374},
    "淡水馬偕": {"city": "NewTaipei", "lat": 25.1376, "lon": 121.4611},
    "土城醫院": {"city": "NewTaipei", "lat": 24.9823, "lon": 121.4426},
    "耕莘": {"city": "NewTaipei", "lat": 24.9748, "lon": 121.5323},
    "部立雙和": {"city": "NewTaipei", "lat": 24.9936, "lon": 121.4924},
    "輔大": {"city": "NewTaipei", "lat": 25.0366, "lon": 121.4334}
}
# ── 座標範圍：雙北地區 Bounding Box ──────────────────────────────────────────
_LAT_MIN, _LAT_MAX = 24.95, 25.35
_LON_MIN, _LON_MAX = 121.35, 121.70


def _normalize_hospital_name(name: str) -> str:
    """標準化醫院名稱，移除多餘空白與符號。"""
    if pd.isna(name):
        return ""
    s = str(name).strip()
    # 移除常見的括號內容（如分院、院區說明）
    s = s.split("(")[0].split("（")[0].strip()
    return s


def _apply_whitelist(df: pd.DataFrame) -> pd.DataFrame:
    """
    白名單篩選：保留在 HOSPITAL_WHITELIST 中的醫院。

    若 hospital_name 欄位不存在，嘗試用其他名稱欄位（hospital, name, 院所名稱等）。
    """
    df = df.copy()

    # 尋找醫院名稱欄位
    name_col = None
    for col in ["hospital_name", "hospital", "name", "院所名稱", "醫院名稱"]:
        if col in df.columns:
            name_col = col
            break

    if name_col is None:
        print("[警告] 找不到醫院名稱欄位，跳過白名單篩選")
        return df

    # 標準化醫院名稱
    df["_hospital_normalized"] = df[name_col].apply(_normalize_hospital_name)

    # 篩選白名單中的醫院
    whitelisted = df["_hospital_normalized"].isin(HOSPITAL_WHITELIST.keys())
    df_filtered = df[whitelisted].copy()

    print(f"[白名單篩選] {len(df)} → {len(df_filtered)} 筆（保留 {len(df_filtered)/max(len(df),1)*100:.1f}%）")

    # 更新醫院名稱欄位（使用標準化版本）
    df_filtered[name_col] = df_filtered["_hospital_normalized"]
    df_filtered = df_filtered.drop(columns=["_hospital_normalized"])

    return df_filtered


def _parse_numeric_fields(df: pd.DataFrame, field_names: list[str]) -> pd.DataFrame:
    """
    將指定的欄位轉換為數值型態。
    轉換失敗的值改為 NaN。
    """
    df = df.copy()
    for col in field_names:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")
    return df


def _find_and_rename_column(df: pd.DataFrame, possible_names: list[str], target_name: str) -> tuple[pd.DataFrame, bool]:
    """
    在DataFrame中尋找可能的欄位名稱，如果找到則重命名為目標名稱。
    回傳：(修改後的DataFrame, 是否找到欄位)
    """
    df = df.copy()
    for name in possible_names:
        if name in df.columns:
            df = df.rename(columns={name: target_name})
            return df, True
    return df, False


def _parse_data_time(df: pd.DataFrame) -> pd.DataFrame:
    """
    尋找並標準化時間欄位。
    支援的欄位名：data_time, time, 資料時間, 更新時間, last_updated 等。
    """
    df = df.copy()

    # 尋找時間欄位
    time_col = None
    for col in ["data_time", "time", "資料時間", "更新時間", "last_updated", "timestamp"]:
        if col in df.columns:
            time_col = col
            break

    if time_col:
        df["data_time"] = convert_str_to_time_format(df[time_col])
        if time_col != "data_time":
            df = df.drop(columns=[time_col])
    else:
        # 若無時間欄位，使用 None（後續會填入提交時間）
        df["data_time"] = None
        print("[資訊] 無找到時間欄位，data_time 將由 ETL.py 填入")

    return df


def _spatial_filter(df: pd.DataFrame) -> pd.DataFrame:
    """
    空間篩選：保留緯度、經度在雙北範圍內的記錄。
    若無座標欄位，則使用白名單中的座標補充。
    """
    df = df.copy()

    # 尋找座標欄位
    lat_col = next((c for c in ["latitude", "lat", "緯度", "latitude_wgs84"] if c in df.columns), None)
    lon_col = next((c for c in ["longitude", "lon", "經度", "longitude_wgs84"] if c in df.columns), None)
    hosp_col = next((c for c in ["hospital_name", "hospital"] if c in df.columns), None)

    if lat_col and lon_col:
        # 欄位已存在，轉換為數值
        df[lat_col] = pd.to_numeric(df[lat_col], errors="coerce")
        df[lon_col] = pd.to_numeric(df[lon_col], errors="coerce")

        # 篩選範圍內的記錄
        valid_coords = (
            df[lat_col].between(_LAT_MIN, _LAT_MAX) &
            df[lon_col].between(_LON_MIN, _LON_MAX)
        )
        df = df[valid_coords].copy()

        # 標準化欄位名稱
        if lat_col != "latitude":
            df = df.rename(columns={lat_col: "latitude"})
        if lon_col != "longitude":
            df = df.rename(columns={lon_col: "longitude"})
    else:
        # 無座標欄位，嘗試從白名單補充
        if hosp_col:
            df["latitude"] = df[hosp_col].apply(
                lambda x: HOSPITAL_WHITELIST.get(_normalize_hospital_name(x), {}).get("lat")
            )
            df["longitude"] = df[hosp_col].apply(
                lambda x: HOSPITAL_WHITELIST.get(_normalize_hospital_name(x), {}).get("lon")
            )
            df = df.dropna(subset=["latitude", "longitude"])
            print("[座標補充] 使用白名單中的座標")
        else:
            print("[警告] 無座標欄位且無醫院名稱欄位，跳過空間篩選")

    return df


def _add_city_scope(df: pd.DataFrame) -> pd.DataFrame:
    """
    根據白名單為各筆記錄添加城市別。
    """
    df = df.copy()

    # 尋找醫院名稱欄位
    name_col = next((c for c in ["hospital_name", "hospital"] if c in df.columns), None)

    if name_col:
        df["city_scope"] = df[name_col].apply(
            lambda x: HOSPITAL_WHITELIST.get(_normalize_hospital_name(x), {}).get("city", "Unknown")
        )
    else:
        df["city_scope"] = "Unknown"

    return df


def transform(
    raw: dict[str, pd.DataFrame],
    data_time: str,
    config: dict,
    dataset_configs: dict = None,
) -> pd.DataFrame:
    """
    急診室人數資料的轉換主流程：
    1. 提取原始資料
    2. 應用白名單篩選
    3. 清洗資料欄位
    4. 空間篩選（雙北範圍）
    5. 標準化輸出格式

    參數：
    ------
    raw : dict[str, pd.DataFrame]
        提取的原始資料，鍵為 dag_id
    data_time : str
        資料時間戳（ISO 格式，含時區）
    config : dict
        ETL 設定（含 dag_id, output_table 等）
    dataset_configs : dict, optional
        所有資料集的設定

    回傳：
    ------
    pd.DataFrame
        清洗後的急診室人數資料
    """
    dag_id = config["dag_id"]
    df = raw[dag_id].copy()

    print(f"\n[Transform] {dag_id} 開始")
    print(f"  原始欄位：{list(df.columns)}")
    print(f"  原始筆數：{len(df)}")

    # 1. 白名單篩選
    df = _apply_whitelist(df)
    if len(df) == 0:
        print("[警告] 白名單篩選後無資料，回傳空 DataFrame")
        return pd.DataFrame(columns=_OUTPUT_COLS)

    # 2. 時間欄位處理
    df = _parse_data_time(df)
    if df["data_time"].isna().all():
        df["data_time"] = data_time

    # 3. 數值欄位轉換 & 欄位標準化
    # 映射CSV中的實際欄位名稱到標準輸出欄位

    # 掛號人數 (waiT_SEE_CNT)
    df, found = _find_and_rename_column(df, ["waiT_SEE_CNT", "wait_see_count"], "patient_count")
    if found:
        df = _parse_numeric_fields(df, ["patient_count"])

    # 病床等候人數 (waiT_BED_CNT)
    df, found = _find_and_rename_column(df, ["waiT_BED_CNT", "wait_bed_count"], "bed_utilization")
    if found:
        df = _parse_numeric_fields(df, ["bed_utilization"])

    # 一般病房等候人數 (waiT_GENERAL_CNT)
    df, found = _find_and_rename_column(df, ["waiT_GENERAL_CNT", "wait_general_count"], "waiting_time")
    if found:
        df = _parse_numeric_fields(df, ["waiting_time"])

    # 醫院ID (hosP_ID)
    df, found = _find_and_rename_column(df, ["hosP_ID", "hospital_id", "hosp_id"], "hospital_id")
    if found:
        df = _parse_numeric_fields(df, ["hospital_id"])

    # 醫院名稱 (hosP_NAME)
    df, found = _find_and_rename_column(df, ["hosP_NAME", "hospital_name", "hosp_name"], "hospital_name")

    # 4. 空間篩選
    df = _spatial_filter(df)
    if len(df) == 0:
        print("[警告] 空間篩選後無資料")
        return pd.DataFrame(columns=_OUTPUT_COLS)

    # 5. 添加城市別
    df = _add_city_scope(df)

    # 6. 標準化欄位名稱（若尚未重命名）
    rename_map = {
        "hospital": "hospital_name",
        "院所名稱": "hospital_name",
        "醫院名稱": "hospital_name",
        "person_count": "patient_count",
        "人數": "patient_count",
        "patients": "patient_count",
        "utilization_rate": "bed_utilization",
        "佔有率": "bed_utilization",
        "avg_waiting_time": "waiting_time",
        "平均等候時間": "waiting_time",
    }
    df = df.rename(columns={k: v for k, v in rename_map.items() if k in df.columns})

    # 7. 補充 source_trace 與 data_mode
    df["source_trace"] = config.get("source_dept", "健保署 NHI")
    df["data_mode"] = "real"

    # 8. 補充缺少的欄位（預設值）
    for col in ["hospital_id", "patient_count", "bed_utilization", "waiting_time"]:
        if col not in df.columns:
            df[col] = None

    # 9. 選擇輸出欄位
    output_df = df[[c for c in _OUTPUT_COLS if c in df.columns]].reset_index(drop=True)

    print(f"  清洗後筆數：{len(output_df)}")
    print(f"  輸出欄位：{list(output_df.columns)}")
    print(f"[Transform] {dag_id} 完成")

    return output_df
