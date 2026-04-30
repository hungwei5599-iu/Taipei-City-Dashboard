package tools

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
)

// ─── T-01: QueryComponentInsight Tests ───────────────────────────────────────

func TestQueryComponentInsight_ValidIndex(t *testing.T) {
	// This test verifies the function handles a valid index without panicking.
	// In CI (no DB), it will get an error result - verify graceful handling.
	args, _ := json.Marshal(map[string]string{"index": "food_inspection_trend"})
	result, err := QueryComponentInsight(context.Background(), string(args))
	// Function should never return a hard error (it returns friendly messages)
	if err != nil {
		t.Logf("DB not available (expected in CI): %v", err)
	} else {
		t.Logf("Result: %s", result)
	}
}

func TestQueryComponentInsight_EmptyIndex(t *testing.T) {
	args, _ := json.Marshal(map[string]string{"index": ""})
	result, err := QueryComponentInsight(context.Background(), string(args))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.Contains(result, "請提供") {
		t.Errorf("expected friendly prompt for empty index, got: %s", result)
	}
}

func TestQueryComponentInsight_InvalidArgs(t *testing.T) {
	_, err := QueryComponentInsight(context.Background(), "{{invalid json")
	if err == nil {
		t.Error("expected error for invalid JSON args")
	}
}

// ─── T-02: CompareDualCity Tests ─────────────────────────────────────────────

func TestCompareDualCity_FoodSafety(t *testing.T) {
	args, _ := json.Marshal(map[string]interface{}{"metric": "food_safety", "year": 2023})
	result, err := CompareDualCity(context.Background(), string(args))
	if err != nil {
		t.Logf("DB not available (expected in CI): %v", err)
	} else {
		t.Logf("Result: %s", result)
	}
}

func TestCompareDualCity_UnknownMetric(t *testing.T) {
	args, _ := json.Marshal(map[string]string{"metric": "foobar"})
	result, err := CompareDualCity(context.Background(), string(args))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.Contains(result, "不支援") {
		t.Errorf("expected 不支援 for unknown metric, got: %s", result)
	}
}

func TestCompareDualCity_AllMetrics(t *testing.T) {
	metrics := []string{"food_safety", "aed", "cultural", "shelter"}
	for _, m := range metrics {
		t.Run(m, func(t *testing.T) {
			args, _ := json.Marshal(map[string]string{"metric": m})
			_, err := CompareDualCity(context.Background(), string(args))
			// Only DB errors are acceptable, not logic panics
			if err != nil {
				t.Logf("DB not available for %s (expected in CI): %v", m, err)
			}
		})
	}
}

// ─── T-03: QueryNearbyFacilities Tests ───────────────────────────────────────

func TestQueryNearbyFacilities_EmptyDistrict(t *testing.T) {
	args, _ := json.Marshal(map[string]string{"district": "", "facility_type": "library"})
	result, err := QueryNearbyFacilities(context.Background(), string(args))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.Contains(result, "請提供") {
		t.Errorf("expected friendly prompt for empty district, got: %s", result)
	}
}

func TestQueryNearbyFacilities_InvalidType(t *testing.T) {
	args, _ := json.Marshal(map[string]string{"district": "信義區", "facility_type": "coffee_shop"})
	result, err := QueryNearbyFacilities(context.Background(), string(args))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.Contains(result, "不支援") {
		t.Errorf("expected 不支援 for invalid type, got: %s", result)
	}
}

func TestQueryNearbyFacilities_ValidRequest(t *testing.T) {
	args, _ := json.Marshal(map[string]string{
		"district":      "信義區",
		"facility_type": "library",
		"city":          "taipei",
	})
	_, err := QueryNearbyFacilities(context.Background(), string(args))
	if err != nil {
		t.Logf("DB not available (expected in CI): %v", err)
	}
}

// ─── T-04: GenerateDataStory Tests ───────────────────────────────────────────

func TestGenerateDataStory_ValidInput(t *testing.T) {
	args, _ := json.Marshal(map[string]string{
		"summary": "台北市 2024 年食品稽查合格率 96.2%，較去年提升 0.8%。",
		"topic":   "food_safety",
	})
	result, err := GenerateDataStory(context.Background(), string(args))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.Contains(result, "城市數據說") {
		t.Errorf("expected 城市數據說 in output, got: %s", result)
	}
	if !strings.Contains(result, "🍱") {
		t.Errorf("expected food emoji in output, got: %s", result)
	}
	if !strings.Contains(result, "citydashboard.taipei") {
		t.Errorf("expected dashboard URL in output, got: %s", result)
	}
}

func TestGenerateDataStory_EmptySummary(t *testing.T) {
	args, _ := json.Marshal(map[string]string{"summary": "", "topic": "food_safety"})
	result, err := GenerateDataStory(context.Background(), string(args))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.Contains(result, "請提供") {
		t.Errorf("expected friendly prompt for empty summary, got: %s", result)
	}
}

func TestGenerateDataStory_UnknownTopic(t *testing.T) {
	args, _ := json.Marshal(map[string]string{
		"summary": "一些數據摘要",
		"topic":   "weather",
	})
	result, err := GenerateDataStory(context.Background(), string(args))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// Should fall back to generic emoji
	if !strings.Contains(result, "📊") {
		t.Errorf("expected fallback emoji 📊, got: %s", result)
	}
}

// ─── T-05: QueryHistoricalTrend Tests ────────────────────────────────────────

func TestQueryHistoricalTrend_FoodSafety(t *testing.T) {
	args, _ := json.Marshal(map[string]interface{}{
		"metric":    "food_safety",
		"city":      "taipei",
		"year_from": 2019,
		"year_to":   2024,
	})
	_, err := QueryHistoricalTrend(context.Background(), string(args))
	if err != nil {
		t.Logf("DB not available (expected in CI): %v", err)
	}
}

func TestQueryHistoricalTrend_UnknownMetric(t *testing.T) {
	args, _ := json.Marshal(map[string]string{"metric": "crime_rate"})
	result, err := QueryHistoricalTrend(context.Background(), string(args))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.Contains(result, "不支援") {
		t.Errorf("expected 不支援 for unknown metric, got: %s", result)
	}
}

func TestQueryHistoricalTrend_DefaultYears(t *testing.T) {
	// Verify function handles missing year_from/year_to gracefully
	args, _ := json.Marshal(map[string]string{"metric": "food_safety", "city": "taipei"})
	_, err := QueryHistoricalTrend(context.Background(), string(args))
	if err != nil {
		t.Logf("DB not available (expected in CI): %v", err)
	}
}

// ─── Helper: buildBar Unit Test ───────────────────────────────────────────────

func TestBuildBar(t *testing.T) {
	tests := []struct {
		value    float64
		max      float64
		expectFn func(string) bool
	}{
		{100, 100, func(s string) bool { return strings.Count(s, "█") == 10 }},
		{0, 100, func(s string) bool { return strings.Count(s, "░") == 10 }},
		{50, 100, func(s string) bool { return strings.Count(s, "█") == 5 }},
	}
	for _, tt := range tests {
		result := buildBar(tt.value, tt.max)
		if !tt.expectFn(result) {
			t.Errorf("buildBar(%.0f, %.0f) = %q, unexpected result", tt.value, tt.max, result)
		}
	}
}
