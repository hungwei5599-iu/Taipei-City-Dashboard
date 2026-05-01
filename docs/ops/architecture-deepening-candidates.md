# 大型 Module 深化候選

> 使用 `improve-codebase-architecture` 詞彙：Module、Interface、Implementation、Depth、Seam、Adapter、Leverage、Locality。

## 盤點結論

本輪只列大型 Module 深化候選，不處理零散小 Module。每個候選都以 deletion test 檢查：如果刪掉目前 Module，複雜度會消失，還是會散回多個 caller。

## 1. FE Hackathon 展示 Module

**Files**

- `Taipei-City-Dashboard-FE/src/views/HackathonDashboardView.vue`
- `Taipei-City-Dashboard-FE/src/assets/configs/hackathon/modules.js`
- `Taipei-City-Dashboard-FE/src/assets/configs/hackathon/heatFamilyWorker.js`
- `Taipei-City-Dashboard-FE/tests/components/HeatFamilyWorker.spec.js`

**Problem**

目前 Hackathon 展示的 Interface 對 caller 來說偏大：地圖 feature、ApexCharts contract、AI fallback、城市 filter、decision card state 分散在 view 與 config。`HackathonDashboardView.vue` 同時知道資料 shape、Mapbox layer 規則、AI proxy fallback 與 chart rendering 細節，Locality 不足。

**Deletion test**

如果刪掉 `heatFamilyWorker.js`，複雜度不會消失，會散回 `modules.js`、view、tests 與 demo 文件。這表示它已經有成為深 Module 的價值，但目前 Interface 還沒有把整個 Hackathon 展示能力收住。

**Solution**

把 Hackathon 展示整理成一個深 Module：外部只取得「目前 module 的展示模型」，Implementation 內部處理圖表、地圖 feature、AI fallback、data contract compliance。`HackathonDashboardView.vue` 只消費展示模型，不直接理解每種資料 contract 的細節。

**Benefits**

- Leverage：新增第 12、13 個 hackathon module 時，只補展示模型，不重寫 view 邏輯。
- Locality：資料契約、fallback、compliance test 集中在同一個 Module。
- Tests：Interface 可用一個 compliance spec 覆蓋 chart format、ApexCharts 限制、AI proxy、map feature。

## 2. BE AI Tool Module

**Files**

- `Taipei-City-Dashboard-BE/app/services/ai/tools/hackathon.go`
- `Taipei-City-Dashboard-BE/app/services/ai/tools/registry.go`
- `Taipei-City-Dashboard-BE/app/services/ai/ai_service.go`
- `Taipei-City-Dashboard-BE/app/services/ai/tools/*_test.go`

**Problem**

`hackathon.go` 的 Implementation 混合 tool registration、argument parsing、external fetch、fallback response、domain wording。Interface 對 caller 看似只是 tool handler，但實際要知道很多隱含規則，例如 tool name、JSON schema、TWCC proxy 合規、官方資料 fallback。

**Deletion test**

如果刪掉 `hackathon.go`，complexity 會散到 registry、controller、AI service 與 tests，代表這個 Module 在承載真實行為；但目前 Depth 還不夠，因為 caller 和 tests 仍要知道過多 handler 細節。

**Solution**

把 AI tool Module 的 Seam 放在「tool catalog + handler contract」。Implementation 內部可分成 registry adapter、domain response builder、external data adapter。先不新增 dependency，也不改 TWCC 紅線。

**Benefits**

- Leverage：新增 tool 時走同一個 registration 與 fallback pattern。
- Locality：官方資料失敗、JSON args error、static fallback wording 在同一處驗證。
- Tests：package-level tests 可測 catalog completeness 與 handler behavior，不必逐一碰 controller。

## 3. DE ETL Module

**Files**

- `Taipei-City-Dashboard-DE/dags/ETL/ETL.py`
- `Taipei-City-Dashboard-DE/dags/ETL/etl_config.json`
- `Taipei-City-Dashboard-DE/dags/ETL/transforms/*.py`
- `Taipei-City-Dashboard-DE/dags/ETL/test_transform_utils.py`

**Problem**

ETL 的 Interface 目前是 `source_type`、`dag_id`、transform module naming、config JSON 欄位共同組成。這些 Interface 規則分散在文件、JSON 與 dynamic import Implementation 中，讓新增資料集時需要同時理解多個位置。

**Deletion test**

如果刪掉 `ETL.py` 或 `etl_config.json`，資料源 dispatch 與 transform plugin 規則會散回各 DAG。這表示 ETL Module 值得深化，不是 pass-through。

**Solution**

把 ETL Module 的 Interface 明確化為「config schema + transform plugin contract + output contract」。Implementation 保留 dynamic import，但把 source dispatch 與 transform fallback 的規則變成可測規約。

**Benefits**

- Leverage：新增資料源或 transform 時只遵循一個 contract。
- Locality：source_type、keep_cols、output table、metadata update 的錯誤集中檢查。
- Tests：JIT selector 可把 config/transform 變更映射到 ETL tests，後續可加 schema contract tests。

## 下一步

建議優先順序：

1. FE Hackathon 展示 Module：目前直接影響 demo 與 `/hackathon` 可視化。
2. JIT selector 與 BE AI Tool Module：讓 tool handler 變更可以快速選測。
3. DE ETL Module：等資料源與 transform contract 要繼續擴張時再深化。
