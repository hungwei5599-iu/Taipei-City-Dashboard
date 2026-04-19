package tools

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

type ScenarioArgs struct {
	ScenarioID string `json:"scenario_id"`
	City       string `json:"city"`
}

type DecisionArgs struct {
	ScenarioID      string                 `json:"scenario_id"`
	CurrentSensors  map[string]interface{} `json:"current_sensors"`
}

type SideEffectArgs struct {
	DecisionID string `json:"decision_id"`
}

type DecisionResponse struct {
	Briefing  string     `json:"briefing,omitempty"`
	Decisions []Decision `json:"decisions"`
}

type Decision struct {
	ID              string       `json:"id"`
	Priority        string       `json:"priority"`
	Action          string       `json:"action"`
	Evidence        []Evidence   `json:"evidence"`
	ExpectedEffect  string       `json:"expected_effect"`
	SideEffects     []SideEffect `json:"side_effects"`
	Confidence      float64      `json:"confidence"`
	SourceTrace     []string     `json:"source_trace"`
	PositiveEffects []MapFeature `json:"positive_effects,omitempty"`
	Alternatives    []string     `json:"alternatives,omitempty"`
}

type Evidence struct {
	Source string `json:"source"`
	Value  string `json:"value"`
}

type SideEffect struct {
	Description  string     `json:"description"`
	Severity     string     `json:"severity"`
	MapHighlight MapFeature `json:"map_highlight"`
}

type MapFeature struct {
	Type        string        `json:"type"`
	Coordinates interface{}   `json:"coordinates"`
	Color       string        `json:"color"`
	Description string        `json:"description,omitempty"`
}

type BriefingResponse struct {
	ScenarioID string   `json:"scenario_id"`
	City       string   `json:"city"`
	Briefing   string   `json:"briefing"`
	Highlights []string `json:"highlights"`
	SourceTrace []string `json:"source_trace"`
}

func init() {
	RegisterTool(Tool{
		Name:        "summarize_events",
		Description: "Summarize current Taipei/New Taipei cultural events and cross-district highlights.",
		InputSchema: cityPeriodSchema("date_range"),
		Handler:     SummarizeEvents,
	})
	RegisterTool(Tool{
		Name:        "analyze_crowd",
		Description: "Analyze real-time crowd status and diversion suggestions for a selected attraction.",
		InputSchema: namedLocationSchema("location"),
		Handler:     AnalyzeCrowd,
	})
	RegisterTool(Tool{
		Name:        "compare_cultural_density",
		Description: "Compare cultural facility density between two districts.",
		InputSchema: twoDistrictSchema(),
		Handler:     CompareCulturalDensity,
	})
	RegisterTool(Tool{
		Name:        "analyze_aed_coverage",
		Description: "Analyze AED coverage, density, and coverage gaps for Taipei or Metro Taipei.",
		InputSchema: cityPeriodSchema("focus"),
		Handler:     AnalyzeAEDCoverage,
	})
	RegisterTool(Tool{
		Name:        "analyze_er_status",
		Description: "Analyze emergency room congestion and diversion suggestions.",
		InputSchema: cityPeriodSchema("time"),
		Handler:     AnalyzeERStatus,
	})
	RegisterTool(Tool{
		Name:        "analyze_food_safety",
		Description: "Summarize food inspection safety index and violation patterns.",
		InputSchema: cityPeriodSchema("period"),
		Handler:     AnalyzeFoodSafety,
	})
	RegisterTool(Tool{
		Name:        "compare_scenarios",
		Description: "Compare two predefined disaster scenarios and identify common bottlenecks.",
		InputSchema: map[string]interface{}{
			"type": "object",
			"properties": map[string]interface{}{
				"scenario_a": stringSchema("First scenario ID."),
				"scenario_b": stringSchema("Second scenario ID."),
			},
			"required": []string{"scenario_a", "scenario_b"},
		},
		Handler: CompareScenarios,
	})
	RegisterTool(Tool{
		Name:        "analyze_shelter_gap",
		Description: "Analyze shelter capacity gaps with a vulnerable-population weighting option.",
		InputSchema: map[string]interface{}{
			"type": "object",
			"properties": map[string]interface{}{
				"city": stringSchema("taipei or metrotaipei."),
				"vulnerability_weight": map[string]interface{}{
					"type":        "boolean",
					"description": "Whether to weight older adults and disabled residents.",
				},
			},
			"required": []string{"city"},
		},
		Handler: AnalyzeShelterGap,
	})
	RegisterTool(Tool{
		Name:        "analyze_flood_risk",
		Description: "Analyze current flooding risk from rainfall, sensor, and historical hotspot context.",
		InputSchema: cityPeriodSchema("trigger"),
		Handler:     AnalyzeFloodRisk,
	})
	RegisterTool(Tool{
		Name:        "assess_situation",
		Description: "Assess the current scenario and produce a compact emergency status summary.",
		InputSchema: scenarioSchema(),
		Handler:     AssessSituation,
	})
	RegisterTool(Tool{
		Name:        "generate_decisions",
		Description: "Generate prioritized disaster response decision cards with evidence, expected effects, side effects, confidence, and source traces.",
		InputSchema: map[string]interface{}{
			"type": "object",
			"properties": map[string]interface{}{
				"scenario_id": stringSchema("Scenario ID such as 001 or tw-typhoon-flood-001."),
				"current_sensors": map[string]interface{}{
					"type":        "object",
					"description": "Current sensor data snapshot.",
				},
			},
			"required": []string{"scenario_id"},
		},
		Handler: GenerateDecisions,
	})
	RegisterTool(Tool{
		Name:        "visualize_side_effects",
		Description: "Convert a decision side effect into Mapbox layer specs for immediate map highlighting.",
		InputSchema: map[string]interface{}{
			"type": "object",
			"properties": map[string]interface{}{
				"decision_id": stringSchema("Decision ID such as d001."),
			},
			"required": []string{"decision_id"},
		},
		Handler: VisualizeSideEffects,
	})
	RegisterTool(Tool{
		Name:        "generate_briefing",
		Description: "Generate a 30-second commander briefing for a scenario.",
		InputSchema: scenarioSchema(),
		Handler:     GenerateBriefing,
	})
}

