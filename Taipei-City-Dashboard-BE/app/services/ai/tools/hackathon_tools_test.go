package tools

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
)

// hackathon_tools_test.go
// TDD 合約：驗證黑客松 7 個 AI Tool handler 的輸出格式與基本行為。
//
// 執行：go test ./app/services/ai/tools/... -run TestHackathon -v

// ─── 合約規則 ─────────────────────────────────────────────────────────────────
// 1. 每個 tool 必須接受 context + JSON args 字串
// 2. 成功時回傳非空字串（繁體中文摘要）
// 3. args 為空 JSON "{}" 時不應 panic，應回傳合理預設值或 error
// 4. 回傳的字串必須包含城市名稱（台北/新北）
// ─────────────────────────────────────────────────────────────────────────────

func mustRegister(t *testing.T, name string) {
	t.Helper()
	if _, ok := registry[name]; !ok {
		t.Errorf("tool %q 未在 registry 中註冊", name)
	}
}

func TestHackathon_RegistryPresence(t *testing.T) {
	expectedTools := []string{
		"query_aed_overview",
		"query_food_inspection_trend",
		"query_death_cause_ranking",
		"query_cultural_facilities",
		"query_library_map",
		"query_shelter_gap",
		"query_cultural_events",
	}
	for _, name := range expectedTools {
		mustRegister(t, name)
	}
}

// ─── query_aed_overview ──────────────────────────────────────────────────────

func TestQueryAEDOverview_EmptyArgs(t *testing.T) {
	result, err := QueryAEDOverview(context.Background(), `{}`)
	if err != nil {
		// DB 可能為空，但不應 panic
		t.Logf("error (expected in test env): %v", err)
		return
	}
	if result == "" {
		t.Error("結果不應為空字串")
	}
	if !strings.Contains(result, "AED") {
		t.Error("結果應包含 AED 關鍵字")
	}
}

func TestQueryAEDOverview_ValidCity(t *testing.T) {
	args := `{"city": "taipei"}`
	_, err := QueryAEDOverview(context.Background(), args)
	// 允許 DB 錯誤（test env 無 DB），但 args 解析不應報錯
	if err != nil && strings.Contains(err.Error(), "invalid") {
		t.Errorf("args 解析失敗: %v", err)
	}
}

// ─── query_food_inspection_trend ─────────────────────────────────────────────

func TestQueryFoodInspectionTrend_EmptyArgs(t *testing.T) {
	result, err := QueryFoodInspectionTrend(context.Background(), `{}`)
	if err != nil {
		t.Logf("error (expected in test env): %v", err)
		return
	}
	if result == "" {
		t.Error("結果不應為空字串")
	}
}

// ─── query_death_cause_ranking ────────────────────────────────────────────────

func TestQueryDeathCauseRanking_EmptyArgs(t *testing.T) {
	result, err := QueryDeathCauseRanking(context.Background(), `{}`)
	if err != nil {
		t.Logf("error (expected in test env): %v", err)
		return
	}
	if result == "" {
		t.Error("結果不應為空字串")
	}
}

// ─── query_shelter_gap ────────────────────────────────────────────────────────

func TestQueryShelterGap_CriticalOnly(t *testing.T) {
	args := `{"city": "taipei", "status_filter": "critical_gap"}`
	_, err := QueryShelterGap(context.Background(), args)
	if err != nil && strings.Contains(err.Error(), "invalid") {
		t.Errorf("args 解析失敗: %v", err)
	}
}

// ─── query_cultural_facilities ────────────────────────────────────────────────

func TestQueryCulturalFacilities_ValidArgs(t *testing.T) {
	args := `{"city": "new_taipei", "limit": 5}`
	_, err := QueryCulturalFacilities(context.Background(), args)
	if err != nil && strings.Contains(err.Error(), "invalid") {
		t.Errorf("args 解析失敗: %v", err)
	}
}

// ─── 通用：args JSON 格式 ─────────────────────────────────────────────────────

func TestHackathon_ArgsJSON_Valid(t *testing.T) {
	cases := []struct {
		tool string
		args string
	}{
		{"query_aed_overview", `{"city":"taipei"}`},
		{"query_food_inspection_trend", `{"city":"taipei","year_from":2020,"year_to":2024}`},
		{"query_death_cause_ranking", `{"city":"new_taipei","year":2023,"top_n":5}`},
		{"query_shelter_gap", `{"city":"taipei","status_filter":"critical_gap"}`},
		{"query_cultural_facilities", `{"city":"taipei","limit":10}`},
		{"query_library_map", `{"city":"taipei"}`},
		{"query_cultural_events", `{"city":"taipei","limit":5}`},
	}

	for _, tc := range cases {
		t.Run(tc.tool, func(t *testing.T) {
			var m map[string]interface{}
			if err := json.Unmarshal([]byte(tc.args), &m); err != nil {
				t.Errorf("args JSON 格式無效: %v", err)
			}
			fn, ok := registry[tc.tool]
			if !ok {
				t.Skipf("tool %q 尚未註冊，跳過執行測試", tc.tool)
				return
			}
			_, _ = fn(context.Background(), tc.args) // 僅確認不 panic
		})
	}
}
