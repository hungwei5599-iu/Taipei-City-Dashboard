const DEFAULT_TAIPEI_CENTER = [121.5654, 25.033];

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
	if (geometry.type === "MultiPoint" && Array.isArray(geometry.coordinates?.[0])) {
		return geometry.coordinates[0];
	}
	if (geometry.type === "Polygon" && Array.isArray(geometry.coordinates?.[0]?.[0])) {
		return geometry.coordinates[0][0];
	}
	if (geometry.type === "MultiPolygon" && Array.isArray(geometry.coordinates?.[0]?.[0]?.[0])) {
		return geometry.coordinates[0][0][0];
	}
	return null;
};

const getGeojsonBounds = (features = []) => {
	const coordinates = features.map(getFeatureCoordinate).filter(Boolean);
	if (!coordinates.length) return null;
	const lngs = coordinates.map((coordinate) => coordinate[0]);
	const lats = coordinates.map((coordinate) => coordinate[1]);
	return [
		[Math.min(...lngs), Math.min(...lats)],
		[Math.max(...lngs), Math.max(...lats)],
	];
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

const getRankingBasis = (question, intent) => {
	const text = String(question || "");
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
	if (/新北|New\s*Taipei/i.test(text)) {
		return props.COUNTYCODE === "65000" || /NewTaipei|New Taipei|新北/.test(haystack);
	}
	if (/台北|臺北|Taipei/i.test(text) && !/新北|New\s*Taipei/i.test(text)) {
		return props.COUNTYCODE === "63000" ||
			(/Taipei|台北|臺北/.test(haystack) && !/NewTaipei|New Taipei|新北/.test(haystack));
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

const summarizeResult = (item) => ({
	name: getFeatureTitle(item.feature),
	coordinates: item.coordinate,
	distance_meters: item.distanceMeters,
	distance_text: formatDistance(item.distanceMeters),
	patient_count: item.feature?.properties?.patient_count,
	waiting_time: item.feature?.properties?.waiting_time,
	data_time: item.feature?.properties?.data_time || item.feature?.properties?.last_updated,
	properties: item.feature.properties,
});

export const executeAiPlan = async ({ question, intent, component }) => {
	const mapConfig = component?.map_config?.find((config) => config?.source === "geojson");
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
	const ranked = rankFeaturesByMetric(
		scopedFeatures.length ? scopedFeatures : geojson.features,
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
	const bounds = getGeojsonBounds(features);
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
				mapConfig: component?.map_config || [],
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
		{
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
		},
	];

	const boundsPolygon = getBoundsPolygon(bounds);
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

	if (referenceCoordinate && top?.coordinate) {
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
				fields: buildCardFields(top.feature, top.distanceMeters),
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
