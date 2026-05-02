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
    """
    將抽驗日期字串 (YYYYMMDD) 轉換為年份
    例: '20220105' → 2022
    """
    try:
        return int(str(date_str)[:4])
    except:
        return None

def get_district_name(postal_code):
    """
    根據郵遞區號返回中文區名
    無法對應時返回 '其他'
    """
    return POSTAL_TO_DISTRICT.get(int(postal_code), '其他')

def clean_location(location_str):
    """
    從抽驗地點字串提取店家名稱
    格式通常為: "店名/地址"
    """
    if pd.isna(location_str):
        return '未知地點'
    
    if '/' in str(location_str):
        return str(location_str).split('/')[0].strip()
    return str(location_str).strip()

def extract_failure_reasons(reason_str):
    """
    從不符合規定原因字串提取農藥/物質名稱
    格式例: "殺蟎劑Spirodiclofen 賜派芬0.52(標準：0.01ppm以下)"
    
    策略：
    - 保留農藥名稱（英文+中文）
    - 移除數值細節與標準值
    - 多項原因用換行 '\\n' 分隔
    """
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
        # 格式: "殺蟎劑Spirodiclofen 賜派芬0.52(標準：...)"
        # 提取到 ppm 前的部分
        if '(' in item:
            item = item.split('(')[0].strip()
        
        # 移除尾部的數字和單位（ppm）
        while item and item[-1].isdigit() or item.endswith('ppm') or item.endswith('ppb'):
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

def transform_food_inspection(input_csv_path, output_json_path):
    """
    主轉換函數
    
    讀取原始CSV → 聚合 → 輸出JSON
    """
    
    # ========== EXTRACT ==========
    print("📥 讀取原始資料...")
    df = pd.read_csv(input_csv_path)
    print(f"   ✓ 讀取 {len(df)} 筆記錄")
    
    # ========== TRANSFORM ==========
    print("🔄 轉換資料...")
    
    # 1. 新增衍生欄位
    df['year'] = df['抽驗日期'].apply(extract_year)
    df['district'] = df['抽驗行政郵遞區號'].apply(get_district_name)
    df['shop_name'] = df['抽驗地點'].apply(clean_location)
    df['failure_reasons'] = df['不符合規定原因'].apply(extract_failure_reasons)
    
    # 2. 重新命名欄位（符合JSON輸出慣例）
    df_clean = df[[
        'year',
        '分類',           # product_category
        'district',       # district_name
        '檢驗結果',        # inspection_result
        'shop_name',      # shop_name
        '抽驗地點',        # original_location
        'failure_reasons' # failure_reasons (list)
    ]].copy()
    
    df_clean.columns = [
        'year',
        'product_category',
        'district',
        'inspection_result',
        'shop_name',
        'original_location',
        'failure_reasons'
    ]
    
    # 3. 聚合統計：依 (year, product_category, district) 分組
    print("   統計維度聚合：年份 × 分類 × 地區")
    
    agg_stats = []
    
    for (year, category, district), group in df_clean.groupby(['year', 'product_category', 'district']):
        # 計算該組合的統計
        total_samples = len(group)
        failed_samples = len(group[group['inspection_result'] == '不符合規定'])
        passed_samples = len(group[group['inspection_result'] == '符合規定'])
        pass_rate = round(passed_samples / total_samples * 100, 2) if total_samples > 0 else 0
        
        # 聚合所有失敗原因（去重）
        all_reasons = []
        for reasons_list in group['failure_reasons']:
            all_reasons.extend(reasons_list)
        unique_reasons = list(set(all_reasons))
        
        # 失敗店家清單
        failed_shops = group[group['inspection_result'] == '不符合規定'][
            ['shop_name', 'original_location', 'failure_reasons']
        ].to_dict('records')
        
        agg_stats.append({
            'year': int(year),
            'product_category': category,
            'district': district,
            'total_samples': int(total_samples),
            'failed_samples': int(failed_samples),
            'passed_samples': int(passed_samples),
            'pass_rate': pass_rate,
            'failure_reasons': unique_reasons,
            'failed_shops_count': len(failed_shops),
            'failed_shops_sample': failed_shops[:5]  # 前5家失敗店家範例
        })
    
    # ========== LOAD ==========
    print("💾 輸出JSON...")
    
    # 按年份、地區、分類排序
    agg_stats_sorted = sorted(
        agg_stats,
        key=lambda x: (x['year'], x['district'], x['product_category']),
        reverse=True
    )
    
    output_data = {
        'metadata': {
            'dataset_name': '臺北市衛生局食品抽驗不合格清冊',
            'export_time': datetime.now().isoformat(),
            'total_records': len(df),
            'years': sorted(list(set(df_clean['year'].dropna()))),
            'districts': sorted(list(set(df_clean['district']))),
            'categories': sorted(list(set(df_clean['product_category']))),
        },
        'aggregated_stats': agg_stats_sorted,
    }
    
    # 輸出為格式化JSON
    with open(output_json_path, 'w', encoding='utf-8') as f:
        json.dump(output_data, f, ensure_ascii=False, indent=2)
    
    print(f"   ✓ 輸出 {output_json_path}")
    print(f"   ✓ 聚合統計項目數：{len(agg_stats_sorted)}")
    
    return output_data

# ============================================
# 使用範例
# ============================================
if __name__ == '__main__':
    input_file = '/mnt/user-data/uploads/hackathon_c12_Food_samples_failed_inspection_ready_20260502_221011.csv'
    output_file = '/home/claude/food_inspection_aggregated.json'
    
    result = transform_food_inspection(input_file, output_file)
    
    # 打印摘要
    print("\n✅ Transform 完成！")
    print(f"聚合維度統計數：{len(result['aggregated_stats'])}")
    print(f"\n首3項範例：")
    for item in result['aggregated_stats'][:3]:
        print(f"  {item['year']} | {item['district']} | {item['product_category']}")
        print(f"    ✗ {item['failed_samples']}/{item['total_samples']} | 通過率 {item['pass_rate']}%\n")