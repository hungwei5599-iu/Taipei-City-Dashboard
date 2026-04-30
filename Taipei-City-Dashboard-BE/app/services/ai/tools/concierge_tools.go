// Package tools — concierge_tools.go
// ============================================================
// CIVIC NEXUS 黑客松 AI 導覽員 (Data Concierge) 專用工具
//
// 合規確認：
//   - 僅使用現有套件（models, fmt, strings, context）
//   - 不引入任何新 go 套件
//   - query_component_insight 查詢 postgres-manager (DBManager)
//   - compare_dual_city / query_nearby_facilities 查詢 postgres-data (DBDashboard)
//   - 回傳繁體中文摘要字串供 llama3.3 分析
// ============================================================

package tools

import (
	"TaipeiCityDashboardBE/app/models"
	"context"
	"fmt"
	"strings"
	"time"
)

func init() {
	RegisterTool(Tool{
		Name:        "query_component_insight",
		Description: "查詢特定儀表板組件的數據說明、使用案例與資料來源。輸入組件的 index 代碼，回傳組件的名稱、描述與建議使用情境。",
		InputSchema: map[string]interface{}{
			"type": "object",
			"properties": map[string]interface{}{
				"index": map[string]interface{}{
					"type":        "string",
					"description": "組件的唯一識別代碼，例如 food_inspection_trend",
				},
			},
			"required": []string{"index"},
		},
		Handler: QueryComponentInsight,
	})

	RegisterTool(Tool{
		Name:        "compare_dual_city",
		Description: "比較台北市與新北市在指定主題的數據差異。支援食安(food_safety)、AED急救(aed)、文化設施(cultural)、避難缺口(shelter)四種主題。",
		InputSchema: map[string]interface{}{
			"type": "object",
			"properties": map[string]interface{}{
				"metric": map[string]interface{}{
					"type":        "string",
					"description": "比較主題：food_safety、aed、cultural、shelter 之一",
					"enum":        []string{"food_safety", "aed", "cultural", "shelter"},
				},
				"year": map[string]interface{}{
					"type":        "integer",
					"description": "查詢年份，例如 2023。不填則使用最新資料。",
				},
			},
			"required": []string{"metric"},
		},
		Handler: CompareDualCity,
	})

	RegisterTool(Tool{
		Name:        "query_nearby_facilities",
		Description: "查詢指定行政區的特定設施分布（圖書館、AED、文化場館）。適合回答「我住XX區，附近有什麼？」類型的個人化問題。",
		InputSchema: map[string]interface{}{
			"type": "object",
			"properties": map[string]interface{}{
				"district": map[string]interface{}{
					"type":        "string",
					"description": "行政區名稱，例如 信義區、板橋區",
				},
				"facility_type": map[string]interface{}{
					"type":        "string",
					"description": "設施類型：library（圖書館）、aed（AED 急救設備）、cultural（文化場館）",
					"enum":        []string{"library", "aed", "cultural"},
				},
				"city": map[string]interface{}{
					"type":        "string",
					"description": "城市：taipei 或 new_taipei",
				},
			},
			"required": []string{"district", "facility_type"},
		},
		Handler: QueryNearbyFacilities,
	})

	RegisterTool(Tool{
		Name:        "generate_data_story",
		Description: "將數據摘要轉化為適合社群分享的故事格式。接收數據分析結果，輸出帶有視覺分隔符與分享邀請的文字。",
		InputSchema: map[string]interface{}{
			"type": "object",
			"properties": map[string]interface{}{
				"summary": map[string]interface{}{
					"type":        "string",
					"description": "要轉化的數據摘要文字",
				},
				"topic": map[string]interface{}{
					"type":        "string",
					"description": "主題標籤：food_safety、cultural、disaster、health 之一",
					"enum":        []string{"food_safety", "cultural", "disaster", "health"},
				},
			},
			"required": []string{"summary", "topic"},
		},
		Handler: GenerateDataStory,
	})

	RegisterTool(Tool{
		Name:        "query_historical_trend",
		Description: "查詢特定指標在近年的歷史趨勢，用於分析數據是否在改善或惡化。",
		InputSchema: map[string]interface{}{
			"type": "object",
			"properties": map[string]interface{}{
				"metric": map[string]interface{}{
					"type":        "string",
					"description": "指標類型：food_safety（食安合格率）或 death_cause（主要死因）",
					"enum":        []string{"food_safety", "death_cause"},
				},
				"city": map[string]interface{}{
					"type":        "string",
					"description": "城市：taipei 或 new_taipei",
				},
				"year_from": map[string]interface{}{
					"type":        "integer",
					"description": "起始年份，例如 2019",
				},
				"year_to": map[string]interface{}{
					"type":        "integer",
					"description": "結束年份，例如 2024",
				},
			},
			"required": []string{"metric"},
		},
		Handler: QueryHistoricalTrend,
	})
}

