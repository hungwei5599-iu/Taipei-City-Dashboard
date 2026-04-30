# Taipei Dashdorad Documentation 📂

歡迎來到雙北儀表板文件中心。本目錄已完成結構重構，按「專案生命週期」與「職能」進行分類，方便隊友快速定位重點。

## 🗺️ 文件導覽 (Table of Contents)

### 📗 [0-Handbooks](./0-Handbooks/) - 手冊與規範
> **重點：** 新手必看，包含環境建置、程式碼規範、協作流程。
- [Rules](./0-Handbooks/Rules/): 開發紅線與規範
- [Workflow](./0-Handbooks/Workflow/): 協作與提交流程

### 🏗️ [1-Architecture](./1-Architecture/) - 架構與設計
> **重點：** 技術架構、系統流程圖、核心功能規格。
- [Diagrams](./1-Architecture/Diagrams/): 內含 Draw.io 架構圖與流程圖
- [Topic Research](./1-Architecture/0408_topic.md): 初期選題與可行性分析

### 📊 [2-Data-Strategy](./2-Data-Strategy/) - 資料策略 (Single Source of Truth)
> **重點：** 系統所有資料源的真值來源。解決了評估報告與技術 RIDs 的定義衝突。
- **[Technical Mapping](./2-Data-Strategy/Technical-Mapping.md)** 🔥 **(開發必看：API/RID 清單)**
- [Strategic Assessment](./2-Data-Strategy/Strategic-Assessment/): 各主題的策略評分與決策劇本
- [Inventory](./2-Data-Strategy/Inventory/): 原始資料盤點清單

### 🚀 [3-Tracks](./3-Tracks/) - 組件賽道 (Themes)
> **重點：** 具體功能的實現過程，按 Research -> Plan -> Execute -> Review -> Ship 階段排列。
- [Heat Island](./3-Tracks/Heat-Island/): 主題一：熱島與脆弱族群
- [Disaster Prep](./3-Tracks/Disaster-Prep/): 主題二：韌性防災

### 🧭 [ops](./ops/) - Agent / PM 運作入口
> **重點：** 交接整理、Gemini CLI 委派規則、JIT test 選測、PM routing。
- **[Agent Ops](./ops/agent-ops.md)**：交接整理、Gemini wrapper、JIT test selector、Linear 待建卡。
- [Resource Routing Map](./ops/resource-routing-map.md): PM/DE/BE/FE/integration 分工入口。

### 🛠️ [9-Internal-Tools](./9-Internal-Tools/) - 內部工具箱
> **重點：** 模擬器、Proxy 工具、資料處理腳本。

---

## ⚠️ 開發特別提醒
1. **資料來源**：請一律以 `docs/2-Data-Strategy/Technical-Mapping.md` 為準。
2. **Agent 工作流**：交接整理、Gemini CLI 委派與 JIT test 選測請先看 `docs/ops/agent-ops.md`。
3. **組件規格**：具體組件的 UI 與邏輯定義請參考 `docs/3-Tracks/[主題]/execute/component-specs.md`。

---
*Last Updated: 2026-04-30*
