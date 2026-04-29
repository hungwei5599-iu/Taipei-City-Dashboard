export const HEAT_FAMILY_WORKER_MODULE_ID = 11;
export const AI_INSIGHT_PROXY_ENDPOINT = "/api/v1/ai/chat/twai";
export const APPROVED_DATA_FORMATS = ["two_d", "percent", "three_d", "map_legend", "time"];

export const heatFamilyWorkerDataContracts = [
	{ id: "district-service-supply", format: "two_d" },
	{ id: "service-completeness", format: "percent" },
	{ id: "heat-hour-distribution", format: "three_d" },
	{ id: "cross-city-dependency", format: "two_d" },
	{ id: "alert-timeline", format: "time" },
	{ id: "resource-map", format: "map_legend" },
];

export const heatFamilyWorkerFeatures = [
	pointFeature("cooling-da-an", [121.5434, 25.0262], "大安涼適點群", "taipei", "#59D987", "官方涼適點密集", 78),
	pointFeature("family-restroom-wanhua", [121.5014, 25.0352], "萬華親子友善廁所", "taipei", "#4FA3FF", "尿布臺 + 兒童座椅", 52),
	pointFeature("worker-rest-zhongzheng", [121.5198, 25.0422], "中正戶外工作休息補給", "taipei", "#F9A03F", "飲水 + 座位", 64),
	pointFeature("ntpc-family-banqiao", [121.459, 25.013], "板橋公共親子中心 proxy", "newtaipei", "#A16EFF", "新北親子資源 proxy", 48),
	pointFeature("ntpc-park-sanchong", [121.488, 25.064], "三重公園休息 proxy", "newtaipei", "#A16EFF", "新北公園 proxy", 42),
	polygonFeature(
		"heat-alert-core",
		[[[121.492, 25.056], [121.565, 25.056], [121.565, 25.018], [121.492, 25.018], [121.492, 25.056]]],
		"metrotaipei",
		"#F05D5E",
		"CWA 高溫警示示意區",
		86
	),
	lineFeature(
		"cross-city-family-support",
		[[121.5014, 25.0352], [121.459, 25.013]],
		"metrotaipei",
		"#FFB000",
		"跨市親子補位案例線",
		58
	),
];

