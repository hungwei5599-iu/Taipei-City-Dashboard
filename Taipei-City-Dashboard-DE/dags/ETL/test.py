"""
每月自來水水質抽驗資料 - 完整 ETL 腳本
資料來源: https://data.gov.tw/dataset/139648
作者: 黑客松 - 資料工程師
"""

import requests
import pandas as pd
import json
from io import StringIO
from pathlib import Path
from datetime import datetime

class WaterQualityETL:
    def __init__(self):
        # 資源ID（從 Network 抓取得到）
        self.resource_id = "G-68L77FMJ2H238"
        self.api_url = f"https://data.gov.tw/api/getResourceFile?resourceId={self.resource_id}"
        
        # 請求標頭（重要：避免 403 Forbidden）
        self.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': 'https://data.gov.tw/dataset/139648',
            'Accept': '*/*',
            'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
        }
        
        # 輸出路徑
        self.output_dir = Path(__file__).parent / "output"
        self.output_dir.mkdir(exist_ok=True)
        
    def fetch_data(self):
        """
        抓取原始資料
        """
        print("\n" + "=" * 70)
        print("📥 步驟 1: 抓取原始資料")
        print("=" * 70)
        
        try:
            print(f"🔗 API URL: {self.api_url}")
            print("⏳ 等待中...")
            
            response = requests.get(
                self.api_url,
                headers=self.headers,
                timeout=30,
                verify=True
            )
            
            # 檢查狀態
            if response.status_code != 200:
                print(f"❌ HTTP {response.status_code}: {response.reason}")
                print(f"回應內容: {response.text[:500]}")
                return None
            
            # 設定編碼
            response.encoding = 'utf-8'
            
            # 讀取 CSV
            df = pd.read_csv(StringIO(response.text))
            
            print(f"✅ 下載成功！")
            print(f"📊 資料形狀: {df.shape[0]} 行 × {df.shape[1]} 列")
            print(f"\n📋 欄位清單 ({df.shape[1]} 個):")
            for i, col in enumerate(df.columns, 1):
                print(f"   {i:2d}. {col}")
            
            print(f"\n📌 前 3 筆資料:")
            print(df.head(3).to_string())
            
            return df
            
        except requests.exceptions.Timeout:
            print("❌ 請求逾時（Timeout），請重試")
            return None
        except requests.exceptions.ConnectionError as e:
            print(f"❌ 網路連線錯誤: {e}")
            return None
        except Exception as e:
            print(f"❌ 未預期的錯誤: {e}")
            return None
    
    def clean_data(self, df):
        """
        資料清洗
        """
        print("\n" + "=" * 70)
        print("🧹 步驟 2: 資料清洗")
        print("=" * 70)
        
        if df is None or df.empty:
            print("❌ 無有效資料")
            return None
        
        # 原始統計
        print(f"📊 清洗前: {df.shape[0]} 行")
        
        # 1. 移除完全重複的行
        initial_rows = len(df)
        df = df.drop_duplicates()
        removed = initial_rows - len(df)
        if removed > 0:
            print(f"✅ 移除 {removed} 筆重複資料")
        
        # 2. 移除全為 NaN 的列
        df = df.dropna(axis=1, how='all')
        print(f"✅ 移除空欄位")
        
        # 3. 轉換日期欄位
        date_columns = [col for col in df.columns if any(x in col for x in ['日期', '時間', 'date', 'time'])]
        for col in date_columns:
            try:
                df[col] = pd.to_datetime(df[col], errors='coerce')
                print(f"✅ 日期欄位轉換: {col}")
            except:
                pass
        
        # 4. 清理文字欄位（去除前後空格）
        for col in df.columns:
            if df[col].dtype == 'object':
                df[col] = df[col].str.strip()
        print(f"✅ 清理文字欄位")
        
        # 5. 移除完全為 NaN 的列（清洗後）
        df = df.dropna(axis=1, how='all')
        
        # 6. 檢查缺失值
        missing = df.isnull().sum()
        if missing.sum() > 0:
            print(f"⚠️  缺失值分布:")
            for col, count in missing[missing > 0].items():
                pct = (count / len(df) * 100)
                print(f"   {col}: {count} ({pct:.1f}%)")
        
        print(f"📊 清洗後: {df.shape[0]} 行 × {df.shape[1]} 列")
        
        return df
    
    def transform_data(self, df):
        """
        資料轉換 - 為前端做準備
        """
        print("\n" + "=" * 70)
        print("🔄 步驟 3: 資料轉換")
        print("=" * 70)
        
        if df is None or df.empty:
            return None
        
        # 1. 重新命名欄位（統一命名規範）
        # 範例：移除空格、轉小寫、加底線
        df.columns = df.columns.str.strip()
        
        # 2. 資料類型檢查
        print(f"✅ 資料類型:")
        for col, dtype in df.dtypes.items():
            print(f"   {col}: {dtype}")
        
        # 3. 新增時間戳記
        df['_data_fetch_time'] = datetime.now().isoformat()
        print(f"✅ 新增資料抓取時間戳記")
        
        return df
    
    def save_outputs(self, df):
        """
        輸出資料為多種格式
        """
        print("\n" + "=" * 70)
        print("💾 步驟 4: 輸出資料")
        print("=" * 70)
        
        if df is None or df.empty:
            print("❌ 無資料可輸出")
            return False
        
        try:
            # 輸出 1: CSV（保留所有資訊）
            csv_path = self.output_dir / "water_quality.csv"
            df.to_csv(csv_path, index=False, encoding='utf-8-sig')
            print(f"✅ CSV 輸出: {csv_path}")
            
            # 輸出 2: JSON（前端用）
            json_path = self.output_dir / "water_quality.json"
            with open(json_path, 'w', encoding='utf-8') as f:
                json.dump(
                    {
                        "metadata": {
                            "source": "https://data.gov.tw/dataset/139648",
                            "resource_id": self.resource_id,
                            "fetch_time": datetime.now().isoformat(),
                            "total_records": len(df),
                            "columns": df.columns.tolist()
                        },
                        "data": df.to_dict(orient='records')
                    },
                    f,
                    ensure_ascii=False,
                    indent=2
                )
            print(f"✅ JSON 輸出: {json_path}")
            
            # 輸出 3: 統計摘要
            summary_path = self.output_dir / "water_quality_summary.txt"
            with open(summary_path, 'w', encoding='utf-8') as f:
                f.write("=" * 70 + "\n")
                f.write("自來水水質資料 - 統計摘要\n")
                f.write("=" * 70 + "\n\n")
                f.write(f"資料來源: https://data.gov.tw/dataset/139648\n")
                f.write(f"抓取時間: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
                f.write(f"總筆數: {len(df)}\n")
                f.write(f"欄位數: {len(df.columns)}\n\n")
                f.write("資料概覽:\n")
                f.write(df.describe(include='all').to_string())
                f.write("\n\n缺失值:\n")
                f.write(df.isnull().sum().to_string())
            
            print(f"✅ 統計摘要: {summary_path}")
            
            return True
            
        except Exception as e:
            print(f"❌ 輸出失敗: {e}")
            return False
    
    def run(self):
        """
        執行完整 ETL 流程
        """
        print("\n" + "=" * 70)
        print("🌊 自來水水質資料 - 完整 ETL 流程")
        print("=" * 70)
        print(f"⏰ 開始時間: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        
        # 執行流程
        df = self.fetch_data()
        if df is not None:
            df = self.clean_data(df)
        if df is not None:
            df = self.transform_data(df)
        if df is not None:
            success = self.save_outputs(df)
        else:
            success = False
        
        # 總結
        print("\n" + "=" * 70)
        if success:
            print("✨ ETL 流程完成！")
            print(f"📁 輸出目錄: {self.output_dir}")
        else:
            print("❌ ETL 流程失敗")
        print(f"⏰ 完成時間: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print("=" * 70 + "\n")
        
        return success


if __name__ == "__main__":
    etl = WaterQualityETL()
    etl.run()