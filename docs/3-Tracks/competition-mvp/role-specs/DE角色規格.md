# DE 角色規格 / DE Role Spec

最後更新 / Last updated: 2026-05-01

- 擁有者 / Owner: 賴泓瑋
- 任務軌 / Lane: DE
- 產出物 / Artifact: dataset manifest、ready table/view contract、quality checks
- 輸入 / Input: official source URLs、PM scenario matrix、archive evidence
- 輸出路徑 / Output path: `docs/3-Tracks/competition-mvp/contracts/de_dataset_manifest.yaml`
- 上游依賴 / Upstream dependency: PM scenario selection and source priority
- 下游消費者 / Downstream consumer: BE/AI owner
- 勿重複 / Do-not-duplicate: BE API shaping、FE visual layout、integration runtime fixes

## 輸入 / Inputs

- 官方 open-data source URLs。
- `docs/3-Tracks/competition-mvp/plan/scenario_matrix.md`
- `docs/Archive/2026-hackathon-prep/` 下的歷史證據。

## 工作合約 / Work Contract

- 定義 source URL、license/source owner、key fields、update cadence 與 fallback mode。
- 只用核准的資料格式產出 ready table/view schema。
- 加入 `source_trace`、`data_mode`、`last_validated_at`、`lasttime_in_data`。
- 文件化 row count、city coverage、coordinate 或 district join validation。

## 完成準則 / Done Criteria

- BE 可以查詢每個 ready table/view，不需要再問欄位語意。
- Taipei 與 Metro-Taipei 的 scope 都有被表示，或已明確說明。
- 每個 derived field 都有書面規則。
- 沒有把 2026-05-01 之前的 ETL code 直接複製成 competition code。
