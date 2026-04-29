#!/usr/bin/env python3
"""
【資料完整性深度檢測器 - Data Integrity Profiler】
針對 TDX, GTFS 等異質開源資料進行結構壓測，揪出 Mapping 斷鏈、座標飄移、與沉默延遲。

用法：
    python data_profiler.py join <dynamic_api> <static_api> --key <ID_Field>
    python data_profiler.py boundary <api> --lat <Lat_Field> --lon <Lon_Field>
    python data_profiler.py time-drift <api> --time <Time_Field>
"""

import sys
import json
import ssl
import urllib.request
import argparse
from datetime import datetime, timezone

def get_nested_value(data, path):
    """Retrieve a value from a nested dict/list using dot notation (e.g. 'showInfo.0.latitude')"""
    parts = path.split('.')
    for part in parts:
        if isinstance(data, list):
            try:
                idx = int(part)
                data = data[idx]
            except (ValueError, IndexError):
                return None
        elif isinstance(data, dict):
            # Check both key and lowercase key
            data = data.get(part, data.get(part.lower()))
        else:
            return None
    return data

def fetch_json(url):
    print(f"📥 Fetching: {url[:80]}...")
    context = ssl._create_unverified_context()
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    try:
        with urllib.request.urlopen(req, timeout=15, context=context) as response:
            content = response.read()
            # Try UTF-8 then Big5
            try:
                data = json.loads(content.decode('utf-8'))
            except (UnicodeDecodeError, json.JSONDecodeError):
                data = json.loads(content.decode('big5', errors='ignore'))
            
            # Smart find records
            records = data
            if isinstance(data, dict):
                # Check for common structures like data.taipei / data.gov.tw
                if "result" in data and isinstance(data["result"], dict) and "results" in data["result"]:
                    records = data["result"]["results"]
                elif "results" in data and isinstance(data["results"], list):
                    records = data["results"]
                else:
                    # Fallback: find the first list in the values
                    for val in data.values():
                        if isinstance(val, list):
                            records = val
                            break
            
            if not isinstance(records, list):
                print("⚠️ 無法找到陣列結構。內容預覽：", str(data)[:100])
                return []
            return records
    except Exception as e:
        print(f"❌ 抓取失敗: {e}")
        return []

def cmd_join(args):
    print("====================================")
    print("🤝 [Phase A] 實體關聯性檢測 (Orphan Rate)")
    print("====================================\n")
    dyn_data = fetch_json(args.dynamic_api)
    stat_data = fetch_json(args.static_api)
    
    if not dyn_data or not stat_data:
        return
        
    fk_key = args.key
    
    # Extract sets of keys using nested path support
    try:
        stat_keys = {str(get_nested_value(item, fk_key)) for item in stat_data}
        dyn_keys = {str(get_nested_value(item, fk_key)) for item in dyn_data}
    except Exception as e:
        print(f"❌ 提取鍵值失敗！錯誤: {e}")
        return
        
    stat_keys.discard("")
    stat_keys.discard("None")
    dyn_keys.discard("")
    dyn_keys.discard("None")
    
    orphans = dyn_keys - stat_keys
    dyn_count = len(dyn_keys)
    
    if dyn_count == 0:
        print("⚠️ 未能在動態資料中找到指定的 Key。")
        return
        
    orphan_rate = len(orphans) / dyn_count * 100
    
    print(f"\n📊 動態資料不重複 ID 數量: {dyn_count}")
    print(f"📊 靜態資料庫 ID 數量: {len(stat_keys)}")
    print(f"💀 查無靜態匹配的孤兒 ID 數量: {len(orphans)}")
    print(f"🔥 孤兒率 (Orphan Rate): {orphan_rate:.2f}%")
    
    if orphan_rate > 5:
        print("\n🚨 [致命異常] 孤兒率超過 5%！這可能代表動態車機/設備未能對應於靜態路網！如果直接依賴這份資料繪製，將產生大量無法點擊與渲染的幽靈圖標。")
    else:
        print("\n✅ 關聯健康度良好！")

def cmd_boundary(args):
    print("====================================")
    print("🗺️ [Phase B] 空間拓樸檢測 (Spatial Drift)")
    print("====================================\n")
    data = fetch_json(args.api)
    if not data: return
    
    lat_key, lon_key = args.lat, args.lon
    
    # 台灣合理的邊界
    BOUND_TPE = {"min_lat": 24.9, "max_lat": 25.2, "min_lon": 121.4, "max_lon": 121.7}
    BOUND_TW = {"min_lat": 21.0, "max_lat": 26.0, "min_lon": 119.0, "max_lon": 122.0}
    
    total = 0
    missing = 0
    out_of_tw = 0
    tpe_inside = 0
    
    for item in data:
        lat = get_nested_value(item, lat_key)
        lon = get_nested_value(item, lon_key)
        
        total += 1
        if lat is None or lon is None or str(lat).strip() == "" or str(lon).strip() == "":
            missing += 1
            continue
            
        try:
            lat = float(lat)
            lon = float(lon)
        except (ValueError, TypeError):
            missing += 1
            continue
            
        if BOUND_TW["min_lat"] <= lat <= BOUND_TW["max_lat"] and BOUND_TW["min_lon"] <= lon <= BOUND_TW["max_lon"]:
            if BOUND_TPE["min_lat"] <= lat <= BOUND_TPE["max_lat"] and BOUND_TPE["min_lon"] <= lon <= BOUND_TPE["max_lon"]:
                tpe_inside += 1
        else:
            out_of_tw += 1
            
    print(f"📊 檢查筆數: {total}")
    print(f"💀 無效/缺漏空間點: {missing} ({(missing/total*100):.1f}%)")
    if out_of_tw > 0:
        print(f"🚨 嚴重漂移(飛出台灣邊界): {out_of_tw} 筆 ({(out_of_tw/total*100):.1f}%)")
    else:
        print("✅ 無嚴重海外漂移點。")
        
    print(f"📍 落在雙北樞紐區域比例: {(tpe_inside/total*100):.1f}%")