// ─── T-01: QueryComponentInsight ─────────────────────────────────────────────
// 查詢 dashboardmanager.query_charts + components 取得組件描述

type componentInsightArgs struct {
	Index string `json:"index"`
}

type componentInsightRow struct {
	Name      string `gorm:"column:name"`
	ShortDesc string `gorm:"column:short_desc"`
	LongDesc  string `gorm:"column:long_desc"`
	UseCase   string `gorm:"column:use_case"`
	QueryType string `gorm:"column:query_type"`
	Source    string `gorm:"column:source"`
}

func QueryComponentInsight(ctx context.Context, args string) (string, error) {
	var params componentInsightArgs
	if err := parseArgs(args, &params); err != nil {
		return "", fmt.Errorf("invalid arguments: %v", err)
	}
	if params.Index == "" {
		return "請提供組件的 index 代碼。", nil
	}

	if models.DBManager == nil {
		return "【系統提示】目前無法連線至管理資料庫，請稍後再試。", nil
	}

	var row componentInsightRow
	err := models.DBManager.Table("query_charts").
		Select("c.name, qc.short_desc, qc.long_desc, qc.use_case, qc.query_type, qc.source").
		Joins("INNER JOIN components c ON query_charts.index = c.index").
		Where("query_charts.index = ?", params.Index).
		// Use LIMIT 1 to avoid duplicate for different cities
		Limit(1).
		Scan(&row).Error
	if err != nil {
		return "", fmt.Errorf("查詢組件資料失敗: %v", err)
	}
	if row.Name == "" {
		return fmt.Sprintf("找不到組件 index「%s」，請確認代碼是否正確。", params.Index), nil
	}

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("【%s 組件說明】\n", row.Name))
	if row.ShortDesc != "" {
		sb.WriteString(fmt.Sprintf("📌 摘要：%s\n", row.ShortDesc))
	}
	if row.LongDesc != "" {
		sb.WriteString(fmt.Sprintf("📖 詳細說明：%s\n", row.LongDesc))
	}
	if row.UseCase != "" {
		sb.WriteString(fmt.Sprintf("💡 建議使用情境：%s\n", row.UseCase))
	}
	if row.Source != "" {
		sb.WriteString(fmt.Sprintf("🗂️ 資料來源：%s\n", row.Source))
	}
	return sb.String(), nil
}

// ─── T-02: CompareDualCity ────────────────────────────────────────────────────
// 並排比較台北 vs 新北同類指標

type compareDualCityArgs struct {
	Metric string `json:"metric"`
	Year   int    `json:"year"`
}

func CompareDualCity(ctx context.Context, args string) (string, error) {
	var params compareDualCityArgs
	if err := parseArgs(args, &params); err != nil {
		return "", fmt.Errorf("invalid arguments: %v", err)
	}

	switch params.Metric {
	case "food_safety":
		return compareFoodSafety(ctx, params.Year)
	case "aed":
		return compareAED(ctx)
	case "cultural":
		return compareCultural(ctx)
	case "shelter":
		return compareShelter(ctx)
	default:
		return fmt.Sprintf("不支援的比較主題「%s」。請使用：food_safety、aed、cultural、shelter。", params.Metric), nil
	}
}

