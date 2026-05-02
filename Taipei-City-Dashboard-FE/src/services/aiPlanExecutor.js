const DEFAULT_TAIPEI_CENTER = [121.5654, 25.033];
const PHARMACY_DENSITY_BY_TOWN_INDEX = "hackathon_component_7_pharmacy_density_by_town";
const TOWN_BOUNDARY_INDEX = "metrotaipei_town";

const getStoredUserCoordinate = () => {
	try {
		const rawStore = window?.localStorage?.getItem("map-user-location");
		if (!rawStore) return null;
		const location = JSON.parse(rawStore);
		const timestamp = Number(location?.timestamp);
		if (!Number.isFinite(timestamp) || Date.now() - timestamp > 30000) return null;
		const longitude = Number(location?.longitude);
		const latitude = Number(location?.latitude);
		if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null;
		return [longitude, latitude];
	} catch {
		return null;
	}
};

const LOCAL_GEOJSON_FALLBACKS = {
	Component2_er_ready: [
		"hackathon_component_9_er_overview",
		"hackathon_component_9_flood_risk_ready",
	],
	hackathon_component_9_er_overview: [
		"hackathon_component_9_er_overview",
		"hackathon_component_9_flood_risk_ready",
	],
	Component3_pharmacy_map_ready: [
		"hackathon_component_7_pharmacy_map_ready",
		"hackathon_component_7_pharmacy_map",
	],
	hackathon_component_7_pharmacy_map_ready: [
		"hackathon_component_7_pharmacy_map_ready",
		"hackathon_component_7_pharmacy_map",
	],
	hackathon_component_7_pharmacy_map: [
		"hackathon_component_7_pharmacy_map",
		"hackathon_component_7_pharmacy_map_ready",
	],
	Component4_water_quality_ready: ["hackathon_component_10_water_quality_ready"],
	hackathon_component_10_water_quality_ready: ["hackathon_component_10_water_quality_ready"],
	Component5_env_protect_restaurant_ready: [
		"hackathon_c11_env_protect_restaurant_ready",
	],
	hackathon_c11_env_protect_restaurant_ready: [
		"hackathon_c11_env_protect_restaurant_ready",
	],
};

const normalizeNumber = (value, fallback = null) => {
	const number = Number(value);
	return Number.isFinite(number) ? number : fallback;
};

