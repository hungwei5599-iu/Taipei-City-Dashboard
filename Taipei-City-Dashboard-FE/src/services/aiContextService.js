import http from "../router/axios";

export const AI_INTERACTION_TYPES = {
	ANSWER_ONLY: "answer_only",
	OPEN_MAP: "open_map",
	NEARBY_LOOKUP: "nearby_lookup",
	FILTER_MAP: "filter_map",
};

const DEFAULT_INTENT = {
	type: AI_INTERACTION_TYPES.ANSWER_ONLY,
	shouldUseGuide: false,
	targetModule: null,
	needsMap: false,
	needsLocation: false,
	shouldOpenComponent: false,
	shouldRequestUiActions: false,
	rankingMetric: null,
	resultLimit: 5,
	cityScope: "metrotaipei",
	district: null,
	componentOnly: false,
	confidence: 0,
	reason: "",
	filters: [],
};

const MAX_CONTEXT_ITEMS = 8;
const MAX_TEXT_LENGTH = 280;

export const getDefaultAiInteractionIntent = () => ({ ...DEFAULT_INTENT });

const toBoolean = (value) => value === true || value === "true";

const ALLOWED_TARGET_MODULES = ["emergency", "pharmacy", "restaurant", "water"];
const ALLOWED_RANKING_METRICS = [
	"distance",
	"waiting_time",
	"patient_count",
	"pharmacy_count",
	"pharmacy_per_10k",
	"area_count",
	"default",
];

const normalizeTargetModule = (value) => {
	const normalized = String(value || "").toLowerCase();
	return ALLOWED_TARGET_MODULES.includes(normalized) ? normalized : null;
};

const normalizeRankingMetric = (value, fallback = null) => {
	const normalized = String(value || "").toLowerCase();
	if (ALLOWED_RANKING_METRICS.includes(normalized)) return normalized;
	return fallback;
};

const clampResultLimit = (value) => {
	const number = Number(value || 5);
	if (!Number.isFinite(number)) return 5;
	return Math.max(1, Math.min(20, Math.round(number)));
};

const normalizeInteractionType = (type) => {
	const normalized = String(type || "").toLowerCase();
	if (Object.values(AI_INTERACTION_TYPES).includes(normalized)) {
		return normalized;
	}
	return AI_INTERACTION_TYPES.ANSWER_ONLY;
};

export const normalizeAiInteractionIntent = (intent = {}) => {
	const shouldUseGuide =
		toBoolean(intent?.shouldUseGuide) ||
		toBoolean(intent?.should_use_guide);
	const componentOnly =
		toBoolean(intent?.componentOnly) ||
		toBoolean(intent?.component_only);
	const targetModule = normalizeTargetModule(
		intent?.targetModule ||
		intent?.target_module ||
		intent?.module_key ||
		intent?.module,
	);
	const type = normalizeInteractionType(
		intent?.type ||
		(shouldUseGuide || targetModule ? AI_INTERACTION_TYPES.OPEN_MAP : null),
	);
	const needsMap =
		toBoolean(intent?.needsMap) ||
		toBoolean(intent?.needs_map) ||
		shouldUseGuide ||
		type === AI_INTERACTION_TYPES.OPEN_MAP ||
		type === AI_INTERACTION_TYPES.NEARBY_LOOKUP ||
		type === AI_INTERACTION_TYPES.FILTER_MAP;
	const needsLocation =
		toBoolean(intent?.needsLocation) ||
		toBoolean(intent?.needs_location) ||
		type === AI_INTERACTION_TYPES.NEARBY_LOOKUP;

	return {
		...DEFAULT_INTENT,
		...intent,
		type,
		shouldUseGuide,
		targetModule,
		needsMap,
		needsLocation,
		shouldOpenComponent:
			toBoolean(intent?.shouldOpenComponent) ||
			toBoolean(intent?.should_open_component) ||
			needsMap,
		shouldRequestUiActions:
			toBoolean(intent?.shouldRequestUiActions) ||
			toBoolean(intent?.should_request_ui_actions) ||
			type === AI_INTERACTION_TYPES.NEARBY_LOOKUP ||
			type === AI_INTERACTION_TYPES.FILTER_MAP,
		rankingMetric: normalizeRankingMetric(
			intent?.rankingMetric || intent?.ranking_metric,
			needsLocation ? "distance" : null,
		),
		resultLimit: clampResultLimit(intent?.resultLimit || intent?.result_limit),
		cityScope: intent?.cityScope || intent?.city_scope || "metrotaipei",
		district: typeof (intent?.district) === "string" ? intent.district : null,
		componentOnly,
		confidence: Number.isFinite(Number(intent?.confidence)) ? Number(intent.confidence) : 0,
		reason: typeof intent?.reason === "string" ? intent.reason : "",
		filters: Array.isArray(intent?.filters) ? intent.filters : [],
	};
};

const truncateText = (value, maxLength = MAX_TEXT_LENGTH) => {
	const text = String(value || "");
	return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
};

