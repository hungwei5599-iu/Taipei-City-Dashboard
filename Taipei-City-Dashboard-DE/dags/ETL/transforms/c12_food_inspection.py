"""
組件12：臺北市衛生局食品抽驗不合格清冊 - Transform 策略實作

聚合維度：
1. 分類（product_category）：果菜類、包葉菜類、等
2. 年份（year）：從抽驗日期提取 YYYY
3. 地區（district）：從郵遞區號對應中文區名 + 抽驗地點提取
4. 檢驗結果（inspection_result）：不符合規定 / 符合規定
5. 不符合原因（failure_reasons）：農藥名稱聚合

輸出：JSON格式，前端可直接用於統計圖表與地圖標記
"""

import pandas as pd
import json
from datetime import datetime

# ============================================
# 定義：郵遞區號 → 中文區名 對應表
# ============================================
POSTAL_TO_DISTRICT = {
    100: '中正', 103: '大同', 104: '中山', 105: '松山', 106: '大安',
    108: '南港', 110: '信義', 111: '士林', 112: '北投', 114: '內湖',
    115: '南山', 116: '文山'
}

def extract_year(date_str):
    """將抽驗日期字串 (YYYYMMDD) 轉換為年份"""
    try:
        return int(str(date_str)[:4])
    except:
        return None

def get_district_name(postal_code):
    """根據郵遞區號返回中文區名，無法對應時返回 '其他'"""
    try:
        return POSTAL_TO_DISTRICT.get(int(postal_code), '其他')
    except:
        return '其他'

def clean_location(location_str):
    """從抽驗地點字串提取店家名稱"""
    if pd.isna(location_str):
        return '未知地點'

    if '/' in str(location_str):
        return str(location_str).split('/')[0].strip()
    return str(location_str).strip()

def extract_failure_reasons(reason_str):
    """從不符合規定原因字串提取農藥/物質名稱"""
    if pd.isna(reason_str):
        return []

    reason_str = str(reason_str).strip()

    # 分割多項原因（用 \n 或 \\n）
    items = reason_str.replace('\\n', '\n').split('\n')

    reasons = []
    for item in items:
        item = item.strip()
        if not item:
            continue

        # 提取農藥分類 + 名稱
        if '(' in item:
            item = item.split('(')[0].strip()

        # 移除尾部的數字和單位（ppm）
        while item and (item[-1].isdigit() or item.endswith('ppm') or item.endswith('ppb')):
            if item[-1].isdigit():
                item = item[:-1]
            elif item.endswith('ppm'):
                item = item[:-3]
            elif item.endswith('ppb'):
                item = item[:-3]
            item = item.strip()

        if item:
            reasons.append(item)

    return reasons

def transform(raw: dict[str, pd.DataFrame], data_time: str, config: dict, dataset_configs: dict) -> pd.DataFrame:
    """
    ETL.py 調用的主函數

    參數：
    - raw: 合併後的原始資料字典 {dag_id: DataFrame}
    - data_time: 資料時間戳 ISO 格式
    - config: 此資料集的 ETL 配置
    - dataset_configs: 所有資料集配置字典

    返回：
    - DataFrame: 轉換後的資料，準備載入資料庫
    """

    print("🔄 [C12] 開始食品抽驗資料轉換...")

    # 合併多個來源的資料
    dfs = list(raw.values())
    if not dfs:
        print("⚠️ [C12] 未取得任何資料")
        return pd.DataFrame()

    df = pd.concat(dfs, ignore_index=True)
    print(f"📊 [C12] 合併後共 {len(df)} 筆記錄")

    # ========== TRANSFORM ==========

    # 1. 新增衍生欄位
    df['year'] = df['抽驗日期'].apply(extract_year)
    df['district'] = df.get('抽驗行政郵遞區號', pd.Series()).apply(get_district_name)
    df['shop_name'] = df.get('抽驗地點', pd.Series()).apply(clean_location)
    df['failure_reasons'] = df.get('不符合規定原因', pd.Series()).apply(extract_failure_reasons)

    # 2. 標準化欄位名稱以符合資料庫規範
    column_mapping = {
        'year': 'year',
        '分類': 'product_category',
        'district': 'district',
        '檢驗結果': 'inspection_result',
        'shop_name': 'shop_name',
        '抽驗地點': 'original_location'
    }

    # 只保留存在的欄位
    available_cols = [k for k in column_mapping.keys() if k in df.columns or k in ['year', 'district', 'shop_name']]
    cols_to_keep = []
    rename_dict = {}

    for orig, new in column_mapping.items():
        if orig in df.columns:
            cols_to_keep.append(orig)
            rename_dict[orig] = new
        elif orig in ['year', 'district', 'shop_name']:
            cols_to_keep.append(orig)
            rename_dict[orig] = new

    df_clean = df[cols_to_keep].copy()
    df_clean = df_clean.rename(columns=rename_dict)

    # 3. 新增資料時間戳
    df_clean['data_time'] = data_time
    df_clean['updated_at'] = datetime.now().isoformat()

    # 4. 清理空值
    df_clean = df_clean.fillna('')

    print(f"✅ [C12] 轉換完成，輸出 {len(df_clean)} 筆記錄")
    print(f"📋 [C12] 欄位：{list(df_clean.columns)}")

    return df_clean
