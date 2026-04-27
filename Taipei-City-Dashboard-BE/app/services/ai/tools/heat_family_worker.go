package tools

import (
	"context"
	"fmt"
)

type HeatFamilyWorkerArgs struct {
	City  string `json:"city"`
	Focus string `json:"focus"`
}

type HeatFamilyWorkerResponse struct {
	City           string                    `json:"city"`
	Focus          string                    `json:"focus"`
	Summary        string                    `json:"summary"`
	DataFormats    []string                  `json:"data_formats"`
	MapLayers      []HeatFamilyWorkerMapLayer `json:"map_layers"`
	ChartContracts []HeatFamilyWorkerChart   `json:"chart_contracts"`
	AIBoundary     HeatFamilyWorkerAIBoundary `json:"ai_boundary"`
	SourceTrace    []string                  `json:"source_trace"`
}

type HeatFamilyWorkerMapLayer struct {
	ID         string `json:"id"`
	Format     string `json:"format"`
	SourceMode string `json:"source_mode"`
	Description string `json:"description"`
}

type HeatFamilyWorkerChart struct {
	ID     string `json:"id"`
	Type   string `json:"type"`
	Format string `json:"format"`
	Purpose string `json:"purpose"`
}

type HeatFamilyWorkerAIBoundary struct {
	Model         string `json:"model"`
	ProxyEndpoint string `json:"proxy_endpoint"`
	Role          string `json:"role"`
}

func init() {
	RegisterTool(Tool{
		Name:        "analyze_heat_family_worker",
		Description: "Analyze Metro Taipei high-temperature safety gaps for families and outdoor workers using only approved dashboard data contracts.",
		InputSchema: map[string]interface{}{
			"type": "object",
			"properties": map[string]interface{}{
				"city":  stringSchema("taipei or metrotaipei."),
				"focus": stringSchema("family_worker, family, or worker."),
			},
			"required": []string{"city"},
		},
		Handler: AnalyzeHeatFamilyWorker,
	})
}

func AnalyzeHeatFamilyWorker(ctx context.Context, args string) (string, error) {
	var params HeatFamilyWorkerArgs
	if err := parseArgs(args, &params); err != nil {
		return "", fmt.Errorf("invalid arguments: %v", err)
	}
	if params.City == "" {
		params.City = "metrotaipei"
	}
	if params.Focus == "" {
		params.Focus = "family_worker"
	}

	return marshalToolResponse(HeatFamilyWorkerPayload(params.City, params.Focus))
}

func HeatFamilyWorkerPayload(city string, focus string) HeatFamilyWorkerResponse {
	if city == "" {
		city = "metrotaipei"
	}
	if focus == "" {
		focus = "family_worker"
	}

	return HeatFamilyWorkerResponse{
		City:        city,
		Focus:       focus,
		Summary:     "雙北高溫治理先以 CWA 高溫警示作觸發，交叉比對台北涼適點、親子友善廁所、兒童遊戲場與新北親子/公園 proxy，辨識親子與戶外工作者的休息資源缺口。",
		DataFormats: []string{"map_legend", "two_d", "percent", "three_d", "time"},
		MapLayers: []HeatFamilyWorkerMapLayer{
			{ID: "cwa-heat-alert", Format: "map_legend", SourceMode: "official", Description: "CWA 高溫警示與示意熱暴露區"},
			{ID: "taipei-cooling-sites", Format: "map_legend", SourceMode: "official", Description: "台北市涼適點 WGS84 點位"},
			{ID: "family-friendly-restrooms", Format: "map_legend", SourceMode: "official", Description: "親子友善廁所與補給能力"},
			{ID: "newtaipei-family-proxy", Format: "map_legend", SourceMode: "official_proxy", Description: "新北公共親子中心與公園 proxy"},
		},
		ChartContracts: []HeatFamilyWorkerChart{
			{ID: "district-service-supply", Type: "bar", Format: "two_d", Purpose: "區級服務供給量排行"},
			{ID: "service-completeness", Type: "radialBar", Format: "percent", Purpose: "涼適點服務完備度"},
			{ID: "heat-hour-distribution", Type: "heatmap", Format: "three_d", Purpose: "熱壓力時段分布"},
			{ID: "cross-city-dependency", Type: "bar", Format: "two_d", Purpose: "跨市補位依賴度"},
			{ID: "alert-timeline", Type: "line", Format: "time", Purpose: "高溫警示時間序列"},
		},
		AIBoundary: HeatFamilyWorkerAIBoundary{
			Model:         "llama3.3-ffm-70b-16k-chat",
			ProxyEndpoint: "/api/v1/ai/chat/twai",
			Role:          "explain_only",
		},
		SourceTrace: []string{
			"CWA-W29-HEAT-WARNING",
			"DATA.TAIPEI-COOLING-SITES-a98a3e0e",
			"DATA.TAIPEI-FAMILY-RESTROOM-9d7488f5",
			"NTPC-FAMILY-CENTER-4182946C",
		},
	}
}
