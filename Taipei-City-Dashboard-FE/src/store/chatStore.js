import { ref, watch } from "vue";
import { defineStore } from "pinia";
import http from "../router/axios";

const defaultChatData = [
	{
		id: 1,
		role: "bot",
		isDefault: true,
		content:
			"你好，我是台北城市儀表板助理。你可以問我想看的城市議題、趨勢或指標，我會先從圖表知識庫找相關元件，再視問題需要請 AI 查詢資料庫後回答。",
	},
];

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

const dedupeComponents = (components) =>
	Array.from(
		components
			.reduce((map, item) => {
				const exist = map.get(item.index);
				if (!exist || item.city === "metrotaipei") {
					map.set(item.index, item);
				}
				return map;
			}, new Map())
			.values(),
	);

export const useChatStore = defineStore("chat", () => {
	const recommendComponents = ref(null);
	const savedChatData = JSON.parse(sessionStorage.getItem("chatData")) || [];
	const chatData = ref([...defaultChatData, ...savedChatData]);

	watch(
		chatData,
		(newVal) => {
			const userBotMessages = newVal.filter((item) => !item.isDefault);
			sessionStorage.setItem("chatData", JSON.stringify(userBotMessages));
		},
		{ deep: true },
	);

	const addChatData = (newChatData) => {
		chatData.value.push({
			id: chatData.value.length + 1,
			isDefault: false,
			...newChatData,
		});
	};

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

	const addQueryData = async (newChatData) => {
		addChatData(newChatData);
		recommendComponents.value = [];

		try {
			recommendComponents.value = await searchRelatedComponents(newChatData.content);
		} catch (error) {
			console.error("VectorAnalysisError:", error);
		}

		try {
			const aiResult = await askTWCCAI(newChatData.content, recommendComponents.value);
			if (aiResult?.content) {
				addChatData({
					role: "bot",
					content: aiResult.content,
					relations: recommendComponents.value,
				});
				saveChatLog(newChatData.content, {
					answer: aiResult.content,
					components: recommendComponents.value,
					tool_used: aiResult.tool_used,
				});
				return;
			}
		} catch (error) {
			console.error("TWCCAIError:", getRequestErrorMessage(error), error);
			addChatData({
				role: "bot",
				content: `AI 回答暫時無法取得：${getRequestErrorMessage(error)}`,
			});
		}

		addFallbackComponentAnswer(newChatData.content);
	};

	const addFallbackComponentAnswer = (question) => {
		if (recommendComponents.value?.length > 0) {
			const topK = [...recommendComponents.value].sort((a, b) => b.score - a.score);
			addChatData({
				role: "bot",
				content:
					"我目前無法取得 AI 回答，但已先根據問題找到語意相近的圖表元件。測試階段請檢查後端 AI / component chart data prefetch log。",
				relations: topK,
			});
			saveChatLog(question, topK);
			return;
		}

		addChatData({
			role: "bot",
			content: "目前沒有找到足夠相關的圖表，也暫時無法取得 AI 回答。請換個關鍵字再試一次。",
		});
		saveChatLog(question, []);
	};

	const saveChatLog = async (question, answer) => {
		try {
			const formData = new FormData();
			formData.append("session", getTodaySessionId());
			formData.append("question", question);
			formData.append("answer", JSON.stringify(answer));

			await http.post("/chatlog/", formData, {
				headers: {
					"Content-Type": "multipart/form-data",
				},
			});
		} catch (error) {
			console.error("saveChatLog error:", error);
		}
	};

	const getTodaySessionId = () => {
		const d = new Date();
		const todayId =
			d.getFullYear() +
			String(d.getMonth() + 1).padStart(2, "0") +
			String(d.getDate()).padStart(2, "0");
		return `session_${todayId}`;
	};

	const getRequestErrorMessage = (error) => {
		if (error?.response) {
			const {status} = error.response;
			const message =
				error.response.data?.message ||
				error.response.data?.error ||
				error.response.data?.error_code ||
				"後端回傳錯誤";
			return `${status} ${message}`;
		}
		return error?.message || "未知錯誤";
	};

	return { chatData, recommendComponents, addChatData, addQueryData, saveChatLog };
});