const getDistanceMeters = (from, to) => {
	if (!Array.isArray(from) || !Array.isArray(to)) return null;
	const toRad = (value) => (value * Math.PI) / 180;
	const earthRadiusMeters = 6371000;
	const dLat = toRad(to[1] - from[1]);
	const dLng = toRad(to[0] - from[0]);
	const lat1 = toRad(from[1]);
	const lat2 = toRad(to[1]);
	const a =
		Math.sin(dLat / 2) * Math.sin(dLat / 2) +
		Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
	return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const collectCoordinates = (geometry) => {
	if (!geometry) return [];
	if (geometry.type === "Point" && Array.isArray(geometry.coordinates)) {
		return [geometry.coordinates];
	}
	if (geometry.type === "MultiPoint" && Array.isArray(geometry.coordinates)) {
		return geometry.coordinates;
	}
	if (geometry.type === "LineString" && Array.isArray(geometry.coordinates)) {
		return geometry.coordinates;
	}
	if (geometry.type === "MultiLineString" && Array.isArray(geometry.coordinates)) {
		return geometry.coordinates.flat();
	}
	if (geometry.type === "Polygon" && Array.isArray(geometry.coordinates)) {
		return geometry.coordinates.flat();
	}
	if (geometry.type === "MultiPolygon" && Array.isArray(geometry.coordinates)) {
		return geometry.coordinates.flat(2);
	}
	return [];
};

const getCoordinateBounds = (coordinates = []) => {
	const validCoordinates = coordinates.filter((coordinate) =>
		Array.isArray(coordinate) &&
		Number.isFinite(Number(coordinate[0])) &&
		Number.isFinite(Number(coordinate[1])),
	);
	if (!validCoordinates.length) return null;
	const lngs = validCoordinates.map((coordinate) => Number(coordinate[0]));
	const lats = validCoordinates.map((coordinate) => Number(coordinate[1]));
	return [
		[Math.min(...lngs), Math.min(...lats)],
		[Math.max(...lngs), Math.max(...lats)],
	];
};

const formatDistance = (meters) => {
	const value = normalizeNumber(meters, null);
	if (value === null) return null;
	if (value >= 1000) return `${(value / 1000).toFixed(1)} 公里`;
	return `${Math.round(value)} 公尺`;
};

const getFeatureCoordinate = (feature) => {
	const geometry = feature?.geometry;
	if (!geometry) return null;
	if (geometry.type === "Point" && Array.isArray(geometry.coordinates)) {
		return geometry.coordinates;
	}
	const bounds = getCoordinateBounds(collectCoordinates(geometry));
	if (!bounds) return null;
	const [[west, south], [east, north]] = bounds;
	return [(west + east) / 2, (south + north) / 2];
};

const getGeojsonBounds = (features = []) => {
	const coordinates = features
		.flatMap((feature) => collectCoordinates(feature?.geometry))
		.filter(Boolean);
	return getCoordinateBounds(coordinates);
};

const getUserCoordinate = async () => {
	const storedCoordinate = getStoredUserCoordinate();
	if (storedCoordinate) return storedCoordinate;
	if (!navigator?.geolocation) return null;
	return new Promise((resolve) => {
		navigator.geolocation.getCurrentPosition(
			(position) => {
				resolve([position.coords.longitude, position.coords.latitude]);
			},
			() => resolve(null),
			{
				enableHighAccuracy: true,
				maximumAge: 15000,
				timeout: 10000,
			},
		);
	});
};

const fetchLocalGeojson = async (mapConfig) => {
	if (!mapConfig?.index || mapConfig.source !== "geojson") return null;
	const candidates = [
		mapConfig.index,
		...(LOCAL_GEOJSON_FALLBACKS[mapConfig.index] || []),
	].filter(Boolean);

	for (const index of [...new Set(candidates)]) {
		try {
			const response = await fetch(`/mapData/${index}.geojson`);
			if (!response.ok) continue;
			const text = await response.text();
			if (!text || text.trim().startsWith("<!DOCTYPE")) continue;
			const data = JSON.parse(text.replace(/^\uFEFF/, ""));
			if (data?.type === "FeatureCollection" && Array.isArray(data.features)) {
				return data;
			}
		} catch (error) {
			console.warn("[ai-plan] failed to load local geojson", index, error);
		}
	}
	return null;
};

const getFeatureTitle = (feature) => {
	const props = feature?.properties || {};
	return (
		props.name ||
		props.hospital_name ||
		props.pharmacy_name ||
		props.district ||
		props.TNAME ||
		props.town ||
		props.title ||
		props.card_title ||
		"地圖結果"
	);
};

const buildCardFields = (feature, distanceMeters) => {
	const props = feature?.properties || {};
	const fields = [
		["地址", props.address],
		["行政區", props.district || props.TNAME || props.town],
		["電話", props.telephone || props.phone],
		["待診人數", props.patient_count],
		["等待時間", props.waiting_time],
		["資料時間", props.data_time || props.last_updated],
		["距離", formatDistance(distanceMeters)],
	];
	return fields
		.filter(([, value]) => value !== null && value !== undefined && value !== "")
		.map(([label, value]) => ({ label, value }));
};

const getPatientCount = (feature) =>
	normalizeNumber(feature?.properties?.patient_count, Number.MAX_SAFE_INTEGER);

const getWaitingTime = (feature) =>
	normalizeNumber(feature?.properties?.waiting_time, Number.MAX_SAFE_INTEGER);

const getQuestionModule = (question, component, intent) => {
	const text = `${question || ""} ${component?.name || ""} ${component?.index || ""} ${intent?.targetModule || ""}`.toLowerCase();
	if (/藥局|藥房|pharmacy/.test(text)) return "pharmacy";
	if (/急診|急救|醫院|待診|候診|hospital|emergency|(^|[^a-z])er([^a-z]|$)/.test(text)) return "emergency";
	if (/環保餐廳|餐廳|restaurant|env_protect/.test(text)) return "restaurant";
	if (/水質|淨水|飲水|water/.test(text)) return "water";
	return null;
};

const isAreaAggregationQuestion = (question, component, intent) => {
	const text = String(question || "");
	if (/最近|附近|離我|nearest|nearby|closest/i.test(text)) return false;
	if (intent?.rankingMetric === "area_count" || intent?.rankingMetric === "pharmacy_count") return true;
	if (intent?.rankingMetric === "pharmacy_per_10k") return true;
	const module = getQuestionModule(question, component, intent);
	const asksArea = /哪個區|哪一區|行政區|區域|分布|在哪一區/i.test(text);
	if (module === "pharmacy") {
		return /最多|最少|最高|最低|哪個區|哪一區|哪裡|分布|區域|行政區|top|highest|lowest/i.test(text);
	}
	return Boolean(module && asksArea && /最多|最少|最高|最低|top|highest|lowest/i.test(text));
};

const getAreaMetricValue = (feature, rankingBasis) => {
	const props = feature?.properties || {};
	if (rankingBasis === "area_density") {
		return normalizeNumber(props.pharmacy_per_10k, 0);
	}
	return normalizeNumber(
		props.area_count ??
		props.pharmacy_count ??
		props.emergency_count ??
		props.restaurant_count,
		0,
	);
};

const hasPatientCountDemand = (question) =>
	/沒人|無人|人少|最少人|人最少|待診.*少|候診.*少|空位|有空|不用等|patient|waiting\s*count/i.test(String(question || ""));

const asksForZeroPatientResults = (question) =>
	/沒人|無人|0\s*人|零人|不用等/i.test(String(question || ""));

const asksForMultipleResults = (question) =>
	/哪幾間|哪些|哪裡|幾間|列出|前\s*\d+|top\s*\d+/i.test(String(question || ""));

const getRankingBasis = (question, intent, component) => {
	const text = String(question || "");
	if (hasPatientCountDemand(question)) return "patient_count";
	if (intent?.rankingMetric === "distance") return "distance";
	if (intent?.rankingMetric === "patient_count") return "patient_count";
	if (intent?.rankingMetric === "waiting_time") return "waiting_time";
	if (intent?.rankingMetric === "pharmacy_per_10k") return "area_density";
	if (intent?.rankingMetric === "area_count" || intent?.rankingMetric === "pharmacy_count") return "area_count";
	if (isAreaAggregationQuestion(question, component, intent)) {
		if (/密度|每萬|per\s*10k|density/i.test(text)) return "area_density";
		return "area_count";
	}
	if (intent?.rankingMetric === "distance" || /最近|附近|離我|這邊|定位|nearest|nearby|closest/i.test(text)) {
		return "distance";
	}
	if (/最少|最低|人最少|待診|候診|patient|waiting\s*count/i.test(text)) {
		return "patient_count";
	}
	if (/最快|最短|等待|等候|waiting\s*time/i.test(text)) {
		return "waiting_time";
	}
	if (intent?.rankingMetric === "distance" || /最近|附近|離我|這邊|定位|near|nearest|nearby|closest/i.test(text)) {
		return "distance";
	}
	if (/最少人|人最少|待診.*少|候診.*少|空|不用等|patient/i.test(text)) {
		return "patient_count";
	}
	if (/等候.*短|等待.*短|最快|時間.*短|waiting/i.test(text)) {
		return "waiting_time";
	}
	return "default";
};

const isPointInRing = ([lng, lat], ring = []) => {
	let inside = false;
	for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
		const [lngI, latI] = ring[i];
		const [lngJ, latJ] = ring[j];
		const intersects =
			(latI > lat) !== (latJ > lat) &&
			lng < ((lngJ - lngI) * (lat - latI)) / (latJ - latI || Number.EPSILON) + lngI;
		if (intersects) inside = !inside;
	}
	return inside;
};

