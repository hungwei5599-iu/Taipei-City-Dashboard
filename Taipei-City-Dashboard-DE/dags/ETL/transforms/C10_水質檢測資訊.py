"""
轉換策略：水質檢測 (C10) - 含座標轉換
=======================================
功能：
  1. 從環保署 CSV API 抓取全國水質檢測資料
  2. 過濾只保留 台北市 + 新北市 的資料
  3. 保留每個淨水場的全部檢驗項目（item）
  4. 去掉同一淨水場 + 同一採樣日期的重複紀錄
  5. 使用 ArcGIS REST API 進行地理編碼，取得經緯度
  6. 標準化欄位、清洗資料
  7. 新增系統欄位供資料庫使用
"""

import pandas as pd
import re
import time
import requests
from datetime import datetime
from typing import Dict
from transform_utils import TAIPEI_TZ


# ========== 輔助函式 ==========

def _to_float(val) -> float | None:
    """安全地轉換為浮點數"""
    try:
        result = float(val)
        return result if result == result else None
    except (TypeError, ValueError):
        return None


def _extract_district(text) -> str | None:
    """從地址字串萃取行政區名稱"""
    if pd.isna(text):
        return None
    m = re.search(r'([^\s市縣]+[區鄉鎮市])', str(text))
    return m.group(1) if m else str(text).strip()


def _geocode_address(address: str) -> Dict[str, any]:
    """
    使用 ArcGIS REST API 進行地理編碼
    優點：對台灣地址辨識率高，且不易發生 403 封鎖
    
    Args:
        address: 完整地址字串
    
    Returns:
        {"lat": 緯度, "lng": 經度} 或 {"lat": None, "lng": None}
    """
    if not address:
        return {'lat': None, 'lng': None}

    # 地址清洗：移除樓層與括號資訊
    clean_address = re.sub(r'[\(\uff08].*?[\)\uff09]', '', str(address))
    clean_address = re.sub(r'(\d+樓|B\d+).*', '', clean_address, flags=re.IGNORECASE)
    clean_address = clean_address.strip()
    
    # 確保地址包含縣市資訊
    if '新北市' not in clean_address and '台北市' not in clean_address and '臺北市' not in clean_address:
        clean_address = f"臺北市{clean_address}"

    url = "https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates"
    params = {
        'f': 'json',
        'singleLine': clean_address,
        'maxLocations': 1,
        'outFields': 'Addr_type'
    }
    
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }

    try:
        # 遵守 API 禮儀，加入微小延遲
        time.sleep(0.3)
        response = requests.get(url, params=params, headers=headers, timeout=10)
        response.raise_for_status()
        data = response.json()
        
        if data.get('candidates'):
            loc = data['candidates'][0]['location']
            return {'lat': loc['y'], 'lng': loc['x']}
    except Exception as e:
        print(f"    ⚠️  地理編碼失敗: {e}")

    return {'lat': None, 'lng': None}


def _batch_geocode_addresses(df: pd.DataFrame, address_col: str, plant_col: str = None) -> pd.DataFrame:
    """
    批量地理編碼
    
    Args:
        df: 原始 DataFrame
        address_col: 地址欄位名
        plant_col: 淨水場欄位名（用於去重）
    
    Returns:
        包含 lat、lng 的 DataFrame
    """
    print(f"\n[Geocoding] 啟動 ArcGIS 地理編碼...")
    
    # 如果有淨水場欄位，先按淨水場去重再編碼（提高效率）
    if plant_col and plant_col in df.columns:
        unique_plants = df.drop_duplicates(subset=[plant_col])
        print(f"[Geocoding] 共 {len(unique_plants)} 個不同淨水場，開始編碼...")
        
        results = []
        for idx, row in unique_plants.iterrows():
            addr = str(row[address_col])
            plant = str(row[plant_col])
            print(f"  [{idx+1}/{len(unique_plants)}] {plant}: {addr}", end=" ")
            
            coords = _geocode_address(addr)
            if coords['lat']:
                print(f"✓ ({coords['lat']:.4f}, {coords['lng']:.4f})")
            else:
                print("✗")
            
            results.append({
                plant_col: plant,
                'latitude': coords['lat'],
                'longitude': coords['lng']
            })
        
        return pd.DataFrame(results)
    else:
        # 沒有淨水場欄位，逐行編碼
        results = []
        total = len(df)
        for idx, row in df.iterrows():
            addr = str(row[address_col])
            print(f"  [{idx+1}/{total}] {addr}", end=" ")
            coords = _geocode_address(addr)
            if coords['lat']:
                print(f"✓")
            else:
                print("✗")
            results.append(coords)
        return pd.DataFrame(results)


