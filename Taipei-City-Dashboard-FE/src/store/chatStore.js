import { ref, watch } from "vue";
import { defineStore } from "pinia";
import router from "../router";
import http from "../router/axios";
import { useContentStore } from "./contentStore";
import { useMapStore } from "./mapStore";
import {
	AI_INTERACTION_TYPES,
	buildAiAnswerPrompt,
	buildAiIntentClassificationPrompt,
	buildComponentSummaryContext,
	buildDatabaseContext,
	dedupeComponents,
	getDefaultAiInteractionIntent,
	normalizeAiInteractionIntent,
} from "../services/aiContextService";
import { executeAiPlan } from "../services/aiPlanExecutor";

const defaultChatData = [
	{
		id: 1,
		role: "bot",
		isDefault: true,
		content:
			"您好，我可以協助查詢儀表板資料，也可以依問題開啟地圖圖層、做附近查詢、區域排名或路徑視覺化。",
	},
];

const parseAiResponse = (content) => {
	if (!content) return { answer: "", warnings: [] };
	if (typeof content === "object") return content;

	const text = String(content).trim();
	try {
		return JSON.parse(text);
	} catch {
		const match = text.match(/\{[\s\S]*\}/);
		if (!match) return { answer: text, warnings: [] };
		try {
			return JSON.parse(match[0]);
		} catch {
			return { answer: text, warnings: [] };
		}
	}
};

const waitForMapReady = (mapStore, timeout = 15000) =>
	new Promise((resolve) => {
		const started = Date.now();
		const tick = () => {
			if (mapStore.map?.isStyleLoaded?.()) {
				resolve(true);
				return;
			}
			if (Date.now() - started > timeout) {
				resolve(false);
				return;
			}
			setTimeout(tick, 100);
		};
		tick();
	});

const semanticMapLayerRules = [
	{
		keywords: [
			"急診",
			"急救",
			"醫院",
			"醫療",
			"就醫",
			"hospital",
			"emergency",
			"er",
		],
		layerHints: ["hospitals", "medical_institution", "醫療院所", "醫院"],
	},
	{
		keywords: ["aed", "自動體外", "去顫", "電擊"],
		layerHints: ["aed", "heal_aed"],
	},
];

const getBestMapComponent = (components) =>
	(components || []).find((component) => component.map_config?.length);

const buildComponentSearchText = (component) =>
	[
		component?.index,
		component?.name,
		component?.short_desc,
		component?.long_desc,
		component?.use_case,
		component?.source,
		...(component?.map_config || []).flatMap((config) => [
			config?.index,
			config?.title,
			config?.type,
		]),
	]
		.filter(Boolean)
		.join(" ")
		.toLowerCase();

const matchesAnyHint = (text, hints) =>
	hints.some((hint) => text.includes(String(hint).toLowerCase()));

const findSemanticMapComponent = (question, components) => {
	const normalizedQuestion = String(question || "").toLowerCase();
	const rule = semanticMapLayerRules.find((item) =>
		item.keywords.some((keyword) =>
			normalizedQuestion.includes(String(keyword).toLowerCase()),
		),
	);
	if (!rule) return null;

	return (components || [])
		.filter((component) => component?.map_config?.length)
		.find((component) =>
			matchesAnyHint(buildComponentSearchText(component), rule.layerHints),
		);
};