const isPointInPolygon = (coordinate, polygon = []) => {
	if (!Array.isArray(coordinate) || !polygon.length) return false;
	const [outerRing, ...holes] = polygon;
	if (!isPointInRing(coordinate, outerRing)) return false;
	return !holes.some((ring) => isPointInRing(coordinate, ring));
};

const isPointInFeature = (coordinate, feature) => {
	const geometry = feature?.geometry;
	if (!geometry) return false;
	if (geometry.type === "Polygon") return isPointInPolygon(coordinate, geometry.coordinates);
	if (geometry.type === "MultiPolygon") {
		return geometry.coordinates.some((polygon) => isPointInPolygon(coordinate, polygon));
	}
	return false;
};

const getAreaCountProperty = (module) => {
	if (module === "emergency") return "emergency_count";
	if (module === "restaurant") return "restaurant_count";
	return "area_count";
};

const buildAreaAggregationGeojson = async ({ question, pointGeojson, module }) => {
	const townGeojson = await fetchLocalGeojson({
		index: TOWN_BOUNDARY_INDEX,
		source: "geojson",
	});
	if (!townGeojson?.features?.length) return pointGeojson;

	const points = (pointGeojson?.features || []).filter((feature) =>
		matchesCityScope(feature, question),
	);
	const countProperty = getAreaCountProperty(module);
	const features = townGeojson.features
		.filter((feature) => matchesCityScope(feature, question))
		.map((townFeature) => {
			const count = points.filter((pointFeature) =>
				isPointInFeature(getFeatureCoordinate(pointFeature), townFeature),
			).length;
			return {
				...townFeature,
				properties: {
					...(townFeature.properties || {}),
					name: getFeatureTitle(townFeature),
					area_count: count,
					[countProperty]: count,
				},
			};
		})
		.filter((feature) => feature.properties.area_count > 0);

	return {
		type: "FeatureCollection",
		features,
	};
};

