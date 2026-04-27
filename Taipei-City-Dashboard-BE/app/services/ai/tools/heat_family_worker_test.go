package tools

import (
	"context"
	"encoding/json"
	"testing"
)

func TestAnalyzeHeatFamilyWorkerRegistered(t *testing.T) {
	found := false
	for _, tool := range Definitions() {
		if tool.Name != "analyze_heat_family_worker" {
			continue
		}
		found = true
		if tool.InputSchema["type"] != "object" {
			t.Fatalf("expected object input schema, got %#v", tool.InputSchema["type"])
		}
		required, ok := tool.InputSchema["required"].([]string)
		if !ok || len(required) != 1 || required[0] != "city" {
			t.Fatalf("expected city to be required, got %#v", tool.InputSchema["required"])
		}
	}
	if !found {
		t.Fatal("analyze_heat_family_worker is not registered")
	}
}

func TestAnalyzeHeatFamilyWorkerOutputContract(t *testing.T) {
	result, err := AnalyzeHeatFamilyWorker(context.Background(), `{"city":"metrotaipei","focus":"family_worker"}`)
	if err != nil {
		t.Fatalf("AnalyzeHeatFamilyWorker returned error: %v", err)
	}

	var payload HeatFamilyWorkerResponse
	if err := json.Unmarshal([]byte(result), &payload); err != nil {
		t.Fatalf("invalid JSON: %v", err)
	}
	if payload.City != "metrotaipei" {
		t.Fatalf("unexpected city: %s", payload.City)
	}
	if len(payload.DataFormats) == 0 {
		t.Fatal("expected data format list")
	}
	for _, format := range payload.DataFormats {
		if !allowedComponentDataFormat(format) {
			t.Fatalf("illegal data format: %s", format)
		}
	}
	if len(payload.MapLayers) == 0 {
		t.Fatal("expected map layers")
	}
	if len(payload.ChartContracts) < 3 {
		t.Fatalf("expected multiple chart contracts, got %d", len(payload.ChartContracts))
	}
	if payload.AIBoundary.ProxyEndpoint != "/api/v1/ai/chat/twai" {
		t.Fatalf("unexpected proxy endpoint: %s", payload.AIBoundary.ProxyEndpoint)
	}
	if payload.AIBoundary.Model != "llama3.3-ffm-70b-16k-chat" {
		t.Fatalf("unexpected model: %s", payload.AIBoundary.Model)
	}
}

func TestAnalyzeHeatFamilyWorkerRejectsInvalidArgs(t *testing.T) {
	if _, err := AnalyzeHeatFamilyWorker(context.Background(), `{`); err == nil {
		t.Fatal("expected invalid JSON to fail")
	}
}

func allowedComponentDataFormat(format string) bool {
	switch format {
	case "two_d", "percent", "three_d", "map_legend", "time":
		return true
	default:
		return false
	}
}
