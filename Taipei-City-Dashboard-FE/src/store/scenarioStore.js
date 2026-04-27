import { defineStore } from "pinia";

export const useScenarioStore = defineStore("scenario", {
	state: () => ({
		scenarios: [
			{
				id: "001",
				title: "強颱 + 淡水河氾濫 + 停電",
				hazards: ["颱風", "淹水", "停電"],
				riskLevel: "critical", // critical, high, medium
				focusDistricts: "大安・萬華・板橋",
				affectedPopulation: "820,000",
			},
			{
				id: "002",
				title: "地震 + 火警 + 幹道中斷",
				hazards: ["地震", "火災", "交通"],
				riskLevel: "high",
				focusDistricts: "台北核心 + 跨河走廊",
				affectedPopulation: "120,000",
			},
			{
				id: "003",
				title: "颱風 + 大潮 + 捷運停駛",
				hazards: ["颱風", "潮汐", "交通"],
				riskLevel: "high",
				focusDistricts: "淡水線沿線",
				affectedPopulation: "450,000",
			},
			{
				id: "004",
				title: "颱風後熱浪 + 停水",
				hazards: ["熱浪", "停水"],
				riskLevel: "medium",
				focusDistricts: "雙北全域",
				affectedPopulation: "1,500,000",
			},
			{
				id: "005",
				title: "地震 + 豪雨 + 土石流",
				hazards: ["地震", "土石流"],
				riskLevel: "critical",
				focusDistricts: "新店、烏來、汐止",
				affectedPopulation: "80,000",
			}
		],
		activeScenarioId: null,
		activeCity: 'Taipei',
		briefing: null,
		decisions: [],
		activeDecisionId: null,
		isLoading: false,
		isFallback: true, // MVP uses mock data
		error: null,
		kpi: {
			reports: 0,
			alerts: 0,
			shelterCapacity: "0%"
		}
	}),
	actions: {
		selectScenario(id) {
			this.isLoading = true;
			this.activeScenarioId = id;
			this.activeDecisionId = null;

			// Mock API Delay
			setTimeout(() => {
				if (id === "001") {
					this.briefing = {
						highlights: [
							"淡水河水位超警戒",
							"建議立即關閉中正橋並啟動萬華區疏散",
							"需注意跨河交通副作用"
						]
					};
					this.kpi = { reports: 123, alerts: 5, shelterCapacity: "42%" };
					this.decisions = [
						{
							id: "d001",
							priority: "critical",
							action: "關閉中正橋雙向車道",
							evidence: ["淡水河水位 7.5m（>警戒 7.3m）", "MATSim 壅塞預測 95%"],
							expected_effect: "疏散效率 +23%",
							side_effects: [
								{
									description: "忠孝橋負荷增加 40%",
									map_layer: "side_effect_congestion"
								}
							],
							confidence: 0.82,
							source_trace: ["CWA 水位 API", "MATSim 預跑結果 001", "歷史案例：納莉颱風"]
						},
						{
							id: "d002",
							priority: "high",
							action: "開啟大安區3所備用收容所",
							evidence: ["萬華區收容所即將滿載", "大安區目前空置率 80%"],
							expected_effect: "增加 1500 人收容容量",
							side_effects: [
								{
									description: "周邊聯外道路短暫壅塞",
									map_layer: "side_effect_traffic"
								}
							],
							confidence: 0.90,
							source_trace: ["民政局收容所API", "人口分布推估"]
						}
					];
				} else {
					// Dummy fallback for others
					this.briefing = {
						highlights: ["資料準備中", "等待進一步指示", "請監控感測器"]
					};
					this.kpi = { reports: 42, alerts: 1, shelterCapacity: "80%" };
					this.decisions = [
						{
							id: "d999",
							priority: "medium",
							action: "加強巡邏",
							evidence: ["預報顯示有潛在風險"],
							expected_effect: "提升應變速度",
							side_effects: [],
							confidence: 0.5,
							source_trace: ["氣象局預報"]
						}
					];
				}
				this.isLoading = false;
			}, 800);
		},
		selectDecision(id) {
			if (this.activeDecisionId === id) {
				this.activeDecisionId = null; // toggle off
			} else {
				this.activeDecisionId = id;
			}
		},
		toggleCity() {
			this.activeCity = this.activeCity === 'Taipei' ? 'Metro-Taipei' : 'Taipei';
		},
		compareWith(otherId) {
			console.log("Compare", this.activeScenarioId, "with", otherId);
			// Future feature
		}
	}
});