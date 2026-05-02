#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
C11 雙北環保餐廳地圖 - Transform 層
臺北市環保餐廳 + 新北市環保餐廳 → 統一標準化輸出
與 ETL.py 集成，用於 Hackathon Component 11
"""

import pandas as pd
import re
import time
import requests
from typing import List, Dict
import logging

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ============================================================================
# 常數定義
# ============================================================================

TAIPEI_DISTRICTS = [
    '松山區', '信義區', '大安區', '中山區', '中正區', '大同區', '萬華區',
    '文山區', '南港區', '內湖區', '士林區', '北投區'
]

NEWTAIPEI_DISTRICTS = [
    '板橋區', '中和區', '新店區', '蘆洲區', '三重區', '永和區', '汐止區',
    '瑞芳區', '五股區', '八里區', '淡水區', '林口區', '深坑區', '石碇區',
    '坪林區', '烏來區', '金山區', '萬里區', '平溪區', '雙溪區', '貢寮區',
    '新莊區', '泰山區', '土城區', '樹林區', '三峽區', '鶯歌區', '大溪區'
]

# ============================================================================
# 地理編碼函數 - ArcGIS REST API
# ============================================================================

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

    clean_address = re.sub(r'[\(（].*?[\)）]', '', str(address))
    clean_address = re.sub(r'(\d+樓|B\d+).*', '', clean_address, flags=re.IGNORECASE)
    clean_address = clean_address.strip()

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
        time.sleep(0.3)
        response = requests.get(url, params=params, headers=headers, timeout=10)
        response.raise_for_status()
        data = response.json()

        if data.get('candidates'):
            loc = data['candidates'][0]['location']
            return {'lat': loc['y'], 'lng': loc['x']}
    except Exception as e:
        logger.warning(f"    ⚠️  地理編碼失敗: {e}")

    return {'lat': None, 'lng': None}


def _batch_geocode_addresses(df: pd.DataFrame, address_col: str) -> pd.DataFrame:
    """
    批量地理編碼

    Args:
        df: 原始 DataFrame
        address_col: 地址欄位名

    Returns:
        包含 latitude、longitude 的 DataFrame
    """
    logger.info(f"\n[Geocoding] 啟動 ArcGIS 地理編碼...")

    results = []
    total = len(df)
    for idx, row in df.iterrows():
        addr = str(row[address_col])
        coords = _geocode_address(addr)
        status = "✓" if coords['lat'] else "✗"
        logger.info(f"  [{idx+1}/{total}] {addr} {status}")
        results.append(coords)

    return pd.DataFrame(results)


# ============================================================================
# 資料清洗函數
# ============================================================================

def clean_address(addr: str) -> str:
    """清洗地址：移除特殊字符、多餘空白"""
    if pd.isna(addr) or not addr:
        return ''

    addr = str(addr).strip()
    addr = re.sub(r'[\(（].*?[\)）]', '', addr)
    addr = re.sub(r'(\d+樓|B\d+).*', '', addr, flags=re.IGNORECASE)
    addr = re.sub(r'\s+', ' ', addr)

    return addr.strip()


def clean_phone(phone: str) -> str:
    """清洗電話號碼"""
    if pd.isna(phone) or not phone:
        return ''

    phone = str(phone).strip()
    phone = re.sub(r'[^\d\-+()]', '', phone)

    return phone.strip()


def extract_district(address: str, city: str) -> str:
    """萃取地址中的行政區名稱"""
    if not address or pd.isna(address):
        return 'unknown'

    address = str(address)
    districts = TAIPEI_DISTRICTS if city == '臺北市' else NEWTAIPEI_DISTRICTS

    for district in districts:
        if district in address:
            return district

    return 'unknown'


def calculate_certification_level(eco_attributes: List[str]) -> str:
    """
    計算認證等級，根據環保作為數量
    臺北會有詳細環保作為，新北統一為「認證中」。
    """
    if not eco_attributes or len(eco_attributes) == 0:
        return '認證中'

    count = len(eco_attributes)

    if count >= 6:
        return '鑽石級'
    elif count >= 4:
        return '金級'
    else:
        return '銀級'



# ============================================================================
# Transform 函數 - 與 ETL.py 集成
# ============================================================================

def transform(raw_dict: dict, data_time: str, config: dict = None, dataset_configs: dict = None) -> pd.DataFrame:
    """
    主要轉換函式 - ETL 集成點

    Args:
        raw_dict: {"臺北市環保餐廳": df_taipei, "新北市環保餐廳": df_newtaipei}
        data_time: ISO 格式時間戳
        config: ETL 配置字典
        dataset_configs: 資料集配置字典

    Returns:
        統一的 DataFrame，包含緯度、經度等標準化欄位
    """
    logger.info("=" * 70)
    logger.info("開始 C11 雙北環保餐廳 Transform")
    logger.info("=" * 70)

    # 提取臺北與新北資料
    df_taipei = raw_dict.get('臺北市環保餐廳', pd.DataFrame())
    df_newtaipei = raw_dict.get('新北市環保餐廳', pd.DataFrame())

    logger.info(f"\n[1/5] 載入資料...")
    logger.info(f"  → 臺北市: {len(df_taipei)} 筆")
    logger.info(f"  → 新北市: {len(df_newtaipei)} 筆")

    # ========== 步驟 2: Transform 資料 ==========
    logger.info("\n[2/5] Transform 資料...")
    df_taipei = _transform_taipei(df_taipei, data_time)
    df_newtaipei = _transform_newtaipei(df_newtaipei, data_time)

    # 合併資料
    all_restaurants = pd.concat([df_taipei, df_newtaipei], ignore_index=True)
    logger.info(f"  → 合併後: {len(all_restaurants)} 筆")

    # ========== 步驟 3: 賦予座標 ==========
    logger.info("\n[3/5] 賦予座標（使用 ArcGIS 地理編碼）...")
    geocoded = _batch_geocode_addresses(all_restaurants, 'address')
    all_restaurants['latitude'] = geocoded['lat']
    all_restaurants['longitude'] = geocoded['lng']

    valid_coords = all_restaurants['latitude'].notna().sum()
    logger.info(f"  → 成功賦予座標: {valid_coords}/{len(all_restaurants)} 筆")

    # ========== 步驟 4: 欄位標準化 ==========
    logger.info("\n[4/5] 標準化欄位...")

    output_cols = [
        'data_time', 'city', 'district', 'name', 'address',
        'latitude', 'longitude',
        'phone', 'certification_level', 'eco_attributes',
        'data_source'
    ]

    # 確保所有欄位存在
    for col in output_cols:
        if col not in all_restaurants.columns:
            all_restaurants[col] = None

    all_restaurants = all_restaurants[output_cols]
    logger.info(f"  → 輸出欄位: {len(all_restaurants.columns)}")

    # ========== 步驟 5: 統計資訊 ==========
    logger.info("\n[5/5] 統計資訊...")
    logger.info(f"  → 臺北市: {len(df_taipei)} 筆，{df_taipei['district'].nunique()} 區")
    logger.info(f"  → 新北市: {len(df_newtaipei)} 筆，{df_newtaipei['district'].nunique()} 區")
    logger.info(f"  → 座標完成率: {100 * valid_coords / len(all_restaurants):.1f}%")

    logger.info("\n" + "=" * 70)
    logger.info("✨ Transform 完成")
    logger.info("=" * 70)

    return all_restaurants


def _transform_taipei(df: pd.DataFrame, data_time: str) -> pd.DataFrame:
    """臺北市環保餐廳 Transform"""
    logger.info("\n  [臺北市]")

    if df.empty:
        return df

    # 標準化欄位名
    df.columns = df.columns.str.strip()

    # 資料清洗
    df = df.dropna(axis=1, how='all')
    initial_rows = len(df)
    df = df.drop_duplicates(subset=['餐廳名稱', '餐廳地址'])
    logger.info(f"    移除重複: {initial_rows - len(df)} 筆")

    # 欄位轉換
    df['name'] = df.get('餐廳名稱', '').astype(str).str.strip()
    df['address'] = df.get('餐廳地址', '').apply(clean_address)
    df['phone'] = df.get('餐廳電話', '').apply(clean_phone)
    df['city'] = '臺北市'
    df['district'] = df['address'].apply(lambda x: extract_district(x, '臺北市'))

    # 環保作為 - 轉換為 tuple 以保持可哈希性
    df['eco_attributes_str'] = df.get('類別環保作為', '')
    df['eco_attributes'] = df['eco_attributes_str'].apply(
        lambda x: tuple(attr.strip() for attr in str(x).split(',')
                       if attr.strip() and attr.strip() != '--')
    )

    # 認證等級
    df['certification_level'] = df['eco_attributes'].apply(
        lambda x: calculate_certification_level(list(x))
    )

    # 系統欄位
    df['data_source'] = '臺北市環保局'
    df['data_time'] = data_time

    logger.info(f"    處理完成: {len(df)} 筆")
    return df


def _transform_newtaipei(df: pd.DataFrame, data_time: str) -> pd.DataFrame:
    """新北市環保餐廳 Transform"""
    logger.info("\n  [新北市]")

    if df.empty:
        return df

    # 標準化欄位名
    df.columns = df.columns.str.strip()

    # 資料清洗
    df = df.dropna(axis=1, how='all')
    initial_rows = len(df)
    df = df.drop_duplicates(subset=['name', 'address'])
    logger.info(f"    移除重複: {initial_rows - len(df)} 筆")

    # 欄位轉換
    df['name'] = df.get('name', '').astype(str).str.strip()
    df['address'] = df.get('address', '').apply(clean_address)
    df['phone'] = df.get('localcallservice', '').apply(clean_phone)
    df['city'] = '新北市'
    df['district'] = df['address'].apply(lambda x: extract_district(x, '新北市'))

    # 新北沒有詳細環保作為，統一為「認證中」
    df['eco_attributes'] = [('認證中',) for _ in range(len(df))]
    df['certification_level'] = '認證中'

    # 系統欄位
    df['data_source'] = '新北市環保局'
    df['data_time'] = data_time

    logger.info(f"    處理完成: {len(df)} 筆")
    return df
