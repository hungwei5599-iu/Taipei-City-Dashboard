// Package tools — hackathon_tools.go
// ============================================================
// CIVIC NEXUS 黑客松 7 個 AI Tool handlers
//
// 合規確認：
//   - 僅使用現有套件（models, fmt, encoding/json, time, strings, context）
//   - 不引入任何新 go 套件
//   - 所有 tool 透過 DBDashboard 查詢（dashboard DB）
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

// ─── 共用 args 結構 ───────────────────────────────────────────────────────────

type CityArgs struct {
	City string `json:"city"` // "taipei" | "new_taipei" | "" (兩城市)
}

type CityLimitArgs struct {
	City  string `json:"city"`
	Limit int    `json:"limit"`
}

type CityYearArgs struct {
	City     string `json:"city"`
	Year     int    `json:"year"`
	TopN     int    `json:"top_n"`
	YearFrom int    `json:"year_from"`
	YearTo   int    `json:"year_to"`
}

type ShelterGapArgs struct {
	City         string `json:"city"`
	StatusFilter string `json:"status_filter"` // "critical_gap" | "gap" | "tight" | "surplus" | ""
}

// ─── 城市代碼轉換 ─────────────────────────────────────────────────────────────

func toCityScope(city string) string {
	switch strings.ToLower(city) {
	case "taipei", "台北", "臺北":
		return "Taipei"
	case "new_taipei", "新北":
		return "NewTaipei"
	default:
		return "" // 兩個城市都查
	}
}

func cityLabel(cityScope string) string {
	switch cityScope {
	case "Taipei":
		return "台北市"
	case "NewTaipei":
		return "新北市"
	default:
		return "雙北市"
	}
}

// ─── D1: QueryAEDOverview ─────────────────────────────────────────────────────
// tool: query_aed_overview
// 查詢 AED 設備分布概況（數量、按行政區彙總）

func QueryAEDOverview(ctx context.Context, args string) (string, error) {
	var params CityArgs
	if err := parseArgs(args, &params); err != nil {
		return "", fmt.Errorf("invalid arguments: %v", err)
	}

	cityScope := toCityScope(params.City)

	type AEDRow struct {
		CityScope    string `gorm:"column:city_scope"`
		TotalDevices int64  `gorm:"column:total_devices"`
	}

	var rows []AEDRow
	q := models.DBDashboard.Table("hackathon_component_d1_aed_ready").
		Select("city_scope, COUNT(*) AS total_devices").
		Group("city_scope")

	if cityScope != "" {
		q = q.Where("city_scope = ?", cityScope)
	}

	if err := q.Scan(&rows).Error; err != nil {
		return "", fmt.Errorf("查詢 AED 資料失敗: %v", err)
	}
	if len(rows) == 0 {
		return fmt.Sprintf("【AED 分布概況】%s 目前無 AED 資料。",
			cityLabel(cityScope)), nil
	}

	var sb strings.Builder
	sb.WriteString("【雙北 AED 急救設備分布概況】\n")
	for _, r := range rows {
		sb.WriteString(fmt.Sprintf("- %s：共 %d 台 AED 設備\n",
			cityLabel(r.CityScope), r.TotalDevices))
	}
	sb.WriteString("\n⚠️ AED 建議：發現患者心臟驟停時，應在 5 分鐘內取得並使用附近 AED，可顯著提高存活率。")
	return sb.String(), nil
}

// ─── D2: QueryFoodInspectionTrend ─────────────────────────────────────────────
// tool: query_food_inspection_trend
// 查詢食品抽驗合格率年度趨勢

