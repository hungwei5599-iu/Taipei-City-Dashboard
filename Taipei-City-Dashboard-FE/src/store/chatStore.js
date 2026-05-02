import { ref, watch } from "vue";
import { defineStore } from "pinia";
import http from "../router/axios";
import router from "../router/index";
import { useUiActionStore } from "./uiActionStore";

const defaultChatData = [
	{
		id: 1,
		role: "bot",
		isDefault: true,
		content:
			"\u4f60\u597d\uff0c\u6211\u662f\u53f0\u5317\u57ce\u5e02\u5100\u8868\u677f\u52a9\u7406\u3002\u4f60\u53ef\u4ee5\u554f\u6211\u60f3\u770b\u7684\u57ce\u5e02\u8b70\u984c\u3001\u8da8\u52e2\u6216\u6307\u6a19\uff0c\u6211\u6703\u5148\u5f9e\u5716\u8868\u77e5\u8b58\u5eab\u627e\u76f8\u95dc\u5143\u4ef6\uff0c\u518d\u8996\u554f\u984c\u9700\u8981\u8acb AI \u67e5\u8a62\u8cc7\u6599\u5eab\u5f8c\u56de\u7b54\u3002",
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
	const targets = (components ?? []).slice(0, 3).filter((item) => item.id);
	const results = await Promise.allSettled(targets.map(fetchComponentChartData));

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

const buildComponentContext = (components) =>
	(components ?? []).slice(0, 10).map((component) => ({
		id: component.id,
		index: component.index,
		name: component.name,
		city: component.city,
		score: component.score,
	}));

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

const routeToComponentOpenAction = (action) => {
	if (!action?.dashboardIndex) return;

	router.push({
		path: "/mapview",
		query: {
			index: action.dashboardIndex,
			city: action.city || "metrotaipei",
			aiOpen: action.componentIndex,
			aiOpenTs: Date.now(),
		},
	});
};

const normalizeUiAction = (action) => {
	if (action?.type !== "open_component" || !action.component_index) {
		return null;
	}

	return {
		componentIndex: action.component_index,
		componentName: action.component_name,
		dashboardIndex: action.dashboard_index || "hackathon_food_health",
		city: action.city || "metrotaipei",
		reason: action.reason,
		source: "ai-ui-action",
	};
};

const parseAiDecision = (aiResult) => {
	const rawContent = aiResult?.content || "";
	const fallback = {
		answer: rawContent,
		uiActions: [],
	};

	try {
		const jsonText =
			rawContent.match(/```json\s*([\s\S]*?)```/)?.[1] ||
			rawContent.match(/\{[\s\S]*\}/)?.[0] ||
			rawContent;
		const parsed = JSON.parse(jsonText);
		return {
			answer: parsed.answer || rawContent,
			uiActions: Array.isArray(parsed.ui_actions)
				? parsed.ui_actions.map(normalizeUiAction).filter(Boolean)
				: [],
		};
	} catch (error) {
		console.warn("[ai-ui] AI response is not JSON; using text only", error);
		return fallback;
	}
};

export const useChatStore = defineStore("chat", () => {
	const recommendComponents = ref(null);
	const savedChatData = JSON.parse(sessionStorage.getItem("chatData")) || [];
	const chatData = ref([...defaultChatData, ...savedChatData]);
	const uiActionStore = useUiActionStore();

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
		const componentContext = buildComponentContext(components);

		console.log("AI components:", components);
		console.log("AI database context:", databaseContext);

		const response = await http.post("/ai/chat/twai", {
			session: getTodaySessionId(),
			stream: false,
			messages: [
				{
					role: "system",
					content: [
						"You are the Taipei City Dashboard assistant.",
						"Answer in the user's language.",
						"You can decide whether the frontend should open a dashboard component.",
						"Use ONLY the components listed in available_components for UI actions.",
						"Return STRICT JSON only. Do not use markdown.",
						"The JSON shape must be:",
						"{",
						'  "answer": "natural language answer for the user",',
						'  "ui_actions": [',
						"    {",
						'      "type": "open_component",',
						'      "component_index": "component index from available_components",',
						'      "component_name": "component name from available_components",',
						'      "dashboard_index": "hackathon_food_health",',
						'      "city": "metrotaipei",',
						'      "reason": "why this component should be opened"',
						"    }",
						"  ]",
						"}",
						"Set ui_actions to [] when opening a component is not useful.",
						"If the user asks for a location, nearest resource, waiting-room status, map points, distribution, or wants to inspect data on the map, choose the most relevant component from available_components.",
						"Do not invent component indexes.",
						"",
						"available_components:",
						JSON.stringify(componentContext, null, 2),
						"",
						"database context:",
						JSON.stringify(databaseContext, null, 2),
					].join("\n"),
				},
				{
					role: "user",
					content: question,
				},
			],
			max_new_tokens: 700,
			temperature: 0.2,
			component_context: componentContext,
		});

		return response.data?.data;
	};

	const executeUiActions = (uiActions) => {
		uiActions.forEach((action) => {
			console.log("[ai-ui] AI selected component open action", action);
			uiActionStore.requestComponentOpen(action);
			routeToComponentOpenAction(action);
		});
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
				const aiDecision = parseAiDecision(aiResult);
				executeUiActions(aiDecision.uiActions);
				addChatData({
					role: "bot",
					content: aiDecision.answer,
					relations: recommendComponents.value,
				});
				saveChatLog(newChatData.content, {
					answer: aiDecision.answer,
					components: recommendComponents.value,
					ui_actions: aiDecision.uiActions,
					tool_used: aiResult.tool_used,
				});
				return;
			}
		} catch (error) {
			console.error("TWCCAIError:", getRequestErrorMessage(error), error);
			addChatData({
				role: "bot",
				content: `AI response is temporarily unavailable: ${getRequestErrorMessage(error)}`,
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
					"AI response is temporarily unavailable, but I found related dashboard components for this question.",
				relations: topK,
			});
			saveChatLog(question, topK);
			return;
		}

		addChatData({
			role: "bot",
			content:
				"I could not find a related dashboard component or AI answer for this question.",
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
			const { status } = error.response;
			const message =
				error.response.data?.message ||
				error.response.data?.error ||
				error.response.data?.error_code ||
				"request failed";
			return `${status} ${message}`;
		}
		return error?.message || "request failed";
	};

	return { chatData, recommendComponents, addChatData, addQueryData, saveChatLog };
});