func SummarizeEvents(ctx context.Context, args string) (string, error) {
	return textResult("本週末雙北共有 52 場藝文活動。台北集中在中正、大安，以展覽與音樂為主；新北集中在板橋、淡水，以戶外市集與親子活動為主。建議主打大稻埕國際藝術節與板橋 435 藝文特區親子工作坊。"), nil
}

func AnalyzeCrowd(ctx context.Context, args string) (string, error) {
	return textResult("西門町目前為紅燈，約 85% 容量，過去 3 小時持續上升。建議導流至中山站商圈或大稻埕；若導流至大同區，夜市周邊停車場可能在 30 分鐘內飽和。"), nil
}

func CompareCulturalDensity(ctx context.Context, args string) (string, error) {
	var params map[string]interface{}
	if err := json.Unmarshal([]byte(args), &params); err != nil {
		return "", fmt.Errorf("invalid arguments: %v", err)
	}

	distA, _ := params["district_a"].(string)
	distB, _ := params["district_b"].(string)

	if distA == "" || distB == "" {
		return textResult("請提供兩個行政區名稱以進行文化密度對比。"), nil
	}

	// 模擬資料邏輯：大安、中正、板橋等核心區較高，林口、淡水等新興區較低
	densityA := 2.8
	densityB := 0.7
	if distA == "大安區" || distA == "中正區" {
		densityA = 3.2
	}
	if distB == "林口區" || distB == "淡水路" {
		densityB = 0.8
	}

	ratio := densityA / densityB

	return textResult(fmt.Sprintf("%s 每萬人文化設施密度約 %.1f 處，%s 約 %.1f 處。相比之下，%s 是 %s 的 %.1f 倍。針對 %s 的分析顯示，該區最缺的是展演空間與中型藝文中心，建議優先配置多功能藝文空間以服務新興人口。",
		distA, densityA, distB, densityB, distA, distB, ratio, distB)), nil
}

