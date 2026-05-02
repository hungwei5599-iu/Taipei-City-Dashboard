import { nextTick, ref } from "vue";
import { defineStore } from "pinia";
import http from "../router/axios";
import router from "../router";
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
			"您好，我是臺北城市儀表板 AI 助理。可以協助查詢圖表資料，也可以依問題開啟地圖圖層並標示結果。",
	},
];

const SEARCH_SCORE_THRESHOLD = 0.8;
const SEARCH_LIMIT = 10;
const MAP_READY_TIMEOUT_MS = 8000;

const semanticMapLayerRules = [
	{
		module: "emergency",
		keywords: ["急診", "急救", "醫院", "醫療", "就醫", "hospital", "emergency", "er"],
		layerHints: [
			"Component2_er_ready",
			"急診",
			"急救",
			"醫院",
			"醫療",
			"emergency",
			"hospital",
			"er_overview",
			"hackathon_component_9_er_overview",
		],
	},
	{
		module: "pharmacy",
		keywords: ["藥局", "藥房", "pharmacy"],
		layerHints: ["Component3_pharmacy_map_ready", "藥局", "藥房", "pharmacy", "hackathon_component_7_pharmacy"],
	},
	{
		module: "restaurant",
		keywords: ["環保餐廳", "餐廳", "restaurant", "env_protect"],
		layerHints: [
			"Component5_env_protect_restaurant_ready",
			"環保餐廳",
			"餐廳",
			"restaurant",
			"env_protect",
			"hackathon_c11_env_protect_restaurant",
		],
	},
	{
		module: "water",
		keywords: ["水質", "淨水", "飲水", "water"],
		layerHints: ["Component4_water_quality_ready", "水質", "淨水", "飲水", "water_quality"],
	},
	{
		module: "aed",
		keywords: ["aed", "去顫", "電擊", "自動體外"],
		layerHints: ["aed", "自動體外", "去顫"],
	},
];

const fallbackMapComponents = {
	emergency: {
		name: "急診即時資訊",
		index: "Component2_er_ready",
		city: "metrotaipei",
		map_config: [
			{
				name: "急診即時資訊",
				index: "Component2_er_ready",
				source: "geojson",
				type: "symbol",
				city: "metrotaipei",
			},
		],
	},
	pharmacy: {
		name: "藥局資訊",
		index: "Component3_pharmacy_map_ready",
		city: "metrotaipei",
		map_config: [
			{
				name: "藥局資訊",
				index: "Component3_pharmacy_map_ready",
				source: "geojson",
				type: "symbol",
				city: "metrotaipei",
			},
		],
	},
	restaurant: {
		name: "環保餐廳",
		index: "Component5_env_protect_restaurant_ready",
		city: "metrotaipei",
		map_config: [
			{
				name: "環保餐廳",
				index: "Component5_env_protect_restaurant_ready",
				source: "geojson",
				type: "symbol",
				city: "metrotaipei",
			},
		],
	},
	water: {
		name: "水質資訊",
		index: "Component4_water_quality_ready",
		city: "metrotaipei",
		map_config: [
			{
				name: "水質資訊",
				index: "Component4_water_quality_ready",
				source: "geojson",
				type: "symbol",
				city: "metrotaipei",
			},
		],
	},
};