const compactValue = (value, depth = 0) => {
	if (value === null || value === undefined) return value;
	if (typeof value === "string") return truncateText(value);
	if (typeof value !== "object") return value;
	if (depth > 4) return "[truncated]";
	if (Array.isArray(value)) {
		return value.slice(0, MAX_CONTEXT_ITEMS).map((item) => compactValue(item, depth + 1));
	}
	return Object.fromEntries(
		Object.entries(value).map(([key, item]) => [key, compactValue(item, depth + 1)]),
	);
};

export const dedupeComponents = (components = []) =>
	Array.from(
		(components || [])
			.filter(Boolean)
			.reduce((map, component) => {
				const key = component.index || component.id || component.name;
				if (!key) return map;
				const existing = map.get(key);
				if (!existing || component.city === "metrotaipei") {
					map.set(key, component);
				}
				return map;
			}, new Map())
			.values(),
	);

export const buildComponentSummaryContext = (components = []) =>
	dedupeComponents(components)
		.slice(0, 6)
		.map((component) => ({
			id: component.id,
			name: component.name,
			city: component.city,
			index: component.index,
			module: component.module,
			description: truncateText(component.description),
			map_config: (component.map_config || []).slice(0, 3).map((config) => ({
				index: config.index,
				name: config.name,
				type: config.type,
				source: config.source,
				city: config.city,
			})),
		}));

const fetchComponentChartData = async (component) => {
	const city = component.city || "metrotaipei";
	const response = await http.get(`/component/${component.id}/chart`, {
		params: { city },
	});

	return {
		id: component.id,
		name: component.name,
		index: component.index,
		city,
		chart_data: compactValue(response.data),
	};
};

export const buildDatabaseContext = async (components = []) => {
	const targets = dedupeComponents(components)
		.filter((component) => component.id)
		.slice(0, 3);
	const results = await Promise.allSettled(targets.map(fetchComponentChartData));

	return results.map((result, index) => {
		if (result.status === "fulfilled") return result.value;
		const component = targets[index];
		return {
			id: component.id,
			name: component.name,
			index: component.index,
			city: component.city,
			error: String(result.reason?.message || result.reason),
		};
	});
};

export const buildAiIntentClassificationPrompt = (question) =>
	[
		"你是台北城市儀表板的 AI 工具規劃器。",
		"你的任務不是回答使用者問題，而是把問題轉成可驗證、可執行的 JSON plan。",
		"只能輸出 JSON，不要 Markdown，不要解釋，不要包 ```json。",
		"allowed targetModule: emergency, pharmacy, restaurant, water, null。",
		"allowed rankingMetric: distance, waiting_time, patient_count, pharmacy_count, pharmacy_per_10k, area_count, default, null。",
		"急診、醫院、候診、待診、等待、人最少 => targetModule emergency。",
		"藥局、藥房 => targetModule pharmacy。",
		"環保餐廳、餐廳 => targetModule restaurant。",
		"水質、淨水、飲水 => targetModule water。",
		"最近、附近、離我、目前位置、GPS => needsLocation true 且 rankingMetric distance。",
		"急診等待時間最短 => rankingMetric waiting_time。",
		"急診人最少、待診人數最少、候診人數最少 => rankingMetric patient_count，不要做行政區聚合。",
		"哪一區、行政區、區域最多/最少 => rankingMetric area_count，needsLocation false。",
		"藥局密度、每萬人 => rankingMetric pharmacy_per_10k。",
		"resultLimit 必須是 1 到 20。",
		"Schema:",
		JSON.stringify(DEFAULT_INTENT),
		"Example: {\"type\":\"open_map\",\"shouldUseGuide\":true,\"targetModule\":\"emergency\",\"needsMap\":true,\"needsLocation\":false,\"shouldOpenComponent\":true,\"shouldRequestUiActions\":true,\"rankingMetric\":\"patient_count\",\"resultLimit\":1,\"cityScope\":\"metrotaipei\",\"district\":null,\"componentOnly\":false,\"confidence\":0.92,\"reason\":\"使用者詢問急診待診人數最少。\"}",
		`Question: ${question}`,
	].join("\n");

export const buildAiAnswerPrompt = ({
	question,
	intent,
	componentContext,
	databaseContext,
	mapContext,
	executionResult,
}) =>
	[
		"You are the Taipei City Dashboard AI assistant.",
		"Answer in Traditional Chinese unless the user asks another language.",
		"Use the provided dashboard/component/chart/map context as authoritative.",
		"If map execution has a top_result, mention it directly and briefly.",
		"Do not expose internal component indexes unless useful to the user.",
		"Return JSON only with this shape: {\"answer\":\"...\"}.",
		"",
		`question: ${question}`,
		"",
		"intent:",
		JSON.stringify(intent || {}, null, 2),
		"",
		"component_context:",
		JSON.stringify(componentContext || [], null, 2),
		"",
		"database_context:",
		JSON.stringify(databaseContext || [], null, 2),
		"",
		"map_context:",
		JSON.stringify(mapContext || {}, null, 2),
		"",
		"execution_result:",
		JSON.stringify(executionResult || {}, null, 2),
	].join("\n");
