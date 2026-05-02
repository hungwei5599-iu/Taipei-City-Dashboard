# BE Gap Spec: ChatBox 食安健康 AI Tool

## 0. Current Prototype Change Map

這份 spec 記錄目前所有 prototype 改動，方便後續全部 revert 後由 BE/AI 開發重做正式版。

### FE changed files

| File | Prototype change | Formal decision |
| --- | --- | --- |
| `Taipei-City-Dashboard-FE/src/components/dialogs/ChatBox.vue` | 攔截食安健康關鍵字，顯示 AI Tool Result Card；預設走 FE deterministic local classifier，不發 API request | 正式版應改為呼叫 `/api/v1/ai/chat/twai`，由 BE tool loop 回傳結構化 `recommended_components` |
| `Taipei-City-Dashboard-FE/src/router/index.js` | 移除上一輪 `/food-safety` 新頁面 route | 保持移除；食安 AI 原型應嵌在既有 ChatBox，不新增頁面 |

### BE changed files

| File | Prototype change | Formal decision |
| --- | --- | --- |
| `Taipei-City-Dashboard-BE/app/controllers/foodSafety.go` | 新增 prototype endpoint `POST /api/v1/ai/food-safety/brief` | 正式版不應依賴此 endpoint；應接回 `/api/v1/ai/chat/twai` |
| `Taipei-City-Dashboard-BE/app/controllers/foodSafety_test.go` | 測 prototype endpoint fallback response | 正式版需改測 `/api/v1/ai/chat/twai` food_safety_concierge mode |
| `Taipei-City-Dashboard-BE/app/services/ai/food_safety.go` | 組裝 classification、recommended_components、Evidence Pack、limitations、fallback AI metadata | 正式版保留 response contract，但改由 TWCC tool loop 產生 answer 與 tool trace |
| `Taipei-City-Dashboard-BE/app/services/ai/food_safety_test.go` | 測 deterministic fallback、question_type、recommended_components | 正式版需補 TWCC disabled fallback 與 tool trace order |
| `Taipei-City-Dashboard-BE/app/services/ai/tools/food_safety.go` | 新增/擴充 `classify_food_safety_question` 與 prototype food-safety tools | 正式版可保留 `classify_food_safety_question`，但應拆出 `build_component_navigation_action` |
| `Taipei-City-Dashboard-BE/app/services/ai/tools/food_safety_test.go` | 測新聞問題分流、city/year filtering、empty data limitation | 正式版需擴充到五類 module classification |
| `Taipei-City-Dashboard-BE/app/services/ai/tools/registry.go` | 註冊 food-safety prototype tools | 正式版需註冊 `build_component_navigation_action` |
| `Taipei-City-Dashboard-BE/app/routes/router.go` | 註冊 `/ai/food-safety/brief` prototype route | 正式版若改走 `/ai/chat/twai`，此 route 可移除或保留為 internal smoke endpoint |

### Spec changed files

| File | Purpose |
| --- | --- |
| `test_specs/AI_spec_raw.md` | ChatBox prototype contract |
| `test_specs/food_safety_chatbox_ai_tool_gap_spec.md` | BE formalization gap spec |
| `CONTEXT.md` | Domain terms for 食安稽查 AI / Evidence Pack / official_only / not single-store verdict |

### Local-server 500 note

本地 FE `.env` 使用：

```text
VITE_API_URL=/api/dev
```

非 Docker Vite proxy 會把 `/api/dev/...` 導向遠端/錯誤 path。為避免 prototype 一打開就產生 server 500，`ChatBox.vue` 預設不呼叫 prototype BE endpoint。只有設定以下 env 才會發 API request：

```text
VITE_FOOD_SAFETY_TOOL_API=true
```

local fallback mode 也不得呼叫 `/chatlog/`。正式版再由 BE 寫入 `ai_chatlog`，不要由 FE prototype 補寫 log。

### 2026-05-02 re-validation result

本次重新驗證時用本機 Vite：

```text
VITE_API_URL=/api ./node_modules/.bin/vite --host 127.0.0.1 --port 5175
```

Vite 因 port 5175 被占用，自動改開：

```text
http://127.0.0.1:5176/dashboard?verify=food-safety-local-recheck
```

驗證結論：

1. `GET /dashboard` 回 200，可正常載入前端 shell。
2. 初始 dashboard 載入仍出現既有 500：
   - `GET /api/contributor/`
   - `GET /api/dashboard/`
3. 送出食安 ChatBox 測試句後，Network 沒有出現：
   - `/api/chatlog/`
   - `/api/ai/*`
   - `/api/*food-safety*`
4. ChatBox 直接回 deterministic local classifier 結果：

```text
已完成問題分類：這個問題應先導向官方資料模組，而不是判定單一店家或商品風險。
```

因此，這次 server 500 不是食安 ChatBox AI Tool 原型新增造成；目前 prototype 已避免 fallback mode 打到 BE 或 chatlog。正式版仍需由 BE/AI 接回 `/api/v1/ai/chat/twai`，並在 BE 端負責 tool trace 與 chat log。