export const useChatStore = defineStore("chat", () => {
	const recommendComponents = ref([]);
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

	const fetchRecommendedComponents = async (question) => {
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

	const fetchMapLayerComponents = async () => {
		const contentStore = useContentStore();
		if (contentStore.allMapLayers?.length) {
			return contentStore.allMapLayers;
		}

		const cities = contentStore.cityManager?.activeCities?.length
			? contentStore.cityManager.activeCities
			: ["metrotaipei"];
		const results = await Promise.allSettled(
			cities.map((city) => http.get(`/dashboard/map-layers-${city}`)),
		);
		const mapLayers = results.flatMap((result) =>
			result.status === "fulfilled" ? result.value.data?.data || [] : [],
		);
		contentStore.allMapLayers = dedupeComponents(mapLayers);
		return contentStore.allMapLayers;
	};

	const resolveMapComponent = async (question, components) => {
		const mapFromVector = getBestMapComponent(components);
		if (mapFromVector) return mapFromVector;

		try {
			const mapLayers = await fetchMapLayerComponents();
			return findSemanticMapComponent(question, [
				...(components || []),
				...mapLayers,
			]);
		} catch (error) {
			console.error("AIMapLayerResolveError:", error);
			return null;
		}
	};

	const requestAiIntent = async (question) => {
		try {
			const response = await http.post("/ai/chat/twai", {
				session: `session_${new Date().toISOString().slice(0, 10)}`,
				stream: false,
				messages: [
					{
						role: "system",
						content: buildAiIntentClassificationPrompt(question),
					},
					{ role: "user", content: question },
				],
				max_new_tokens: 500,
				temperature: 0.1,
			});
			return normalizeAiInteractionIntent(
				parseAiResponse(response.data?.data?.content),
			);
		} catch (error) {
			console.error("AIIntentClassificationError:", error);
			return getDefaultAiInteractionIntent();
		}
	};

	const ensureMapOpened = async (component) => {
		if (!component?.map_config?.length) return false;

		const contentStore = useContentStore();
		const mapStore = useMapStore();

		if (router.currentRoute.value.name !== "mapview") {
			await router.push({
				name: "mapview",
				query: {
					index:
						router.currentRoute.value.query?.index ||
						contentStore.currentDashboard.index,
					city:
						router.currentRoute.value.query?.city ||
						contentStore.currentDashboard.city ||
						component.city,
				},
			});
		}

		const ready = await waitForMapReady(mapStore);
		if (ready) {
			mapStore.openComponentLayer(component.map_config);
		}
		return ready;
	};

	const buildMapContext = () => {
		const mapStore = useMapStore();
		const center = mapStore.map?.getCenter?.();
		return {
			center: center ? [center.lng, center.lat] : null,
			zoom: mapStore.map?.getZoom?.() ?? null,
			visible_layers: mapStore.currentVisibleLayers,
			user_location: mapStore.userLocation,
		};
	};

	const requestAiAnswer = async ({
		question,
		intent,
		components,
		executionResult,
	}) => {
		const databaseContext = await buildDatabaseContext(components);
		const componentContext = buildComponentSummaryContext(components);
		const systemPrompt = buildAiAnswerPrompt({
			question,
			intent,
			componentContext,
			databaseContext,
			mapContext: buildMapContext(),
			executionResult,
		});
		const response = await http.post("/ai/chat/twai", {
			session: `session_${new Date().toISOString().slice(0, 10)}`,
			stream: false,
			messages: [
				{ role: "system", content: systemPrompt },
				{ role: "user", content: question },
			],
			max_new_tokens: 900,
			temperature: 0.2,
		});
		return parseAiResponse(response.data?.data?.content);
	};

	const runMapActions = async ({ intent, component, mapActions }) => {
		if (
			intent.type === AI_INTERACTION_TYPES.PURE_DATA_QA &&
			!mapActions?.length
		) {
			return;
		}

		const mapStore = useMapStore();
		const shouldOpen =
			intent.shouldOpenComponent ||
			intent.needsMap ||
			Boolean(mapActions?.length);
		if (!shouldOpen) return;

		await ensureMapOpened(component);

		if (mapActions?.length) {
			mapStore.executeAiMapCommands(mapActions, null);
		}
	};

	const addQueryData = async (newChatData) => {
		const question = newChatData.content;
		addChatData(newChatData);
		recommendComponents.value = [];

		try {
			const intent = await requestAiIntent(question);
			recommendComponents.value = await fetchRecommendedComponents(question);
			const topK = [...recommendComponents.value].sort(
				(a, b) => b.score - a.score,
			);
			const mapComponent = await resolveMapComponent(question, topK);
			const answerComponents =
				mapComponent && !topK.some((item) => item.id === mapComponent.id)
					? [mapComponent, ...topK]
					: topK;

			const { executionResult, mapActions } = intent.needsMap
				? await executeAiPlan({
					question,
					intent,
					component: mapComponent,
				})
				: {
					executionResult: {
						status: "not_required",
						intent_type: intent.type,
						notes: ["此問題不需要前端地圖工具執行。"],
					},
					mapActions: [],
				};

			const aiPayload = await requestAiAnswer({
				question,
				intent,
				components: answerComponents,
				executionResult,
			});

			await runMapActions({
				intent,
				component: mapComponent,
				mapActions,
			});

			addChatData({
				role: "bot",
				content: aiPayload.answer || "已完成查詢。",
				relations: answerComponents,
				interactionIntent: intent.type,
				executionResult,
				warnings: aiPayload.warnings || [],
			});

			saveChatLog(question, {
				answer: aiPayload.answer,
				relations: answerComponents,
				intent,
				execution_result: executionResult,
				map_actions: mapActions,
			});
		} catch (error) {
			console.error("AIQueryError:", error);
			addChatData({
				role: "bot",
				content: "查詢時發生錯誤，請稍後再試或換個問法。",
			});
			saveChatLog(question, { error: String(error?.message || error) });
		}
	};

	const saveChatLog = async (question, answer) => {
		try {
			const formData = new FormData();
			const d = new Date();
			const todayId =
				d.getFullYear() +
				String(d.getMonth() + 1).padStart(2, "0") +
				String(d.getDate()).padStart(2, "0");

			formData.append("session", `session_${todayId}`);
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

	return { chatData, addChatData, addQueryData, saveChatLog };
});