const getFeatureDistrictName = (feature) => {
	const props = feature?.properties || {};
	return props.district || props.TNAME || props.town || props.name || null;
};

const buildDistrictHighlightGeojson = async ({ coordinate, question, preferredDistrict }) => {
	const townGeojson = await fetchLocalGeojson({
		index: TOWN_BOUNDARY_INDEX,
		source: "geojson",
	});
	if (!townGeojson?.features?.length) return null;

	const scopedTowns = townGeojson.features.filter((feature) =>
		matchesCityScope(feature, question),
	);
	const towns = scopedTowns.length ? scopedTowns : townGeojson.features;
	const matchedByName = preferredDistrict
		? towns.find((feature) =>
			String(getFeatureDistrictName(feature) || "") === String(preferredDistrict),
		)
		: null;
	const matchedByCoordinate = coordinate
		? towns.find((feature) => isPointInFeature(coordinate, feature))
		: null;
	const feature = matchedByName || matchedByCoordinate;
	if (!feature) return null;

	return {
		type: "FeatureCollection",
		features: [
			{
				...feature,
				properties: {
					...(feature.properties || {}),
					name: getFeatureTitle(feature),
					kind: "guide_district",
				},
			},
		],
	};
};

// eslint-disable-next-line no-unused-vars
const matchesCityScopeLegacy = (feature, question) => {
	const text = String(question || "");
	const props = feature?.properties || {};
	const haystack = [
		props.city_scope,
		props.city,
		props.PNAME,
		props.COUNTYNAME,
		props.COUNTY,
		props.county,
	].filter(Boolean).join(" ");
	if (/新北|New\s*Taipei/i.test(text)) {
		return props.COUNTYCODE === "65000" || /NewTaipei|New Taipei|新北/.test(haystack);
	}
	if (/台北|臺北|Taipei/i.test(text) && !/新北|New\s*Taipei/i.test(text)) {
		return props.COUNTYCODE === "63000" ||
			(/Taipei|台北|臺北/.test(haystack) && !/NewTaipei|New Taipei|新北/.test(haystack));
	}
	return true;
};

const matchesCityScope = (feature, question) => {
	const text = String(question || "");
	const props = feature?.properties || {};
	const haystack = [
		props.city_scope,
		props.city,
		props.PNAME,
		props.COUNTYNAME,
		props.COUNTY,
		props.county,
	].filter(Boolean).join(" ");

	if (/新北市|新北|New\s*Taipei/i.test(text)) {
		return props.COUNTYCODE === "65000" || /新北市|新北|NewTaipei|New Taipei/i.test(haystack);
	}
	if (/台北市|臺北市|台北|臺北|Taipei/i.test(text) && !/新北市|新北|New\s*Taipei/i.test(text)) {
		return props.COUNTYCODE === "63000" || /台北市|臺北市|台北|臺北|Taipei/i.test(haystack);
	}
	return true;
};

