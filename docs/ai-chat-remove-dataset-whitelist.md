# AI Chat 改法：移除資料集白名單，改用圖表 API 預抓資料

## 目前問題

現在 AI 會回答：

```text
找到相關圖表 hackathon_component_9_er_overview，但目前找不到符合條件的資料集。
```

這不是因為後台資料庫沒有資料，而是 AI 走錯查詢路徑。

目前有兩條資料路徑：

| 路徑 | 用途 | 問題 |
|---|---|---|
| `search_dashboard_datasets` + `query_dashboard_dataset` | 查 `datasetCatalog` 白名單資料表 | 白名單目前只有人口資料，沒有急診圖表資料 |
| `/component/{id}/chart?city=...` | 查圖表真正使用的後台 SQL / JSON 資料 | 前端圖表已經可以正常拿到資料 |

急診待診人數和等候時間的資料其實已經可以由圖表 API 取得：

```http
GET /api/v1/component/11/chart?city=metrotaipei
```

範例回傳：

```json
{
  "categories": ["三總", "北市聯醫", "北榮"],
  "data": [
    { "name": "待診人數", "data": [0, 0, 2] },
    { "name": "等候時間", "data": [2, 0, 32] }
  ],
  "status": "success"
}
```

所以不要再讓 LLM 去查 `datasetCatalog` 白名單。正確作法是：

```text
使用者提問
  ↓
/vector/component 找到最相關 component
  ↓
前端或後端直接呼叫 /component/{id}/chart?city=...
  ↓
把 chart JSON 當作 database context 塞給 LLM
  ↓
LLM 只負責整理、比較、摘要，不負責決定要不要查資料
```

---

## 要移除的舊設計

前端 `chatStore.js` 的 `databaseTools` 不要再放這兩個 tool：

```js
search_dashboard_datasets
query_dashboard_dataset
```

原因：

1. 這兩個 tool 只查 `datasetCatalog`。
2. `datasetCatalog` 沒有所有 chart 使用的後台資料表。
3. LLM 看到這兩個 tool 會誤以為要先搜尋資料集。
4. 搜不到時就會回答「找不到資料集」，但其實 chart API 有資料。

測試階段可以先完全不給 database tool，讓資料預抓流程固定。

---

## 建議新流程

### Step 1：向量搜尋 component

保留目前前端流程：

```js
const searchRelatedComponents = async (question) => {
  const response = await http.post(
    "/vector/component",
    new URLSearchParams({
      query: question,
      limit: 10,
      score: 0.8,
    }),
    {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    },
  );

  return dedupeComponents(response.data?.data || []);
};
```

向量搜尋結果應該至少包含：

```json
{
  "id": 11,
  "index": "hackathon_component_9_er_overview",
  "name": "急診待診人數和等候時間",
  "city": "metrotaipei",
  "score": 0.8872
}
```

---

### Step 2：前端預抓 chart data

在 `chatStore.js` 新增：

```js
const fetchComponentChartData = async (component) => {
  const city = component.city || "metrotaipei";
  const response = await http.get(`/component/${component.id}/chart`, {
    params: { city },
  });

  return {
    id: component.id,
    name: component.name,
    city,
    chart_data: response.data,
  };
};
```

再新增：

```js
const buildDatabaseContext = async (components) => {
  const targets = (components ?? [])
    .slice(0, 3)
    .filter((item) => item.id);

  const results = await Promise.allSettled(
    targets.map(fetchComponentChartData),
  );

  return results.map((result, index) => {
    if (result.status === "fulfilled") {
      return result.value;
    }

    const component = targets[index];
    return {
      id: component.id,
      name: component.name,
      city: component.city,
      error: String(result.reason?.message || result.reason),
    };
  });
};
```

---

### Step 3：把 chart data 塞給 LLM

修改 `askTWCCAI`：

```js
const askTWCCAI = async (question, components) => {
  const databaseContext = await buildDatabaseContext(components);

  console.log("AI components:", components);
  console.log("AI database context:", databaseContext);

  const response = await http.post("/ai/chat/twai", {
    session: getTodaySessionId(),
    stream: false,
    messages: [
      {
        role: "system",
        content: [
          "你是台北城市儀表板的資料助理，回答請使用繁體中文。",
          "系統已根據使用者問題找到相關圖表，並已從後端圖表 API 預先取得資料。",
          "以下 database context 是真實後端資料，請優先根據它回答。",
          "",
          "database context:",
          JSON.stringify(databaseContext, null, 2),
          "",
          "回答規則：",
          "1. 若 database context 有 chart_data，必須根據 chart_data 的數值回答。",
          "2. 不要只回答找到哪個圖表。",
          "3. 不要顯示 component index、score、tool name 或內部流程。",
          "4. 若資料中有 categories 和 data，請把同一個位置的 category 與 data 對齊後解讀。",
          "5. 若使用者問排名、最高、最低、比較，請直接計算後回答。",
          "6. 只有在 chart_data 缺失或 status 不是 success 時，才說資料抓取失敗，並列出 debug error。",
        ].join("\n"),
      },
      {
        role: "user",
        content: question,
      },
    ],
    max_new_tokens: 700,
    temperature: 0.2,
  });

  return response.data?.data;
};
```

這樣 LLM 不需要決定要不要 tool call，因為資料已經在 prompt 裡。

---

## `databaseTools` 建議改法

測試階段先改成空陣列，避免 LLM 走錯路：

```js
const databaseTools = [];
```

然後 `/ai/chat/twai` payload 先不要送：

```js
tools: databaseTools,
tool_choice: "auto",
component_context: ...
```

也就是先移除：

```js
tools: databaseTools,
tool_choice: "auto",
component_context: (components ?? []).slice(0, 10).map(...),
```

等 chart prefetch 穩定後，再考慮是否保留 `get_component_chart_data` 作為 fallback tool。

---

## 預期回答

使用者問：

```text
急診待診人數和等候時間
```

AI 不應該回答：

```text
根據圖表元件，相關圖表為 hackathon_component_9_er_overview，score=0.8872。
```

AI 應該回答類似：

```text
目前急診待診人數最多的是萬芳 3 人；北榮、北醫、台北馬偕、臺大各 2 人。
等候時間最長的是臺大 73 分鐘，其次是台北馬偕 41 分鐘、北榮 32 分鐘。
```

---

## 驗證方式

### 1. 瀏覽器 Network 檢查

送出問題後，看 `/ai/chat/twai` request payload。

system message 裡必須看到：

```text
database context:
```

而且下面要有 chart JSON：

```json
{
  "chart_data": {
    "categories": [...],
    "data": [...]
  }
}
```

### 2. 不應該再看到舊字串

payload 裡不應該再有：

```text
chartStore context
index=
score=
search_dashboard_datasets
query_dashboard_dataset
```

### 3. Console 檢查

瀏覽器 console 應該看到：

```text
AI components:
AI database context:
```

如果 `AI components` 是空陣列，表示 `/vector/component` 沒找到圖表。

如果 `AI components` 有資料，但 `AI database context` 裡有 error，表示 `/component/{id}/chart` 查詢失敗。

如果 `AI database context` 有 chart data，但 AI 還回答圖表名稱，表示 prompt 還要再加強。

---

## 結論

不要再用 `datasetCatalog` 白名單回答 chart 問題。

AI chat 應該固定成：

```text
vector 找 component
→ chart API 抓資料
→ LLM 統整資料
```

LLM 不應該負責判斷資料要去哪裡查，也不應該把 component index、score、內部工具名稱講給使用者。
