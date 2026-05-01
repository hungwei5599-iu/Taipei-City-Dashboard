# 後端與 AI 角色規格 / BE and AI Role Spec

最後更新 / Last updated: 2026-05-01

- 擁有者 / Owner: 張詠翔
- 任務軌 / Lane: BE / AI
- 產出物 / Artifact: API contract、query contract、AI tool schema、cache/fallback behavior
- 輸入 / Input: DE manifest and schema plan、existing Go backend patterns、TWCC AI boundary rules
- 輸出路徑 / Output path: `docs/3-Tracks/competition-mvp/contracts/be_api_ai_contracts.md`
- 上游依賴 / Upstream dependency: DE ready table/view contract
- 下游消費者 / Downstream consumer: FE owner and integration owner
- 勿重複 / Do-not-duplicate: DE cleaning logic、FE visual layout、PM story framing

## 輸入 / Inputs

- DE manifest 與 schema plan。
- 現有 Go backend patterns。
- TWCC AI boundary rules。

## 工作合約 / Work Contract

- 實作或文件化 map、trend、comparison 與 AI context 的 query 行為。
- 所有 AI traffic 都要走 `/api/v1/ai/chat/twai`。
- 加入 deterministic cache key：`component_id + city_scope + district + date_range + data_hash`。
- 回傳 source trace 與 fallback state。

## 完成準則 / Done Criteria

- FE 可以直接消費 API response，不需要先讀 DB schema。
- AI tool output 是結構化且有 evidence support。
- invalid city、empty data、DB error、provider error、rate limit cases 都已定義。
- 沒有引入未核准的 Go package。