def cmd_timedrift(args):
    print("====================================")
    print("⏱️ [Phase C] 沉默延遲檢測 (Temporal Staleness)")
    print("====================================\n")
    data = fetch_json(args.api)
    if not data: return
    
    time_key = args.time
    now = datetime.now()
    
    valid_times = []
    missing = 0
    
    for item in data:
        t_val = get_nested_value(item, time_key)
        t_str = str(t_val) if t_val else ""
        
        if not t_str or t_str == "None":
            missing += 1
            continue
            
        # 嘗試簡單剖析常見 ISO 型態
        t_str = t_str.replace("T", " ").replace("Z", "")
        if "+" in t_str:
            t_str = t_str.split("+")[0]
        if "." in t_str:
            t_str = t_str.split(".")[0]
            
        try:
            dt = datetime.strptime(t_str, "%Y-%m-%d %H:%M:%S")
            diff_minutes = (now - dt).total_seconds() / 60.0
            valid_times.append(diff_minutes)
        except Exception:
            missing += 1
            
    total = len(data)
    print(f"📊 總筆數: {total}")
    print(f"⚠️ 無法解析時間筆數: {missing}")
    
    if valid_times:
        valid_times.sort()
        avg_drift = sum(valid_times) / len(valid_times)
        max_drift = valid_times[-1]
        stale_count = sum(1 for m in valid_times if m > 30)
        
        print(f"⏱️ 平均時間差異: {avg_drift:.1f} 分鐘")
        print(f"🚨 最舊紀錄延遲: {max_drift:.1f} 分鐘")
        print(f"💀 殭屍測站(停滯超過30分鐘): {stale_count} 筆 ({(stale_count/len(valid_times)*100):.1f}%)")
        
        if stale_count / len(valid_times) > 0.1:
            print("\n🚨 [致命異常] 超過 10% 的測站已經停滯不更新，此資料流不建議用於要求『緊急倒數』特性的決策模組！")
        else:
            print("\n✅ 時間新鮮度健康！")
            
    total = len(data)
    print(f"📊 總筆數: {total}")
    print(f"⚠️ 無法解析時間筆數: {missing}")
    
    if valid_times:
        valid_times.sort()
        avg_drift = sum(valid_times) / len(valid_times)
        max_drift = valid_times[-1]
        stale_count = sum(1 for m in valid_times if m > 30) # > 30 mins 認定極端延遲
        
        print(f"⏱️ 平均時間差異: {avg_drift:.1f} 分鐘")
        print(f"🚨 最舊紀錄延遲: {max_drift:.1f} 分鐘")
        print(f"💀 殭屍測站(停滯超過30分鐘): {stale_count} 筆 ({(stale_count/len(valid_times)*100):.1f}%)")
        
        if stale_count / len(valid_times) > 0.1:
            print("\n🚨 [致命異常] 超過 10% 的測站已經停滯不更新，此資料流不建議用於要求『緊急倒數』特性的決策模組！")
        else:
            print("\n✅ 時間新鮮度健康！")

def main():
    parser = argparse.ArgumentParser(description="資料完整性深度檢測器")
    subparsers = parser.add_subparsers(dest="command", required=True)
    
    pj = subparsers.add_parser("join", help="檢視 FK 的孤兒率")
    pj.add_argument("dynamic_api", help="動態資料 API URL")
    pj.add_argument("static_api", help="靜態資料源 API URL")
    pj.add_argument("--key", required=True, help="共同鍵值 (Ex: RouteID)")
    
    pb = subparsers.add_parser("boundary", help="檢視空間異常離群值")
    pb.add_argument("api", help="API URL")
    pb.add_argument("--lat", required=True, help="緯度欄位名稱")
    pb.add_argument("--lon", required=True, help="經度欄位名稱")
    
    pt = subparsers.add_parser("time-drift", help="檢視資料沉默延遲度")
    pt.add_argument("api", help="API URL")
    pt.add_argument("--time", required=True, help="時間欄位名稱")

    args = parser.parse_args()
    
    if args.command == "join":
        cmd_join(args)
    elif args.command == "boundary":
        cmd_boundary(args)
    elif args.command == "time-drift":
        cmd_timedrift(args)

if __name__ == "__main__":
    main()
