"""
轉換策略：水質檢測 (C10) - 只保留合格紀錄 + 預設座標 + ArcGIS地理編碼備用
===========================================================================
功能：
  1. 從環保署 CSV API 抓取全國水質檢測資料
  2. 過濾只保留 台北市 + 新北市 的資料
  3. 只保留 itemid=PASS 的合格紀錄（去掉個別檢驗項目）
  4. 使用預設淨水場座標補齊高信心度資料
  5. 對其他淨水場使用 ArcGIS REST API 進行地理編碼
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


# ========== 淨水場座標預設值（高信心度） ==========
WATER_PLANT_COORDS = {
    "板新淨水廠": (24.940313, 121.356482),  # ★★★★★ 非常高
    "貢寮淨水場": (25.010992, 121.920722),  # ★★★★ 高
    "老梅淨水場": (25.254823, 121.551272),  # ★★★ 中高
    "萬里淨水場": (25.179375, 121.688809),  # ★★★ 中高
    "中幅淨水場": (25.165400, 121.675186),  # ★★ 中
    "烏來淨水場": (24.864725, 121.552571),  # ★★ 中
}


# ========== 輔助函式：地理編碼 ==========

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
        包含 latitude、longitude 的 DataFrame
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


def transform(raw_dict: dict, data_time: str, config: dict = None, dataset_configs: dict = None) -> pd.DataFrame:
    """
    水質檢測資料轉換函式（預設座標 + ArcGIS地理編碼備用）

    Args:
        raw_dict: {"C10_水質檢測資訊": DataFrame}
        data_time: ISO 格式時間戳字串
        config: 資料集配置（可選）
        dataset_configs: 全部資料集配置（可選）

    Returns:
        transformed_df: 標準化後的 DataFrame（含經緯度）
    """
    # 從raw_dict提取DataFrame
    df = raw_dict.get(list(raw_dict.keys())[0])
    if df is None or df.empty:
        print("[Transform] 資料為空")
        return pd.DataFrame()
    
    print(f"\n[Transform] 開始轉換水質檢測資料")
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
    
    # ========== 步驟 2: 只保留 itemid=PASS 的合格紀錄 ==========
    print(f"\n[Transform] 篩選合格紀錄（itemid=PASS）...")
    print(f"[Transform] 篩選前行數：{len(df):,}")
    
    if 'itemid' in df.columns:
        df = df[df['itemid'] == 'PASS']
        print(f"[Transform] 篩選後行數：{len(df):,}")
    else:
        print(f"[Transform][警告] 找不到 itemid 欄位，跳過篩選")
    
    if df.empty:
        print(f"[Transform][警告] 篩選後無資料！")
        return df
    
    # ========== 步驟 3: 資料清洗 ==========
    initial_rows = len(df)
    df = df.drop_duplicates()
    duplicates = initial_rows - len(df)
    if duplicates > 0:
        print(f"[Transform] 移除完全重複資料：{duplicates:,} 筆")
    
    df = df.dropna(axis=1, how='all')
    df.columns = df.columns.str.strip()
    
    # ========== 步驟 4: 淨水場採樣紀錄去重 ==========
    print(f"\n[Transform] 進行淨水場採樣紀錄去重...")
    print(f"[Transform] 去重前行數：{len(df):,}")
    
    if 'plant' in df.columns and 'ckdate' in df.columns:
        df['ckdate'] = pd.to_datetime(df['ckdate'], errors='coerce', format='%Y%m%d')
        df = df.drop_duplicates(
            subset=['plant', 'ckdate'],
            keep='first'
        )
        
        print(f"[Transform] 去重後行數：{len(df):,}")
        
        plant_sample_counts = df.groupby('plant')['ckdate'].nunique()
        print(f"\n[Transform] 淨水場採樣統計：")
        print(f"    總淨水場數：{len(plant_sample_counts)}")
        print(f"    淨水場列表：")
        for plant, count in plant_sample_counts.items():
            print(f"      {plant}: {count} 個採樣日期")
    
    # ========== 步驟 5: 新增座標欄位（預設 + ArcGIS備用） ==========
    print(f"\n[Transform] 新增座標欄位...")
    
    df['latitude'] = None
    df['longitude'] = None
    
    if 'plant' in df.columns:
        # 優先使用預設座標
        for plant, (lat, lng) in WATER_PLANT_COORDS.items():
            mask = df['plant'] == plant
            df.loc[mask, 'latitude'] = lat
            df.loc[mask, 'longitude'] = lng
        
        # 統計需要地理編碼的淨水場
        need_geocode = df[df['latitude'].isna()]['plant'].unique()
        
        if len(need_geocode) > 0:
            print(f"[Transform] 需要地理編碼的淨水場：{len(need_geocode)} 個")
            print(f"[Transform] 淨水場列表：{', '.join(need_geocode)}")
            
            # 對需要編碼的淨水場進行批量編碼
            if 'address' in df.columns:
                need_geocode_df = df[df['plant'].isin(need_geocode)]
                geocoded_df = _batch_geocode_addresses(need_geocode_df, 'address', 'plant')
                
                # 合併編碼結果
                for _, row in geocoded_df.iterrows():
                    plant = row['plant']
                    mask = df['plant'] == plant
                    df.loc[mask, 'latitude'] = row['latitude']
                    df.loc[mask, 'longitude'] = row['longitude']
            else:
                print(f"[Transform][警告] 找不到地址欄位，無法進行地理編碼")
        
        # 統計座標補齊情況
        valid_coords = df['latitude'].notna().sum()
        print(f"[Transform] 座標補齊完成：{valid_coords} 筆有效座標")
        
        # 顯示各淨水場的座標
        print(f"[Transform] 淨水場座標補齊情況：")
        plant_coords = df[['plant', 'latitude', 'longitude']].drop_duplicates(subset=['plant'])
        for _, row in plant_coords.iterrows():
            if pd.notna(row['latitude']) and pd.notna(row['longitude']):
                source = "預設" if row['plant'] in WATER_PLANT_COORDS else "ArcGIS"
                print(f"    {row['plant']}: ({row['latitude']:.6f}, {row['longitude']:.6f}) [{source}]")
            else:
                print(f"    {row['plant']}: 無座標")
    
    # ========== 步驟 6: 欄位清洗 ==========
    # 文字欄位清洗
    text_cols = df.select_dtypes(include=['object']).columns
    for col in text_cols:
        if col not in ['latitude', 'longitude']:
            df[col] = df[col].astype(str).str.strip()
    print(f"\n[Transform] 文字欄位清洗完成")
    
    # 日期欄位轉換
    if 'ckdate' in df.columns and df['ckdate'].dtype == 'object':
        df['ckdate'] = pd.to_datetime(df['ckdate'], errors='coerce', format='%Y%m%d')
    
    # 數值欄位轉換
    if 'itemval' in df.columns:
        df['itemval'] = pd.to_numeric(df['itemval'], errors='coerce')
    
    # ========== 步驟 7: 新增系統欄位 ==========
    df['data_time'] = data_time
    df['_fetch_time'] = datetime.now(tz=TAIPEI_TZ).isoformat()
    df['_source'] = 'Environment Agency'
    
    print(f"[Transform] 新增系統欄位")
    
    # ========== 步驟 8: 重新整理欄位順序 ==========
    priority_cols = [
        'data_time', 'county', 'township', 'plant', 'address',
        'latitude', 'longitude',
        'ckdate', 'itemid', 'item', 'itemval', 'standards'
    ]
    
    existing_priority = [c for c in priority_cols if c in df.columns]
    other_cols = [c for c in df.columns if c not in existing_priority]
    
    df = df[existing_priority + other_cols]
    
    # ========== 步驟 9: 統計資訊 ==========
    print(f"\n[Transform] 轉換完成")
    print(f"[Transform] 最終行數：{len(df):,}")
    print(f"[Transform] 欄位數：{len(df.columns)}")
    print(f"[Transform] 座標欄位統計：")
    print(f"    latitude: {df['latitude'].notna().sum()} 筆有效數據")
    print(f"    longitude: {df['longitude'].notna().sum()} 筆有效數據")
    
    # ========== 步驟 10: 資料品質檢查 ==========
    print(f"\n[Transform] 資料品質檢查：")
    
    missing = df.isnull().sum()
    if missing.sum() > 0:
        print(f"[Transform] 缺失值統計：")
        for col, count in missing[missing > 0].items():
            pct = (count / len(df)) * 100
            print(f"    {col}: {count:,} ({pct:.1f}%)")
    
    if 'plant' in df.columns:
        print(f"\n[Transform] 淨水場統計：")
        print(f"    總淨水場數：{df['plant'].nunique()}")
        for plant, count in df['plant'].value_counts().items():
            lat = df[df['plant'] == plant]['latitude'].iloc[0]
            lng = df[df['plant'] == plant]['longitude'].iloc[0]
            if pd.notna(lat) and pd.notna(lng):
                print(f"      {plant}: {count} 筆 ({lat:.6f}, {lng:.6f})")
            else:
                print(f"      {plant}: {count} 筆 (無座標)")
    
    if 'county' in df.columns:
        print(f"\n[Transform] 縣市分布確認：")
        for county, count in df['county'].value_counts().items():
            print(f"    {county}: {count:,} 筆")
    
    print(f"\n[Transform] ✅ 轉換完成：預設座標 + ArcGIS地理編碼備用")
    
    return df