func QueryFoodInspectionTrend(ctx context.Context, args string) (string, error) {
	var params CityYearArgs
	if err := parseArgs(args, &params); err != nil {
		return "", fmt.Errorf("invalid arguments: %v", err)
	}

	cityScope := toCityScope(params.City)

	// 年份範圍預設：近 5 年
	currentYear := time.Now().Year()
	yearFrom := params.YearFrom
	yearTo := params.YearTo
	if yearFrom == 0 {
		yearFrom = currentYear - 5
	}
	if yearTo == 0 {
		yearTo = currentYear
	}

	type FoodRow struct {
		CityScope string  `gorm:"column:city_scope"`
		Year      int     `gorm:"column:year"`
		PassRate  float64 `gorm:"column:pass_rate"`
	}

	var rows []FoodRow
	q := models.DBDashboard.Table("hackathon_component_d2_food_inspect_ready").
		Select("city_scope, year, ROUND(pass_rate::numeric, 1) AS pass_rate").
		Where("pass_rate IS NOT NULL AND year BETWEEN ? AND ?", yearFrom, yearTo).
		Order("city_scope, year ASC")

	if cityScope != "" {
		q = q.Where("city_scope = ?", cityScope)
	}

	if err := q.Scan(&rows).Error; err != nil {
		return "", fmt.Errorf("查詢食品抽驗資料失敗: %v", err)
	}
	if len(rows) == 0 {
		return fmt.Sprintf("【食品抽驗合格率】%d～%d 年無資料。", yearFrom, yearTo), nil
	}

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("【%s 食品抽驗合格率趨勢（%d～%d年）】\n",
		cityLabel(cityScope), yearFrom, yearTo))

	currentCity := ""
	for _, r := range rows {
		label := cityLabel(r.CityScope)
		if label != currentCity {
			currentCity = label
			sb.WriteString(fmt.Sprintf("\n▸ %s：\n", label))
		}
		sb.WriteString(fmt.Sprintf("  %d年：%.1f%%\n", r.Year, r.PassRate))
	}
	return sb.String(), nil
}

// ─── D3: QueryDeathCauseRanking ───────────────────────────────────────────────
// tool: query_death_cause_ranking
// 查詢主要死因排名

func QueryDeathCauseRanking(ctx context.Context, args string) (string, error) {
	var params CityYearArgs
	if err := parseArgs(args, &params); err != nil {
		return "", fmt.Errorf("invalid arguments: %v", err)
	}

	cityScope := toCityScope(params.City)
	year := params.Year
	if year == 0 {
		year = time.Now().Year() - 1
	}
	topN := params.TopN
	if topN == 0 || topN > 10 {
		topN = 5
	}

	type DeathRow struct {
		CityScope   string `gorm:"column:city_scope"`
		CauseOfDeath string `gorm:"column:cause_of_death"`
		DeathCount  int64  `gorm:"column:death_count"`
	}

	var rows []DeathRow
	q := models.DBDashboard.Table("hackathon_component_d3_death_cause_ready").
		Select("city_scope, cause_of_death, SUM(death_count) AS death_count").
		Where("year = ?", year).
		Group("city_scope, cause_of_death").
		Order("SUM(death_count) DESC").
		Limit(topN * 2) // *2 because there are 2 cities

	if cityScope != "" {
		q = q.Where("city_scope = ?", cityScope)
	}

	if err := q.Scan(&rows).Error; err != nil {
		return "", fmt.Errorf("查詢死亡原因資料失敗: %v", err)
	}
	if len(rows) == 0 {
		return fmt.Sprintf("【主要死亡原因】%d 年無資料，請嘗試其他年份。", year), nil
	}

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("【%s 主要死亡原因排行（%d年 前%d名）】\n",
		cityLabel(cityScope), year, topN))

	currentCity := ""
	rank := 1
	for _, r := range rows {
		label := cityLabel(r.CityScope)
		if label != currentCity {
			currentCity = label
			rank = 1
			sb.WriteString(fmt.Sprintf("\n▸ %s：\n", label))
		}
		if rank <= topN {
			sb.WriteString(fmt.Sprintf("  第%d名 %s：%d 人\n", rank, r.CauseOfDeath, r.DeathCount))
			rank++
		}
	}
	return sb.String(), nil
}

// ─── C3: QueryCulturalFacilities ─────────────────────────────────────────────
// tool: query_cultural_facilities
// 查詢文化資產設施數量（按行政區 + 類別）