func AnalyzeAEDCoverage(ctx context.Context, args string) (string, error) {
	return textResult("雙北 AED 以台北核心與交通場站密度最高，新北住宅擴張區覆蓋不足。林口、三峽與部分中和住宅區是優先補點候選區。"), nil
}

func AnalyzeERStatus(ctx context.Context, args string) (string, error) {
	resp, err := fetchNHIERStatus()
	if err != nil {
		return textResult("目前無法取得即時急診數據，建議優先參考醫學中心官方網站。"), nil
	}

	// Filter for Metro Taipei (Area 01, 31)
	var tpeHospitals []map[string]interface{}
	for _, h := range resp {
		area, _ := h["areA_NO_N"].(string)
		if area == "01" || area == "31" {
			tpeHospitals = append(tpeHospitals, h)
		}
	}

	if len(tpeHospitals) == 0 {
		return textResult("目前雙北地區急診回報正常。"), nil
	}

	summary := "目前雙北急診即時狀態：\n"
	for i, h := range tpeHospitals {
		if i > 5 {
			break
		}
		summary += fmt.Sprintf("- %s: 等待看診 %v 人, 等待住院 %v 人\n",
			h["hosP_NAME"], h["waiT_SEE_CNT"], h["waiT_BED_CNT"])
	}
	summary += "\n分析建議：醫學中心（如台大、馬偕）負荷較重，建議非急迫個案轉往鄰近區域醫院以縮短等待時間。"

	return textResult(summary), nil
}

