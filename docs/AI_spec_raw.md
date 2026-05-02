# AI Spec Raw: ChatBox 食安健康 AI Tool 原型

## 0. 決策結論

本輪不做新頁面、不做完整食安資料研究、不做五個模組完整串接。

第一版只做一個原型驗證：

```text
在既有 ChatBox.vue 內，新增食安健康 AI Tool Result Card。
市民輸入食安/健康問題後，系統先做問題分類，回傳應導向的官方資料模組、Evidence Pack 摘要與限制。
```

產品主軸暫定：

```text
雙北食安資訊落差雷達
```

AI 角色：

```text
官方資料導覽員 + Evidence Pack 產生器 + 儀表板跳轉控制器
```

非目標：

```text
1. 不建立 /food-safety 新頁面
2. 不在第一版做 ApexCharts 趨勢圖
3. 不判定單一店家、單一商品或個人健康風險
4. 不提供醫療建議
5. 不用 OpenAI mock
```

---

## 1. 使用旅程

```text
看到食安新聞
→ 產生焦慮：這跟我有關嗎？
→ ChatBox AI Tool 判斷問題類型
→ 推薦官方資料模組
→ 顯示 Evidence Pack 摘要
→ 顯示資料限制
→ 提供儀表板元件跳轉 action
```

第一版只驗證：

```text
ChatBox 問題分類 → 推薦模組 → Evidence/limitations card
```

---

## 2. 問題分類

固定五類：

| question_type / module_id | 用途 |
| --- | --- |
| `food_inspection` | 食品抽驗、稽查、合格率、不合格原因 |
| `restaurant_grade` | 餐廳、親子餐廳、夜市、外食、餐飲衛生分級 |
| `water_quality` | 飲用水、水質、自來水、淨水監測 |
| `medical_access` | 急診、藥局、身體不適後的資源可及性 |
| `information_gap` | 官方資料查證、資料透明度、資料缺口 |

新聞脈絡可回：

```text
food_safety_news_context
```

代表問題來自新聞焦慮，需導向多個資料模組，而不是單點判斷。

---

## 3. Prototype API

短期原型 endpoint：

```http
POST /api/v1/ai/food-safety/brief
```

正式化方向：

```http
POST /api/v1/ai/chat/twai
```

正式版應把 `classify_food_safety_question` 接進既有 TWCC tool-calling loop；目前 prototype endpoint 只作為輕量 Go proxy 與 deterministic fallback。

Request：

```json
{
  "session": "food-safety-chatbox-demo",
  "city_scope": "both",
  "year_from": 2021,
  "year_to": 2025,
  "question": "我看到食品中毒新聞，想知道雙北外食跟親子餐廳是否有官方資料可以查？",
  "mode": "official_only",
  "stream": false
}
```

Response 必須包含：

```json
{
  "question_type": "food_safety_news_context",
  "summary": {
    "official": "問題類型判定與導覽摘要"
  },
  "recommended_components": [
    {
      "component_id": "restaurant_grade_map",
      "module_id": "restaurant_grade",
      "title": "雙北餐飲衛生分級地圖",
      "reason": "用於查詢餐飲場所衛生分級與外食場景資料。",
      "action": {
        "type": "navigate_focus_component",
        "path": "/dashboard",
        "query": {
          "index": "food_safety",
          "focusComponent": "restaurant_grade_map"
        }
      }
    }
  ],
  "evidence": [],
  "limitations": [
    "AI 不輸出單一店家危險判定。"
  ],
  "tool_trace": [
    {
      "tool": "classify_food_safety_question",
      "status": "success"
    }
  ],
  "ai": {
    "provider": "local_fake",
    "model": "deterministic-food-safety-v1",
    "fallback": true
  }
}
```

---

## 4. FE Prototype Contract

修改位置：

```text
Taipei-City-Dashboard-FE/src/components/dialogs/ChatBox.vue
```

行為：

```text
1. 使用者輸入含食安健康關鍵字的問題
2. ChatBox 攔截該問題，不走既有 vector component recommendation
3. 第一版預設使用 FE deterministic local classifier，不發 API request
4. 回覆一則 bot message
5. bot message 內顯示 AI Tool Result Card
```

若需要測 prototype BE endpoint，需明確設定：

```text
VITE_FOOD_SAFETY_TOOL_API=true
```

未設定時不得呼叫 `/api/v1/ai/food-safety/brief`，避免本機 Vite `/api/dev` proxy 打到錯誤 server path 造成 500。
同時不得呼叫 `/chatlog/`，因為 local fallback 只驗證 UI 與分類，不寫入後端紀錄。

Card 必須顯示：

```text
1. question_type
2. recommended_components
3. Evidence Pack 摘要
4. limitations
5. provider/fallback 狀態
```

若 BE 不可用：

```text
FE 使用 deterministic local classifier fallback。
fallback 只驗證 UX，不代表正式 AI 結果。
```

---

## 5. BE Gap

正式 BE 仍缺：

```text
1. 接入 /api/v1/ai/chat/twai 的 tool-calling loop
2. 新增 build_component_navigation_action tool
3. 將 Evidence Pack 從 prototype metadata 改為正式官方資料查詢
4. 將 recommended_components 對應到真實 component index/id
5. 寫入 ai_chatlog，包括 tool trace、provider、fallback reason
```

詳細缺口見：

```text
test_specs/food_safety_chatbox_ai_tool_gap_spec.md
```

---

## 6. 驗收

Demo query：

```text
我看到食品中毒新聞，想知道雙北外食跟親子餐廳是否有官方資料可以查？
```

Expected：

```text
1. 不開新頁面
2. ChatBox 回覆 AI Tool Result Card
3. question_type = food_safety_news_context
4. recommended_components 至少包含 restaurant_grade_map 與 food_inspection_trend
5. 顯示 Evidence Pack 與 limitations
6. 明確說明不判定單一店家安全、不提供醫療建議
```

Verification：

```bash
cd Taipei-City-Dashboard/Taipei-City-Dashboard-BE
GOCACHE=/private/tmp/taipei-dashdorad-go-build-cache go test ./app/services/ai/... ./app/controllers/...

cd ../Taipei-City-Dashboard-FE
./node_modules/.bin/eslint src/components/dialogs/ChatBox.vue src/router/index.js
./node_modules/.bin/vite build
```