func QueryCulturalFacilities(ctx context.Context, args string) (string, error) {
	var params CityLimitArgs
	if err := parseArgs(args, &params); err != nil {
		return "", fmt.Errorf("invalid arguments: %v", err)
	}

	cityScope := toCityScope(params.City)
	limit := params.Limit
	if limit == 0 || limit > 20 {
		limit = 10
	}

	type CulturalRow struct {
		District      string `gorm:"column:district"`
		AssetCategory string `gorm:"column:asset_category"`
		Count         int64  `gorm:"column:count"`
	}

	var rows []CulturalRow
	q := models.DBDashboard.Table("hackathon_component_3_cultural_density_ready").
		Select("district, asset_category, COUNT(*) AS count").
		Group("district, asset_category").
		Order("COUNT(*) DESC").
		Limit(limit)

	if cityScope != "" {
		q = q.Where("city_scope = ?", cityScope)
	}

	if err := q.Scan(&rows).Error; err != nil {
		return "", fmt.Errorf("查詢文化設施資料失敗: %v", err)
	}
	if len(rows) == 0 {
		return fmt.Sprintf("【文化設施】%s 無文化資產資料。", cityLabel(cityScope)), nil
	}

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("【%s 文化資產設施密度（前%d筆）】\n", cityLabel(cityScope), limit))
	for i, r := range rows {
		sb.WriteString(fmt.Sprintf("%d. %s - %s：%d 處\n", i+1, r.District, r.AssetCategory, r.Count))
	}
	return sb.String(), nil
}

// ─── C5: QueryLibraryMap ──────────────────────────────────────────────────────
// tool: query_library_map
// 查詢圖書館分布概況

func QueryLibraryMap(ctx context.Context, args string) (string, error) {
	var params CityArgs
	if err := parseArgs(args, &params); err != nil {
		return "", fmt.Errorf("invalid arguments: %v", err)
	}

	cityScope := toCityScope(params.City)

	type LibRow struct {
		CityScope      string `gorm:"column:city_scope"`
		TotalLibraries int64  `gorm:"column:total_libraries"`
		WithSeats      int64  `gorm:"column:with_seats"`
	}

	var rows []LibRow
	q := models.DBDashboard.Table("hackathon_component_c5_library_ready").
		Select(`city_scope,
			COUNT(*) AS total_libraries,
			COUNT(CASE WHEN available_seats IS NOT NULL THEN 1 END) AS with_seats`).
		Group("city_scope")

	if cityScope != "" {
		q = q.Where("city_scope = ?", cityScope)
	}

	if err := q.Scan(&rows).Error; err != nil {
		return "", fmt.Errorf("查詢圖書館資料失敗: %v", err)
	}
	if len(rows) == 0 {
		return fmt.Sprintf("【圖書館分布】%s 無圖書館資料。", cityLabel(cityScope)), nil
	}

	var sb strings.Builder
	sb.WriteString("【雙北圖書館與閱讀資源分布】\n")
	for _, r := range rows {
		sb.WriteString(fmt.Sprintf("- %s：共 %d 座圖書館（其中 %d 座提供即時座位查詢）\n",
			cityLabel(r.CityScope), r.TotalLibraries, r.WithSeats))
	}
	return sb.String(), nil
}

// ─── C8: QueryShelterGap ─────────────────────────────────────────────────────
// tool: query_shelter_gap
// 查詢避難收容缺口分析