export function buildHeatFamilyWorkerModule() {
	return {
		id: HEAT_FAMILY_WORKER_MODULE_ID,
		theme: "SYS.02",
		title: "雙北高溫家庭與戶外工作者安全",
		shortTitle: "高溫安全",
		icon: "device_thermostat",
		lastUpdated: "2026-04-27 17:30",
		defaultCity: "metrotaipei",
		filters: ["CWA 高溫", "親子補給", "戶外工作", "涼適點", "新北 proxy"],
		mapKinds: ["heat", "cooling", "family", "worker"],
		aiTool: "analyze_heat_family_worker",
		aiProxyEndpoint: AI_INSIGHT_PROXY_ENDPOINT,
		aiInsight:
			"雙北高溫治理先看 CWA 警示，再交叉比對涼適點、親子友善廁所、兒童遊戲場與新北 proxy。AI 只做解釋，不取代地圖與圖表證據。",
		dataContracts: heatFamilyWorkerDataContracts,
		charts: [
			{
				id: "district-service-supply",
				title: "區級服務供給",
				type: "bar",
				dataFormat: "two_d",
				options: {
					chart: { toolbar: { show: false } },
					colors: ["#59D987", "#4FA3FF"],
					plotOptions: { bar: { borderRadius: 4 } },
					xaxis: { categories: ["大安", "萬華", "中正", "板橋", "三重"] },
					legend: { position: "bottom" },
				},
				series: [
					{ name: "涼適/親子點", data: [78, 52, 64, 48, 42] },
					{ name: "高溫需求", data: [68, 74, 61, 70, 66] },
				],
			},
			{
				id: "service-completeness",
				title: "服務完備度",
				type: "radialBar",
				dataFormat: "percent",
				options: {
					chart: { toolbar: { show: false } },
					colors: ["#59D987", "#F9A03F", "#F05D5E"],
					labels: ["飲水", "冷氣", "座位"],
					plotOptions: {
						radialBar: {
							hollow: { size: "44%" },
							dataLabels: { value: { formatter: (value) => `${value}%` } },
						},
					},
				},
				series: [84, 76, 63],
			},
			{
				id: "heat-hour-distribution",
				title: "熱壓力時段",
				type: "heatmap",
				dataFormat: "three_d",
				options: {
					chart: { toolbar: { show: false } },
					dataLabels: { enabled: false },
					plotOptions: {
						heatmap: {
							colorScale: {
								ranges: [
									{ from: 0, to: 50, color: "#59D987" },
									{ from: 51, to: 75, color: "#F9A03F" },
									{ from: 76, to: 100, color: "#F05D5E" },
								],
							},
						},
					},
					xaxis: { categories: ["09", "11", "13", "15", "17", "19"] },
				},
				series: [
					{ name: "親子", data: [36, 58, 82, 88, 72, 44] },
					{ name: "戶外工作", data: [44, 69, 91, 95, 80, 52] },
					{ name: "長者照顧", data: [32, 55, 78, 84, 70, 46] },
				],
			},
			{
				id: "cross-city-dependency",
				title: "跨市補位依賴",
				type: "bar",
				dataFormat: "two_d",
				options: {
					chart: { toolbar: { show: false } },
					colors: ["#FFB000"],
					plotOptions: { bar: { horizontal: true, borderRadius: 4 } },
					xaxis: { categories: ["萬華→板橋", "大同→三重", "中正→永和", "文山→新店"] },
				},
				series: [{ name: "依賴度", data: [58, 46, 34, 29] }],
			},
			{
				id: "alert-timeline",
				title: "高溫警示序列",
				type: "line",
				dataFormat: "time",
				options: {
					chart: { toolbar: { show: false } },
					colors: ["#F05D5E", "#4FA3FF"],
					stroke: { curve: "smooth", width: 3 },
					xaxis: { categories: ["D-3", "D-2", "D-1", "D", "D+1"] },
					legend: { position: "bottom" },
				},
				series: [
					{ name: "警示強度", data: [45, 56, 74, 88, 69] },
					{ name: "服務啟動率", data: [28, 42, 61, 76, 72] },
				],
			},
		],
	};
}

export function heatFamilyWorkerComplianceReport(module = buildHeatFamilyWorkerModule()) {
	const charts = module.charts || [module.chart];
	return {
		usesOnlyApexChartTypes: charts.every((chart) =>
			["bar", "radialBar", "heatmap", "line"].includes(chart.type)
		),
		usesOnlyApprovedFormats: module.dataContracts.every((contract) =>
			APPROVED_DATA_FORMATS.includes(contract.format)
		),
		usesGoAIProxy: module.aiProxyEndpoint === AI_INSIGHT_PROXY_ENDPOINT,
		hasMapFeatures: heatFamilyWorkerFeatures.length >= 5,
	};
}

function pointFeature(id, coordinates, name, city, color, status, value) {
	return {
		type: "Feature",
		geometry: { type: "Point", coordinates },
		properties: featureProperties(id, name, city, color, status, value, "point"),
	};
}

function lineFeature(id, coordinates, city, color, status, value) {
	return {
		type: "Feature",
		geometry: { type: "LineString", coordinates },
		properties: featureProperties(id, status, city, color, status, value, "line"),
	};
}

function polygonFeature(id, coordinates, city, color, status, value) {
	return {
		type: "Feature",
		geometry: { type: "Polygon", coordinates },
		properties: featureProperties(id, status, city, color, status, value, "fill"),
	};
}

function featureProperties(id, name, city, color, status, value, geometryKind) {
	return {
		id,
		name,
		city,
		kinds: ["heat", "cooling", "family", "worker"],
		modules: [HEAT_FAMILY_WORKER_MODULE_ID],
		color,
		status,
		value,
		geometryKind,
		source_mode: city === "newtaipei" ? "official_proxy" : "official",
	};
}
