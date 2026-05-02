import http from "../router/axios";

export const AI_INTERACTION_TYPES = {
	ANSWER_ONLY: "answer_only",
	OPEN_MAP: "open_map",
	NEARBY_LOOKUP: "nearby_lookup",
	FILTER_MAP: "filter_map",
};

const DEFAULT_INTENT = {
	type: AI_INTERACTION_TYPES.ANSWER_ONLY,
	needsMap: false,
	needsLocation: false,
	shouldOpenComponent: false,
	shouldRequestUiActions: false,
	rankingMetric: null,
	resultLimit: 5,
	filters: [],
};

const MAX_CONTEXT_ITEMS = 8;
const MAX_TEXT_LENGTH = 280;

export const getDefaultAiInteractionIntent = () => ({ ...DEFAULT_INTENT });

const toBoolean = (value) => value === true || value === "true";

const normalizeInteractionType = (type) => {
	const normalized = String(type || "").toLowerCase();
	if (Object.values(AI_INTERACTION_TYPES).includes(normalized)) {
		return normalized;
	}
	return AI_INTERACTION_TYPES.ANSWER_ONLY;
};

export const normalizeAiInteractionIntent = (intent = {}) => {
	const type = normalizeInteractionType(intent?.type);
	const needsMap =
		toBoolean(intent?.needsMap) ||
		toBoolean(intent?.needs_map) ||
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
		rankingMetric:
			intent?.rankingMetric ||
			intent?.ranking_metric ||
			(needsLocation ? "distance" : null),
		resultLimit: Number(intent?.resultLimit || intent?.result_limit || 5),
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
		"You classify Taipei City Dashboard chat questions into a strict JSON intent.",
		"Return JSON only. Do not include markdown.",
		"Schema:",
		JSON.stringify(DEFAULT_INTENT),
		"Use nearby_lookup when the user asks for nearby, closest, distance, GPS, or current location.",
		"Use open_map when the user asks to show, open, locate, or visualize a map layer.",
		"Use filter_map when the user asks to filter/highlight a subset on the map.",
		"Use answer_only for plain chart or knowledge questions.",
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