---

## 1. Prototype Boundary

目前 prototype 已先用：

```http
POST /api/v1/ai/food-safety/brief
```

驗證 ChatBox 內的問題分類與模組導覽卡。

正式 BE 不應停在這條 domain prototype API。正式版要接回既有 AI gateway：

```http
POST /api/v1/ai/chat/twai
```

並由 TWCC tool-calling loop 執行 tools。

---

## 2. Required Tools

### 2.1 `classify_food_safety_question`

用途：

```text
將市民食安健康問題分流到官方資料模組。
```

Input：

```json
{
  "question": "我看到食品中毒新聞，想知道雙北外食跟親子餐廳是否有官方資料可以查？",
  "city_scope": "both",
  "year_from": 2021,
  "year_to": 2025
}
```

Output：

```json
{
  "topic": "food_safety_information_gap_radar",
  "intent": "route_question_to_official_data_modules",
  "question_type": "food_safety_news_context",
  "recommended_modules": [
    {
      "module_id": "restaurant_grade",
      "title": "餐飲衛生分級模組",
      "reason": "用餐飲衛生分級、標章與地理分布資料協助市民查詢外食或親子用餐場景。"
    }
  ],
  "warnings": [
    "此工具只負責把食安健康問題導向官方資料模組，不判定單一店家是否安全。"
  ]
}
```

### 2.2 `build_component_navigation_action`

目前缺口。

用途：

```text
把 module_id 轉成前端可執行的儀表板跳轉 action。
```

Input：

```json
{
  "module_id": "restaurant_grade",
  "city_scope": "both"
}
```

Output：

```json
{
  "component_id": "restaurant_grade_map",
  "title": "雙北餐飲衛生分級地圖",
  "action": {
    "type": "navigate_focus_component",
    "path": "/dashboard",
    "query": {
      "index": "food_safety",
      "focusComponent": "restaurant_grade_map"
    }
  }
}
```

### 2.3 `build_food_safety_evidence_pack`

目前有 prototype metadata，但正式版需補：

```text
1. source_name
2. agency
3. url
4. data_date
5. update_frequency
6. used_for
7. limitations
```

---

## 3. Module Mapping Gap

BE 需要與 FE/PM 確認真實 component id。

| module_id | prototype component_id | BE 待補 |
| --- | --- | --- |
| `food_inspection` | `food_inspection_trend` | 對應正式食品抽驗趨勢 component index/id |
| `restaurant_grade` | `restaurant_grade_map` | 對應正式餐飲衛生分級地圖 component index/id |
| `water_quality` | `water_quality_dashboard` | 對應正式飲用水監測 component index/id |
| `medical_access` | `emergency_pharmacy_access` | 拆成急診/藥局或合併為健康應變可及性 |
| `information_gap` | `food_information_gap_radar` | 新增或定義資訊落差雷達 component |

---

## 4. API Contract Gap

正式 `/api/v1/ai/chat/twai` 需要支援 ChatBox 食安 tool mode。

Request 建議：

```json
{
  "session_id": "food-safety-chatbox-demo",
  "mode": "food_safety_concierge",
  "messages": [
    {
      "role": "user",
      "content": "我看到食品中毒新聞，想知道雙北外食跟親子餐廳是否有官方資料可以查？"
    }
  ],
  "tool_policy": {
    "official_only": true,
    "stream": false
  }
}
```

Response 建議：

```json
{
  "status": "success",
  "data": {
    "answer": "可先查餐飲衛生分級與食品抽驗趨勢，但不能判定單一店家安全。",
    "question_type": "food_safety_news_context",
    "recommended_components": [],
    "evidence": [],
    "limitations": [],
    "tool_trace": [],
    "ai": {
      "provider": "twcc",
      "model": "env:TWCC_MODEL",
      "fallback": false
    }
  }
}
```

---

## 5. Logging Gap

正式版需寫入 `ai_chatlog`：

```text
1. session_id
2. user_id
3. provider
4. model
5. question
6. answer
7. tool_used = true
8. tools = classify_food_safety_question, build_component_navigation_action, build_food_safety_evidence_pack
9. latency_ms
10. fallback_reason
```

---

## 6. Acceptance Tests for BE

必補測試：

```text
1. 食安新聞問題 → question_type=food_safety_news_context
2. 親子餐廳問題 → recommended_modules includes restaurant_grade
3. 飲用水問題 → recommended_modules includes water_quality
4. 身體不適/藥局/急診問題 → recommended_modules includes medical_access
5. 泛官方資料查證問題 → recommended_modules includes information_gap
6. stream=true → reject or force false
7. official_only=false/open_web → reject
8. TWCC disabled → deterministic fallback, status 200
9. tool trace 寫入且順序可追蹤
10. 不得輸出單一店家安全判定或醫療建議
```