func QueryShelterGap(ctx context.Context, args string) (string, error) {
	var params ShelterGapArgs
	if err := parseArgs(args, &params); err != nil {
		return "", fmt.Errorf("invalid arguments: %v", err)
	}

	cityScope := toCityScope(params.City)

	type ShelterRow struct {
		CityScope               string  `gorm:"column:city_scope"`
		DistrictName            string  `gorm:"column:district_name"`
		ShelterCapacity         int64   `gorm:"column:shelter_capacity"`
		VulnerablePopulation65p int64   `gorm:"column:vulnerable_population_65p"`
		CapacityGapAbs          int64   `gorm:"column:capacity_gap_abs"`
		CapacityGapRatio        float64 `gorm:"column:capacity_gap_ratio"`
		SupportStatus           string  `gorm:"column:support_status"`
	}

	var rows []ShelterRow
	q := models.DBDashboard.Table("hackathon_component_8_shelter_gap_ready").
		Select("city_scope, district_name, shelter_capacity, vulnerable_population_65p, capacity_gap_abs, capacity_gap_ratio, support_status").
		Order("capacity_gap_ratio DESC").
		Limit(20)

	if cityScope != "" {
		q = q.Where("city_scope = ?", cityScope)
	}
	if params.StatusFilter != "" {
		q = q.Where("support_status = ?", params.StatusFilter)
	}

	if err := q.Scan(&rows).Error; err != nil {
		return "", fmt.Errorf("查詢避難收容資料失敗: %v", err)
	}
	if len(rows) == 0 {
		return fmt.Sprintf("【避難收容缺口】%s 無符合條件的資料。", cityLabel(cityScope)), nil
	}

	statusMap := map[string]string{
		"critical_gap": "🔴 嚴重缺口",
		"gap":          "🟠 有缺口",
		"tight":        "🟡 略為不足",
		"surplus":      "🟢 容量充足",
	}

	var sb strings.Builder
	filter := ""
	if params.StatusFilter != "" {
		filter = fmt.Sprintf("（篩選：%s）", statusMap[params.StatusFilter])
	}
	sb.WriteString(fmt.Sprintf("【%s 避難收容缺口分析%s】\n", cityLabel(cityScope), filter))
	sb.WriteString("（以 65 歲以上弱勢人口 vs 收容容量計算）\n\n")

	for _, r := range rows {
		statusLabel := statusMap[r.SupportStatus]
		if statusLabel == "" {
			statusLabel = r.SupportStatus
		}
		sb.WriteString(fmt.Sprintf("- %s %s：容量%d人，65歲以上人口%d人，缺口%d人（%.1f%%）\n",
			r.DistrictName, statusLabel,
			r.ShelterCapacity, r.VulnerablePopulation65p,
			r.CapacityGapAbs, r.CapacityGapRatio*100))
	}
	return sb.String(), nil
}

// ─── C1: QueryCulturalEvents ──────────────────────────────────────────────────
// tool: query_cultural_events
// 查詢近期藝文活動摘要

func QueryCulturalEvents(ctx context.Context, args string) (string, error) {
	var params CityLimitArgs
	if err := parseArgs(args, &params); err != nil {
		return "", fmt.Errorf("invalid arguments: %v", err)
	}

	cityScope := toCityScope(params.City)
	limit := params.Limit
	if limit == 0 || limit > 10 {
		limit = 5
	}

	type EventRow struct {
		Title        string `gorm:"column:title"`
		LocationName string `gorm:"column:location_name"`
		Category     string `gorm:"column:category"`
		EventTime    string `gorm:"column:event_time"`
	}

	var rows []EventRow
	q := models.DBDashboard.Table("hackathon_component_1_event_map_ready").
		Select("title, location_name, category, event_time").
		Order("data_time DESC").
		Limit(limit)

	if cityScope != "" {
		q = q.Where("city_scope = ? OR city_scope IS NULL", cityScope)
	}

	if err := q.Scan(&rows).Error; err != nil {
		return "", fmt.Errorf("查詢藝文活動資料失敗: %v", err)
	}
	if len(rows) == 0 {
		return fmt.Sprintf("【藝文活動】%s 目前無近期活動資料。", cityLabel(cityScope)), nil
	}

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("【%s 近期藝文活動（前%d筆）】\n", cityLabel(cityScope), limit))
	for i, r := range rows {
		sb.WriteString(fmt.Sprintf("%d. 《%s》\n   地點：%s | 類別：%s\n",
			i+1, r.Title, r.LocationName, r.Category))
	}
	return sb.String(), nil
}