const getTodaySessionId = () =>
	`single_turn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const parseAiResponse = (rawValue) => {
	if (!rawValue) return null;
	if (typeof rawValue === "object") return rawValue;
	if (typeof rawValue !== "string") return null;

	try {
		return JSON.parse(rawValue);
	} catch {
		const jsonMatch = rawValue.match(/\{[\s\S]*\}/);
		if (!jsonMatch) return { answer: rawValue };
		try {
			return JSON.parse(jsonMatch[0]);
		} catch {
			return { answer: rawValue };
		}
	}
};

const parseMaybeJson = (value) => {
	if (!value || typeof value !== "string") return null;
	const trimmed = value
		.trim()
		.replace(/^```(?:json)?/i, "")
		.replace(/```$/i, "")
		.trim();
	if (!trimmed) return null;

	try {
		return JSON.parse(trimmed);
	} catch {
		const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
		if (!jsonMatch) return null;
		try {
			return JSON.parse(jsonMatch[0]);
		} catch {
			return null;
		}
<<<<<<< HEAD

		const component = targets[index];
		return {
			id: component.id,
			name: component.name,
			city: component.city,
			error: String(result.reason?.message || result.reason),
		};
	});
};

const buildComponentSummaryContext = (components) =>
	(components ?? []).slice(0, 3).map((component) => ({
		id: component.id,
		name: component.name,
		city: component.city,
		index: component.index,
		module: component.module,
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

const findMatchedComponent = (target, components = []) => {
	const targetKeys = [
		target?.componentIndex,
		...(target?.componentIndexes || []),
	]
		.filter(Boolean)
		.map(String);

	return (components || []).find((component) => {
		const componentKeys = [
			component.id,
			component.index,
			component.component_index,
		]
			.filter(Boolean)
			.map(String);

		return componentKeys.some((key) => targetKeys.includes(key));
	});
};

const buildGuideComponentPayload = (target, components = []) => {
	const matchedComponent = findMatchedComponent(target, components);
	const preferredCity =
		target?.dashboardCity ||
		target?.city ||
		"metrotaipei";
	const matchedComponentCity = matchedComponent?.city;
	const useMatchedComponentId =
		!!matchedComponent?.id &&
		(!matchedComponentCity || matchedComponentCity === preferredCity);
	return {
		component: matchedComponent || null,
		componentIndex: target?.componentIndex,
		componentIndexes: target?.componentIndexes || [],
		componentId: useMatchedComponentId ? matchedComponent?.id : null,
		city: preferredCity,
		mapConfig: target?.mapConfig || [],
		title: target?.componentName || target?.title,
	};
};

let guideTargetRegistry = null;

const moduleIdToGuideModuleKey = {
	medical_access: "emergency",
	pharmacy_access: "pharmacy",
	water_quality: "water_quality",
	eco_restaurant: "eco_restaurant",
	food_inspection: "food_inspection",
};

const loadGuideTargetRegistry = async () => {
	if (guideTargetRegistry) return guideTargetRegistry;
	const response = await fetch("/config/guide-map-target-registry.json");
	guideTargetRegistry = await response.json();
	return guideTargetRegistry;
};

const resolveGuideTarget = async (question, components = []) => {
	const registry = await loadGuideTargetRegistry();
	const loweredQuestion = String(question || "").toLowerCase();
	if (hasEmergencyKeyword(question)) {
		const emergencyTarget = registry.find((target) => target.moduleKey === "emergency");
		if (emergencyTarget) return emergencyTarget;
=======
>>>>>>> 74eec4a5eb7f9ca142fc7cc02ee007e2579e416c
	}
};

<<<<<<< HEAD
const resolveGuideTargetFromModules = async (
	selectedModuleIds = [],
	question = "",
	components = [],
) => {
	const registry = await loadGuideTargetRegistry();
	const moduleKeys = (selectedModuleIds || [])
		.map((moduleId) => moduleIdToGuideModuleKey[moduleId])
		.filter(Boolean);

	for (const moduleKey of moduleKeys) {
		const target = registry.find((item) => item.moduleKey === moduleKey);
		if (target) return target;
	}

	return resolveGuideTarget(question, components);
};

const tryParseJson = (value) => {
	if (typeof value !== "string") return null;
	try {
		return JSON.parse(value);
	} catch {
		return null;
	}
};

const normalizeAiPayload = (aiResult) => {
	if (!aiResult) return {};
	if (typeof aiResult === "string") {
		const parsed = tryParseJson(aiResult);
		return parsed || { content: aiResult };
	}

	if (typeof aiResult === "object") {
		const contentParsed = tryParseJson(aiResult.content);
		if (contentParsed && typeof contentParsed === "object") {
			return {
				...aiResult,
				...contentParsed,
				content: contentParsed.answer || aiResult.content,
			};
		}
	}

	return aiResult;
};

const waitForMapReady = (mapStore, timeout = 20000) =>
=======
const normalizeAnswerText = (payload) => {
	if (!payload) return "";
	if (typeof payload === "string") {
		const parsed = parseMaybeJson(payload);
		if (parsed) return normalizeAnswerText(parsed);
		return payload.trim();
	}
	if (typeof payload !== "object") return String(payload);

	const answer = payload.answer || payload.content || payload.message || "";
	if (typeof answer === "string") {
		const parsed = parseMaybeJson(answer);
		if (parsed) return normalizeAnswerText(parsed);
		return answer.trim();
	}
	return normalizeAnswerText(answer);
};

const getRequestErrorMessage = (error) => {
	if (error?.response) {
		const message =
			error.response.data?.message ||
			error.response.data?.error ||
			error.response.data?.error_code ||
			"request failed";
		return `${error.response.status} ${message}`;
	}
	return error?.message || String(error);
};

const waitForMapReady = (mapStore, timeoutMs = MAP_READY_TIMEOUT_MS) =>
>>>>>>> 74eec4a5eb7f9ca142fc7cc02ee007e2579e416c
	new Promise((resolve) => {
		const startedAt = Date.now();
		const check = () => {
			if (mapStore.map?.isStyleLoaded?.()) {
				resolve(true);
				return;
			}
			if (Date.now() - startedAt > timeoutMs) {
				resolve(false);
				return;
			}
			window.setTimeout(check, 150);
		};
		check();
	});

const componentSearchText = (component) =>
	[
		component?.name,
		component?.index,
		component?.module,
		component?.description,
		...(component?.map_config || []).flatMap((item) => [
			item?.name,
			item?.index,
			item?.sourceLayer,
			item?.source_layer,
			item?.source,
		]),
	]
		.filter(Boolean)
		.join(" ")
		.toLowerCase();

const questionMatchesRule = (question, rule) => {
	const normalized = String(question || "").toLowerCase();
	return rule.keywords.some((keyword) =>
		normalized.includes(String(keyword).toLowerCase()),
	);
};

const scoreSemanticComponent = (component, rule) => {
	const text = componentSearchText(component);
	return rule.layerHints.reduce((score, hint) => {
		const normalizedHint = String(hint).toLowerCase();
		return text.includes(normalizedHint) ? score + 1 : score;
	}, 0);
};

const getQuestionTargetModule = (question) => {
	const text = String(question || "").toLowerCase();
	if (/藥局|藥房|pharmacy/.test(text)) return "pharmacy";
	if (/急診|急救|醫院|候診|待診|hospital|emergency|(^|[^a-z])er([^a-z]|$)/.test(text)) return "emergency";
	if (/環保餐廳|餐廳|restaurant|env_protect/.test(text)) return "restaurant";
	if (/水質|淨水|飲水|water/.test(text)) return "water";
	return null;
};

const getIntentTargetModule = (intent, question) =>
	intent?.targetModule || intent?.target_module || getQuestionTargetModule(question);

const findSemanticMapComponent = (question, components, targetModule = null) => {
	const candidates = (components || []).filter(
		(component) => component?.map_config?.length,
	);
	const rules = targetModule
		? semanticMapLayerRules.filter((rule) => rule.module === targetModule)
		: semanticMapLayerRules;
	for (const rule of rules) {
		if (!targetModule && !questionMatchesRule(question, rule)) continue;
		const matched = candidates
			.map((component) => ({
				component,
				score: scoreSemanticComponent(component, rule),
			}))
			.filter((item) => item.score > 0)
			.sort((a, b) => b.score - a.score);
		if (matched[0]?.component) return matched[0].component;
	}
	return null;
};

// eslint-disable-next-line no-unused-vars
const inferIntentFromQuestionLegacy = (question, intent) => {
	const normalized = String(question || "").toLowerCase();
	const asksNearby =
		/附近|最近|離我|nearest|nearby|closest/.test(normalized) ||
		(/急診|醫院|藥局|pharmacy|hospital|emergency/.test(normalized) &&
			/哪|where|找/.test(normalized));

	if (!asksNearby) return intent;

	return normalizeAiInteractionIntent({
		...intent,
		type: AI_INTERACTION_TYPES.NEARBY_LOOKUP,
		needsMap: true,
		needsLocation: true,
		shouldOpenComponent: true,
		shouldRequestUiActions: true,
		rankingMetric: "distance",
		resultLimit: intent?.resultLimit || 5,
	});
};

const inferIntentFromQuestion = (question, intent) => {
	const normalized = String(question || "").toLowerCase();
	const targetModule = getIntentTargetModule(intent, question);
	const asksNearby =
		/最近|附近|離我|這邊|定位|nearest|nearby|closest/.test(normalized) ||
		(/急診|醫院|藥局|藥房|環保餐廳|餐廳|水質|pharmacy|hospital|emergency|restaurant/.test(normalized) &&
			/哪|哪裡|where/.test(normalized));
	const asksMapRelated =
		/急診|醫院|待診|候診|藥局|藥房|水質|淨水|環保餐廳|餐廳|pharmacy|hospital|emergency|restaurant/.test(normalized);
	const asksRanking =
		/最少|最多|最低|最高|最快|最短|排名|排行|比較|top|lowest|highest/.test(normalized);
	const needsLocation = /最近|附近|離我|這邊|定位|目前位置|我的位置|gps|near|nearest|nearby|closest/i.test(normalized);
	const effectiveAsksNearby = asksNearby && !asksRanking;
	const rankingMetric =
		effectiveAsksNearby
			? "distance"
			: /急診|醫院|hospital|emergency/.test(normalized) &&
					/人最少|最少人|待診.*少|候診.*少|待診人數|候診人數/.test(normalized)
				? "patient_count"
				: /急診|醫院|hospital|emergency/.test(normalized) &&
						/等待|等候|最快|最短/.test(normalized)
					? "waiting_time"
					: /哪一區|哪個區|行政區|區域/.test(normalized) &&
							/最多|最少/.test(normalized)
						? "area_count"
						: intent?.rankingMetric;

	if (!effectiveAsksNearby && !(asksMapRelated && asksRanking)) return intent;

	return normalizeAiInteractionIntent({
		...intent,
		targetModule,
		type: effectiveAsksNearby
			? AI_INTERACTION_TYPES.NEARBY_LOOKUP
			: AI_INTERACTION_TYPES.OPEN_MAP,
		needsMap: true,
		needsLocation,
		shouldOpenComponent: true,
		shouldRequestUiActions: true,
		rankingMetric,
		resultLimit: intent?.resultLimit || (rankingMetric === "area_count" ? 1 : 5),
	});
};

const formatGuideDistance = (meters) => {
	const value = Number(meters);
	if (!Number.isFinite(value)) return "";
	if (value >= 1000) return `${(value / 1000).toFixed(1)} 公里`;
	return `${Math.round(value)} 公尺`;
};

// eslint-disable-next-line no-unused-vars
const hasEmergencyTopicLegacy = (question, component) =>
	/急診|醫院|hospital|emergency|er/i.test(`${question || ""} ${component?.name || ""} ${component?.index || ""}`);

const getResultNameList = (results = []) =>
	results.map((item) => item?.name).filter(Boolean).join("、");

const escapeGuideHtml = (value) =>
	String(value ?? "")
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#039;");

const UNKNOWN_GUIDE_VALUE = "未知";

// eslint-disable-next-line no-unused-vars
const getGuideTopicLegacy = (question, component) => {
	const text = `${question || ""} ${component?.name || ""} ${component?.index || ""}`.toLowerCase();
	if (/急診|醫院|待診|候診|hospital|emergency|er/.test(text)) return "emergency";
	if (/藥局|藥房|pharmacy/.test(text)) return "pharmacy";
	if (/環保餐廳|餐廳|restaurant|env_protect/.test(text)) return "restaurant";
	if (/水質|淨水|飲水|water/.test(text)) return "water";
	return "map_guide";
};

const getGuideTopic = (question, component) => {
	const text = `${question || ""} ${component?.name || ""} ${component?.index || ""}`.toLowerCase();
	if (/藥局|藥房|pharmacy/.test(text)) return "pharmacy";
	if (/急診|醫院|待診|候診|hospital|emergency|(^|[^a-z])er([^a-z]|$)/.test(text)) return "emergency";
	if (/環保餐廳|餐廳|restaurant|env_protect/.test(text)) return "restaurant";
	if (/水質|淨水|飲水|water/.test(text)) return "water";
	return "map_guide";
};

const pickGuideValue = (properties, keys) => {
	for (const key of keys) {
		const value = properties?.[key];
		if (value !== null && value !== undefined && value !== "") return value;
	}
	return UNKNOWN_GUIDE_VALUE;
};

const getGuideDistanceValue = (item) =>
	item?.distance_text || formatGuideDistance(item?.distance_meters) || UNKNOWN_GUIDE_VALUE;

const buildGuideMetrics = (question, component, item) => {
	const topic = getGuideTopic(question, component);
	const properties = item?.properties || {};
	const distance = {
		label: "距離",
		value: getGuideDistanceValue(item),
	};

	if (item?.area_count !== undefined || properties.area_count !== undefined) {
		const countLabel = topic === "emergency"
			? "急診醫院數"
			: topic === "restaurant"
				? "環保餐廳數"
				: "數量";
		return [
			{ label: "行政區", value: item?.district || properties.district || properties.TNAME || UNKNOWN_GUIDE_VALUE },
			{ label: countLabel, value: item?.area_count ?? properties.area_count ?? UNKNOWN_GUIDE_VALUE },
			{ label: "資料時間", value: item?.data_time || pickGuideValue(properties, ["last_updated", "data_time", "updated_at"]) },
		];
	}

	if (topic === "emergency") {
		return [
			distance,
			{ label: "待診人數", value: item?.patient_count ?? UNKNOWN_GUIDE_VALUE },
			{
				label: "等待時間",
				value: item?.waiting_time !== undefined && item?.waiting_time !== null
					? `${item.waiting_time} 分鐘`
					: UNKNOWN_GUIDE_VALUE,
			},
		];
	}

	if (topic === "pharmacy") {
		if (item?.pharmacy_count !== undefined || properties.pharmacy_count !== undefined) {
			return [
				{ label: "行政區", value: item?.district || properties.district || properties.TNAME || UNKNOWN_GUIDE_VALUE },
				{ label: "藥局數", value: item?.pharmacy_count ?? properties.pharmacy_count ?? UNKNOWN_GUIDE_VALUE },
				{ label: "每萬人藥局數", value: item?.pharmacy_per_10k ?? properties.pharmacy_per_10k ?? UNKNOWN_GUIDE_VALUE },
			];
		}
		return [
			distance,
			{ label: "區域", value: pickGuideValue(properties, ["district", "TNAME", "town", "行政區"]) },
			{ label: "電話", value: pickGuideValue(properties, ["telephone", "phone", "tel", "電話"]) },
		];
	}

	if (topic === "restaurant") {
		return [
			distance,
			{ label: "區域", value: pickGuideValue(properties, ["district", "TNAME", "town", "行政區"]) },
			{ label: "地址", value: pickGuideValue(properties, ["address", "addr", "ADDR", "地址"]) },
		];
	}

	if (topic === "water") {
		return [
			distance,
			{ label: "區域", value: pickGuideValue(properties, ["district", "TNAME", "town", "行政區"]) },
			{ label: "狀態", value: pickGuideValue(properties, ["status", "quality", "result", "水質狀態"]) },
		];
	}

	return [
		distance,
		{ label: "區域", value: pickGuideValue(properties, ["district", "TNAME", "town", "行政區"]) },
		{ label: "更新時間", value: item?.data_time || pickGuideValue(properties, ["last_updated", "data_time", "updated_at"]) },
	];
};

const buildGuideComparisonTable = (question, component, results) => {
	const sampleMetrics = buildGuideMetrics(question, component, results?.[0] || {});
	return {
		id: "candidate_rank",
		title: "候選結果",
		columns: ["排名", "名稱", ...sampleMetrics.map((metric) => metric.label)],
		rows: (results || []).map((item, index) => [
			index + 1,
			item.name,
			...buildGuideMetrics(question, component, item).map((metric) => metric.value),
		]),
	};
};

const hasEmergencyTopic = (question, component) =>
	getGuideTopic(question, component) === "emergency";

// eslint-disable-next-line no-unused-vars
const buildGuideAnswerLegacy = (question, component, executionResult) => {
	if (executionResult?.status !== "ready" || !executionResult?.top_result) return "";

	const componentName = component?.name || executionResult.component_name || "相關地圖";
	const top = executionResult.top_result;
	const results = executionResult.top_results || [];
	const rankingBasis = executionResult.ranking_basis;
	const distanceText = top.distance_text || formatGuideDistance(top.distance_meters);
	const waitingText = top.waiting_time !== undefined && top.waiting_time !== null
		? `，等待時間約 ${top.waiting_time} 分鐘`
		: "";
	const patientText = top.patient_count !== undefined && top.patient_count !== null
		? `，待診人數 ${top.patient_count} 人`
		: "";
	let answer = `我已開啟「${componentName}」地圖組件，並在地圖上標出候選點、畫出候選範圍，接著縮放到第一筆結果並開啟資訊卡。`;

	if (rankingBasis === "distance") {
		answer += `目前最近的是「${top.name}」${distanceText ? `，距離約 ${distanceText}` : ""}${waitingText}${patientText}。地圖上也已畫出你的位置到該點的連線。`;
	} else if (rankingBasis === "patient_count") {
		const names = getResultNameList(results.filter((item) =>
			String(item.patient_count) === String(top.patient_count),
		));
		answer += `目前待診人數最少的是${names ? `「${names}」` : `「${top.name}」`}，待診人數 ${top.patient_count ?? "未知"} 人${waitingText}。`;
	} else if (rankingBasis === "waiting_time") {
		answer += `目前等待時間最短的是「${top.name}」，等待時間約 ${top.waiting_time ?? "未知"} 分鐘${patientText}。`;
	} else {
		answer += `目前最推薦先看「${top.name}」${waitingText}${patientText}。`;
	}

	if (hasEmergencyTopic(question, component)) {
		answer += " 如果情況緊急或有生命危險，請直接撥打 119 或就近就醫，不要只依賴待診數字。";
	}

	return answer;
};

const buildGuideAnswer = (question, component, executionResult) => {
	if (executionResult?.status !== "ready" || !executionResult?.top_result) return "";

	const componentName = component?.name || executionResult.component_name || "相關地圖";
	const top = executionResult.top_result;
	const rankingBasis = executionResult.ranking_basis;
	const topic = getGuideTopic(question, component);
	const distanceText = top.distance_text || formatGuideDistance(top.distance_meters);

	if (rankingBasis === "area_count" && topic === "pharmacy") {
		return `我已開啟「${componentName}」地圖，並框出藥局數最多的行政區。「${top.name}」目前有 ${top.pharmacy_count ?? "未知"} 間藥局${top.pharmacy_per_10k !== undefined ? `，每萬人約 ${top.pharmacy_per_10k} 間` : ""}。`;
	}

	if (rankingBasis === "area_density" && topic === "pharmacy") {
		return `我已開啟「${componentName}」地圖，並框出藥局密度最高的行政區。「${top.name}」每萬人約 ${top.pharmacy_per_10k ?? "未知"} 間藥局，藥局數為 ${top.pharmacy_count ?? "未知"} 間。`;
	}

	if (rankingBasis === "area_count") {
		const label = topic === "emergency"
			? "急診醫院"
			: topic === "restaurant"
				? "環保餐廳"
				: "項目";
		const answer = `我已開啟「${componentName}」地圖，並框出${label}數最多的行政區。「${top.name}」目前有 ${top.area_count ?? "未知"} 個${label}。`;
		return topic === "emergency"
			? `${answer} 如果情況緊急或有生命危險，請直接撥打 119 或就近就醫。`
			: answer;
	}

	if (rankingBasis === "distance") {
		const waitingText = top.waiting_time !== undefined && top.waiting_time !== null
			? `，等待時間約 ${top.waiting_time} 分鐘`
			: "";
		const patientText = top.patient_count !== undefined && top.patient_count !== null
			? `，待診人數 ${top.patient_count} 人`
			: "";
		let answer = `我已開啟「${componentName}」地圖，並標出候選點。最近的是「${top.name}」${distanceText ? `，距離約 ${distanceText}` : ""}${waitingText}${patientText}。`;
		if (topic === "emergency") {
			answer += " 如果情況緊急或有生命危險，請直接撥打 119 或就近就醫。";
		}
		return answer;
	}

	if (rankingBasis === "patient_count" && topic === "emergency") {
		const results = executionResult.top_results || [];
		const zeroPatientResults = results.filter((item) => Number(item?.patient_count) === 0);
		if (zeroPatientResults.length > 1) {
			const names = zeroPatientResults
				.slice(0, 3)
				.map((item) => item.name)
				.filter(Boolean)
				.join("、");
			return `我已開啟「${componentName}」地圖，並依待診人數排序。目前待診人數為 0 人的急診醫院包含：${names}。如果情況緊急或有生命危險，請直接撥打 119 或就近就醫。`;
		}
		const waitingText = top.waiting_time !== undefined && top.waiting_time !== null
			? `，等待時間約 ${top.waiting_time} 分鐘`
			: "";
		return `我已開啟「${componentName}」地圖，並依待診人數排序。目前待診人數最少的是「${top.name}」，待診人數 ${top.patient_count ?? "未知"} 人${waitingText}。如果情況緊急或有生命危險，請直接撥打 119 或就近就醫。`;
	}

	if (rankingBasis === "waiting_time" && topic === "emergency") {
		const patientText = top.patient_count !== undefined && top.patient_count !== null
			? `，待診人數 ${top.patient_count} 人`
			: "";
		return `我已開啟「${componentName}」地圖，並依等待時間排序。目前等待時間最短的是「${top.name}」，等待時間約 ${top.waiting_time ?? "未知"} 分鐘${patientText}。如果情況緊急或有生命危險，請直接撥打 119 或就近就醫。`;
	}

	return `我已開啟「${componentName}」地圖，並整理目前最相關的結果：「${top.name}」。`;
};

// eslint-disable-next-line no-unused-vars
const buildGuideHtml = (question, component, executionResult) => {
	if (executionResult?.status !== "ready" || !executionResult?.top_result) return "";

	const top = executionResult.top_result;
	const results = executionResult.top_results || [];
	const distance = top.distance_text || formatGuideDistance(top.distance_meters) || "未知";
	const patientCount = top.patient_count ?? "未知";
	const waitingTime = top.waiting_time !== undefined && top.waiting_time !== null
		? `${top.waiting_time} 分鐘`
		: "未知";
	const tableRows = results.map((item, index) => `
		<tr>
			<td>${index + 1}</td>
			<td>${escapeGuideHtml(item.name)}</td>
			<td>${escapeGuideHtml(item.distance_text || formatGuideDistance(item.distance_meters) || "未知")}</td>
			<td>${escapeGuideHtml(item.patient_count ?? "未知")}</td>
			<td>${escapeGuideHtml(item.waiting_time !== undefined && item.waiting_time !== null ? `${item.waiting_time} 分鐘` : "未知")}</td>
		</tr>
	`).join("");

	return `
		<section class="guide-html-card">
			<div class="guide-html-eyebrow">${escapeGuideHtml(component?.name || executionResult.component_name || "地圖導覽")}</div>
			<h4>${escapeGuideHtml(top.name)}</h4>
			<p>${escapeGuideHtml(buildGuideAnswer(question, component, executionResult))}</p>
			<div class="guide-html-metrics">
				<div><span>距離</span><strong>${escapeGuideHtml(distance)}</strong></div>
				<div><span>待診人數</span><strong>${escapeGuideHtml(patientCount)}</strong></div>
				<div><span>等待時間</span><strong>${escapeGuideHtml(waitingTime)}</strong></div>
			</div>
			<table class="guide-html-table">
				<thead><tr><th>排名</th><th>名稱</th><th>距離</th><th>待診</th><th>等待</th></tr></thead>
				<tbody>${tableRows}</tbody>
			</table>
		</section>
	`;
};

const buildMapLink = (component) => {
	const city = encodeURIComponent(component?.city || "metrotaipei");
	return `/mapview?city=${city}`;
};

// eslint-disable-next-line no-unused-vars
const buildCoreGuideHtmlLegacy = (question, component, executionResult) => {
	if (executionResult?.status !== "ready" || !executionResult?.top_result) return "";

	const top = executionResult.top_result;
	const distance = top.distance_text || formatGuideDistance(top.distance_meters) || "未知";
	const patientCount = top.patient_count ?? "未知";
	const waitingTime = top.waiting_time !== undefined && top.waiting_time !== null
		? `${top.waiting_time} 分鐘`
		: "未知";

	return `
		<section class="guide-html-core">
			<h4>${escapeGuideHtml(top.name)}</h4>
			<p>${escapeGuideHtml(buildGuideAnswer(question, component, executionResult))}</p>
			<div class="guide-html-metrics">
				<div><span>距離</span><strong>${escapeGuideHtml(distance)}</strong></div>
				<div><span>待診</span><strong>${escapeGuideHtml(patientCount)}</strong></div>
				<div><span>等待</span><strong>${escapeGuideHtml(waitingTime)}</strong></div>
			</div>
			<a class="guide-html-action" href="${escapeGuideHtml(buildMapLink(component))}">查看地圖</a>
		</section>
	`;
};

const buildCoreGuideHtml = (question, component, executionResult) => {
	if (executionResult?.status !== "ready" || !executionResult?.top_result) return "";

	const top = executionResult.top_result;
	const metrics = buildGuideMetrics(question, component, top);

	return `
		<section class="guide-html-core">
			<h4>${escapeGuideHtml(top.name)}</h4>
			<p>${escapeGuideHtml(buildGuideAnswer(question, component, executionResult))}</p>
			<div class="guide-html-metrics">
				${metrics.map((metric) => `
					<div><span>${escapeGuideHtml(metric.label)}</span><strong>${escapeGuideHtml(metric.value)}</strong></div>
				`).join("")}
			</div>
			<a class="guide-html-action" href="${escapeGuideHtml(buildMapLink(component))}">查看地圖</a>
		</section>
	`;
};

// eslint-disable-next-line no-unused-vars
const buildGuidePayloadLegacy = (question, component, executionResult, uiActions) => {
	const answer = buildGuideAnswer(question, component, executionResult);
	if (!answer) return null;

	const top = executionResult.top_result;
	const results = executionResult.top_results || [];
	return {
		answer,
		html: buildCoreGuideHtml(question, component, executionResult),
		topic: hasEmergencyTopic(question, component) ? "emergency" : "map_guide",
		data_timestamp: top?.data_time || new Date().toISOString(),
		tool_steps: [
			{ id: "open_component", label: "開啟相關地圖組件", status: "done" },
			{ id: "rank_candidates", label: "排序候選資料", status: "done" },
			{ id: "draw_map_actions", label: "標點、畫線、畫範圍並開啟資訊卡", status: "done" },
		],
		insight_cards: top
			? [
				{
					id: "top_result",
					title: top.name,
					status: executionResult.ranking_basis,
					stats: [
						{ label: "距離", value: top.distance_text || formatGuideDistance(top.distance_meters) || "未知" },
						{ label: "待診人數", value: top.patient_count ?? "未知" },
						{ label: "等待時間", value: top.waiting_time !== undefined && top.waiting_time !== null ? `${top.waiting_time} 分鐘` : "未知" },
					],
				},
			]
			: [],
		comparison_tables: [
			{
				id: "candidate_rank",
				title: "候選結果",
				columns: ["排名", "名稱", "距離", "待診人數", "等待時間"],
				rows: results.map((item, index) => [
					index + 1,
					item.name,
					item.distance_text || formatGuideDistance(item.distance_meters) || "未知",
					item.patient_count ?? "未知",
					item.waiting_time !== undefined && item.waiting_time !== null ? `${item.waiting_time} 分鐘` : "未知",
				]),
			},
		],
		warnings: hasEmergencyTopic(question, component)
			? ["急症請優先撥打 119 或直接就近就醫，系統資料可能有時間差。"]
			: [],
		ui_actions: uiActions || [],
	};
};

const buildGuidePayload = (question, component, executionResult, uiActions) => {
	const answer = buildGuideAnswer(question, component, executionResult);
	if (!answer) return null;

	const top = executionResult.top_result;
	const results = executionResult.top_results || [];
	const metrics = buildGuideMetrics(question, component, top);

	return {
		answer,
		html: buildCoreGuideHtml(question, component, executionResult),
		topic: getGuideTopic(question, component),
		data_timestamp: top?.data_time || new Date().toISOString(),
		tool_steps: [
			{ id: "open_component", label: "開啟相關地圖", status: "done" },
			{ id: "rank_candidates", label: "整理候選資料", status: "done" },
			{ id: "draw_map_actions", label: "標點、畫線、畫範圍並定位", status: "done" },
		],
		insight_cards: top
			? [
				{
					id: "top_result",
					title: top.name,
					status: executionResult.ranking_basis,
					stats: metrics,
				},
			]
			: [],
		comparison_tables: [buildGuideComparisonTable(question, component, results)],
		warnings: hasEmergencyTopic(question, component)
			? ["急症請優先撥打 119 或直接就近就醫，系統資料可能有時間差。"]
			: [],
		ui_actions: uiActions || [],
	};
};

export const useChatStore = defineStore("chat", () => {
	const recommendComponents = ref(null);
	const chatData = ref([...defaultChatData]);

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
				limit: SEARCH_LIMIT,
				score: SEARCH_SCORE_THRESHOLD,
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
		if (contentStore.allMapLayers?.length) return contentStore.allMapLayers;

		const activeCities = contentStore.cityManager?.activeCities?.length
			? contentStore.cityManager.activeCities
			: ["metrotaipei", "taipei", "newtaipei"];

		const responses = await Promise.allSettled(
			activeCities.map((city) => http.get(`/dashboard/map-layers-${city}`)),
		);
		const layers = responses.flatMap((result) =>
			result.status === "fulfilled" ? result.value.data?.data || [] : [],
		);

		contentStore.allMapLayers = dedupeComponents(layers);
		return contentStore.allMapLayers;
	};

	const requestAiIntent = async (question) => {
		try {
			const response = await http.post("/ai/chat/twai", {
				session: getTodaySessionId(),
				stream: false,
				messages: [
					{
						role: "system",
						content: buildAiIntentClassificationPrompt(question),
					},
					{
						role: "user",
						content: question,
					},
				],
				max_new_tokens: 300,
				temperature: 0.01,
			});
			return inferIntentFromQuestion(
				question,
				normalizeAiInteractionIntent(parseAiResponse(response.data?.data)),
			);
		} catch (error) {
			console.error("AI intent classify failed:", getRequestErrorMessage(error));
			return inferIntentFromQuestion(
				question,
				getDefaultAiInteractionIntent(),
			);
		}
	};

	const resolveMapComponent = async (question, topComponents, intent) => {
		const contentStore = useContentStore();
		const mapLayers = await fetchMapLayerComponents();
		const localComponents = [
			...(contentStore.currentDashboard?.components || []),
			...(contentStore.cityDashboard?.components || []),
			...mapLayers,
		];
		const candidates = dedupeComponents([
			...(topComponents || []),
			...localComponents,
		]);

		const topMapComponent = (topComponents || []).find(
			(component) => component?.map_config?.length,
		);
		const targetModule = getIntentTargetModule(intent, question);
		const semanticComponent = findSemanticMapComponent(question, candidates, targetModule);
		if (semanticComponent) return semanticComponent;
		if (targetModule) return fallbackMapComponents[targetModule] || null;
		return (
			findSemanticMapComponent(question, candidates) ||
			topMapComponent ||
			candidates.find((component) => component?.map_config?.length) ||
			null
		);
	};

	const ensureMapOpened = async (component) => {
		const mapStore = useMapStore();
		const contentStore = useContentStore();

		if (router.currentRoute.value.name !== "mapview") {
			const city =
				component?.city ||
				contentStore.currentDashboard?.city ||
				router.currentRoute.value.query?.city ||
				"metrotaipei";
			await router.push({ name: "mapview", query: { city } });
			await nextTick();
		}

		if (component?.map_config?.length) {
			if (typeof mapStore.openMapConfig === "function") {
				mapStore.openMapConfig(component.map_config);
			} else if (typeof mapStore.openComponentLayer === "function") {
				mapStore.openComponentLayer(component.map_config);
			} else if (typeof mapStore.addToMapLayerList === "function") {
				mapStore.addToMapLayerList(component.map_config);
			}
		}

		return waitForMapReady(mapStore);
	};

	const buildMapContext = (component, executionResult) => ({
		active_component: component
			? {
				id: component.id,
				index: component.index,
				name: component.name,
				city: component.city,
				map_config: component.map_config,
			}
			: null,
		execution_status: executionResult?.status,
		top_result: executionResult?.top_result,
		reference_point: executionResult?.reference_point,
	});

	const requestAiAnswer = async ({
		question,
		intent,
		components,
		component,
		executionResult,
	}) => {
		const answerComponents = dedupeComponents([
			...(components || []),
			...(component ? [component] : []),
		]);
		const databaseContext = await buildDatabaseContext(answerComponents);
		const componentContext = buildComponentSummaryContext(answerComponents);
		const mapContext = buildMapContext(component, executionResult);
		const response = await http.post("/ai/chat/twai", {
			session: getTodaySessionId(),
			stream: false,
			messages: [
				{
					role: "system",
					content: buildAiAnswerPrompt({
						question,
						intent,
						componentContext,
						databaseContext,
						mapContext,
						executionResult,
					}),
				},
				{
					role: "user",
					content: question,
				},
			],
			max_new_tokens: 450,
			temperature: 0.2,
		});

		return parseAiResponse(response.data?.data);
	};

	const runMapActions = async (component, mapActions) => {
		if (!component && !mapActions?.length) return false;
		const mapStore = useMapStore();
<<<<<<< HEAD
		const contentStore = useContentStore();
		const openComponentOnly =
		options.componentOnly || shouldOpenComponentOnly(question, target);
		const currentQuery = router.currentRoute.value.query || {};
		const targetCity =
			target?.dashboardCity ||
			target?.city ||
			currentQuery.city ||
			contentStore.currentDashboard.city ||
			"metrotaipei";
		const targetIndex =
			target?.dashboardIndex ||
			currentQuery.index ||
			contentStore.currentDashboard.index;
		const shouldNavigateToTargetMap =
			router.currentRoute.value.name !== "mapview" ||
			currentQuery.city !== targetCity ||
			(targetIndex && currentQuery.index !== targetIndex);

		console.log("[ai-guide] openGuideMapTarget routing", {
			target,
			currentRoute: router.currentRoute.value.fullPath,
			targetCity,
			targetIndex,
			shouldNavigateToTargetMap,
			openComponentOnly,
		});

		if (shouldNavigateToTargetMap) {
			const query = targetIndex
				? { city: targetCity, index: targetIndex }
				: { city: targetCity };

			await router.push({
				path: "/mapview",
				query,
			});
			console.log("[ai-guide] navigated to guide map route", {
				query,
				routeAfterPush: router.currentRoute.value.fullPath,
			});
			await nextTick();
		}

		const guideComponentPayload = buildGuideComponentPayload(target, components);
		console.log("[ai-guide] guide component payload", guideComponentPayload);
		mapStore.openGuideComponent(guideComponentPayload);

		const ready = await waitForMapReady(mapStore);
		if (!ready) {
			mapStore.queueAiGuideRun(
				openComponentOnly ? buildClearGuideOverlayAction(target) : uiActions,
			);
			if (attempt < 2) {
				setTimeout(() => {
					openGuideMapTarget(
						target,
						uiActions,
						question,
						components,
						answer,
						attempt + 1,
						options,
					);
				}, 1000);
=======
		await ensureMapOpened(component);

		if (!mapActions?.length) return true;
		if (typeof mapStore.executeAiMapCommands === "function") {
			return mapStore.executeAiMapCommands(mapActions, null);
		}
		if (typeof mapStore.dispatchAiGuideActions === "function") {
			if (mapStore.map?.isStyleLoaded?.()) {
				return mapStore.dispatchAiGuideActions(mapActions);
>>>>>>> 74eec4a5eb7f9ca142fc7cc02ee007e2579e416c
			}
			mapStore.queueAiGuideRun(mapActions);
			return true;
		}
<<<<<<< HEAD

		await getUserCoordinate({
			prompt: shouldShowUserLocationForGuide(target),
		});

		const actions = openComponentOnly
			? buildClearGuideOverlayAction(target)
			: await ensureGuideMapActions(
				target,
				uiActions,
				question,
				components,
				answer,
				{ promptLocation: true },
			);
		mapStore.queueAiGuideRun(actions);

		return true;
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
			const provisionalGuideTarget = await resolveGuideTarget(
				newChatData.content,
				recommendComponents.value,
			);
			let guideUiActions = [];
			let mapToolContext = null;
			let guideTarget = null;
			if (provisionalGuideTarget) {
				guideUiActions = shouldOpenComponentOnly(
					newChatData.content,
					provisionalGuideTarget,
				)
					? buildClearGuideOverlayAction(provisionalGuideTarget)
					: await ensureGuideMapActions(
						provisionalGuideTarget,
						[],
						newChatData.content,
						recommendComponents.value,
						"",
					);
				mapToolContext = buildGuideAiMapContext(
					provisionalGuideTarget,
					guideUiActions,
					newChatData.content,
				);
			}
			const aiResult = await askTWCCAI(
				newChatData.content,
				recommendComponents.value,
				mapToolContext,
			);
			const aiPayload = normalizeAiPayload(aiResult);
			const selectedModuleIds =
				aiPayload?.selected_module_ids ||
				aiPayload?.guide?.selected_module_ids ||
				[];
			guideTarget = await resolveGuideTargetFromModules(
				selectedModuleIds,
				newChatData.content,
				recommendComponents.value,
			);
			if (!guideTarget) {
				guideTarget = provisionalGuideTarget;
			}
			if (guideTarget) {
				guideUiActions = shouldOpenComponentOnly(
					newChatData.content,
					guideTarget,
				)
					? buildClearGuideOverlayAction(guideTarget)
					: await ensureGuideMapActions(
						guideTarget,
						guideUiActions,
						newChatData.content,
						recommendComponents.value,
						aiPayload?.answer || aiPayload?.content || "",
					);
			}
			const guideAnswer = aiPayload?.answer || aiPayload?.content;
			let guidePayload = null;

			if (guideAnswer) {
				if (guideTarget) {
					guidePayload = {
						...(aiPayload || {}),
						...buildGuideBlocks(guideTarget, guideUiActions, guideAnswer),
						answer: guideAnswer,
						ui_actions: guideUiActions,
					};
				}
				if (guideTarget) {
					openGuideMapTarget(
						guideTarget,
						guideUiActions,
						newChatData.content,
						recommendComponents.value,
						guideAnswer,
					).catch((error) => {
						console.error("[ai-guide] auto open failed", error);
					});
				}
				addChatData({
					role: "bot",
					content: guideAnswer,
					userQuestion: newChatData.content,
					relations: recommendComponents.value,
					guideTarget,
					guidePayload,
					ui_actions: guideUiActions,
					button: guideTarget
						? [
							{
								id: "open-guide-map",
								text: `打開${guideTarget.title}地圖組件`,
								action: "openGuideMap",
							},
						]
						: undefined,
				});
				saveChatLog(newChatData.content, {
					answer: guideAnswer,
					components: recommendComponents.value,
					tool_used: aiPayload?.tool_used,
					selected_module_ids: selectedModuleIds,
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
=======
		return false;
>>>>>>> 74eec4a5eb7f9ca142fc7cc02ee007e2579e416c
	};

	const addFallbackComponentAnswer = (question) => {
		if (recommendComponents.value?.length > 0) {
			const topK = [...recommendComponents.value].sort(
				(a, b) => (b.score || 0) - (a.score || 0),
			);
			addChatData({
				role: "bot",
				content:
					"AI 回答暫時失敗，但我已找到可能相關的儀表板組件，請先參考下方結果。",
				relations: topK,
			});
			saveChatLog(question, topK);
			return;
		}

		addChatData({
			role: "bot",
			content:
				"目前找不到可對應的儀表板組件，也暫時無法取得 AI 回答。請稍後再試，或換一個更明確的關鍵字。",
		});
		saveChatLog(question, []);
	};

	const addQueryData = async (newChatData) => {
		addChatData(newChatData);
		const question = newChatData.content;
		recommendComponents.value = [];

		try {
			recommendComponents.value = await fetchRecommendedComponents(question);
		} catch (error) {
			console.error("VectorAnalysisError:", getRequestErrorMessage(error));
		}

		try {
			const intent = await requestAiIntent(question);
			const mapComponent =
				intent.needsMap || intent.shouldOpenComponent
					? await resolveMapComponent(question, recommendComponents.value, intent)
					: null;

			let executionResult = {
				status: "not_required",
				intent_type: intent.type,
				notes: [],
			};
			let mapActions = [];

			if (intent.needsMap || intent.shouldRequestUiActions) {
				const { executionResult: nextExecutionResult, mapActions: nextMapActions } = await executeAiPlan({
					question,
					intent,
					component: mapComponent,
				});
				executionResult = nextExecutionResult;
				mapActions = nextMapActions;
				runMapActions(mapComponent, mapActions).catch((error) => {
					console.error("AI map action failed:", error);
				});
			}

			const aiPayload = await requestAiAnswer({
				question,
				intent,
				components: recommendComponents.value,
				component: mapComponent,
				executionResult,
			});
			const guidePayload = buildGuidePayload(
				question,
				mapComponent,
				executionResult,
				mapActions,
			);
			const answer = guidePayload?.answer || normalizeAnswerText(aiPayload);

			if (answer) {
				addChatData({
					role: "bot",
					content: answer,
					html: guidePayload?.html,
					relations: recommendComponents.value,
					guidePayload: null,
					ui_actions: mapActions,
					showRelations: !guidePayload,
				});
				saveChatLog(question, {
					answer,
					guidePayload,
					intent,
					executionResult,
					components: recommendComponents.value,
				});
				return;
			}
		} catch (error) {
			console.error("TWCCAIError:", getRequestErrorMessage(error), error);
		}

		addFallbackComponentAnswer(question);
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

	return {
		recommendComponents,
		chatData,
		addChatData,
		addQueryData,
		saveChatLog,
	};
});
