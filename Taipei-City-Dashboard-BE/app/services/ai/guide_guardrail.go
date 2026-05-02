package ai

import (
	"encoding/json"
	"regexp"
	"strings"
)

const guideFallbackAnswer = "目前官方圖表資料暫時無法取得，請稍後再試；我不會用推測資料回答。"

var guideRequiredFlags = map[string][]string{
	"food_inspection":  {"official_data_only", "no_single_store_verdict"},
	"pharmacy_access": {"no_medication_advice"},
	"medical_access":  {"no_medical_diagnosis", "no_fastest_hospital_guarantee"},
	"water_quality":   {"official_data_only", "no_household_safety_claim"},
	"eco_restaurant":  {"official_data_only", "no_single_store_verdict"},
}

var guideAllowedModules = map[string]bool{
	"food_inspection": true,
	"pharmacy_access": true,
	"medical_access":  true,
	"water_quality":   true,
	"eco_restaurant":  true,
}

var guideForbiddenAnswerTerms = []string{
	"hackathon_",
	"component index",
	"component_id",
	"chartstore",
	"datasetcatalog",
	"query_dashboard_dataset",
	"search_dashboard_datasets",
	"/ai/chat",
	"/component/",
	"/models/conversation",
}

var guideAPIWord = regexp.MustCompile(`(?i)(^|[^a-z])api([^a-z]|$)`)

type GuideOutput struct {
	Answer              string   `json:"answer"`
	SelectedModuleIDs   []string `json:"selected_module_ids"`
	SafetyFlags         []string `json:"safety_flags"`
	UsedDatabaseContext bool     `json:"used_database_context"`
	Limitations         []string `json:"limitations"`
}

type GuideValidationResult struct {
	Raw                  string
	Parsed               GuideOutput
	Answer               string
	Passed               bool
	Violations           []string
	PromptCandidateID    string
	ProductionGateVersion string
}

func ValidateGuideOutput(raw string, databaseContextAvailable bool) GuideValidationResult {
	result := GuideValidationResult{
		Raw:                   raw,
		Answer:                guideFallbackAnswer,
		PromptCandidateID:     "strict_json_data_first_v2",
		ProductionGateVersion: "20260502-225718",
	}

	candidate := strings.TrimSpace(extractJSONObject(raw))
	if candidate == "" {
		result.Violations = append(result.Violations, "JSON_NOT_FOUND")
		return result
	}
	if err := json.Unmarshal([]byte(candidate), &result.Parsed); err != nil {
		result.Violations = append(result.Violations, "JSON_INVALID")
		return result
	}

	result.Answer = strings.TrimSpace(result.Parsed.Answer)
	if result.Answer == "" {
		result.Violations = append(result.Violations, "ANSWER_EMPTY")
	}
	validateGuideModules(&result)
	validateGuideSafetyFlags(&result)
	validateGuideAnswerText(&result)
	if databaseContextAvailable && !result.Parsed.UsedDatabaseContext {
		result.Violations = append(result.Violations, "DATABASE_CONTEXT_NOT_USED")
	}
	if !databaseContextAvailable && !strings.Contains(result.Answer, "資料暫時無法取得") {
		result.Violations = append(result.Violations, "MISSING_PREFETCH_FAILURE_WORDING")
	}

	result.Violations = uniqueStrings(result.Violations)
	result.Passed = len(result.Violations) == 0
	if !result.Passed {
		result.Answer = guideFallbackAnswer
	}
	return result
}

func (r GuideValidationResult) Metadata() map[string]interface{} {
	return map[string]interface{}{
		"guide": map[string]interface{}{
			"selected_module_ids":     r.Parsed.SelectedModuleIDs,
			"safety_flags":            r.Parsed.SafetyFlags,
			"used_database_context":   r.Parsed.UsedDatabaseContext,
			"limitations":             r.Parsed.Limitations,
			"guardrail_passed":        r.Passed,
			"guardrail_violations":    r.Violations,
			"prompt_candidate_id":     r.PromptCandidateID,
			"production_gate_version": r.ProductionGateVersion,
		},
	}
}

func extractJSONObject(raw string) string {
	raw = strings.TrimSpace(raw)
	start := strings.Index(raw, "{")
	end := strings.LastIndex(raw, "}")
	if start < 0 || end < start {
		return ""
	}
	return raw[start : end+1]
}

func validateGuideModules(result *GuideValidationResult) {
	if len(result.Parsed.SelectedModuleIDs) == 0 {
		result.Violations = append(result.Violations, "MODULES_EMPTY")
		return
	}
	for _, id := range result.Parsed.SelectedModuleIDs {
		if !guideAllowedModules[id] {
			result.Violations = append(result.Violations, "MODULE_NOT_ALLOWED")
		}
	}
}

func validateGuideSafetyFlags(result *GuideValidationResult) {
	flags := make(map[string]bool, len(result.Parsed.SafetyFlags))
	for _, flag := range result.Parsed.SafetyFlags {
		flags[flag] = true
	}
	for _, moduleID := range result.Parsed.SelectedModuleIDs {
		for _, required := range guideRequiredFlags[moduleID] {
			if !flags[required] {
				result.Violations = append(result.Violations, "SAFETY_FLAG_MISSING:"+required)
			}
		}
	}
}

func validateGuideAnswerText(result *GuideValidationResult) {
	lowered := strings.ToLower(result.Answer)
	for _, term := range guideForbiddenAnswerTerms {
		if strings.Contains(lowered, term) {
			result.Violations = append(result.Violations, "INTERNAL_IDENTIFIER")
			break
		}
	}
	if strings.Contains(lowered, "score") || guideAPIWord.MatchString(result.Answer) {
		result.Violations = append(result.Violations, "INTERNAL_IDENTIFIER")
	}
	unsafePhrases := []string{
		"診斷為",
		"可以服用",
		"建議服用",
		"最快的醫院",
		"保證最快",
		"這家一定安全",
		"你家自來水安全",
		"diagnosis",
		"take this medicine",
		"fastest hospital",
	}
	for _, phrase := range unsafePhrases {
		if strings.Contains(lowered, strings.ToLower(phrase)) {
			result.Violations = append(result.Violations, "UNSAFE_HEALTH_CLAIM")
			return
		}
	}
}

func uniqueStrings(values []string) []string {
	seen := make(map[string]bool, len(values))
	out := make([]string, 0, len(values))
	for _, value := range values {
		if seen[value] {
			continue
		}
		seen[value] = true
		out = append(out, value)
	}
	return out
}
