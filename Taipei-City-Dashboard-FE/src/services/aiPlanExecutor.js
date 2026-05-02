import { AI_CAPABILITIES, AI_INTERACTION_TYPES } from "./aiContextService";
import { useMapStore } from "../store/mapStore";

const TAIPEI_DISTRICT_CENTERS = [
	{ name: "板橋區", aliases: ["板橋", "板橋區", "banqiao"], coordinate: [121.459, 25.0096] },
	{ name: "大安區", aliases: ["大安", "大安區"], coordinate: [121.5434, 25.0262] },
	{ name: "信義區", aliases: ["信義", "信義區"], coordinate: [121.5668, 25.033] },
	{ name: "中正區", aliases: ["中正", "中正區"], coordinate: [121.5199, 25.0324] },
	{ name: "中山區", aliases: ["中山", "中山區"], coordinate: [121.5382, 25.0644] },
	{ name: "松山區", aliases: ["松山", "松山區"], coordinate: [121.5576, 25.0497] },
	{ name: "萬華區", aliases: ["萬華", "萬華區"], coordinate: [121.497, 25.0337] },
	{ name: "士林區", aliases: ["士林", "士林區"], coordinate: [121.5246, 25.095] },
	{ name: "北投區", aliases: ["北投", "北投區"], coordinate: [121.5011, 25.1324] },
	{ name: "內湖區", aliases: ["內湖", "內湖區"], coordinate: [121.5889, 25.0689] },
	{ name: "南港區", aliases: ["南港", "南港區"], coordinate: [121.6069, 25.0328] },
	{ name: "文山區", aliases: ["文山", "文山區"], coordinate: [121.5705, 24.9886] },
	{ name: "三重區", aliases: ["三重", "三重區"], coordinate: [121.4881, 25.0615] },
	{ name: "中和區", aliases: ["中和", "中和區"], coordinate: [121.498, 24.9994] },
	{ name: "永和區", aliases: ["永和", "永和區"], coordinate: [121.5146, 25.01] },
	{ name: "新莊區", aliases: ["新莊", "新莊區"], coordinate: [121.4504, 25.0359] },
	{ name: "新店區", aliases: ["新店", "新店區"], coordinate: [121.5415, 24.9676] },
	{ name: "土城區", aliases: ["土城", "土城區"], coordinate: [121.4433, 24.9722] },
	{ name: "蘆洲區", aliases: ["蘆洲", "蘆洲區"], coordinate: [121.4737, 25.0866] },
	{ name: "淡水區", aliases: ["淡水", "淡水區"], coordinate: [121.4434, 25.1695] },
	{ name: "汐止區", aliases: ["汐止", "汐止區"], coordinate: [121.6567, 25.068] },
];

const isFiniteCoordinate = (coordinate) =>
	Array.isArray(coordinate) &&
	coordinate.length >= 2 &&
	Number.isFinite(Number(coordinate[0])) &&
	Number.isFinite(Number(coordinate[1]));

const normalizeCoordinate = (coordinate) =>
	isFiniteCoordinate(coordinate)
		? [Number(coordinate[0]), Number(coordinate[1])]
		: null;