const getRankComparison = (a, b, rankingBasis) => {
	if (rankingBasis === "area_count" || rankingBasis === "area_density") {
		return getAreaMetricValue(b.feature, rankingBasis) -
			getAreaMetricValue(a.feature, rankingBasis);
	}
	if (rankingBasis === "distance") {
		return (a.distanceMeters ?? Number.MAX_SAFE_INTEGER) -
			(b.distanceMeters ?? Number.MAX_SAFE_INTEGER) ||
			getPatientCount(a.feature) - getPatientCount(b.feature) ||
			getWaitingTime(a.feature) - getWaitingTime(b.feature);
	}
	if (rankingBasis === "patient_count") {
		return getPatientCount(a.feature) - getPatientCount(b.feature) ||
			(a.distanceMeters ?? Number.MAX_SAFE_INTEGER) -
				(b.distanceMeters ?? Number.MAX_SAFE_INTEGER) ||
			getWaitingTime(a.feature) - getWaitingTime(b.feature);
	}
	if (rankingBasis === "waiting_time") {
		return getWaitingTime(a.feature) - getWaitingTime(b.feature) ||
			getPatientCount(a.feature) - getPatientCount(b.feature) ||
			(a.distanceMeters ?? Number.MAX_SAFE_INTEGER) -
				(b.distanceMeters ?? Number.MAX_SAFE_INTEGER);
	}
	return getPatientCount(a.feature) - getPatientCount(b.feature) ||
		getWaitingTime(a.feature) - getWaitingTime(b.feature);
};

const rankFeaturesByMetric = (features, rankingBasis, referenceCoordinate, limit) =>
	features
		.map((feature) => {
			const coordinate = getFeatureCoordinate(feature);
			return {
				feature,
				coordinate,
				distanceMeters: getDistanceMeters(referenceCoordinate, coordinate),
			};
		})
		.filter((item) => item.coordinate)
		.sort((a, b) => getRankComparison(a, b, rankingBasis))
		.slice(0, limit);

const filterMentionedDistrict = (features, question) => {
	const text = String(question || "");
	const matched = features.filter((feature) => {
		const props = feature?.properties || {};
		const district = props.district || props.TNAME || props.town;
		return district && text.includes(String(district));
	});
	return matched.length ? matched : features;
};

const summarizeResult = (item) => ({
	name: getFeatureTitle(item.feature),
	coordinates: item.coordinate,
	distance_meters: item.distanceMeters,
	distance_text: formatDistance(item.distanceMeters),
	patient_count: item.feature?.properties?.patient_count,
	waiting_time: item.feature?.properties?.waiting_time,
	area_count: item.feature?.properties?.area_count,
	emergency_count: item.feature?.properties?.emergency_count,
	pharmacy_count: item.feature?.properties?.pharmacy_count,
	pharmacy_per_10k: item.feature?.properties?.pharmacy_per_10k,
	restaurant_count: item.feature?.properties?.restaurant_count,
	district: item.feature?.properties?.district || item.feature?.properties?.TNAME,
	data_time: item.feature?.properties?.data_time || item.feature?.properties?.last_updated,
	properties: item.feature.properties,
});

const buildAreaCardFields = (feature, module) => {
	const props = feature?.properties || {};
	const countLabel = module === "emergency"
		? "急診醫院數"
		: module === "restaurant"
			? "環保餐廳數"
			: "藥局數";
	const countValue = module === "pharmacy"
		? props.pharmacy_count
		: props.area_count;
	const fields = [
		{ label: "行政區", value: props.district || props.TNAME },
		{ label: countLabel, value: countValue ?? "未知" },
	];
	if (module === "pharmacy") {
		fields.push({
			label: "每萬人藥局數",
			value: props.pharmacy_per_10k ?? "未知",
		});
	}
	fields.push({ label: "資料時間", value: props.data_time || props.last_updated || "未知" });
	return fields;
};