# ========== 淨水場座標預設值（備用） ==========
WATER_PLANT_COORDS = {
    "公館淨水場": (25.0013, 121.5167),
    "南軟淨水場": (25.0400, 121.5500),
    "鶯歌淨水場": (24.9717, 121.5556),
    "陶山淨水場": (25.0933, 121.4625),
}


def _merge_coordinates(df: pd.DataFrame, geocoded_df: pd.DataFrame, plant_col: str = 'plant') -> pd.DataFrame:
    """
    合併座標資料到原始 DataFrame
    
    優先級：
    1. ArcGIS 編碼結果
    2. 預設座標表
    3. None
    """
    if geocoded_df.empty:
        df['latitude'] = None
        df['longitude'] = None
        return df
    
    # 合併編碼結果
    df = df.merge(
        geocoded_df,
        on=plant_col,
        how='left'
    )
    
    # 填補缺失值：使用預設座標表
    if plant_col in df.columns:
        for plant, (lat, lng) in WATER_PLANT_COORDS.items():
            mask = (df[plant_col] == plant) & (df['latitude'].isna())
            df.loc[mask, 'latitude'] = lat
            df.loc[mask, 'longitude'] = lng
    
    return df


# ========== 主要轉換函式 ==========

def transform(raw_dict: dict, data_time: str, config: dict) -> pd.DataFrame:
    """
    水質檢測資料轉換函式（含座標轉換）
    
    Args:
        raw_dict: {"C10_水質檢測資訊": DataFrame}
        data_time: ISO 格式時間戳字串
        config: 配置字典
    
    Returns:
        transformed_df: 標準化後的 DataFrame（含經緯度）
    """
    dag_id = config["dag_id"]
    df = raw_dict[dag_id]
    
    print(f"\n[Transform] 開始轉換水質檢測資料 ({dag_id})")
    print(f"[Transform] 原始資料行數：{len(df):,}")
    
    # ========== 步驟 1: 過濾地理位置 ==========
    target_counties = ['臺北市', '台北市', '新北市']
    
    if 'county' in df.columns:
        df['county'] = df['county'].astype(str).str.strip()
        df = df[df['county'].isin(target_counties)]
        
        print(f"[Transform] 過濾後（台北+新北）：{len(df):,} 筆")
        print(f"[Transform] 縣市分布：")
        print(df['county'].value_counts().to_string())
    else:
        print(f"[Transform][警告] 找不到 county 欄位")
    
    if df.empty:
        print(f"[Transform][警告] 過濾後無資料！")
        return df
    
    # ========== 步驟 2: 資料清洗 ==========
    initial_rows = len(df)
    df = df.drop_duplicates()
    duplicates = initial_rows - len(df)
    if duplicates > 0:
        print(f"[Transform] 移除完全重複資料：{duplicates:,} 筆")
    
    df = df.dropna(axis=1, how='all')
    df.columns = df.columns.str.strip()
    
    # ========== 步驟 3: 淨水場採樣紀錄去重 ==========
    print(f"\n[Transform] 進行淨水場採樣紀錄去重...")
    print(f"[Transform] 去重前行數：{len(df):,}")
    
    if 'plant' in df.columns and 'ckdate' in df.columns and 'item' in df.columns:
        df['ckdate'] = pd.to_datetime(df['ckdate'], errors='coerce', format='%Y%m%d')
        df = df.drop_duplicates(
            subset=['plant', 'ckdate', 'item'],
            keep='first'
        )
        
        print(f"[Transform] 去重後行數：{len(df):,}")
        
        plant_sample_counts = df.groupby('plant')['ckdate'].nunique()
        print(f"\n[Transform] 淨水場採樣統計：")
        print(f"    總淨水場數：{len(plant_sample_counts)}")
        print(f"    前 5 個淨水場：")
        for plant, count in plant_sample_counts.head(5).items():
            print(f"      {plant}: {count} 個採樣日期")
    
    # ========== 步驟 4: 地理編碼（取得經緯度） ==========
    print(f"\n[Transform] 進行地理編碼...")
    
    if 'address' in df.columns and 'plant' in df.columns:
        # 按淨水場分組，進行高效地理編碼
        geocoded_df = _batch_geocode_addresses(df, 'address', 'plant')
        
        # 合併座標
        df = _merge_coordinates(df, geocoded_df, 'plant')
        
        # 統計編碼結果
        valid_coords = df['latitude'].notna().sum()
        print(f"[Transform] 地理編碼完成：{valid_coords}/{len(df['plant'].unique())} 個淨水場有座標")
    else:
        print(f"[Transform][警告] 缺少地址或淨水場欄位，跳過地理編碼")
        df['latitude'] = None
        df['longitude'] = None
    
    # ========== 步驟 5: 欄位轉換 ==========
    # 文字欄位清洗
    text_cols = df.select_dtypes(include=['object']).columns
    for col in text_cols:
        if col not in ['latitude', 'longitude']:  # 保留座標
            df[col] = df[col].astype(str).str.strip()
    print(f"[Transform] 文字欄位清洗完成")
    
    # 日期欄位轉換
    if 'ckdate' in df.columns and df['ckdate'].dtype == 'object':
        df['ckdate'] = pd.to_datetime(df['ckdate'], errors='coerce', format='%Y%m%d')
    
    # 數值欄位轉換
    if 'itemval' in df.columns:
        df['itemval'] = pd.to_numeric(df['itemval'], errors='coerce')
    
    # ========== 步驟 6: 新增系統欄位 ==========
    df['data_time'] = data_time
    df['_fetch_time'] = datetime.now(tz=TAIPEI_TZ).isoformat()
    df['_source'] = 'Environment Agency'
    df['_table_name'] = config.get("output_table", "hackathon_component_10_water_quality_ready")
    
    print(f"[Transform] 新增系統欄位")
    
    # ========== 步驟 7: 重新整理欄位順序 ==========
    # 將地理資訊欄位放在前面
    priority_cols = [
        'data_time', 'county', 'township', 'plant', 'address',
        'latitude', 'longitude',  # 座標欄位
        'ckdate', 'item', 'itemid', 'itemval', 'standards'
    ]
    
    existing_priority = [c for c in priority_cols if c in df.columns]
    other_cols = [c for c in df.columns if c not in existing_priority]
    
    df = df[existing_priority + other_cols]
    
    # ========== 步驟 8: 統計資訊 ==========
    print(f"\n[Transform] 轉換完成")
    print(f"[Transform] 最終行數：{len(df):,}")
    print(f"[Transform] 欄位數：{len(df.columns)}")
    print(f"[Transform] 新增的地理欄位：")
    print(f"    latitude: {df['latitude'].notna().sum()} 筆有效數據")
    print(f"    longitude: {df['longitude'].notna().sum()} 筆有效數據")
    
    # ========== 步驟 9: 資料品質檢查 ==========
    print(f"\n[Transform] 資料品質檢查：")
    
    missing = df.isnull().sum()
    if missing.sum() > 0:
        print(f"[Transform] 缺失值統計（前 10 個）：")
        for col, count in missing[missing > 0].head(10).items():
            pct = (count / len(df)) * 100
            print(f"    {col}: {count:,} ({pct:.1f}%)")
    
    if 'plant' in df.columns:
        print(f"\n[Transform] 淨水場統計：")
        print(f"    總淨水場數：{df['plant'].nunique()}")
        for plant, count in df['plant'].value_counts().head(5).items():
            lat = df[df['plant'] == plant]['latitude'].iloc[0]
            lng = df[df['plant'] == plant]['longitude'].iloc[0]
            print(f"      {plant}: {count} 筆 ({lat:.4f}, {lng:.4f})")
    
    if 'county' in df.columns:
        print(f"\n[Transform] 縣市分布確認：")
        for county, count in df['county'].value_counts().items():
            print(f"    {county}: {count:,} 筆")
    
    print(f"\n[Transform] ✅ 轉換完成：保留全部檢驗項目 + 新增經緯度")
    
    return df