func compareFoodSafety(_ context.Context, year int) (string, error) {
	if models.DBDashboard == nil {
		return "【系統提示】目前無法連線至儀表板資料庫，無法進行數據對比。", nil
	}
	if year == 0 {
		year = time.Now().Year() - 1
	}
	type FoodRow struct {
		CityScope string  `gorm:"column:city_scope"`
		PassRate  float64 `gorm:"column:pass_rate"`
	}
	var rows []FoodRow
	err := models.DBDashboard.Table("hackathon_component_d2_food_inspect_ready").
		Select("city_scope, ROUND(AVG(pass_rate)::numeric, 1) AS pass_rate").
		Where("year = ? AND pass_rate IS NOT NULL", year).
		Group("city_scope").
		Scan(&rows).Error
	if err != nil || len(rows) == 0 {
		return fmt.Sprintf("【食安對比 %d 年】暫無雙城對比資料，請嘗試其他年份。", year), nil
	}

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("【🍱 台北 vs 新北 食品稽查合格率對比（%d年）】\n\n", year))
	for _, r := range rows {
		label := cityLabel(r.CityScope)
		bar := buildBar(r.PassRate, 100)
		sb.WriteString(fmt.Sprintf("%s：%.1f%% %s\n", label, r.PassRate, bar))
	}
	sb.WriteString("\n💡 合格率越高，代表食品安全監管越有效。低合格率行政區需加強稽查密度。")
	return sb.String(), nil
}

func compareAED(_ context.Context) (string, error) {
	if models.DBDashboard == nil {
		return "【系統提示】目前無法連線至儀表板資料庫，無法進行數據對比。", nil
	}
	type AEDRow struct {
		CityScope    string `gorm:"column:city_scope"`
		TotalDevices int64  `gorm:"column:total_devices"`
	}
	var rows []AEDRow
	err := models.DBDashboard.Table("hackathon_component_d1_aed_ready").
		Select("city_scope, COUNT(*) AS total_devices").
		Group("city_scope").
		Scan(&rows).Error
	if err != nil || len(rows) == 0 {
		return "【AED對比】暫無雙城 AED 資料。", nil
	}

	var sb strings.Builder
	sb.WriteString("【💊 台北 vs 新北 AED 急救設備分布對比】\n\n")
	for _, r := range rows {
		sb.WriteString(fmt.Sprintf("%s：共 %d 台\n", cityLabel(r.CityScope), r.TotalDevices))
	}
	sb.WriteString("\n💡 AED 在心臟驟停後 5 分鐘內使用，存活率可提升至 70%。密度越高代表急救覆蓋越完整。")
	return sb.String(), nil
}

func compareCultural(_ context.Context) (string, error) {
	if models.DBDashboard == nil {
		return "【系統提示】目前無法連線至儀表板資料庫，無法進行數據對比。", nil
	}
	type CulturalRow struct {
		CityScope string `gorm:"column:city_scope"`
		Count     int64  `gorm:"column:count"`
	}
	var rows []CulturalRow
	err := models.DBDashboard.Table("hackathon_component_3_cultural_density_ready").
		Select("city_scope, COUNT(*) AS count").
		Group("city_scope").
		Scan(&rows).Error
	if err != nil || len(rows) == 0 {
		return "【文化對比】暫無雙城文化設施資料。", nil
	}

	var sb strings.Builder
	sb.WriteString("【🎨 台北 vs 新北 文化資產設施對比】\n\n")
	for _, r := range rows {
		sb.WriteString(fmt.Sprintf("%s：共 %d 處文化資產設施\n", cityLabel(r.CityScope), r.Count))
	}
	sb.WriteString("\n💡 文化設施密度影響市民文化參與機會。密度低的區域可考慮優先增設社區藝文空間。")
	return sb.String(), nil
}

