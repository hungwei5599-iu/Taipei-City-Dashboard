import http from "../router/axios";

export const MAX_AI_CONTEXT_CHARS = 3500;

const MAX_CONTEXT_ARRAY_ITEMS = 8;
const MAX_CONTEXT_STRING_CHARS = 240;

const truncateText = (value, maxChars = MAX_CONTEXT_STRING_CHARS) => {
	const text = String(value || "");
	return text.length > maxChars ? `${text.slice(0, maxChars)}...` : text;
};

export const compactForAiContext = (value, depth = 0) => {
	if (value === null || value === undefined) return value;
	if (typeof value === "string") return truncateText(value);
	if (typeof value !== "object") return value;
	if (depth >= 5) return "[truncated]";
	if (Array.isArray(value)) {
		const items = value
			.slice(0, MAX_CONTEXT_ARRAY_ITEMS)
			.map((item) => compactForAiContext(item, depth + 1));
		if (value.length > MAX_CONTEXT_ARRAY_ITEMS) {
			items.push({ _truncated_count: value.length - MAX_CONTEXT_ARRAY_ITEMS });
		}
		return items;
	}
	return Object.fromEntries(
		Object.entries(value).map(([key, item]) => [
			key,
			compactForAiContext(item, depth + 1),
		]),
	);
};

export const stringifyForAiContext = (
	value,
	maxChars = MAX_AI_CONTEXT_CHARS,
) => {
	const text = JSON.stringify(compactForAiContext(value), null, 2);
	return text.length > maxChars
		? `${text.slice(0, maxChars)}\n... [context truncated]`
		: text;
};

const fetchComponentChartData = async (component) => {
	const city = component.city || "metrotaipei";
	const response = await http.get(`/component/${component.id}/chart`, {
		params: { city },
	});

	return {
		id: component.id,
		index: component.index,
		name: component.name,
		city,
		chart_data: compactForAiContext(response.data),
	};
};

export const buildDatabaseContext = async (components) => {
	const targets = (components ?? []).slice(0, 2).filter((item) => item.id);
	const results = await Promise.allSettled(
		targets.map(fetchComponentChartData),
	);

	return results.map((result, index) => {
		if (result.status === "fulfilled") return result.value;
		const component = targets[index];
		return {
			id: component.id,
			index: component.index,
			name: component.name,
			city: component.city,
			error: String(result.reason?.message || result.reason),
		};
	});
};

export const buildComponentSummaryContext = (components) =>
	(components ?? []).slice(0, 5).map((component) => ({
		id: component.id,
		name: component.name,
		city: component.city,
		index: component.index,
		module: component.module,
		has_map: Boolean(component.map_config?.length),
		map_config: component.map_config,
	}));

export const dedupeComponents = (components) =>
	Array.from(
		(components ?? [])
			.reduce((map, item) => {
				const key = item.index || item.id;
				const exist = map.get(key);
				if (!exist || item.city === "metrotaipei") {
					map.set(key, item);
				}
				return map;
			}, new Map())
			.values(),
	);

export const AI_INTERACTION_TYPES = {
	PURE_DATA_QA: "pure_data_qa",
	OPEN_MAP_COMPONENT: "open_map_component",
	POINT_LOOKUP: "point_lookup",
	NEARBY_LOOKUP: "nearby_lookup",
	AREA_STAT_RANKING: "area_stat_ranking",
	ROUTE_RELATION_VISUALIZATION: "route_relation_visualization",
};

export const AI_CAPABILITIES = {
	CHART_CONTEXT: "chart_context",
	OPEN_COMPONENT_LAYER: "open_component_layer",
	GPS: "gps",
	POINT_RANKING: "point_ranking",
	MAP_POINTS: "map_points",
	MAP_POLYGONS: "map_polygons",
	MAP_LINE: "map_line",
	FIT_BOUNDS: "fit_bounds",
	INFO_CARD: "info_card",
	CANDIDATE_LIST: "candidate_list",
	COMPARE_PANEL: "compare_panel",
	FILTERS: "filters",
};

const buildIntent = ({
	type,
	capabilities = [],
	needsMap = false,
	needsLocation = false,
	shouldOpenComponent = false,
	shouldRequestUiActions = false,
	targetKeywords = [],
	referenceLocationText = "",
	rankingMetric = "default",
	resultLimit = 5,
}) => ({
	type,
	needsMap,
	needsLocation,
	shouldOpenComponent,
	shouldRequestUiActions,
	requiredCapabilities: [...new Set(capabilities)],
	targetKeywords,
	referenceLocationText,
	rankingMetric,
	resultLimit,
});

export const getDefaultAiInteractionIntent = () =>
	buildIntent({
		type: AI_INTERACTION_TYPES.PURE_DATA_QA,
		needsMap: false,
		needsLocation: false,
		shouldOpenComponent: false,
		shouldRequestUiActions: false,
		capabilities: [AI_CAPABILITIES.CHART_CONTEXT],
	});

