# 資料對接對位表與 RID 註冊庫 (Data Mapping & RID Registry) 🛰️

本文件為雙北儀表板資料整合的「唯一真值來源 (Single Source of Truth)」，旨在取代早期驗證中發現的過時或失效連結。

## 🔴 核心即時軌跡 (Real-Time Tracks)

| 關鍵指標 | 負責單位 | RID / API 端點 | 資料格式 | 狀態 |
| :--- | :--- | :--- | :--- | :--- |
| **即時淹水感測** | 台北水利處 | `192f155c-15ba-4122-863a-23743f553a1c` | JSON/API | ✅ 已驗證 (含預埋雨水下水道備援) |
| **景點人潮燈號** | 台北觀傳局 | `https://travel.taipei/stream/alert-of-crowds/json` | JSON/API | ⚠️ 受阻 (Cloudflare 保護中，需 BE Proxy) |
| **全國急診即時** | 健保署 (NHI) | `https://info.nhi.gov.tw/api/inae4000/inae4001s01/SQL0002` | JSON/POST | ✅ 已驗證 (改用後端直接介接) |
| **台北市 AED** | 台北衛生局 | `cd050577-0f57-410a-9d95-885141040339` | JSON/API | ✅ 已驗證 (Resource: `438c61ad`) |

---

## 🟡 社經與脆弱性指標

### 1. 台北市人口結構 (高齡統計)
- **資料集 ID**: `64c8a3a0-3b9a-4f49-a13a-fb1eb2ffa4b1`
- **欄位對應**: `區域別` (行政區), `65歲以上數量` (計算各年齡加總)。

### 2. 新北市人口結構 (高齡統計)
- **資料集 ID**: `8308AB58-62D1-424E-8314-24B65B7AB492`
- **欄位對應**:
    - `field1`: 行政區 (District)
    - `percent2`: 總人口數
    - `percent28`: 65歲以上人口數 (Vulnerable Count)
    - `percent33`: 老化指數 (Aging Index)

---

## 🟢 韌性基礎設施處所

| 圖層屬性 | 負責單位 | RID / URL |
| :--- | :--- | :--- |
| **台北避難處所** | 台北教育局 | `aaf97773-3631-40e2-b3cc-da87bf2ce1d5` (RID: `4c92dbd4`) |
| **新北避難處所** | 新北社會局 | `25E439AB-49E7-4E5E-85CE-A25C13FD2770` |

---

## 🛠️ 開發修復紀錄 (Data Engineering & BE Logic)

為了確保上述資料在儀表板中能即時呈現，我們針對後端與資料處理層做了以下修補：

### 1. 後端工具處理器 (BE Tool Handler)
- **修改檔案**：`Taipei-City-Dashboard-BE/app/services/ai/tools/hackathon.go`
- **關鍵改動**：
    - **急診即時度 (C5)**：建立 `fetchNHIERStatus()` 函數。由於健保署 API 需使用 `POST` 請求並帶入特定的 JSON Body，我們放棄了現有 DAG 的靜態抓取，改由後端直接介接 JSON POST API 以獲取 15 分鐘一跳的即時數據。
    - **AED 點位 (C4)**：更新 RID 至 `cd050577`/`438c61ad`。修復了因資料庫舊 RID 404 導致的地圖空白問題。
    - **淹水監測 (C9)**：整合了淹水感測器與水位站的雙軌邏輯，確保在非颱風期間仍能顯示監測點位。

### 2. 資料診斷工具 (DE Helper Script)
- **新建立腳本**：`docs/2-Data-Strategy/Strategic-Assessment/data_profiler.py`
- **功能描述**：此 Python 腳本用於快速診斷政府資料集（data.taipei / data.ntpc）的連通性與編碼問題。支援自動轉碼（UTF-8/Big5）檢查，並能解析嵌套的 JSON 路徑，幫助隊友在開發前確認 RID 是否仍然有效。

---
**核對日期**: 2026-04-20
**核對人**: AI 系統架構師 (Antigravity)
