import { nextTick, ref } from "vue";
import { defineStore } from "pinia";
import http from "../router/axios";
import router from "../router";
import { useDialogStore } from "./dialogStore";
import { useContentStore } from "./contentStore";
import { useMapStore } from "./mapStore";

const defaultChatData = [
	{
		id: 1,
		role: "bot",
		isDefault: true,
		content:
			"你好，我是台北城市儀表板助理。你可以問我想看的城市議題、趨勢或指標，我會先從圖表知識庫找相關元件，再視問題需要請 AI 查詢資料庫後回答。",
	},
];

const MAX_AI_CONTEXT_CHARS = 3500;
const MAX_AI_MAP_CONTEXT_CHARS = 1800;
const MAX_CONTEXT_ARRAY_ITEMS = 8;
const MAX_CONTEXT_STRING_CHARS = 240;
const GUIDE_ONLY_CONTEXT_MODULES = new Set(["pharmacy", "emergency"]);

const truncateText = (value, maxChars = MAX_CONTEXT_STRING_CHARS) => {
	const text = String(value || "");
	return text.length > maxChars
		? `${text.slice(0, maxChars)}...`
		: text;
};

const compactForAiContext = (value, depth = 0) => {
	if (value === null || value === undefined) return value;
	if (typeof value === "string") return truncateText(value);
	if (typeof value !== "object") return value;
	if (depth >= 5) return "[truncated]";
	if (Array.isArray(value)) {
		const items = value
			.slice(0, MAX_CONTEXT_ARRAY_ITEMS)
			.map((item) => compactForAiContext(item, depth + 1));
		if (value.length > MAX_CONTEXT_ARRAY_ITEMS) {
			items.push({
				_truncated_count: value.length - MAX_CONTEXT_ARRAY_ITEMS,
			});
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

const stringifyForAiContext = (value, maxChars = MAX_AI_CONTEXT_CHARS) => {
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
		name: component.name,
		city,
		chart_data: compactForAiContext(response.data),
	};
};

const buildDatabaseContext = async (components) => {
	const targets = (components ?? [])
		.slice(0, 2)
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
	}
	if (hasPharmacyKeyword(question)) {
		const pharmacyTarget = registry.find((target) => target.moduleKey === "pharmacy");
		if (pharmacyTarget) return pharmacyTarget;
	}
	const componentIndexes = new Set(
		(components || [])
			.map((item) => item.index)
			.filter(Boolean),
	);

	if (/(急診|急救|醫院|候診|等待|空位|最少人|最近|er|emergency)/i.test(loweredQuestion)) {
		const emergencyTarget = registry.find((target) => target.moduleKey === "emergency");
		if (emergencyTarget) return emergencyTarget;
	}
	if (/(藥局|藥房|藥妝|pharmacy)/i.test(loweredQuestion)) {
		const pharmacyTarget = registry.find((target) => target.moduleKey === "pharmacy");
		if (pharmacyTarget) return pharmacyTarget;
	}

	const matchesAlias = (target) =>
		(target.moduleKey === "pharmacy" &&
			/(藥局|藥房|pharmacy)/i.test(loweredQuestion)) ||
		(target.moduleKey === "emergency" &&
			/(急診|候診|醫院|等待時間|er|emergency)/i.test(loweredQuestion));
	const explicitTarget = registry.find(matchesAlias);
	if (explicitTarget) return explicitTarget;

	return registry.find((target) => {
		const matchedComponent = (target.componentIndexes || []).some((index) =>
			componentIndexes.has(index),
		);
		const matchedKeyword = (target.keywords || []).some((keyword) =>
			loweredQuestion.includes(String(keyword).toLowerCase()),
		);
		return matchedComponent || matchedKeyword;
	});
};

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

const normalizeGuideNumber = (value, fallback = 0) => {
	if (value === null || value === undefined || value === "") return fallback;
	const num = Number(value);
	return Number.isFinite(num) ? num : fallback;
};

const emergencyStatus = (feature) => {
	const patientCount = normalizeGuideNumber(feature.properties?.patient_count, null);
	const waitingTime = normalizeGuideNumber(feature.properties?.waiting_time, null);
	if (patientCount === null || waitingTime === null) return "unknown";
	if (patientCount >= 6 || waitingTime >= 40) return "critical";
	if (patientCount >= 3 || waitingTime >= 20) return "busy";
	return "ok";
};

const getLocationErrorMessage = (error) => {
	if (!error) return "定位失敗，請確認瀏覽器定位權限。";
	if (error.code === 1) return "定位權限被拒絕，請開啟瀏覽器定位權限後再試一次。";
	if (error.code === 2) return "目前無法取得定位訊號，請稍後再試或提供地點名稱。";
	if (error.code === 3) return "定位逾時，請確認 GPS 或網路定位可用後再試一次。";
	return error.message || "定位失敗，請確認瀏覽器定位權限。";
};

const getUserCoordinate = async ({ prompt = false } = {}) => {
	const mapStore = useMapStore();
	const dialogStore = useDialogStore();
	const {latitude, longitude} = mapStore.userLocation || {};
	const lat = normalizeGuideNumber(latitude, null);
	const lng = normalizeGuideNumber(longitude, null);
	const triggerGeolocate = mapStore.geoLocateControl?.trigger;
	if (prompt && typeof triggerGeolocate === "function") {
		try {
			triggerGeolocate.call(mapStore.geoLocateControl);
		} catch (error) {
			console.warn("[ai-guide] geolocate trigger failed", error);
		}
	}
	if (lat !== null && lng !== null) {
		return [lng, lat];
	}
	if (!navigator.geolocation) {
		dialogStore.showNotification("fail", "此瀏覽器不支援定位，請提供地點或行政區。", 5000);
		return null;
	}
	if (!prompt) return null;
	return new Promise((resolve) => {
		navigator.geolocation.getCurrentPosition(
			(position) => {
				const coordinate = [
					position.coords.longitude,
					position.coords.latitude,
				];
				mapStore.setUserLocation?.({
					latitude: position.coords.latitude,
					longitude: position.coords.longitude,
				});
				resolve(coordinate);
			},
			(error) => {
				dialogStore.showNotification("fail", getLocationErrorMessage(error), 6000);
				resolve(null);
			},
			{
				enableHighAccuracy: true,
				maximumAge: 30000,
				timeout: 8000,
			},
		);
	});
};

const getDistanceMeters = (from, to) => {
	if (!Array.isArray(from) || !Array.isArray(to)) return 999999999;
	const toRad = (value) => (value * Math.PI) / 180;
	const earthRadiusMeters = 6371000;
	const dLat = toRad(to[1] - from[1]);
	const dLng = toRad(to[0] - from[0]);
	const lat1 = toRad(from[1]);
	const lat2 = toRad(to[1]);
	const a =
		Math.sin(dLat / 2) * Math.sin(dLat / 2) +
		Math.cos(lat1) * Math.cos(lat2) *
			Math.sin(dLng / 2) * Math.sin(dLng / 2);
	return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const hasCleanDistanceIntent = (question) =>
	/(最近|附近|離我|離我最近|找最近|找附近|目前位置|我的位置|定位|gps|GPS|near|nearest|nearby|closest)/i.test(String(question || ""));

const shouldSortByDistance = (question) =>
	/(最近|離我|near|nearest|nearby|closest)/i.test(String(question || ""));

const hasDistanceIntent = (question) =>
	/(最近|附近|離我|目前位置|我的位置|定位|gps|GPS|near|nearest|nearby|closest)/i.test(String(question || ""));

const shouldUseDistance = (question) =>
	hasCleanDistanceIntent(question) ||
	/(最近|附近|離我|目前位置|我的位置|定位|gps|near|nearest|nearby|closest)/i.test(String(question || "")) ||
	shouldSortByDistance(question) ||
	hasDistanceIntent(question);

const hasChineseDistanceIntent = (question) =>
	/(\u6700\u8fd1|\u9644\u8fd1|\u96e2\u6211|\u96e2\u6211\u6700\u8fd1|\u627e\u6700\u8fd1|\u627e\u9644\u8fd1|\u76ee\u524d\u4f4d\u7f6e|\u6211\u7684\u4f4d\u7f6e|\u5b9a\u4f4d)/i.test(String(question || ""));

const hasNearestOnlyIntent = (question) =>
	/(\u6700\u8fd1|\u96e2\u6211\u6700\u8fd1|\u627e\u6700\u8fd1|nearest|closest)/i.test(String(question || ""));

const hasEmergencyKeyword = (question) =>
	/(\u6025\u8a3a|\u6025\u6551|\u91ab\u9662|emergency|hospital|\ber\b)/i.test(String(question || ""));

const hasPharmacyKeyword = (question) =>
	/(\u85e5\u5c40|\u85e5\u623f|pharmacy)/i.test(String(question || ""));

const shouldShowUserLocationForGuide = (target) =>
	["emergency", "pharmacy"].includes(target?.moduleKey);

const shouldOpenComponentOnly = (question, target) => {
	const text = String(question || "");
	if (target?.moduleKey !== "emergency") return false;
	if (
		hasPatientCountIntent(text) ||
		hasWaitingTimeIntent(text) ||
		hasDistanceIntent(text) ||
		/(最少|最近|空位|有空|候診|等待|急診)/.test(text)
	) {
		return false;
	}
	const singularAnswerQuestion =
		/(哪間|哪一間|是哪間|哪個|哪一個)/i.test(text) &&
		!/(前\s*\d+|前[一二兩三四五六七八九十]+|哪些|比較|排名|排行)/i.test(text);
	const requiresSpatialMap =
		/(附近|最近|距離|定位|gps|GPS|路線|地圖|圖層|顯示|框線|zoom|放大|標|畫)/i.test(text);
	return singularAnswerQuestion && !requiresSpatialMap;
};

const buildClearGuideOverlayAction = (target) => [
	{
		id: `clear-${target?.moduleKey || "guide"}`,
		type: "map.clear_ai_overlay",
		payload: { scope: "ai-guide" },
	},
];

const detectGuideCityScope = (question, components = [], answer = "") => {
	const text = String(question || "");
	if (/(\u65b0\u5317|\u677f\u6a4b|New\s*Taipei)/i.test(text)) return "NewTaipei";
	if (/(\u53f0\u5317|\u81fa\u5317|Taipei)/i.test(text) && !/(\u65b0\u5317|New\s*Taipei)/i.test(text)) return "Taipei";
	if (/新北|New\s*Taipei/i.test(text)) return "NewTaipei";
	if (/台北市|臺北市|Taipei/i.test(text)) return "Taipei";
	const answerText = String(answer || "");
	if (/(\u65b0\u5317|\u677f\u6a4b|New\s*Taipei)/i.test(answerText)) return "NewTaipei";
	if (/(\u53f0\u5317|\u81fa\u5317|Taipei)/i.test(answerText) && !/(\u65b0\u5317|New\s*Taipei)/i.test(answerText)) return "Taipei";
	if (/新北|New\s*Taipei/i.test(answerText)) return "NewTaipei";
	if (/台北市|臺北市|Taipei/i.test(answerText)) return "Taipei";
	const scopedComponent = (components || []).find((item) =>
		["taipei", "newtaipei"].includes(String(item.city || "").toLowerCase()),
	);
	if (String(scopedComponent?.city || "").toLowerCase() === "newtaipei") {
		return "NewTaipei";
	}
	if (String(scopedComponent?.city || "").toLowerCase() === "taipei") {
		return "Taipei";
	}
	return null;
};

const matchesGuideCityScope = (feature, cityScope) => {
	if (!cityScope) return true;
	const props = feature.properties || {};
	if (cityScope === "NewTaipei" && props.COUNTYCODE === "65000") return true;
	if (cityScope === "Taipei" && props.COUNTYCODE === "63000") return true;
	const haystack = [
		props.city_scope,
		props.city,
		props.PNAME,
		props.COUNTYNAME,
		props.COUNTY,
		props.county,
	].filter(Boolean).join(" ");
	if (cityScope === "NewTaipei") {
		return /NewTaipei|New Taipei|新北|新北市/.test(haystack);
	}
	return /Taipei|台北|臺北/.test(haystack) && !/NewTaipei|New Taipei|新北/.test(haystack);
};

const guideDistrictAliases = [
	{ name: "大安區", aliases: ["大安", "大安區"], townEng: "Da'an District", townCode: "63000030" },
	{ name: "文山區", aliases: ["文山", "文山區"], townEng: "Wenshan District", townCode: "63000080" },
	{ name: "信義區", aliases: ["信義", "信義區"], townEng: "Xinyi District", townCode: "63000020" },
	{ name: "萬華區", aliases: ["萬華", "萬華區"], townEng: "Wanhua District", townCode: "63000070" },
	{ name: "中正區", aliases: ["中正", "中正區"], townEng: "Zhongzheng District", townCode: "63000050" },
	{ name: "松山區", aliases: ["松山", "松山區"], townEng: "Songshan District", townCode: "63000010" },
	{ name: "大同區", aliases: ["大同", "大同區"], townEng: "Datong District", townCode: "63000060" },
	{ name: "中山區", aliases: ["中山", "中山區"], townEng: "Zhongshan District", townCode: "63000040" },
	{ name: "士林區", aliases: ["士林", "士林區"], townEng: "Shilin District", townCode: "63000110" },
	{ name: "北投區", aliases: ["北投", "北投區"], townEng: "Beitou District", townCode: "63000120" },
	{ name: "南港區", aliases: ["南港", "南港區"], townEng: "Nangang District", townCode: "63000090" },
	{ name: "內湖區", aliases: ["內湖", "內湖區"], townEng: "Neihu District", townCode: "63000100" },
	{ name: "板橋區", aliases: ["板橋", "板橋區"], townEng: "Banqiao District", townCode: "65000010" },
	{ name: "三重區", aliases: ["三重", "三重區"], townEng: "Sanchong District", townCode: "65000020" },
	{ name: "中和區", aliases: ["中和", "中和區"], townEng: "Zhonghe District", townCode: "65000030" },
	{ name: "永和區", aliases: ["永和", "永和區"], townEng: "Yonghe District", townCode: "65000040" },
	{ name: "新莊區", aliases: ["新莊", "新莊區"], townEng: "Xinzhuang District", townCode: "65000050" },
	{ name: "新店區", aliases: ["新店", "新店區"], townEng: "Xindian District", townCode: "65000060" },
	{ name: "樹林區", aliases: ["樹林", "樹林區"], townEng: "Shulin District", townCode: "65000070" },
	{ name: "鶯歌區", aliases: ["鶯歌", "鶯歌區"], townEng: "Yingge District", townCode: "65000080" },
	{ name: "三峽區", aliases: ["三峽", "三峽區"], townEng: "Sanxia District", townCode: "65000090" },
	{ name: "淡水區", aliases: ["淡水", "淡水區"], townEng: "Tamsui District", townCode: "65000100" },
	{ name: "汐止區", aliases: ["汐止", "汐止區"], townEng: "Xizhi District", townCode: "65000110" },
	{ name: "瑞芳區", aliases: ["瑞芳", "瑞芳區"], townEng: "Ruifang District", townCode: "65000120" },
	{ name: "土城區", aliases: ["土城", "土城區"], townEng: "Tucheng District", townCode: "65000130" },
	{ name: "蘆洲區", aliases: ["蘆洲", "蘆洲區"], townEng: "Luzhou District", townCode: "65000140" },
	{ name: "五股區", aliases: ["五股", "五股區"], townEng: "Wugu District", townCode: "65000150" },
	{ name: "泰山區", aliases: ["泰山", "泰山區"], townEng: "Taishan District", townCode: "65000160" },
	{ name: "林口區", aliases: ["林口", "林口區"], townEng: "Linkou District", townCode: "65000170" },
	{ name: "深坑區", aliases: ["深坑", "深坑區"], townEng: "Shenkeng District", townCode: "65000180" },
	{ name: "石碇區", aliases: ["石碇", "石碇區"], townEng: "Shiding District", townCode: "65000190" },
	{ name: "坪林區", aliases: ["坪林", "坪林區"], townEng: "Pinglin District", townCode: "65000200" },
	{ name: "三芝區", aliases: ["三芝", "三芝區"], townEng: "Sanzhi District", townCode: "65000210" },
	{ name: "石門區", aliases: ["石門", "石門區"], townEng: "Shimen District", townCode: "65000220" },
	{ name: "八里區", aliases: ["八里", "八里區"], townEng: "Bali District", townCode: "65000230" },
	{ name: "平溪區", aliases: ["平溪", "平溪區"], townEng: "Pingxi District", townCode: "65000240" },
	{ name: "雙溪區", aliases: ["雙溪", "雙溪區"], townEng: "Shuangxi District", townCode: "65000250" },
	{ name: "貢寮區", aliases: ["貢寮", "貢寮區"], townEng: "Gongliao District", townCode: "65000260" },
	{ name: "金山區", aliases: ["金山", "金山區"], townEng: "Jinshan District", townCode: "65000270" },
	{ name: "萬里區", aliases: ["萬里", "萬里區"], townEng: "Wanli District", townCode: "65000280" },
	{ name: "烏來區", aliases: ["烏來", "烏來區"], townEng: "Wulai District", townCode: "65000290" },
];

const cleanGuideDistrictAliases = [
	{ name: "\u677f\u6a4b\u5340", aliases: ["\u677f\u6a4b", "\u677f\u6a4b\u5340", "banqiao", "banqiao district"], coordinates: [121.4590, 25.0096], townEng: "Banqiao District", townCode: "65000010" },
	{ name: "大安區", aliases: ["大安", "大安區"], coordinates: [121.5434, 25.0262] },
	{ name: "文山區", aliases: ["文山", "文山區"], coordinates: [121.5705, 24.9886] },
	{ name: "信義區", aliases: ["信義", "信義區"], coordinates: [121.5668, 25.0330] },
	{ name: "萬華區", aliases: ["萬華", "萬華區"], coordinates: [121.4970, 25.0337] },
	{ name: "中正區", aliases: ["中正", "中正區"], coordinates: [121.5199, 25.0324] },
	{ name: "松山區", aliases: ["松山", "松山區"], coordinates: [121.5576, 25.0497] },
	{ name: "大同區", aliases: ["大同", "大同區"], coordinates: [121.5155, 25.0634] },
	{ name: "中山區", aliases: ["中山", "中山區"], coordinates: [121.5382, 25.0644] },
	{ name: "士林區", aliases: ["士林", "士林區"], coordinates: [121.5246, 25.0950] },
	{ name: "北投區", aliases: ["北投", "北投區"], coordinates: [121.5011, 25.1324] },
	{ name: "南港區", aliases: ["南港", "南港區"], coordinates: [121.6069, 25.0328] },
	{ name: "內湖區", aliases: ["內湖", "內湖區"], coordinates: [121.5889, 25.0689] },
	{ name: "板橋區", aliases: ["板橋", "板橋區"], coordinates: [121.4590, 25.0096] },
	{ name: "三重區", aliases: ["三重", "三重區"], coordinates: [121.4881, 25.0615] },
	{ name: "中和區", aliases: ["中和", "中和區"], coordinates: [121.4980, 24.9994] },
	{ name: "永和區", aliases: ["永和", "永和區"], coordinates: [121.5146, 25.0100] },
	{ name: "新莊區", aliases: ["新莊", "新莊區"], coordinates: [121.4504, 25.0359] },
	{ name: "新店區", aliases: ["新店", "新店區"], coordinates: [121.5415, 24.9676] },
	{ name: "土城區", aliases: ["土城", "土城區"], coordinates: [121.4433, 24.9722] },
	{ name: "蘆洲區", aliases: ["蘆洲", "蘆洲區"], coordinates: [121.4737, 25.0866] },
	{ name: "淡水區", aliases: ["淡水", "淡水區"], coordinates: [121.4434, 25.1695] },
	{ name: "汐止區", aliases: ["汐止", "汐止區"], coordinates: [121.6567, 25.0680] },
];

const guideDistrictByTownEng = guideDistrictAliases.reduce((map, item) => {
	map.set(item.townEng, item.name);
	return map;
}, new Map());

const resolveGuideDistrict = (question) => {
	const text = String(question || "").toLowerCase();
	const cleanMatch = cleanGuideDistrictAliases.find((item) =>
		item.aliases.some((alias) => text.includes(String(alias).toLowerCase())),
	);
	if (cleanMatch) return cleanMatch;
	return guideDistrictAliases.find((item) =>
		item.aliases.some((alias) => text.includes(String(alias).toLowerCase())),
	);
};

const getGuideDistrictName = (props = {}) =>
	props.district ||
	props.TNAME ||
	guideDistrictByTownEng.get(props.TOWNENG) ||
	props.COUNTYNAME ||
	props.TOWNNAME ||
	props.TOWNENG ||
	"候選行政區";

const featureMatchesGuideDistrict = (feature, districtTarget) => {
	if (!districtTarget) return true;
	const props = feature.properties || {};
	return (
		props.TOWNCODE === districtTarget.townCode ||
		props.TOWNENG === districtTarget.townEng ||
		props.district === districtTarget.name ||
		props.TNAME === districtTarget.name
	);
};

const isPharmacyAreaQuestion = (target, question) =>
	target?.moduleKey === "pharmacy" &&
	(
		Boolean(resolveGuideDistrict(question)) ||
		/(哪一區|哪區|行政區|最多|最高|密度|每萬|per_10k|per 10k)/i.test(String(question || ""))
	);

const isWaitingTimeQuestion = (question) =>
	/(等待時間|等候時間|候診時間|最短|較短|比較短|waiting)/i.test(String(question || ""));

const isPatientCountQuestion = (question) =>
	/(候診人數|人數|最少|最低|較少|比較少|patient)/i.test(String(question || ""));

const parseChineseGuideNumber = (value) => {
	const text = String(value || "");
	const numberMap = {
		一: 1,
		二: 2,
		兩: 2,
		三: 3,
		四: 4,
		五: 5,
		六: 6,
		七: 7,
		八: 8,
		九: 9,
		十: 10,
	};
	if (numberMap[text]) return numberMap[text];
	if (text.length === 2 && text[0] === "十" && numberMap[text[1]]) {
		return 10 + numberMap[text[1]];
	}
	if (text.length === 2 && text[1] === "十" && numberMap[text[0]]) {
		return numberMap[text[0]] * 10;
	}
	if (text.length === 3 && text[1] === "十") {
		return numberMap[text[0]] * 10 + numberMap[text[2]];
	}
	return null;
};

const clampGuideLimit = (value) => {
	const limit = Number(value);
	if (!Number.isFinite(limit)) return null;
	return Math.max(1, Math.min(20, Math.round(limit)));
};

const getGuideResultLimit = (question, target) => {
	const text = String(question || "");
	if (hasNearestOnlyIntent(text)) return 1;
	if (hasChineseDistanceIntent(text) && target?.moduleKey === "emergency") return 1;
	if (/(哪一間|哪間|哪家|最少人|人最少|最少|最近|最快|最短|空位|有空)/.test(text)) {
		return 1;
	}
	if (/(哪一間|哪間|哪家|最少人|人最少|最近|最快|最短)/.test(text)) {
		return 1;
	}
	const numericMatch =
		text.match(/(?:前|top\s*)(\d{1,2})/i) ||
		text.match(/(\d{1,2})\s*(?:間|個|處|家|筆)/);
	if (numericMatch) {
		return clampGuideLimit(numericMatch[1]);
	}

	const chineseMatch = text.match(/前\s*([一二兩三四五六七八九十]{1,3})/);
	if (chineseMatch) {
		const parsed = parseChineseGuideNumber(chineseMatch[1]);
		if (parsed) return clampGuideLimit(parsed);
	}

	if (/(哪間|哪一間|哪個|哪一個|標在地圖|標出|最近)/.test(text)) {
		return 1;
	}
	if (target?.moduleKey === "emergency" && /(哪些|比較)/.test(text)) {
		return 5;
	}
	return target?.moduleKey === "pharmacy" ? 20 : 10;
};

const getGuideAreaResultLimit = (question, districtTarget) => {
	if (districtTarget) return 1;
	const text = String(question || "");
	const parsed = getGuideResultLimit(question, { moduleKey: "pharmacy" });
	if (parsed !== 20) return parsed;
	if (/(哪一區|哪區|最多|最高)/.test(text)) return 1;
	return 3;
};

const buildGuideFeature = (feature, rank, target) => {
	const props = feature.properties || {};
	const isEmergency = target.moduleKey === "emergency";
	const isPharmacy = target.moduleKey === "pharmacy";
	const name = isEmergency
		? props.hospital_name
		: props.name || props.hospital_name || `候選點 ${rank}`;
	const id = String(
		isEmergency
			? props.hospital_id
			: props.id || props.pharmacy_id || `${target.moduleKey}_${rank}`,
	);
	const statusLevel = isEmergency ? emergencyStatus(feature) : "ok";
	const tooltipLines = isEmergency
		? [
			`候診人數 ${props.patient_count ?? "未知"}`,
			`等待時間 ${props.waiting_time ?? "未知"}`,
			`資料時間 ${props.data_time ?? "未知"}`,
		]
		: [
			props.address ? `地址 ${props.address}` : "",
			props.telephone ? `電話 ${props.telephone}` : "",
			props.pharmacy_per_10k ? `每萬人藥局數 ${props.pharmacy_per_10k}` : "",
		].filter(Boolean);

	const cardFields = isEmergency
		? [
			{ label: "候診人數", value: String(props.patient_count ?? "未知") },
			{ label: "等待時間", value: String(props.waiting_time ?? "未知") },
			{ label: "資料時間", value: String(props.data_time ?? "未知") },
			{ label: "資料來源", value: String(props.source_trace ?? "官方資料") },
		]
		: [
			{ label: "地址", value: String(props.address ?? "未知") },
			{ label: "電話", value: String(props.telephone ?? "未知") },
			{ label: "行政區", value: String(props.district ?? "未知") },
			{ label: "資料時間", value: String(props.data_time ?? "未知") },
		];

	return {
		type: "Feature",
		geometry: feature.geometry,
		properties: {
			...props,
			module_key: target.moduleKey,
			[isEmergency ? "hospital_id" : isPharmacy ? "pharmacy_id" : "feature_id"]: id,
			rank,
			name,
			status_level: statusLevel,
			tooltip_title: name,
			tooltip_lines: tooltipLines,
			card_title: name,
			card_summary: tooltipLines.join("，"),
			card_fields: cardFields,
		},
	};
};

const sortGuideFeatures = (features, target, question, userCoordinate) => {
	const sorted = [...features].filter((feature) => feature.geometry?.type === "Point");
	if ((shouldUseDistance(question) || hasChineseDistanceIntent(question)) && userCoordinate) {
		sorted.sort(
			(a, b) =>
				getDistanceMeters(userCoordinate, a.geometry.coordinates) -
				getDistanceMeters(userCoordinate, b.geometry.coordinates),
		);
		return sorted;
	}
	if (target.moduleKey === "emergency") {
		sorted.sort((a, b) => {
			const aPatients = normalizeGuideNumber(a.properties?.patient_count, 999999);
			const bPatients = normalizeGuideNumber(b.properties?.patient_count, 999999);
			const aWaitingTime = normalizeGuideNumber(a.properties?.waiting_time, 999999);
			const bWaitingTime = normalizeGuideNumber(b.properties?.waiting_time, 999999);

			if ((hasCleanWaitingTimeIntent(question) || hasWaitingTimeIntent(question) || isWaitingTimeQuestion(question)) && aWaitingTime !== bWaitingTime) {
				return aWaitingTime - bWaitingTime;
			}
			if ((hasCleanPatientCountIntent(question) || hasPatientCountIntent(question) || isPatientCountQuestion(question)) && aPatients !== bPatients) {
				return aPatients - bPatients;
			}
			if (aPatients !== bPatients) return aPatients - bPatients;
			return aWaitingTime - bWaitingTime;
		});
	}
	return sorted;
};

const getFeatureCoordinates = (geometry) => {
	if (!geometry) return [];
	if (geometry.type === "Point") return [geometry.coordinates];
	if (geometry.type === "LineString") return geometry.coordinates;
	if (geometry.type === "Polygon") return geometry.coordinates.flat();
	if (geometry.type === "MultiPolygon") return geometry.coordinates.flat(2);
	return [];
};

const getFeatureBounds = (features) => {
	const coordinates = features.flatMap((feature) =>
		getFeatureCoordinates(feature.geometry),
	);
	const lngs = coordinates.map((coordinate) => coordinate[0]);
	const lats = coordinates.map((coordinate) => coordinate[1]);
	if (lngs.length === 0 || lats.length === 0) return null;
	return [
		[Math.min(...lngs), Math.min(...lats)],
		[Math.max(...lngs), Math.max(...lats)],
	];
};

const getCoordinateBounds = (coordinates) => {
	const validCoordinates = (coordinates || []).filter((coordinate) =>
		Array.isArray(coordinate) &&
		coordinate.length >= 2 &&
		Number.isFinite(Number(coordinate[0])) &&
		Number.isFinite(Number(coordinate[1])),
	);
	if (validCoordinates.length === 0) return null;
	const lngs = validCoordinates.map((coordinate) => Number(coordinate[0]));
	const lats = validCoordinates.map((coordinate) => Number(coordinate[1]));
	return [
		[Math.min(...lngs), Math.min(...lats)],
		[Math.max(...lngs), Math.max(...lats)],
	];
};

const hasWaitingTimeIntent = (question) =>
	/(等待|候診|等候|時間|最快|最短|waiting)/i.test(String(question || ""));

const hasPatientCountIntent = (question) =>
	/(最少人|人最少|空位|有空|候診人數|病人數|人數|patient)/i.test(String(question || ""));

const hasCleanWaitingTimeIntent = (question) =>
	/(等待|候診|等候|時間|最快|最短|waiting)/i.test(String(question || ""));

const hasCleanPatientCountIntent = (question) =>
	/(最少人|人最少|最少|空位|有空|候診人數|病人數|人數|patient)/i.test(String(question || ""));

const getBoundsCenter = (bounds) => [
	(bounds[0][0] + bounds[1][0]) / 2,
	(bounds[0][1] + bounds[1][1]) / 2,
];

// eslint-disable-next-line no-unused-vars
const buildBoundsPolygonFeature = (bounds, paddingRatio = 0.12) => {
	const [[minLng, minLat], [maxLng, maxLat]] = bounds;
	const lngPadding = Math.max((maxLng - minLng) * paddingRatio, 0.003);
	const latPadding = Math.max((maxLat - minLat) * paddingRatio, 0.003);
	const west = minLng - lngPadding;
	const south = minLat - latPadding;
	const east = maxLng + lngPadding;
	const north = maxLat + latPadding;

	return {
		type: "Feature",
		geometry: {
			type: "Polygon",
			coordinates: [[
				[west, south],
				[east, south],
				[east, north],
				[west, north],
				[west, south],
			]],
		},
		properties: {
			name: "候選點搜尋範圍",
			kind: "candidate_bounds",
		},
	};
};

const buildGuideAreaFeature = (feature, rank, target) => {
	const props = feature.properties || {};
	const districtName = getGuideDistrictName(props);
	return {
		type: "Feature",
		geometry: feature.geometry,
		properties: {
			...props,
			module_key: target.moduleKey,
			rank,
			name: districtName,
			card_title: districtName,
			card_summary: `藥局數 ${props.pharmacy_count ?? "未知"}，每萬人藥局數 ${props.pharmacy_per_10k ?? "未知"}`,
			card_fields: [
				{ label: "行政區", value: String(districtName) },
				{ label: "藥局數", value: String(props.pharmacy_count ?? "未知") },
				{ label: "每萬人藥局數", value: String(props.pharmacy_per_10k ?? "未知") },
				{ label: "資料時間", value: String(props.data_time ?? "未知") },
			],
		},
	};
};

const buildStraightRouteAction = (target, fromCoordinate, toFeature) => {
	if (!Array.isArray(fromCoordinate) || !Array.isArray(toFeature?.geometry?.coordinates)) {
		return null;
	}
	const toCoordinate = toFeature.geometry.coordinates;
	const distanceMeters = Math.round(getDistanceMeters(fromCoordinate, toCoordinate));
	return {
		id: `route-${target.moduleKey}-top`,
		type: "map.add_line",
		payload: {
			sourceId: `ai-guide-${target.moduleKey}-route`,
			layerId: `ai-guide-${target.moduleKey}-route-line`,
			geojson: {
				type: "FeatureCollection",
				features: [
					{
						type: "Feature",
						geometry: {
							type: "LineString",
							coordinates: [fromCoordinate, toCoordinate],
						},
						properties: {
							name: "使用者位置到第一順位候選點",
							distance_meters: distanceMeters,
							distance_text:
								distanceMeters >= 1000
									? `${(distanceMeters / 1000).toFixed(1)} km`
									: `${distanceMeters} m`,
						},
					},
				],
			},
		},
	};
};

const buildGuideAreaMapActions = async (target, question, components = [], answer = "", options = {}) => {
	const areaConfig =
		(target.mapConfig || []).find((item) => item.role === "area") ||
		(target.mapConfig || []).find((item) => item.type === "fill");
	if (!areaConfig) return [];

	const response = await fetch(`/mapData/${areaConfig.index}.geojson`);
	const rawGeojson = await response.json();
	await getUserCoordinate({ prompt: Boolean(options.promptLocation) });
	const cityScope = detectGuideCityScope(question, components, answer);
	const districtTarget = resolveGuideDistrict(question) || resolveGuideDistrict(answer);
	const metricKey = /密度|每萬|per_10k|per 10k/i.test(String(question || ""))
		? "pharmacy_per_10k"
		: "pharmacy_count";
	const candidateFeatures = (rawGeojson.features || [])
		.filter((feature) => feature.geometry?.type?.includes("Polygon"))
		.filter((feature) => matchesGuideCityScope(feature, cityScope));
	const districtFeatures = districtTarget
		? candidateFeatures.filter((feature) =>
			featureMatchesGuideDistrict(feature, districtTarget),
		)
		: [];
	const sourceFeatures = districtFeatures.length > 0 ? districtFeatures : candidateFeatures;
	const features = sourceFeatures
		.sort(
			(a, b) =>
				normalizeGuideNumber(b.properties?.[metricKey], -1) -
				normalizeGuideNumber(a.properties?.[metricKey], -1),
		)
		.slice(0, getGuideAreaResultLimit(question, districtTarget))
		.map((feature, index) => buildGuideAreaFeature(feature, index + 1, target));

	if (features.length === 0) return [];

	const bounds = getFeatureBounds(features);
	const top = features[0];
	const topBounds = getFeatureBounds([top]);
	const center = getBoundsCenter(topBounds || bounds);

	return [
		{
			id: `clear-${target.moduleKey}`,
			type: "map.clear_ai_overlay",
			payload: { scope: "ai-guide" },
		},
		{
			id: `add-${target.moduleKey}-area`,
			type: "map.add_polygon",
			payload: {
				sourceId: `ai-guide-${target.moduleKey}-area`,
				layerId: `ai-guide-${target.moduleKey}-area-fill`,
				outlineLayerId: `ai-guide-${target.moduleKey}-area-line`,
				fillColor: "#22c55e",
				fillOpacity: 0.24,
				lineColor: "#ffffff",
				lineWidth: 2,
				geojson: {
					type: "FeatureCollection",
					features,
				},
			},
		},
		{
			id: `fit-${target.moduleKey}-area`,
			type: "map.fit_bounds",
			payload: {
				bounds,
				padding: 80,
				maxZoom: 12,
			},
		},
		{
			id: `open-${target.moduleKey}-area-card`,
			type: "map.open_card",
			payload: {
				coordinate: center,
				title: top.properties.card_title,
				summary: top.properties.card_summary,
				fields: top.properties.card_fields,
			},
		},
	];
};

const buildGuideMapActions = async (target, question, components = [], answer = "", options = {}) => {
	if (isPharmacyAreaQuestion(target, question)) {
		return buildGuideAreaMapActions(target, question, components, answer, options);
	}

	const focusConfig =
		(target.mapConfig || []).find((item) => item.role === "focus") ||
		(target.mapConfig || []).find((item) => item.type === "circle") ||
		(target.mapConfig || [])[0];
	if (!focusConfig) return [];

	const response = await fetch(`/mapData/${focusConfig.index}.geojson`);
	const rawGeojson = await response.json();
	const districtTarget = resolveGuideDistrict(question) || resolveGuideDistrict(answer);
	const districtCoordinate = (hasDistanceIntent(question) || hasChineseDistanceIntent(question)) && Array.isArray(districtTarget?.coordinates)
		? districtTarget.coordinates
		: null;
	const userCoordinate = await getUserCoordinate({
		prompt: Boolean(!districtCoordinate && options.promptLocation && shouldShowUserLocationForGuide(target)),
	});
	const referenceCoordinate = districtCoordinate || userCoordinate;
	const cityScope = detectGuideCityScope(question, components, answer);
	const features = sortGuideFeatures(
		(rawGeojson.features || []).filter((feature) =>
			matchesGuideCityScope(feature, cityScope),
		),
		target,
		question,
		referenceCoordinate,
	)
		.slice(0, getGuideResultLimit(question, target))
		.map((feature, index) => buildGuideFeature(feature, index + 1, target));

	if (features.length === 0) return [];

	const lngs = features.map((feature) => feature.geometry.coordinates[0]);
	const lats = features.map((feature) => feature.geometry.coordinates[1]);
	const top = features[0];
	const topProps = top.properties;
	const sourceId = `ai-guide-${target.moduleKey}`;
	const layerId = `ai-guide-${target.moduleKey}-points`;
	const bounds = [
		[Math.min(...lngs), Math.min(...lats)],
		[Math.max(...lngs), Math.max(...lats)],
	];
	const routeAction = buildStraightRouteAction(target, referenceCoordinate, top);
	const routeBounds = routeAction
		? getCoordinateBounds([referenceCoordinate, top.geometry.coordinates])
		: null;
	const focusAction = routeBounds
		? {
			id: `fit-${target.moduleKey}-route`,
			type: "map.fit_bounds",
			payload: {
				bounds: routeBounds,
				padding: 110,
				maxZoom: target.zoom || 15,
			},
		}
		: features.length === 1
			? {
				id: `fly-${target.moduleKey}-top`,
				type: "map.fly_to",
				payload: {
					center: top.geometry.coordinates,
					zoom: target.zoom || 15,
				},
			}
			: {
				id: `fit-${target.moduleKey}`,
				type: "map.fit_bounds",
				payload: {
					bounds,
					padding: 90,
					maxZoom: target.zoom || 15,
				},
			};

	const actions = [
		{
			id: `clear-${target.moduleKey}`,
			type: "map.clear_ai_overlay",
			payload: { scope: "ai-guide" },
		},
		{
			id: `add-${target.moduleKey}-points`,
			type: "map.add_points",
			payload: {
				sourceId,
				layerId,
				featureIdProperty: target.moduleKey === "emergency" ? "hospital_id" : "pharmacy_id",
				geojson: {
					type: "FeatureCollection",
					features,
				},
			},
		},
		focusAction,
		{
			id: `open-${target.moduleKey}-top-card`,
			type: "map.open_card",
			payload: {
				coordinate: top.geometry.coordinates,
				feature_id: topProps.hospital_id || topProps.pharmacy_id,
				title: topProps.card_title,
				summary: topProps.card_summary,
				fields: topProps.card_fields,
			},
		},
	];
	if (routeAction) {
		actions.splice(2, 0, routeAction);
	}
	return actions;
};

const actionMatchesGuideTarget = (action, target) => {
	if (!target?.moduleKey) return false;
	const marker = `ai-guide-${target.moduleKey}`;
	const values = [
		action?.id,
		action?.payload?.sourceId,
		action?.payload?.layerId,
		action?.payload?.outlineLayerId,
	].filter(Boolean);
	return values.some((value) => String(value).includes(marker) || String(value).includes(target.moduleKey));
};

const extractGuideFeatures = (uiActions = [], target) => {
	const pointAction = uiActions.find((action) =>
		action.type === "map.add_points" && actionMatchesGuideTarget(action, target),
	);
	if (pointAction?.payload?.geojson?.features?.length) {
		return pointAction.payload.geojson.features;
	}

	return uiActions
		.filter((action) =>
			action.type === "map.add_polygon" && actionMatchesGuideTarget(action, target),
		)
		.flatMap((action) => action.payload?.geojson?.features || [])
		.filter((feature) => feature.properties?.kind !== "candidate_bounds");
};

const hasExecutableGuideOverlay = (uiActions = [], target) => {
	return uiActions.some((action) =>
		["map.add_points", "map.add_polygon"].includes(action.type) &&
		action.payload?.geojson?.features?.length &&
		actionMatchesGuideTarget(action, target),
	);
};

const buildGuideAiMapContext = (target, uiActions = [], question = "") => {
	const features = extractGuideFeatures(uiActions, target);
	const top = features[0];
	const props = top?.properties || {};
	const isEmergency = target?.moduleKey === "emergency";
	const coordinate = top?.geometry?.coordinates || null;
	const summarizeFeature = (feature) => {
		const featureProps = feature?.properties || {};
		const isArea = feature?.geometry?.type?.includes("Polygon");
		return {
			rank: featureProps.rank,
			name: featureProps.name || featureProps.hospital_name || featureProps.card_title,
			district: featureProps.district || featureProps.TNAME,
			address: featureProps.address,
			telephone: featureProps.telephone,
			hospital_name: isEmergency ? featureProps.hospital_name : undefined,
			patient_count: featureProps.patient_count,
			waiting_time: featureProps.waiting_time,
			pharmacy_count: featureProps.pharmacy_count,
			pharmacy_per_10k: featureProps.pharmacy_per_10k,
			data_time: featureProps.data_time,
			coordinates: isArea ? undefined : feature?.geometry?.coordinates,
		};
	};
	return {
		has_map_result: features.length > 0,
		question,
		module: target?.moduleKey || null,
		result_count: features.length,
		sort_basis: hasCleanPatientCountIntent(question)
			? "patient_count_ascending"
			: hasCleanWaitingTimeIntent(question)
				? "waiting_time_ascending"
				: shouldUseDistance(question) || hasChineseDistanceIntent(question)
					? "distance_ascending"
					: "default",
		top_result: top
			? {
				name: props.name || props.hospital_name || props.card_title,
				hospital_name: isEmergency ? props.hospital_name || props.name : undefined,
				patient_count: props.patient_count,
				waiting_time: props.waiting_time,
				district: props.district || props.TNAME,
				address: props.address,
				telephone: props.telephone,
				pharmacy_count: props.pharmacy_count,
				pharmacy_per_10k: props.pharmacy_per_10k,
				data_time: props.data_time,
				coordinates: coordinate,
			}
			: null,
		top_results: features.slice(0, 5).map(summarizeFeature),
		instruction:
			"Use map_tool_context as authoritative for location or ranking questions. If has_map_result is true, do not say the data is insufficient for that ranking.",
	};
};

const ensureGuideMapActions = async (
	target,
	uiActions = [],
	question = "",
	components = [],
	answer = "",
	options = {},
) => {
	if (!target?.moduleKey) return [];

	if (["pharmacy", "emergency"].includes(target.moduleKey)) {
		return buildGuideMapActions(target, question, components, answer, options);
	}

	if (hasExecutableGuideOverlay(uiActions, target)) return uiActions;
	return buildGuideMapActions(target, question, components, answer, options);
};

const buildGuideBlocks = (target, uiActions, answer) => {
	const features = extractGuideFeatures(uiActions, target);
	const isEmergency = target?.moduleKey === "emergency";
	const isArea = features.some((feature) =>
		feature.geometry?.type?.includes("Polygon"),
	);
	const topFeatures = features.slice(0, 3);
	const hasData = features.length > 0;
	const minPatients = Math.min(
		...features.map((feature) =>
			normalizeGuideNumber(feature.properties?.patient_count, 999999),
		),
	);
	const maxPharmacyCount = Math.max(
		...features.map((feature) =>
			normalizeGuideNumber(feature.properties?.pharmacy_count, -1),
		),
	);

	return {
		answer,
		topic: target?.moduleKey || "overview",
		component_key: target?.componentIndex,
		data_timestamp:
			features[0]?.properties?.data_time ||
			features[0]?.properties?.last_updated ||
			new Date().toISOString(),
		tool_steps: [
			{
				id: "resolve_component",
				label: `開啟${target?.title || "相關"}地圖組件`,
				status: "done",
			},
			{
				id: "load_map_data",
				label: "讀取地圖點位資料",
				status: hasData ? "done" : "error",
			},
			{
				id: "build_interaction",
				label: "建立地圖互動指令",
				status: uiActions.length > 0 ? "done" : "error",
			},
		],
		insight_cards: hasData
			? [
				{
					id: `${target.moduleKey}_summary`,
					title: `${target.title}摘要`,
					subtitle: target.componentName,
					accent: isEmergency ? "cyan" : "green",
					stats: isEmergency
						? [
							{ label: "候選醫院", value: features.length, unit: "間" },
							{
								label: "最低候診人數",
								value: minPatients === 999999 ? "未知" : minPatients,
								unit: minPatients === 999999 ? "" : "人",
							},
							{
								label: "已開啟圖層",
								value: target.mapConfig?.length || 1,
								unit: "層",
							},
						]
						: [
							{ label: isArea ? "候選行政區" : "候選點位", value: features.length, unit: isArea ? "區" : "處" },
							{
								label: isArea ? "最高藥局數" : "行政區",
								value: isArea
									? (maxPharmacyCount < 0 ? "未知" : maxPharmacyCount)
									: new Set(features.map((feature) => feature.properties?.district).filter(Boolean)).size,
								unit: isArea ? "家" : "區",
							},
							{
								label: "已開啟圖層",
								value: target.mapConfig?.length || 1,
								unit: "層",
							},
						],
				},
			]
			: [],
		mini_charts: isEmergency && hasData
			? [
				{
					id: "er_patient_count_bar",
					title: "候選急診候診人數",
					type: "horizontal_bar",
					unit: "人",
					data: topFeatures.map((feature) => ({
						label: feature.properties?.name || feature.properties?.hospital_name || "候選醫院",
						value: normalizeGuideNumber(feature.properties?.patient_count, 0),
						colorKey: feature.properties?.status_level || "unknown",
					})),
				},
			]
			: [],
		comparison_tables: hasData
			? [
				{
					id: `${target.moduleKey}_compare`,
					title: `${target.title}候選比較`,
					columns: isEmergency
						? ["名稱", "候診人數", "等待時間", "狀態"]
						: isArea
							? ["行政區", "藥局數", "每萬人藥局數", "資料時間"]
							: ["名稱", "行政區", "地址", "電話"],
					rows: topFeatures.map((feature) => {
						const props = feature.properties || {};
						return isEmergency
							? [
								props.name || props.hospital_name || "未知",
								props.patient_count ?? "未知",
								props.waiting_time ?? "未知",
								props.status_level || "unknown",
							]
							: isArea
								? [
									props.name || props.district || "未知",
									props.pharmacy_count ?? "未知",
									props.pharmacy_per_10k ?? "未知",
									props.data_time || "未知",
								]
								: [
									props.name || "未知",
									props.district || "未知",
									props.address || "未知",
									props.telephone || "未知",
								];
					}),
					highlight: [{ rowIndex: 0, reason: "目前排序第一" }],
				},
			]
			: [],
		follow_up_questions: target
			? [
				{
					id: "follow_open_map",
					label: `打開${target.title}地圖`,
					prompt: `請把${target.title}標到地圖上`,
					topic: target.moduleKey,
				},
			]
			: [],
		ui_actions: uiActions,
		interaction_model: {
			target_layer_id: `ai-guide-${target?.moduleKey}-points`,
			feature_id_property: isEmergency ? "hospital_id" : "pharmacy_id",
			hover: { type: "tooltip", template: `${target?.moduleKey}_short` },
			click: { type: "open_card", template: `${target?.moduleKey}_detail` },
		},
		warnings: isEmergency
			? [
				"若有立即危及生命的狀況，請直接撥打 119。",
				"急診等待狀態可能快速變動，請以現場與官方資訊為準。",
			]
			: [],
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

	const askTWCCAI = async (question, components, mapToolContext = null) => {
		const useGuideOnlyContext = GUIDE_ONLY_CONTEXT_MODULES.has(
			mapToolContext?.module,
		);
		const databaseContext = useGuideOnlyContext
			? buildComponentSummaryContext(components)
			: await buildDatabaseContext(components);
		const databaseContextText = stringifyForAiContext(
			databaseContext,
			MAX_AI_CONTEXT_CHARS,
		);
		const mapToolContextText = stringifyForAiContext(
			mapToolContext,
			MAX_AI_MAP_CONTEXT_CHARS,
		);

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
						databaseContextText,
						"",
						"map_tool_context:",
						mapToolContextText,
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
			max_new_tokens: 450,
			temperature: 0.2,
		});

		return response.data?.data;
	};

	const openGuideMapTarget = async (
		target,
		uiActions = [],
		question = "",
		components = [],
		answer = "",
		attempt = 0,
		options = {},
	) => {
		if (!target) return false;
		const mapStore = useMapStore();
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
			}
			return true;
		}

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

	const handleGuideButton = async (chat) => {
		return openGuideMapTarget(
			chat?.guideTarget,
			[],
			chat?.userQuestion || "",
			chat?.relations || [],
			chat?.content || "",
			0,
			{ componentOnly: true },
		);
	};

	const getTodaySessionId = () => {
		return `single_turn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
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

	return {
		chatData,
		recommendComponents,
		addChatData,
		addQueryData,
		saveChatLog,
		handleGuideButton,
	};
});
