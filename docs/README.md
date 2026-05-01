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
> **重點：** 競賽正式規格、角色 spec、合約與驗收清單。
- **[Competition MVP](./3-Tracks/competition-mvp/)** 🔥 **正式主入口：4 組件 MVP 賽中透明重建規格**
- [Legacy prep_compoment](./3-Tracks/prep_compoment/): 舊路徑導引，只保留 legacy pointer

### 🧭 [ops](./ops/) - Agent / PM 運作入口
> **重點：** 交接整理、Gemini CLI 委派規則、JIT test 選測、PM routing。
- **[Agent Ops](./ops/agent-ops.md)**：交接整理、Gemini wrapper、JIT test selector、Linear 待建卡。
- [Resource Routing Map](./ops/resource-routing-map.md): PM/DE/BE/FE/integration 分工入口。

### 🛠️ [9-Internal-Tools](./9-Internal-Tools/) - 內部工具箱
> **重點：** 工具位置導引。工具 source 已移到 `tools/pre-hackathon/`，`docs/` 不存 venv 或 runtime cache。

### 🗄️ [Archive](./Archive/) - 歷史證據
> **重點：** 舊驗證報告、HTML prototype、舊 10 組件計畫只作為歷史證據。
- [2026 Hackathon Prep Archive](./Archive/2026-hackathon-prep/)

---

## ⚠️ 開發特別提醒
1. **資料來源**：請一律以 `docs/2-Data-Strategy/Technical-Mapping.md` 為準。
2. **Agent 工作流**：交接整理、Gemini CLI 委派與 JIT test 選測請先看 `docs/ops/agent-ops.md`。
3. **正式規格**：賽中重建 spec 請一律寫入 `docs/3-Tracks/competition-mvp/`。
4. **歷史產物**：quick validation、prototype HTML、舊 mock 與舊 10 組件計畫請歸檔到 `docs/Archive/2026-hackathon-prep/`。

---
*Last Updated: 2026-05-01*