export const executeAiPlan = async ({ question, intent, component }) => {
	const baseMapConfig = component?.map_config?.find((config) => config?.source === "geojson");
	const module = getQuestionModule(question, component, intent);
	const areaAggregation = isAreaAggregationQuestion(question, component, intent);
	const areaMapConfig = areaAggregation
		? {
			...(baseMapConfig || {}),
			index: module === "pharmacy" ? PHARMACY_DENSITY_BY_TOWN_INDEX : TOWN_BOUNDARY_INDEX,
			type: "fill",
			source: "geojson",
			city: baseMapConfig?.city || component?.city || "metrotaipei",
		}
		: null;
	const mapConfig = areaMapConfig || baseMapConfig;
	const analysisMapConfig = areaAggregation && module !== "pharmacy"
		? baseMapConfig
		: mapConfig;
	const resultLimit = areaAggregation
		? 1
		: asksForMultipleResults(question)
			? Math.max(normalizeNumber(intent?.resultLimit, 5) || 5, 5)
			: normalizeNumber(intent?.resultLimit, 5) || 5;
	const rankingBasis = getRankingBasis(question, intent, component);
	const needsLocation = Boolean(
		intent?.needsLocation ||
		intent?.rankingMetric === "distance" ||
		rankingBasis === "distance" ||
		/最近|附近|離我|這邊|定位|目前位置|我的位置|gps|near|nearest|nearby|closest/i.test(String(question || "")),
	);
	const userCoordinate = needsLocation ? await getUserCoordinate() : null;
	const referenceCoordinate = needsLocation
		? userCoordinate || DEFAULT_TAIPEI_CENTER
		: null;

	if (!mapConfig) {
		return {
			executionResult: {
				status: "no_map_config",
				intent_type: intent?.type,
				question,
				notes: ["No local geojson map_config was available for this component."],
			},
			mapActions: [],
		};
	}

	const geojson = await fetchLocalGeojson(analysisMapConfig);
	if (!geojson) {
		return {
			executionResult: {
				status: "geojson_unavailable",
				intent_type: intent?.type,
				component_index: component?.index,
				map_index: analysisMapConfig?.index,
				notes: ["The map component can still be opened, but no local GeoJSON was loaded for AI overlay."],
			},
			mapActions: [],
		};
	}

	const analysisGeojson = areaAggregation && module !== "pharmacy"
		? await buildAreaAggregationGeojson({ question, pointGeojson: geojson, module })
		: geojson;
	const scopedFeatures = analysisGeojson.features.filter((feature) =>
		matchesCityScope(feature, question),
	);
	const candidateFeatures = areaAggregation
		? filterMentionedDistrict(scopedFeatures.length ? scopedFeatures : analysisGeojson.features, question)
		: scopedFeatures.length ? scopedFeatures : analysisGeojson.features;
	const zeroPatientFeatures = asksForZeroPatientResults(question)
		? candidateFeatures.filter((feature) => getPatientCount(feature) === 0)
		: [];
	const filteredCandidateFeatures = zeroPatientFeatures.length
		? zeroPatientFeatures
		: candidateFeatures;
	const ranked = rankFeaturesByMetric(
		filteredCandidateFeatures,
		rankingBasis,
		referenceCoordinate,
		resultLimit,
	);
	const features = ranked.map(({ feature, distanceMeters }, index) => ({
		...feature,
		properties: {
			...(feature.properties || {}),
			rank: index + 1,
			distance_meters: distanceMeters,
			distance_text: formatDistance(distanceMeters),
			tooltip_title: getFeatureTitle(feature),
			card_title: getFeatureTitle(feature),
			card_fields: JSON.stringify(buildCardFields(feature, distanceMeters)),
		},
	}));
	const overlayFeatures = areaAggregation ? features.slice(0, 1) : features;
	const bounds = getGeojsonBounds(overlayFeatures);
	const top = ranked[0];
	const highlightCoordinate = needsLocation && userCoordinate
		? userCoordinate
		: top?.coordinate;
	const highlightDistrict = needsLocation && userCoordinate
		? null
		: getFeatureDistrictName(top?.feature);
	const districtPolygon = areaAggregation
		? null
		: await buildDistrictHighlightGeojson({
			coordinate: highlightCoordinate,
			question,
			preferredDistrict: highlightDistrict,
		});
	const districtBounds = districtPolygon
		? getGeojsonBounds(districtPolygon.features)
		: null;
	const routeBounds = userCoordinate && top?.coordinate
		? getCoordinateBounds([userCoordinate, top.coordinate])
		: null;
	const shouldUseStoreLocationForRoute = needsLocation && !userCoordinate && top?.coordinate;
	const fitBounds = routeBounds || districtBounds || bounds;
	const sourceId = `ai-guide-${mapConfig.index}-source`;
	const layerId = `ai-guide-${mapConfig.index}-points`;
	const lineSourceId = `ai-guide-${mapConfig.index}-route-source`;
	const lineLayerId = `ai-guide-${mapConfig.index}-route`;
	const boundsSourceId = `ai-guide-${mapConfig.index}-bounds-source`;
	const boundsLayerId = `ai-guide-${mapConfig.index}-bounds`;
	const mapActions = [
		{
			id: `open-${component?.index || mapConfig.index}`,
			type: "component.open",
			payload: {
				component,
				componentIndex: component?.index,
				componentId: component?.id,
				city: component?.city || mapConfig.city || "metrotaipei",
				mapConfig: areaAggregation ? [mapConfig] : component?.map_config || [],
				title: component?.name,
			},
		},
		...(needsLocation
			? [
				{
					id: "request-user-location",
					type: "map.request_user_location",
					payload: {
						flyTo: false,
						zoom: 14.5,
						duration: 800,
					},
				},
			]
			: []),
		{
			id: `clear-${mapConfig.index}`,
			type: "map.clear_ai_overlay",
			payload: { scope: "ai-guide" },
		},
	];

	if (!areaAggregation) {
		mapActions.push({
			id: `add-${mapConfig.index}-points`,
			type: "map.add_points",
			payload: {
				sourceId,
				layerId,
				renderMode: module === "emergency" ? "symbol" : "circle",
				iconImage: module === "emergency" ? "hospital" : "Pharmacy",
				iconColor: module === "emergency" ? "#facc15" : null,
				textColor: module === "emergency" ? "#111827" : "#ffffff",
				textHaloColor: module === "emergency" ? "#ffffff" : "#0f172a",
				showRankLabel: true,
				geojson: {
					type: "FeatureCollection",
					features,
				},
			},
		});
	}

	const boundsPolygon = districtPolygon || (areaAggregation
		? {
			type: "FeatureCollection",
			features: overlayFeatures,
		}
		: null);
	if (boundsPolygon) {
		mapActions.push({
			id: `area-${mapConfig.index}`,
			type: "map.add_polygon",
			payload: {
				sourceId: boundsSourceId,
				layerId: boundsLayerId,
				outlineLayerId: `${boundsLayerId}-outline`,
				geojson: boundsPolygon,
				fillColor: "#38bdf8",
				fillOpacity: 0.08,
				lineColor: "#38bdf8",
				lineWidth: 2,
			},
		});
	}

	if (!areaAggregation && (userCoordinate || shouldUseStoreLocationForRoute) && top?.coordinate) {
		mapActions.push({
			id: `line-${mapConfig.index}-to-top`,
			type: "map.add_line",
			payload: {
				sourceId: lineSourceId,
				layerId: lineLayerId,
				...(userCoordinate
					? {
						geojson: {
							type: "FeatureCollection",
							features: [
								{
									type: "Feature",
									geometry: {
										type: "LineString",
										coordinates: [userCoordinate, top.coordinate],
									},
									properties: {
										name: "目前位置到最近結果",
									},
								},
							],
						},
					}
					: {
						fromUserLocation: true,
						targetCoordinate: top.coordinate,
						properties: {
							name: "目前位置到最近結果",
						},
					}),
				lineColor: "#f97316",
				lineWidth: 4,
			},
		});
	}

	if (fitBounds) {
		mapActions.push({
			id: `fit-${mapConfig.index}`,
			type: "map.fit_bounds",
			payload: {
				bounds: fitBounds,
				includeUserLocation: shouldUseStoreLocationForRoute,
				targetCoordinate: top?.coordinate,
				padding: 90,
				maxZoom: routeBounds || shouldUseStoreLocationForRoute ? 14.5 : 15,
			},
		});
	}

	if (top?.coordinate) {
		if (!routeBounds && !shouldUseStoreLocationForRoute) {
			mapActions.push({
				id: `fly-${mapConfig.index}-top`,
				type: "map.fly_to",
				payload: {
					center: top.coordinate,
					zoom: rankingBasis === "distance" ? 15.5 : 14.5,
					duration: 900,
				},
			});
		}
		mapActions.push({
			id: `open-${mapConfig.index}-top-card`,
			type: "map.open_card",
			payload: {
				coordinate: top.coordinate,
				title: getFeatureTitle(top.feature),
				summary: rankingBasis === "distance"
					? `距離約 ${formatDistance(top.distanceMeters) || "未知"}`
					: "",
				fields: areaAggregation
					? buildAreaCardFields(top.feature, module)
					: buildCardFields(top.feature, top.distanceMeters),
			},
		});
	}

	const topResults = ranked.map(summarizeResult);

	return {
		executionResult: {
			status: "ready",
			intent_type: intent?.type,
			component_index: component?.index,
			component_name: component?.name,
			map_index: mapConfig.index,
			ranking_basis: rankingBasis,
			reference_point: referenceCoordinate,
			used_location: Boolean(userCoordinate),
			location_failed: needsLocation && !userCoordinate,
			highlighted_district: districtPolygon?.features?.[0]
				? getFeatureTitle(districtPolygon.features[0])
				: null,
			result_count: features.length,
			top_results: topResults,
			top_result: topResults[0] || null,
		},
		mapActions,
	};
};