const intentDefaults = {
	[AI_INTERACTION_TYPES.PURE_DATA_QA]: getDefaultAiInteractionIntent(),
	[AI_INTERACTION_TYPES.OPEN_MAP_COMPONENT]: buildIntent({
		type: AI_INTERACTION_TYPES.OPEN_MAP_COMPONENT,
		needsMap: true,
		shouldOpenComponent: true,
		capabilities: [AI_CAPABILITIES.OPEN_COMPONENT_LAYER],
	}),
	[AI_INTERACTION_TYPES.POINT_LOOKUP]: buildIntent({
		type: AI_INTERACTION_TYPES.POINT_LOOKUP,
		needsMap: true,
		shouldOpenComponent: true,
		shouldRequestUiActions: true,
		capabilities: [
			AI_CAPABILITIES.CHART_CONTEXT,
			AI_CAPABILITIES.OPEN_COMPONENT_LAYER,
			AI_CAPABILITIES.MAP_POINTS,
			AI_CAPABILITIES.FIT_BOUNDS,
			AI_CAPABILITIES.INFO_CARD,
			AI_CAPABILITIES.CANDIDATE_LIST,
		],
	}),
	[AI_INTERACTION_TYPES.NEARBY_LOOKUP]: buildIntent({
		type: AI_INTERACTION_TYPES.NEARBY_LOOKUP,
		needsMap: true,
		needsLocation: true,
		shouldOpenComponent: true,
		shouldRequestUiActions: true,
		capabilities: [
			AI_CAPABILITIES.CHART_CONTEXT,
			AI_CAPABILITIES.OPEN_COMPONENT_LAYER,
			AI_CAPABILITIES.GPS,
			AI_CAPABILITIES.POINT_RANKING,
			AI_CAPABILITIES.MAP_POINTS,
			AI_CAPABILITIES.MAP_LINE,
			AI_CAPABILITIES.FIT_BOUNDS,
			AI_CAPABILITIES.INFO_CARD,
			AI_CAPABILITIES.CANDIDATE_LIST,
		],
	}),
	[AI_INTERACTION_TYPES.AREA_STAT_RANKING]: buildIntent({
		type: AI_INTERACTION_TYPES.AREA_STAT_RANKING,
		needsMap: true,
		shouldOpenComponent: true,
		shouldRequestUiActions: true,
		capabilities: [
			AI_CAPABILITIES.CHART_CONTEXT,
			AI_CAPABILITIES.OPEN_COMPONENT_LAYER,
			AI_CAPABILITIES.MAP_POLYGONS,
			AI_CAPABILITIES.FIT_BOUNDS,
			AI_CAPABILITIES.INFO_CARD,
			AI_CAPABILITIES.COMPARE_PANEL,
			AI_CAPABILITIES.FILTERS,
		],
	}),
	[AI_INTERACTION_TYPES.ROUTE_RELATION_VISUALIZATION]: buildIntent({
		type: AI_INTERACTION_TYPES.ROUTE_RELATION_VISUALIZATION,
		needsMap: true,
		shouldOpenComponent: true,
		shouldRequestUiActions: true,
		capabilities: [
			AI_CAPABILITIES.CHART_CONTEXT,
			AI_CAPABILITIES.OPEN_COMPONENT_LAYER,
			AI_CAPABILITIES.MAP_LINE,
			AI_CAPABILITIES.FIT_BOUNDS,
		],
	}),
};

export const normalizeAiInteractionIntent = (rawIntent) => {
	const type = Object.values(AI_INTERACTION_TYPES).includes(rawIntent?.type)
		? rawIntent.type
		: AI_INTERACTION_TYPES.PURE_DATA_QA;
	const defaults = intentDefaults[type] || getDefaultAiInteractionIntent();

	return {
		...defaults,
		...rawIntent,
		type,
		resultLimit: Math.max(
			1,
			Math.min(20, Number(rawIntent?.resultLimit || defaults.resultLimit || 5)),
		),
		requiredCapabilities: [
			...new Set([
				...(defaults.requiredCapabilities || []),
				...(rawIntent?.requiredCapabilities || []),
			]),
		],
	};
};

export const buildAiIntentClassificationPrompt = (question) => `Classify the user's Taipei City Dashboard task.

Question:
${question}

Choose exactly one main task type:
1. pure_data_qa
2. open_map_component
3. point_lookup
4. nearby_lookup
5. area_stat_ranking
6. route_relation_visualization

Important:
- The task type is not a single tool. It is the main task.
- requiredCapabilities is the tool/capability plan and may contain multiple capabilities.
- Use GPS only as the existing site location capability.
- For route_relation_visualization, add only line/route overlay capabilities. Existing station layers and cards should be reused.

Return strict JSON only:
{
  "type": "one of the six task types",
  "needsMap": true,
  "needsLocation": false,
  "shouldOpenComponent": true,
  "shouldRequestUiActions": true,
  "requiredCapabilities": ["chart_context"],
  "targetKeywords": ["急診"],
  "referenceLocationText": "板橋",
  "rankingMetric": "distance",
  "resultLimit": 5
}`;

export const buildAiAnswerPrompt = ({
	question,
	intent,
	componentContext,
	databaseContext,
	mapContext,
	executionResult,
}) => `You are Taipei City Dashboard's data assistant.

Interaction intent:
${stringifyForAiContext(intent, 1200)}

Question:
${question}

Matched dashboard components:
${stringifyForAiContext(componentContext, 1600)}

Database/chart context:
${stringifyForAiContext(databaseContext, 2600)}

Current map context:
${stringifyForAiContext(mapContext, 1000)}

Frontend execution result:
${stringifyForAiContext(executionResult, 3000)}

Return strict JSON only:
{
  "answer": "short answer in Traditional Chinese",
  "warnings": []
}

Rules:
- Do not recalculate ranking yourself. Use Frontend execution result as authoritative.
- If execution_result.status is "ok", answer from ranked_results/top_result.
- If execution_result.status is not "ok", explain the missing data or permission clearly.
- Do not return ui_actions. The frontend already generated and will execute map actions.`;

export const buildAiSystemPrompt = buildAiAnswerPrompt;