func compareShelter(_ context.Context) (string, error) {
	if models.DBDashboard == nil {
		return "【系統提示】目前無法連線至儀表板資料庫，無法進行數據對比。", nil
	}
	type ShelterRow struct {
		CityScope        string `gorm:"column:city_scope"`
		TotalCapacity    int64  `gorm:"column:total_capacity"`
		CriticalGapCount int64  `gorm:"column:critical_gap_count"`
	}
	var rows []ShelterRow
	err := models.DBDashboard.Table("hackathon_component_8_shelter_gap_ready").
		Select("city_scope, SUM(shelter_capacity) AS total_capacity, COUNT(CASE WHEN support_status = 'critical_gap' THEN 1 END) AS critical_gap_count").
		Group("city_scope").
		Scan(&rows).Error
	if err != nil || len(rows) == 0 {
		return "【防災對比】暫無雙城避難資料。", nil
	}

	var sb strings.Builder
	sb.WriteString("【🌊 台北 vs 新北 避難收容容量對比】\n\n")
	for _, r := range rows {
		sb.WriteString(fmt.Sprintf("%s：總容量 %d 人，嚴重缺口行政區 %d 個\n",
			cityLabel(r.CityScope), r.TotalCapacity, r.CriticalGapCount))
	}
	sb.WriteString("\n💡 嚴重缺口代表避難所容量不足以容納該區 65 歲以上弱勢人口，需優先補強。")
	return sb.String(), nil
}

// ─── T-03: QueryNearbyFacilities ─────────────────────────────────────────────

type nearbyFacilitiesArgs struct {
	District     string `json:"district"`
	FacilityType string `json:"facility_type"`
	City         string `json:"city"`
}

func QueryNearbyFacilities(ctx context.Context, args string) (string, error) {
	var params nearbyFacilitiesArgs
	if err := parseArgs(args, &params); err != nil {
		return "", fmt.Errorf("invalid arguments: %v", err)
	}
	if params.District == "" {
		return "請提供行政區名稱。", nil
	}

	cityScope := toCityScope(params.City)

	switch params.FacilityType {
	case "library":
		return nearbyLibraries(params.District, cityScope)
	case "aed":
		return nearbyAED(params.District, cityScope)
	case "cultural":
		return nearbyCultural(params.District, cityScope)
	default:
		return fmt.Sprintf("不支援的設施類型「%s」，請使用：library、aed、cultural。", params.FacilityType), nil
	}
}

func nearbyLibraries(district, cityScope string) (string, error) {
	if models.DBDashboard == nil {
		return "【系統提示】資料庫連線中斷，暫時無法查詢附近的圖書館。", nil
	}
	type LibRow struct {
		TotalLibraries int64 `gorm:"column:total_libraries"`
		WithSeats      int64 `gorm:"column:with_seats"`
	}
	var row LibRow
	q := models.DBDashboard.Table("hackathon_component_c5_library_ready").
		Select("COUNT(*) AS total_libraries, COUNT(CASE WHEN available_seats IS NOT NULL THEN 1 END) AS with_seats").
		Where("district = ?", district)
	if cityScope != "" {
		q = q.Where("city_scope = ?", cityScope)
	}
	if err := q.Scan(&row).Error; err != nil {
		return "", fmt.Errorf("查詢圖書館資料失敗: %v", err)
	}
	if row.TotalLibraries == 0 {
		return fmt.Sprintf("【%s 圖書館】目前無資料。", district), nil
	}
	return fmt.Sprintf("【📚 %s 圖書館】\n共 %d 座圖書館，其中 %d 座提供即時座位查詢。\n💡 前往前可先查詢座位狀況，避免白跑一趟。",
		district, row.TotalLibraries, row.WithSeats), nil
}

func nearbyAED(district, cityScope string) (string, error) {
	if models.DBDashboard == nil {
		return "【系統提示】資料庫連線中斷，暫時無法查詢附近的 AED 設備。", nil
	}
	var count int64
	q := models.DBDashboard.Table("hackathon_component_d1_aed_ready").
		Where("district = ?", district)
	if cityScope != "" {
		q = q.Where("city_scope = ?", cityScope)
	}
	if err := q.Count(&count).Error; err != nil {
		return "", fmt.Errorf("查詢 AED 資料失敗: %v", err)
	}
	if count == 0 {
		return fmt.Sprintf("【%s AED】目前無 AED 登記資料，建議聯繫當地衛生所確認。", district), nil
	}
	return fmt.Sprintf("【💊 %s AED 設備】\n共有 %d 台 AED 急救設備。\n💡 發現心臟驟停時，應在 5 分鐘內取得並使用，可大幅提升存活率。",
		district, count), nil
}

