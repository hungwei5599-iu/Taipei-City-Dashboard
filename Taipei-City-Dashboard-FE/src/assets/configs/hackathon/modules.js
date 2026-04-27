import {
	AI_INSIGHT_PROXY_ENDPOINT,
	buildHeatFamilyWorkerModule,
	heatFamilyWorkerFeatures,
} from "./heatFamilyWorker";

export { AI_INSIGHT_PROXY_ENDPOINT, heatFamilyWorkerFeatures };

export const cityOptions = [
	{ value: "taipei", label: "台北" },
	{ value: "metrotaipei", label: "雙北" },
];

export const hackathonModules = [
	buildHeatFamilyWorkerModule(),
	{
		id: 1,
		theme: "SYS.06",
		title: "雙北藝文活動即時地圖",
		shortTitle: "藝文活動",
		icon: "festival",
		lastUpdated: "2026-04-15 14:20",
		defaultCity: "taipei",
		filters: ["今天", "本週末", "音樂", "展覽", "市集"],
		mapKinds: ["event"],
		aiInsight:
			"本週末雙北活動集中在台北中正/大安與新北板橋/淡水。建議以親子活動和戶外市集作跨區導流。",
		chart: {
			type: "bar",
			options: {
				chart: { toolbar: { show: false } },
				colors: ["#4FA3FF", "#F9A03F"],
				plotOptions: { bar: { borderRadius: 4, columnWidth: "48%" } },
				xaxis: { categories: ["中正", "大安", "信義", "板橋", "淡水"] },
				legend: { position: "bottom" },
			},
			series: [
				{ name: "台北", data: [12, 10, 7, 0, 0] },
				{ name: "新北", data: [0, 0, 0, 9, 6] },
			],
		},
	},
	{
		id: 2,
		theme: "SYS.06",
		title: "景點人潮即時燈號",
		shortTitle: "人潮燈號",
		icon: "traffic",
		lastUpdated: "2026-04-15 14:32",
		defaultCity: "taipei",
		filters: ["紅燈", "黃燈", "綠燈", "24hr 趨勢"],
		mapKinds: ["crowd"],
		aiInsight:
			"西門町與信義商圈為紅燈，建議導流至中山站商圈與大稻埕；若導流大同區，停車場需同步監控。",
		chart: {
			type: "radialBar",
			options: {
				chart: { toolbar: { show: false } },
				colors: ["#F05D5E"],
				labels: ["西門町人潮"],
				plotOptions: {
					radialBar: {
						hollow: { size: "58%" },
						dataLabels: { value: { formatter: (value) => `${value}%` } },
					},
				},
			},
			series: [85],
		},
	},
	{
		id: 3,
		theme: "SYS.06",
		title: "雙北文化設施密度比較",
		shortTitle: "文化密度",
		icon: "museum",
		lastUpdated: "2026-04-15 12:00",
		defaultCity: "metrotaipei",
		filters: ["圖書館", "博物館", "展演空間", "電影院"],
		mapKinds: ["culture"],
		aiInsight:
			"大安文化設施密度約為林口 4 倍。林口與三峽缺少展演空間，可優先規劃多功能藝文節點。",
		chart: {
			type: "radar",
			options: {
				chart: { toolbar: { show: false }, dropShadow: { enabled: true, blur: 1, left: 1, top: 1 } },
				colors: ["#59D987", "#F9A03F"],
				stroke: { width: 2 },
				fill: { opacity: 0.1 },
				markers: { size: 4 },
				xaxis: { categories: ["圖書館", "博物館", "展演", "電影院", "社區"] },
				legend: { position: "bottom" },
			},
			series: [
				{ name: "大安", data: [85, 70, 92, 64, 80] },
				{ name: "林口", data: [42, 20, 12, 35, 48] },
			],
		},
	},
	{
		id: 4,
		theme: "SYS.04",
		title: "雙北 AED 急救地圖",
		shortTitle: "AED 地圖",
		icon: "emergency",
		lastUpdated: "2026-04-15 09:00",
		defaultCity: "taipei",
		filters: ["公共機關", "交通場站", "商場", "學校"],
		mapKinds: ["aed"],
		aiInsight:
			"台北核心 AED 密度較高，新北住宅擴張區覆蓋不足。林口、三峽與中和部分住宅區是優先補點區。",
		chart: {
			type: "bar",
			options: {
				chart: { toolbar: { show: false } },
				colors: ["#59D987"],
				plotOptions: { bar: { horizontal: true, borderRadius: 4 } },
				xaxis: { categories: ["中正", "大安", "板橋", "中和", "林口"] },
			},
			series: [{ name: "每萬人 AED", data: [18.2, 16.7, 9.4, 7.8, 4.1] }],
		},
	},
	{
		id: 5,
		theme: "SYS.04",
		title: "雙北急診即時壅塞度",
		shortTitle: "急診壅塞",
		icon: "local_hospital",
		lastUpdated: "2026-04-15 14:35",
		defaultCity: "metrotaipei",
		filters: ["醫學中心", "區域醫院", "紅燈", "黃燈"],
		mapKinds: ["er"],
		aiInsight:
			"台大、馬偕與亞東壅塞偏高。萬華報案可優先評估仁愛院區，但需監控導流後 2 小時容量。",
		chart: {
			type: "heatmap",
			options: {
				chart: { toolbar: { show: false } },
				colors: ["#59D987"],
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
				xaxis: { categories: ["00", "04", "08", "12", "16", "20"] },
			},
			series: [
				{ name: "一", data: [40, 35, 55, 68, 82, 77] },
				{ name: "二", data: [38, 44, 61, 72, 84, 80] },
				{ name: "三", data: [42, 49, 58, 75, 88, 83] },
				{ name: "四", data: [45, 47, 62, 79, 90, 86] },
			],
		},
	},
	{
		id: 6,
		theme: "SYS.04",
		title: "食品稽查安全指數",
		shortTitle: "食安指數",
		icon: "restaurant",
		lastUpdated: "2026-04-15 10:00",
		defaultCity: "metrotaipei",
		filters: ["合格率", "稽查件數", "違規類型"],
		mapKinds: ["food"],
		aiInsight:
			"違規以標示不全為最大宗，非嚴重衛生問題。中和夜市與萬華老舊市場需提高稽查頻率。",
		chart: {
			type: "donut",
			options: {
				chart: { toolbar: { show: false } },
				labels: ["標示不全", "衛生缺失", "過期食品", "其他"],
				colors: ["#4FA3FF", "#F9A03F", "#F05D5E", "#A16EFF"],
				legend: { position: "bottom" },
			},
			series: [47, 28, 9, 16],
		},
	},
	{
		id: 7,
		theme: "SYS.02",
		title: "災難情境劇本選擇器",
		shortTitle: "災害劇本",
		icon: "storm",
		lastUpdated: "2026-04-15 14:10",
		defaultCity: "metrotaipei",
		filters: ["001 強颱淹水", "002 地震火警", "003 颱風大潮"],
		mapKinds: ["scenario", "flood"],
		aiInsight:
			"劇本 001 影響人口最多，跨河橋梁是共同瓶頸。中正橋替代方案是後續決策卡的關鍵。",
		chart: {
			type: "line",
			options: {
				chart: { toolbar: { show: false } },
				colors: ["#F05D5E", "#4FA3FF"],
				stroke: { curve: "smooth", width: 3 },
				xaxis: { categories: ["T-72", "T-24", "T-6", "T", "T+6"] },
				legend: { position: "bottom" },
			},
			series: [
				{ name: "警戒區", data: [2, 4, 7, 11, 9] },
				{ name: "收容需求", data: [8, 18, 34, 55, 49] },
			],
		},
	},
	{
		id: 8,
		theme: "SYS.02",
		title: "避難收容缺口分析",
		shortTitle: "收容缺口",
		icon: "home_work",
		lastUpdated: "2026-04-15 11:45",
		defaultCity: "metrotaipei",
		filters: ["脆弱人口", "容量", "缺口率"],
		mapKinds: ["shelter"],
		aiInsight:
			"大安與中和缺口率最高。若開放學校體育館作備援，可先把大安缺口從 41% 降至 24%。",
		chart: {
			type: "bar",
			options: {
				chart: { toolbar: { show: false } },
				colors: ["#F05D5E", "#59D987"],
				plotOptions: { bar: { borderRadius: 4 } },
				xaxis: { categories: ["大安", "萬華", "板橋", "中和", "文山"] },
				legend: { position: "bottom" },
			},
			series: [
				{ name: "脆弱人口", data: [38, 34, 42, 45, 25] },
				{ name: "收容容量", data: [22, 25, 30, 28, 31] },
			],
		},
	},
	{
		id: 9,
		theme: "SYS.02",
		title: "即時淹水風險監測",
		shortTitle: "淹水監測",
		icon: "flood",
		lastUpdated: "2026-04-15 14:32",
		defaultCity: "taipei",
		filters: ["感測器", "歷史熱區", "雨量站"],
		mapKinds: ["flood"],
		aiInsight:
			"萬華西藏路與建國南路地下道水位上升，建議預防性管制，並同步評估建國高架替代路徑壅塞。",
		chart: {
			type: "line",
			options: {
				chart: { toolbar: { show: false } },
				colors: ["#4FA3FF", "#F9A03F", "#F05D5E"],
				stroke: { curve: "smooth", width: 3 },
				xaxis: { categories: ["09", "10", "11", "12", "13", "14"] },
				legend: { position: "bottom" },
			},
			series: [
				{ name: "西藏路 cm", data: [1, 2, 3, 5, 6, 8] },
				{ name: "建國南路 cm", data: [0, 1, 2, 3, 5, 7] },
				{ name: "淡水河 m", data: [6.6, 6.8, 7.0, 7.2, 7.4, 7.5] },
			],
		},
	},
	{
		id: 10,
		theme: "SYS.02",
		title: "AI 決策卡片（副作用視覺化）",
		shortTitle: "決策卡片",
		icon: "psychology_alt",
		lastUpdated: "2026-04-15 14:35",
		defaultCity: "metrotaipei",
		filters: ["強颱+淹水", "採納", "替代方案"],
		mapKinds: ["flood", "decision"],
		aiInsight:
			"淡水河水位超警戒。建議立即關閉中正橋並啟動萬華區疏散；主要副作用是忠孝橋負荷增加 40%。",
		chart: {
			type: "bar",
			options: {
				chart: { toolbar: { show: false } },
				colors: ["#F05D5E", "#F9A03F", "#59D987"],
				plotOptions: { bar: { borderRadius: 4, distributed: true } },
				xaxis: { categories: ["風險", "副作用", "信心"] },
				legend: { show: false },
			},
			series: [{ name: "決策分數", data: [92, 64, 82] }],
		},
		decisions: [
			{
				id: "d001",
				priority: "critical",
				action: "關閉中正橋雙向車道",
				evidence: "淡水河水位 7.5m > 警戒 7.3m；MATSim 預測中正橋壅塞 95%",
				effect: "疏散效率 +23%",
				sideEffect: "忠孝橋負荷 +40%",
				confidence: 0.82,
				alternative: "改採單向管制並保留救護車道。",
				mapFeatures: [
					lineFeature("side-effect-d001", [[121.4987, 25.0478], [121.5012, 25.0501]], "#FF8C00", "副作用：忠孝橋負荷增加"),
					lineFeature("positive-d001", [[121.5032, 25.0435], [121.5102, 25.0395], [121.5222, 25.0378]], "#42D77D", "正面效果：疏散路線暢通"),
				],
			},
			{
				id: "d002",
				priority: "high",
				action: "預防性疏散萬華低窪里",
				evidence: "萬華西藏路 8cm 且上升中；鄰近收容所空位率 38%",
				effect: "脆弱族群暴露 -18%",
				sideEffect: "龍山寺周邊交通壓力上升",
				confidence: 0.76,
				alternative: "先疏散 65 歲以上與行動不便居民。",
				mapFeatures: [
					polygonFeature("risk-d002", [[[121.4978, 25.0397], [121.5061, 25.0397], [121.5061, 25.0336], [121.4978, 25.0336], [121.4978, 25.0397]]], "#F05D5E", "風險區：萬華低窪里"),
					lineFeature("positive-d002", [[121.501, 25.036], [121.515, 25.035], [121.529, 25.033]], "#42D77D", "疏散接駁方向"),
				],
			},
			{
				id: "d003",
				priority: "medium",
				action: "開設信義與文山備援收容點",
				evidence: "大安缺口率 41%；信義與文山仍有收容盈餘",
				effect: "收容缺口 -12%",
				sideEffect: "需額外 14 輛接駁巴士",
				confidence: 0.71,
				alternative: "先開放學校體育館，再擴大跨區收容。",
				mapFeatures: [
					lineFeature("side-effect-d003", [[121.525, 25.032], [121.548, 25.031], [121.572, 25.026]], "#FFB000", "副作用：跨區接駁需求"),
				],
			},
		],
	},
];

export const demoScript = [
	"平時：從藝文活動與人潮燈號展示生活服務。",
	"健康：切到 AED 與急診，展示救命資源與分流。",
	"災時：選劇本、看淹水與收容缺口。",
	"決策：hover 決策卡，高亮副作用與正面效果。",
];

function lineFeature(id, coordinates, color, description) {
	return {
		type: "Feature",
		geometry: { type: "LineString", coordinates },
		properties: { id, color, description, geometryKind: "line" },
	};
}

function polygonFeature(id, coordinates, color, description) {
	return {
		type: "Feature",
		geometry: { type: "Polygon", coordinates },
		properties: { id, color, description, geometryKind: "fill" },
	};
}
