const DEFAULT_TAIPEI_CENTER = [121.5654, 25.033];
const PHARMACY_DENSITY_BY_TOWN_INDEX = "hackathon_component_7_pharmacy_density_by_town";

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

const getBoundsPolygon = (bounds) => {
	if (!Array.isArray(bounds) || bounds.length !== 2) return null;
	const [[west, south], [east, north]] = bounds;
	return {
		type: "FeatureCollection",
		features: [
			{
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
					kind: "candidate_bounds",
					name: "候選結果範圍",
				},
			},
		],
	};
};

const getUserCoordinate = async () => {
	if (!navigator?.geolocation) return null;
	return new Promise((resolve) => {
		navigator.geolocation.getCurrentPosition(
			(position) => {
				resolve([position.coords.longitude, position.coords.latitude]);
			},
			() => resolve(null),
			{
				enableHighAccuracy: true,
				maximumAge: 30000,
				timeout: 6000,
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

const isPharmacyQuestion = (question, component) =>
	/藥局|藥房|pharmacy/i.test(`${question || ""} ${component?.name || ""} ${component?.index || ""}`);

const isAreaAggregationQuestion = (question, component) => {
	const text = String(question || "");
	return isPharmacyQuestion(question, component) &&
		/最多|最少|最高|最低|哪個區|哪一區|哪裡|分布|區域|行政區|top|highest|lowest/i.test(text) &&
		!/最近|附近|離我|nearest|nearby|closest/i.test(text);
};

const getAreaMetricValue = (feature, rankingBasis) => {
	const props = feature?.properties || {};
	if (rankingBasis === "area_density") {
		return normalizeNumber(props.pharmacy_per_10k, 0);
	}
	return normalizeNumber(props.pharmacy_count, 0);
};

const getRankingBasis = (question, intent) => {
	const text = String(question || "");
	if (isAreaAggregationQuestion(question)) {
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
		.sort((a, b) => {
			if (rankingBasis === "area_count" || rankingBasis === "area_density") {
				return getAreaMetricValue(b.feature, rankingBasis) -
					getAreaMetricValue(a.feature, rankingBasis);
			}
			if (rankingBasis === "distance") {
				return (a.distanceMeters ?? Number.MAX_SAFE_INTEGER) -
					(b.distanceMeters ?? Number.MAX_SAFE_INTEGER);
			}
			if (rankingBasis === "patient_count") {
				return getPatientCount(a.feature) - getPatientCount(b.feature) ||
					getWaitingTime(a.feature) - getWaitingTime(b.feature);
			}
			if (rankingBasis === "waiting_time") {
				return getWaitingTime(a.feature) - getWaitingTime(b.feature) ||
					getPatientCount(a.feature) - getPatientCount(b.feature);
			}
			return getPatientCount(a.feature) - getPatientCount(b.feature) ||
				getWaitingTime(a.feature) - getWaitingTime(b.feature);
		})
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
	pharmacy_count: item.feature?.properties?.pharmacy_count,
	pharmacy_per_10k: item.feature?.properties?.pharmacy_per_10k,
	district: item.feature?.properties?.district || item.feature?.properties?.TNAME,
	data_time: item.feature?.properties?.data_time || item.feature?.properties?.last_updated,
	properties: item.feature.properties,
});

export const executeAiPlan = async ({ question, intent, component }) => {
	const baseMapConfig = component?.map_config?.find((config) => config?.source === "geojson");
	const areaAggregation = isAreaAggregationQuestion(question, component);
	const areaMapConfig = areaAggregation
		? {
			...(baseMapConfig || {}),
			index: PHARMACY_DENSITY_BY_TOWN_INDEX,
			type: "fill",
			source: "geojson",
			city: baseMapConfig?.city || component?.city || "metrotaipei",
		}
		: null;
	const mapConfig = areaMapConfig || baseMapConfig;
	const resultLimit = normalizeNumber(intent?.resultLimit, 5) || 5;
	const rankingBasis = getRankingBasis(question, intent);
	const needsLocation = Boolean(
		intent?.needsLocation ||
		intent?.rankingMetric === "distance" ||
		rankingBasis === "distance",
	);
	const referenceCoordinate = needsLocation
		? (await getUserCoordinate()) || DEFAULT_TAIPEI_CENTER
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

	const geojson = await fetchLocalGeojson(mapConfig);
	if (!geojson) {
		return {
			executionResult: {
				status: "geojson_unavailable",
				intent_type: intent?.type,
				component_index: component?.index,
				map_index: mapConfig.index,
				notes: ["The map component can still be opened, but no local GeoJSON was loaded for AI overlay."],
			},
			mapActions: [],
		};
	}

	const scopedFeatures = geojson.features.filter((feature) =>
		matchesCityScope(feature, question),
	);
	const candidateFeatures = areaAggregation
		? filterMentionedDistrict(scopedFeatures.length ? scopedFeatures : geojson.features, question)
		: scopedFeatures.length ? scopedFeatures : geojson.features;
	const ranked = rankFeaturesByMetric(
		candidateFeatures,
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
						flyTo: true,
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
				geojson: {
					type: "FeatureCollection",
					features,
				},
			},
		});
	}

	const boundsPolygon = areaAggregation
		? {
			type: "FeatureCollection",
			features: overlayFeatures,
		}
		: getBoundsPolygon(bounds);
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

	if (!areaAggregation && referenceCoordinate && top?.coordinate) {
		mapActions.push({
			id: `line-${mapConfig.index}-to-top`,
			type: "map.add_line",
			payload: {
				sourceId: lineSourceId,
				layerId: lineLayerId,
				geojson: {
					type: "FeatureCollection",
					features: [
						{
							type: "Feature",
							geometry: {
								type: "LineString",
								coordinates: [referenceCoordinate, top.coordinate],
							},
							properties: {
								name: "目前位置到最近結果",
							},
						},
					],
				},
				lineColor: "#f97316",
				lineWidth: 4,
			},
		});
	}

	if (bounds) {
		mapActions.push({
			id: `fit-${mapConfig.index}`,
			type: "map.fit_bounds",
			payload: {
				bounds,
				padding: 90,
				maxZoom: 15,
			},
		});
	}

	if (top?.coordinate) {
		mapActions.push({
			id: `fly-${mapConfig.index}-top`,
			type: "map.fly_to",
			payload: {
				center: top.coordinate,
				zoom: rankingBasis === "distance" ? 15.5 : 14.5,
				duration: 900,
			},
		});
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
					? [
						{ label: "行政區", value: top.feature?.properties?.district || top.feature?.properties?.TNAME },
						{ label: "藥局數", value: top.feature?.properties?.pharmacy_count ?? "未知" },
						{ label: "每萬人藥局數", value: top.feature?.properties?.pharmacy_per_10k ?? "未知" },
						{ label: "資料時間", value: top.feature?.properties?.data_time ?? "未知" },
					]
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
			result_count: features.length,
			top_results: topResults,
			top_result: topResults[0] || null,
		},
		mapActions,
	};
};