func nearbyCultural(district, cityScope string) (string, error) {
	if models.DBDashboard == nil {
		return "【系統提示】資料庫連線中斷，暫時無法查詢附近的文化場館。", nil
	}
	type CulturalRow struct {
		AssetCategory string `gorm:"column:asset_category"`
		Count         int64  `gorm:"column:count"`
	}
	var rows []CulturalRow
	q := models.DBDashboard.Table("hackathon_component_3_cultural_density_ready").
		Select("asset_category, COUNT(*) AS count").
		Where("district = ?", district).
		Group("asset_category").
		Order("COUNT(*) DESC").
		Limit(5)
	if cityScope != "" {
		q = q.Where("city_scope = ?", cityScope)
	}
	if err := q.Scan(&rows).Error; err != nil {
		return "", fmt.Errorf("查詢文化設施資料失敗: %v", err)
	}
	if len(rows) == 0 {
		return fmt.Sprintf("【%s 文化設施】目前無文化資產資料。", district), nil
	}

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("【🎨 %s 文化資產設施】\n", district))
	for i, r := range rows {
		sb.WriteString(fmt.Sprintf("%d. %s：%d 處\n", i+1, r.AssetCategory, r.Count))
	}
	sb.WriteString("💡 文化資產是城市的記憶，歡迎探訪！")
	return sb.String(), nil
}

// ─── T-04: GenerateDataStory ──────────────────────────────────────────────────
// 純格式化，不查 DB

type dataStoryArgs struct {
	Summary string `json:"summary"`
	Topic   string `json:"topic"`
}

var topicEmoji = map[string]string{
	"food_safety": "🍱",
	"cultural":    "🎨",
	"disaster":    "🌊",
	"health":      "💊",
}

func GenerateDataStory(ctx context.Context, args string) (string, error) {
	var params dataStoryArgs
	if err := parseArgs(args, &params); err != nil {
		return "", fmt.Errorf("invalid arguments: %v", err)
	}
	if params.Summary == "" {
		return "請提供要轉化的數據摘要。", nil
	}

	emoji := topicEmoji[params.Topic]
	if emoji == "" {
		emoji = "📊"
	}

	return fmt.Sprintf(
		`%s 城市數據說
━━━━━━━━━━━━━━━━
%s
━━━━━━━━━━━━━━━━
🏙️ 更多台北-新北城市數據，探索儀表板：citydashboard.taipei
#台北 #新北 #開放資料 #城市儀表板`,
		emoji, strings.TrimSpace(params.Summary),
	), nil
}

// ─── T-05: QueryHistoricalTrend ───────────────────────────────────────────────

type historicalTrendArgs struct {
	Metric   string `json:"metric"`
	City     string `json:"city"`
	YearFrom int    `json:"year_from"`
	YearTo   int    `json:"year_to"`
}

func QueryHistoricalTrend(ctx context.Context, args string) (string, error) {
	var params historicalTrendArgs
	if err := parseArgs(args, &params); err != nil {
		return "", fmt.Errorf("invalid arguments: %v", err)
	}

	currentYear := time.Now().Year()
	if params.YearFrom == 0 {
		params.YearFrom = currentYear - 5
	}
	if params.YearTo == 0 {
		params.YearTo = currentYear
	}

	switch params.Metric {
	case "food_safety":
		return trendFoodSafety(params)
	case "death_cause":
		return trendDeathCause(params)
	default:
		return fmt.Sprintf("不支援的指標「%s」，請使用：food_safety、death_cause。", params.Metric), nil
	}
}

