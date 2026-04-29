package tools

import (
	"context"
	"encoding/json"
	"testing"
)

func TestDefinitionsIncludeExistingAndHackathonTools(t *testing.T) {
	definitions := Definitions()
	found := map[string]bool{}
	for _, tool := range definitions {
		found[tool.Name] = true
		if tool.InputSchema == nil {
			t.Fatalf("tool %s has nil schema", tool.Name)
		}
	}

	for _, name := range []string{"get_current_time", "get_population_summary", "generate_decisions", "visualize_side_effects", "generate_briefing"} {
		if !found[name] {
			t.Fatalf("expected tool %s to be registered", name)
		}
	}
}

func TestGenerateDecisionsRequiresScenarioID(t *testing.T) {
	_, err := GenerateDecisions(context.Background(), `{}`)
	if err == nil {
		t.Fatal("expected missing scenario_id to fail")
	}
}

func TestGenerateDecisionsOutputShape(t *testing.T) {
	result, err := GenerateDecisions(context.Background(), `{"scenario_id":"001"}`)
	if err != nil {
		t.Fatalf("GenerateDecisions returned error: %v", err)
	}

	var payload DecisionResponse
	if err := json.Unmarshal([]byte(result), &payload); err != nil {
		t.Fatalf("invalid JSON: %v", err)
	}
	if len(payload.Decisions) == 0 {
		t.Fatal("expected at least one decision")
	}
	if payload.Decisions[0].ID != "d001" {
		t.Fatalf("unexpected first decision ID: %s", payload.Decisions[0].ID)
	}
	if len(payload.Decisions[0].SideEffects) == 0 {
		t.Fatal("expected side effects in first decision")
	}
}

func TestVisualizeSideEffectsOutputShape(t *testing.T) {
	result, err := VisualizeSideEffects(context.Background(), `{"decision_id":"d001"}`)
	if err != nil {
		t.Fatalf("VisualizeSideEffects returned error: %v", err)
	}

	var payload map[string]interface{}
	if err := json.Unmarshal([]byte(result), &payload); err != nil {
		t.Fatalf("invalid JSON: %v", err)
	}
	layers, ok := payload["layers"].([]interface{})
	if !ok || len(layers) == 0 {
		t.Fatalf("expected layers array, got %#v", payload["layers"])
	}
}

func TestGenerateBriefingOutputShape(t *testing.T) {
	result, err := GenerateBriefing(context.Background(), `{"scenario_id":"001","city":"metrotaipei"}`)
	if err != nil {
		t.Fatalf("GenerateBriefing returned error: %v", err)
	}

	var payload BriefingResponse
	if err := json.Unmarshal([]byte(result), &payload); err != nil {
		t.Fatalf("invalid JSON: %v", err)
	}
	if payload.Briefing == "" {
		t.Fatal("expected briefing text")
	}
	if len(payload.SourceTrace) == 0 {
		t.Fatal("expected source trace")
	}
}