const distanceMeters = (from, to) => {
	const origin = normalizeCoordinate(from);
	const target = normalizeCoordinate(to);
	if (!origin || !target) return null;
	const toRad = (value) => (value * Math.PI) / 180;
	const earthRadiusMeters = 6371000;
	const dLat = toRad(target[1] - origin[1]);
	const dLng = toRad(target[0] - origin[0]);
	const lat1 = toRad(origin[1]);
	const lat2 = toRad(target[1]);
	const a =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
	return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const distanceText = (meters) => {
	if (!Number.isFinite(meters)) return "未知";
	return meters >= 1000
		? `${(meters / 1000).toFixed(1)} 公里`
		: `${Math.round(meters)} 公尺`;
};

const findKnownReferenceLocation = (text) => {
	const normalized = String(text || "").toLowerCase();
	return TAIPEI_DISTRICT_CENTERS.find((item) =>
		item.aliases.some((alias) => normalized.includes(alias.toLowerCase())),
	);
};

const requestBrowserLocation = () =>
	new Promise((resolve) => {
		const mapStore = useMapStore();
		const current = mapStore.userLocation;
		if (
			Number.isFinite(Number(current?.longitude)) &&
			Number.isFinite(Number(current?.latitude))
		) {
			resolve([Number(current.longitude), Number(current.latitude)]);
			return;
		}
		if (mapStore.geoLocateControl?.trigger) {
			try {
				mapStore.geoLocateControl.trigger();
			} catch (error) {
				console.warn("geolocate trigger failed", error);
			}
		}
		if (!navigator.geolocation) {
			resolve(null);
			return;
		}
		navigator.geolocation.getCurrentPosition(
			(position) => {
				const coordinate = [
					position.coords.longitude,
					position.coords.latitude,
				];
				mapStore.setUserLocation({
					longitude: coordinate[0],
					latitude: coordinate[1],
				});
				resolve(coordinate);
			},
			() => resolve(null),
			{ enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 },
		);
	});

const getReferencePoint = async (intent, question) => {
	const knownLocation =
		findKnownReferenceLocation(intent.referenceLocationText) ||
		findKnownReferenceLocation(question);
	if (knownLocation) {
		return {
			coordinate: knownLocation.coordinate,
			label: knownLocation.name,
			source: "known_district_center",
		};
	}
	if (!intent.needsLocation) return null;
	const coordinate = await requestBrowserLocation();
	return coordinate
		? { coordinate, label: "目前位置", source: "browser_gps" }
		: null;
};

const validMapConfigs = (component) =>
	(component?.map_config || []).filter((item) => item && item.index);

const getPrimaryMapConfig = (component) => {
	const configs = validMapConfigs(component);
	return (
		configs.find((item) => ["circle", "symbol"].includes(item.type)) ||
		configs.find((item) => ["fill", "line"].includes(item.type)) ||
		configs[0]
	);
};

const fetchGeojsonForMapConfig = async (mapConfig) => {
	if (!mapConfig?.index) return null;
	if (mapConfig.source === "geojson") {
		const response = await fetch(`/mapData/${mapConfig.index}.geojson`);
		if (!response.ok) return null;
		return response.json();
	}
	const response = await fetch(
		`${location.origin}/geo_server/taipei_vioc/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=taipei_vioc%3A${mapConfig.index}&maxFeatures=1000000&outputFormat=application%2Fjson`,
	);
	if (!response.ok) return null;
	return response.json();
};

const getFeatureCoordinate = (feature) => {
	if (feature?.geometry?.type === "Point") {
		return normalizeCoordinate(feature.geometry.coordinates);
	}
	return null;
};

const getFeatureName = (props = {}) =>
	props.name ||
	props.hospital_name ||
	props.pharmacy_name ||
	props.station_name ||
	props.sna ||
	props.title ||
	props.card_title ||
	"候選點位";

const getFeatureId = (feature, index) => {
	const props = feature?.properties || {};
	return (
		props.id ||
		props.hospital_id ||
		props.pharmacy_id ||
		props.station_id ||
		props.uid ||
		`${getFeatureName(props)}-${index}`
	);
};

const metricValue = (feature, metric) => {
	const props = feature?.properties || {};
	if (metric === "waiting_time") return Number(props.waiting_time);
	if (metric === "patient_count") return Number(props.patient_count);
	if (metric === "available_beds") return Number(props.emergency_available_beds);
	return null;
};

const summarizeFeature = (feature, index, referencePoint) => {
	const props = feature.properties || {};
	const coordinate = getFeatureCoordinate(feature);
	const meters = referencePoint?.coordinate
		? distanceMeters(referencePoint.coordinate, coordinate)
		: null;
	return {
		rank: index + 1,
		feature_id: getFeatureId(feature, index),
		name: getFeatureName(props),
		coordinate,
		distance_meters: Number.isFinite(meters) ? Math.round(meters) : null,
		distance_text: distanceText(meters),
		properties: {
			district: props.district || props.TNAME || props.town || props.area,
			address: props.address,
			telephone: props.telephone || props.phone,
			patient_count: props.patient_count,
			waiting_time: props.waiting_time,
			data_time: props.data_time || props.last_updated,
		},
	};
};

const getBoundsFromCoordinates = (coordinates) => {
	const validCoordinates = coordinates.filter(Boolean);
	if (!validCoordinates.length) return null;
	const lngs = validCoordinates.map((coordinate) => coordinate[0]);
	const lats = validCoordinates.map((coordinate) => coordinate[1]);
	return [
		[Math.min(...lngs), Math.min(...lats)],
		[Math.max(...lngs), Math.max(...lats)],
	];
};

const buildLineActions = (intent, referencePoint, topResult) => {
	if (
		!intent.requiredCapabilities?.includes(AI_CAPABILITIES.MAP_LINE) ||
		!referencePoint?.coordinate ||
		!topResult?.coordinate
	) {
		return [];
	}
	const bounds = getBoundsFromCoordinates([
		referencePoint.coordinate,
		topResult.coordinate,
	]);
	return [
		{
			id: "clear-ai-route",
			type: "map.clear_ai_overlay",
			payload: { scope: "ai-guide" },
		},
		{
			id: "add-ai-route-line",
			type: "map.add_line",
			payload: {
				sourceId: "ai-guide-route",
				layerId: "ai-guide-route-line",
				geojson: {
					type: "FeatureCollection",
					features: [
						{
							type: "Feature",
							geometry: {
								type: "LineString",
								coordinates: [
									referencePoint.coordinate,
									topResult.coordinate,
								],
							},
							properties: {
								name: `${referencePoint.label} 到 ${topResult.name}`,
								distance_meters: topResult.distance_meters,
								distance_text: topResult.distance_text,
							},
						},
					],
				},
			},
		},
		...(bounds
			? [
				{
					id: "fit-ai-route-line",
					type: "map.fit_bounds",
					payload: {
						bounds,
						padding: 110,
						maxZoom: 15,
					},
				},
			]
			: []),
	];
};

const buildFitOnlyActions = (intent, rankedResults) => {
	if (!intent.requiredCapabilities?.includes(AI_CAPABILITIES.FIT_BOUNDS)) {
		return [];
	}
	const bounds = getBoundsFromCoordinates(
		rankedResults.map((item) => item.coordinate),
	);
	return bounds
		? [
			{
				id: "fit-ai-results",
				type: "map.fit_bounds",
				payload: { bounds, padding: 90, maxZoom: 15 },
			},
		]
		: [];
};

export const executeAiPlan = async ({ question, intent, component }) => {
	const mapConfig = getPrimaryMapConfig(component);
	const referencePoint = await getReferencePoint(intent, question);
	const executionResult = {
		status: "ok",
		intent_type: intent.type,
		component: component
			? {
				id: component.id,
				index: component.index,
				name: component.name,
				city: component.city,
			}
			: null,
		reference_point: referencePoint,
		ranked_results: [],
		top_result: null,
		notes: [],
	};

	if (!component) {
		return {
			executionResult: {
				...executionResult,
				status: "no_component",
				notes: ["找不到可對應的儀表板組件。"],
			},
			mapActions: [],
		};
	}

	if (intent.type === AI_INTERACTION_TYPES.OPEN_MAP_COMPONENT) {
		return {
			executionResult: {
				...executionResult,
				notes: ["已交由前端開啟既有地圖組件。"],
			},
			mapActions: [],
		};
	}

	if (!mapConfig) {
		return {
			executionResult: {
				...executionResult,
				status: "no_map_config",
				notes: ["此組件沒有可讀取的地圖設定。"],
			},
			mapActions: [],
		};
	}

	let geojson = null;
	try {
		geojson = await fetchGeojsonForMapConfig(mapConfig);
	} catch (error) {
		return {
			executionResult: {
				...executionResult,
				status: "data_error",
				notes: [`讀取地圖資料失敗：${error.message}`],
			},
			mapActions: [],
		};
	}

	const pointFeatures = (geojson?.features || []).filter(getFeatureCoordinate);
	if (!pointFeatures.length) {
		return {
			executionResult: {
				...executionResult,
				status: "no_point_features",
				notes: ["地圖資料沒有可排序的點位座標。"],
			},
			mapActions: [],
		};
	}

	const rankingMetric = intent.rankingMetric || "default";
	const sortedFeatures = [...pointFeatures].sort((a, b) => {
		if (referencePoint?.coordinate || rankingMetric === "distance") {
			return (
				distanceMeters(referencePoint?.coordinate, getFeatureCoordinate(a)) -
				distanceMeters(referencePoint?.coordinate, getFeatureCoordinate(b))
			);
		}
		const aMetric = metricValue(a, rankingMetric);
		const bMetric = metricValue(b, rankingMetric);
		if (Number.isFinite(aMetric) && Number.isFinite(bMetric)) {
			return aMetric - bMetric;
		}
		return 0;
	});

	const rankedResults = sortedFeatures
		.slice(0, intent.resultLimit || 5)
		.map((feature, index) =>
			summarizeFeature(feature, index, referencePoint),
		);
	const topResult = rankedResults[0] || null;
	const mapActions = [
		...buildLineActions(intent, referencePoint, topResult),
		...(intent.type !== AI_INTERACTION_TYPES.NEARBY_LOOKUP
			? buildFitOnlyActions(intent, rankedResults)
			: []),
	];

	return {
		executionResult: {
			...executionResult,
			map_data: {
				index: mapConfig.index,
				source: mapConfig.source,
				type: mapConfig.type,
				total_point_features: pointFeatures.length,
			},
			ranking_metric: referencePoint?.coordinate ? "distance" : rankingMetric,
			ranked_results: rankedResults,
			top_result: topResult,
			notes:
				intent.needsLocation && !referencePoint
					? ["需要定位或可辨識地點才能計算最近距離。"]
					: [],
			status:
				intent.needsLocation && !referencePoint ? "missing_location" : "ok",
		},
		mapActions:
			intent.needsLocation && !referencePoint ? [] : mapActions,
	};
};