func trendFoodSafety(params historicalTrendArgs) (string, error) {
	if models.DBDashboard == nil {
		return "【系統提示】資料庫連線中斷，無法查詢趨勢數據。", nil
	}
	cityScope := toCityScope(params.City)

	type TrendRow struct {
		Year     int     `gorm:"column:year"`
		PassRate float64 `gorm:"column:pass_rate"`
	}
	var rows []TrendRow
	q := models.DBDashboard.Table("hackathon_component_d2_food_inspect_ready").
		Select("year, ROUND(AVG(pass_rate)::numeric, 1) AS pass_rate").
		Where("pass_rate IS NOT NULL AND year BETWEEN ? AND ?", params.YearFrom, params.YearTo).
		Group("year").
		Order("year ASC")
	if cityScope != "" {
		q = q.Where("city_scope = ?", cityScope)
	}
	if err := q.Scan(&rows).Error; err != nil || len(rows) == 0 {
		return fmt.Sprintf("【食安趨勢】%d～%d 年無資料。", params.YearFrom, params.YearTo), nil
	}

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("【🍱 %s 食品稽查合格率趨勢（%d～%d年）】\n\n",
		cityLabel(cityScope), params.YearFrom, params.YearTo))
	for _, r := range rows {
		trend := "─"
		sb.WriteString(fmt.Sprintf("%d年：%.1f%% %s\n", r.Year, r.PassRate, trend))
	}

	// Simple trend analysis
	if len(rows) >= 2 {
		first := rows[0].PassRate
		last := rows[len(rows)-1].PassRate
		diff := last - first
		if diff > 1 {
			sb.WriteString(fmt.Sprintf("\n📈 趨勢：近年持續改善（+%.1f%%），食品安全監管成效顯著。", diff))
		} else if diff < -1 {
			sb.WriteString(fmt.Sprintf("\n📉 趨勢：近年略有下滑（%.1f%%），需關注稽查力道。", diff))
		} else {
			sb.WriteString("\n➡️ 趨勢：數據穩定，維持現有監管強度。")
		}
	}
	return sb.String(), nil
}

func trendDeathCause(params historicalTrendArgs) (string, error) {
	if models.DBDashboard == nil {
		return "【系統提示】資料庫連線中斷，無法查詢趨勢數據。", nil
	}
	cityScope := toCityScope(params.City)

	type TrendRow struct {
		Year         int    `gorm:"column:year"`
		CauseOfDeath string `gorm:"column:cause_of_death"`
		DeathCount   int64  `gorm:"column:death_count"`
	}
	var rows []TrendRow
	q := models.DBDashboard.Table("hackathon_component_d3_death_cause_ready").
		Select("year, cause_of_death, SUM(death_count) AS death_count").
		Where("year BETWEEN ? AND ?", params.YearFrom, params.YearTo).
		Group("year, cause_of_death").
		Order("year ASC, SUM(death_count) DESC")
	if cityScope != "" {
		q = q.Where("city_scope = ?", cityScope)
	}
	if err := q.Scan(&rows).Error; err != nil || len(rows) == 0 {
		return fmt.Sprintf("【死因趨勢】%d～%d 年無資料。", params.YearFrom, params.YearTo), nil
	}

	// Group by year, show top 1 per year
	yearTopCause := make(map[int]TrendRow)
	for _, r := range rows {
		if _, exists := yearTopCause[r.Year]; !exists {
			yearTopCause[r.Year] = r
		}
	}

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("【💊 %s 主要死亡原因趨勢（%d～%d年 各年第一名）】\n\n",
		cityLabel(cityScope), params.YearFrom, params.YearTo))
	for y := params.YearFrom; y <= params.YearTo; y++ {
		if r, ok := yearTopCause[y]; ok {
			sb.WriteString(fmt.Sprintf("%d年：%s（%d人）\n", r.Year, r.CauseOfDeath, r.DeathCount))
		}
	}
	return sb.String(), nil
}

// ─── 共用工具函數（複用 hackathon_tools.go 的模式）────────────────────────────

// buildBar creates a simple ASCII bar chart for percentage values.
func buildBar(value, max float64) string {
	filled := int(value / max * 10)
	bar := strings.Repeat("█", filled) + strings.Repeat("░", 10-filled)
	return bar
}
