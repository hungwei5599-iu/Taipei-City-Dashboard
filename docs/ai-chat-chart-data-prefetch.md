# AI Chat 先抓圖表資料再回答：前端止血方案

## 問題

目前使用者問：

```text
急診待診人數和等候時間
```

AI 仍可能回答：

```text
根據圖表元件，急診待診人數和等候時間的相關圖表元件是 hackathon_component_9_er_overview，
涵蓋雙北地區，相關性分數為 0.8872。
```

這不是使用者要的答案。

原因是目前流程把向量搜尋結果放進 system prompt 後，AI 仍然可以選擇不呼叫 tool，直接把 chart context 當答案。即使後端已有 `get_component_chart_data` tool，只要模型沒有主動呼叫，就還是會發生這種回答。

所以最快的修正方式是：前端在呼叫 AI 前，先用既有後端 API 把圖表資料抓回來，再把資料放進 prompt，讓 AI 直接根據資料統整回答。

---

## 目標流程

```text
使用者提問
  |
  +--> POST /vector/component
  |      找到相關元件，例如 hackathon_component_9_er_overview
  |
  +--> GET /component/:id/chart
  |      抓該元件目前圖表資料
  |
  +--> POST /ai/chat/twai
         把 chart context + chart data context 一起交給 AI
         AI 根據 chart data 統整回答
```

---

## 修改檔案

```text
Taipei-City-Dashboard-FE/src/store/chatStore.js
```

---

## Step 1：新增抓圖表資料的 function

在 `chatStore.js` 裡新增：

```js
const fetchComponentChartData = async (component) => {
	if (!component?.id) return null;

	const response = await http.get(`/component/${component.id}/chart`, {
		params: {
			city: component.city || "metrotaipei",
		},
	});

	return {
		name: component.name,
		city: component.city,
		chart_data: response.data?.data || [],
		categories: response.data?.categories || [],
	};
};
```

這會走既有後端 API：

```text
GET /api/v1/component/:id/chart
```

後端會自己從 `query_charts.query_chart` 找 SQL，並查 `DBDashboard`。

---

## Step 2：在呼叫 AI 前先抓 chart data

找到 `addQueryData()` 裡這段：

```js
const aiResult = await askTWCCAI(newChatData.content, recommendComponents.value);
```

改成：

```js
let chartDataContext = null;

try {
	chartDataContext = await fetchComponentChartData(recommendComponents.value?.[0]);
} catch (error) {
	console.error("ComponentChartDataError:", error);
}

const aiResult = await askTWCCAI(
	newChatData.content,
	recommendComponents.value,
	chartDataContext,
);
```

先只抓第一個最相關元件即可。之後如果要更完整，可以抓前 3 個元件。

---

## Step 3：讓 `askTWCCAI` 接收 chart data

把：

```js
const askTWCCAI = async (question, components) => {
```

改成：

```js
const askTWCCAI = async (question, components, chartDataContext) => {
```

---

## Step 4：把 chart data 放進 system prompt

在 `askTWCCAI()` 的 system message content 裡加入：

```js
"chart data context:",
chartDataContext
	? JSON.stringify(chartDataContext)
	: "沒有預先取得圖表資料。",
"",
```

建議放在 `buildChartContext(components)` 後面。

---

## Step 5：修改 AI 回答規則

把原本偏向「推薦圖表」的規則改成資料優先。

建議改成：

```js
"回答規則：",
"1. 若使用者問數字、狀態、等候時間、人數、排名、摘要，必須優先使用 chart data context 回答。",
"2. 若 chart data context 有資料，必須根據該資料統整回答，不得只回答找到哪個圖表。",
"3. 只有在使用者明確要求推薦圖表時，才推薦圖表。",
"4. 不要在回答中出現元件 index、相關性評分數字、工具名稱或 API 名稱。",
"5. 不要捏造 chart data context 沒有的數字。",
```

尤其要避免這種規則：

```js
"若問題是在找圖表、趨勢或主題，根據上方圖表名稱回答並推薦可用圖表。"
```

因為它會讓 AI 對「急診待診人數和等候時間」這種問題仍然只推薦圖表。

---

## Step 6：確認 chart context 不含 index / score

`buildChartContext()` 應該只輸出使用者可理解的圖表名稱，不要輸出 `index` 或 `score`。

建議保持：

```js
return `${i + 1}. ${item.name}（${city}）`;
```

不要輸出：

```js
item.index
item.score
```

---

## 預期結果

AI 不應再回答：

```text
相關圖表元件是 hackathon_component_9_er_overview，相關性分數為 0.8872。
```

應改成：

```text
根據目前急診圖表資料，雙北急診待診與等候狀況如下：

- A 醫院：待診 X 人，平均等候 Y 分鐘
- B 醫院：待診 X 人，平均等候 Y 分鐘

整體來看，等待壓力較高的是 ...
```

如果 chart data 抓不到，才回答：

```text
我有找到急診待診與等候時間的相關圖表，但目前後端圖表資料暫時無法取得，所以不能直接整理即時數字。
```

---

## 後續更乾淨的做法

前端 prefetch 是最快止血方案。

之後可以改成後端處理：

1. `/ai/chat/twai` 接收 `component_context`。
2. 後端根據 `component.id` 直接呼叫 `models.GetComponentChartDataQuery()`。
3. 後端查完 chart data 後注入 AI prompt。
4. 前端不用自己抓 chart data。

但短期要讓 AI 不再回答 index / score，先做前端 prefetch 最快。