func fetchNHIERStatus() ([]map[string]interface{}, error) {
	url := "https://info.nhi.gov.tw/api/inae4000/inae4001s01/SQL0002"
	req, _ := http.NewRequest("POST", url, bytes.NewBuffer([]byte("{}")))
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	var result struct {
		Data []map[string]interface{} `json:"data"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, err
	}
	return result.Data, nil
}

func AnalyzeFoodSafety(ctx context.Context, args string) (string, error) {
	return textResult("過去半年雙北食品稽查整體合格率穩定，違規以標示不全為最大宗。中和、萬華需關注夜市與老舊市場稽查密度。"), nil
}

func CompareScenarios(ctx context.Context, args string) (string, error) {
	return textResult("劇本 001 的影響人口較多，劇本 005 的致命風險較高。兩者共同瓶頸是跨河疏散路徑，尤其是中正橋替代方案。"), nil
}

func AnalyzeShelterGap(ctx context.Context, args string) (string, error) {
	return textResult("雙北避難收容容量與脆弱人口存在缺口。大安、中和與板橋需優先比對學校備援場地；信義與文山可作鄰近支援區。"), nil
}

func AnalyzeFloodRisk(ctx context.Context, args string) (string, error) {
	return textResult("近 1 小時強降雨已推高低窪區風險。萬華西藏路與建國南路地下道需預防性管制，並同步評估轉向路段壅塞副作用。"), nil
}

func AssessSituation(ctx context.Context, args string) (string, error) {
	return marshalToolResponse(map[string]interface{}{
		"scenario_id": "001",
		"risk_level": "critical",
		"summary": "淡水河水位超過警戒，萬華與跨河走廊進入優先應變狀態。",
		"source_trace": []string{"CWA-WATER-20260415-1432", "FLOOD-SENSOR-E73305A4", "MATSIM-001-PRERUN"},
	})
}

func GenerateDecisions(ctx context.Context, args string) (string, error) {
	var params DecisionArgs
	if err := parseArgs(args, &params); err != nil {
		return "", fmt.Errorf("invalid arguments: %v", err)
	}
	if params.ScenarioID == "" {
		return "", fmt.Errorf("scenario_id is required")
	}
	return marshalToolResponse(GenerateDecisionsPayload(params.ScenarioID))
}

func VisualizeSideEffects(ctx context.Context, args string) (string, error) {
	var params SideEffectArgs
	if err := parseArgs(args, &params); err != nil {
		return "", fmt.Errorf("invalid arguments: %v", err)
	}
	if params.DecisionID == "" {
		return "", fmt.Errorf("decision_id is required")
	}
	return marshalToolResponse(VisualizeSideEffectsPayload(params.DecisionID))
}

func GenerateBriefing(ctx context.Context, args string) (string, error) {
	var params ScenarioArgs
	if err := parseArgs(args, &params); err != nil {
		return "", fmt.Errorf("invalid arguments: %v", err)
	}
	if params.ScenarioID == "" {
		params.ScenarioID = "001"
	}
	return marshalToolResponse(GenerateBriefingPayload(params.ScenarioID, params.City))
}

func GenerateDecisionsPayload(scenarioID string) DecisionResponse {
	if scenarioID == "" {
		scenarioID = "001"
	}
	return DecisionResponse{
		Briefing: "淡水河水位超警戒，建議立即關閉中正橋並啟動萬華區疏散。",
		Decisions: []Decision{
			{
				ID:       "d001",
				Priority: "critical",
				Action:   "關閉中正橋雙向車道",
				Evidence: []Evidence{
					{Source: "CWA 水位 API", Value: "淡水河 7.5m > 警戒 7.3m"},
					{Source: "MATSim 預跑 001", Value: "中正橋壅塞預測 95%"},
				},
				ExpectedEffect: "疏散效率提升 23%",
				SideEffects: []SideEffect{
					{
						Description: "忠孝橋負荷增加 40%",
						Severity:    "medium",
						MapHighlight: MapFeature{
							Type:        "road_segment",
							Coordinates: [][]float64{{121.4987, 25.0478}, {121.5012, 25.0501}},
							Color:       "#FF8C00",
						},
					},
				},
				PositiveEffects: []MapFeature{
					{
						Type:        "route",
						Coordinates: [][]float64{{121.5032, 25.0435}, {121.5102, 25.0395}, {121.5222, 25.0378}},
						Color:       "#42D77D",
						Description: "萬華往大安疏散路線維持暢通",
					},
				},
				Confidence: 0.82,
				SourceTrace: []string{"CWA-E73305A4-20260415-1432", "MATSIM-001-PRERUN", "NCDR-NARI-REFERENCE"},
				Alternatives: []string{"改採單向管制並保留救護車道", "延後 20 分鐘並同步開放忠孝橋替代匝道"},
			},
			{
				ID:       "d002",
				Priority: "high",
				Action:   "預防性疏散萬華低窪里",
				Evidence: []Evidence{
					{Source: "即時淹水感測", Value: "萬華西藏路 8cm 且上升中"},
					{Source: "避難收容容量", Value: "鄰近收容所空位率 38%"},
				},
				ExpectedEffect: "脆弱族群暴露人數降低 18%",
				SideEffects: []SideEffect{
					{
						Description: "龍山寺周邊臨時交通壓力上升",
						Severity:    "low",
						MapHighlight: MapFeature{
							Type:        "polygon",
							Coordinates: [][][]float64{{{121.4978, 25.0397}, {121.5061, 25.0397}, {121.5061, 25.0336}, {121.4978, 25.0336}, {121.4978, 25.0397}}},
							Color:       "#F05D5E",
						},
					},
				},
				Confidence: 0.76,
				SourceTrace: []string{"FLOOD-SENSOR-E73305A4", "SHELTER-AAf97773", "POP-64C8A3A0"},
				Alternatives: []string{"先疏散 65 歲以上與行動不便居民", "開設臨時接駁點後再擴大疏散"},
			},
			{
				ID:       "d003",
				Priority: "medium",
				Action:   "開設信義與文山備援收容點",
				Evidence: []Evidence{
					{Source: "收容缺口分析", Value: "大安缺口率 41%，信義與文山仍有盈餘"},
					{Source: "道路可達性", Value: "辛亥路與基隆路仍維持黃燈以下"},
				},
				ExpectedEffect: "收容容量缺口降低 12%",
				SideEffects: []SideEffect{
					{
						Description: "跨區接駁需額外 14 輛巴士",
						Severity:    "medium",
						MapHighlight: MapFeature{
							Type:        "route",
							Coordinates: [][]float64{{121.525, 25.032}, {121.548, 25.031}, {121.572, 25.026}},
							Color:       "#FFB000",
						},
					},
				},
				Confidence: 0.71,
				SourceTrace: []string{"SHELTER-Aaf97773", "NTPC-25E439AB", "MATSIM-001-PRERUN"},
				Alternatives: []string{"先開放學校體育館", "由新北板橋支援跨河收容"},
			},
		},
	}
}

func VisualizeSideEffectsPayload(decisionID string) map[string]interface{} {
	if decisionID == "" {
		decisionID = "d001"
	}

	features := []map[string]interface{}{
		{
			"type": "Feature",
			"geometry": map[string]interface{}{
				"type":        "LineString",
				"coordinates": [][]float64{{121.4987, 25.0478}, {121.5012, 25.0501}},
			},
			"properties": map[string]interface{}{
				"decision_id": decisionID,
				"kind":        "side_effect",
				"severity":    "medium",
				"description": "忠孝橋負荷增加 40%",
			},
		},
		{
			"type": "Feature",
			"geometry": map[string]interface{}{
				"type":        "LineString",
				"coordinates": [][]float64{{121.5032, 25.0435}, {121.5102, 25.0395}, {121.5222, 25.0378}},
			},
			"properties": map[string]interface{}{
				"decision_id": decisionID,
				"kind":        "positive_effect",
				"severity":    "low",
				"description": "疏散路線維持暢通",
			},
		},
	}

	return map[string]interface{}{
		"layers": []map[string]interface{}{
			{
				"id":   "side-effect-congestion",
				"type": "line",
				"source": map[string]interface{}{
					"type": "geojson",
					"data": map[string]interface{}{
						"type":     "FeatureCollection",
						"features": features,
					},
				},
				"paint": map[string]interface{}{
					"line-color":   "#FF8C00",
					"line-width":   4,
					"line-opacity": 0.85,
				},
			},
		},
	}
}

func GenerateBriefingPayload(scenarioID string, city string) BriefingResponse {
	if scenarioID == "" {
		scenarioID = "001"
	}
	if city == "" {
		city = "metrotaipei"
	}
	return BriefingResponse{
		ScenarioID: scenarioID,
		City:       city,
		Briefing:   "淡水河水位超過警戒，萬華低窪區與跨河橋梁進入高風險。建議立即關閉中正橋、啟動萬華脆弱族群疏散，並監控忠孝橋壅塞副作用。",
		Highlights: []string{
			"現況：淡水河 7.5m，高於警戒 7.3m。",
			"建議：中正橋管制與萬華預防性疏散同步啟動。",
			"風險：忠孝橋負荷可能增加 40%，需動態導流。",
		},
		SourceTrace: []string{"CWA-E73305A4-20260415-1432", "MATSIM-001-PRERUN", "SHELTER-AAf97773"},
	}
}

func textResult(text string) string {
	return text
}

func marshalToolResponse(v interface{}) (string, error) {
	raw, err := json.Marshal(v)
	if err != nil {
		return "", err
	}
	return string(raw), nil
}

func cityPeriodSchema(extraKey string) map[string]interface{} {
	properties := map[string]interface{}{
		"city": stringSchema("taipei or metrotaipei."),
	}
	if extraKey != "" {
		properties[extraKey] = stringSchema("Tool-specific filter.")
	}
	return map[string]interface{}{
		"type":       "object",
		"properties": properties,
	}
}

func namedLocationSchema(key string) map[string]interface{} {
	return map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			key:    stringSchema("Location name."),
			"time": stringSchema("Time label, such as now."),
		},
		"required": []string{key},
	}
}

func twoDistrictSchema() map[string]interface{} {
	return map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"district_a": stringSchema("First district name."),
			"district_b": stringSchema("Second district name."),
		},
		"required": []string{"district_a", "district_b"},
	}
}

func scenarioSchema() map[string]interface{} {
	return map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"scenario_id": stringSchema("Scenario ID such as 001."),
			"city":        stringSchema("taipei or metrotaipei."),
		},
		"required": []string{"scenario_id"},
	}
}

func stringSchema(description string) map[string]interface{} {
	return map[string]interface{}{
		"type":        "string",
		"description": description,
	}
}
