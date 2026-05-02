package tools

import (
	"TaipeiCityDashboardBE/app/models"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"sort"
	"strings"
	"time"
)

// DatasetCatalogItem describes one queryable dataset available to AI tools.
type DatasetCatalogItem struct {
	Table       string
	Title       string
	Description string
	Columns     []string // full whitelist — used for validation
	Metrics     []string // numeric columns AI may request
	Dimensions  []string // categorical / time columns
	TimeColumn  string
	Examples    []string // Chinese phrases used for keyword matching
}

// datasetCatalog is the whitelist of datasets the AI is allowed to query.
// Add new entries here when new datasets become available.
var datasetCatalog = []DatasetCatalogItem{
	{
		Table:       "population_age_distribution_tpe",
		Title:       "台北市人口年齡結構",
		Description: "依年份統計幼年、工作年齡與老年人口",
		Columns:     []string{"year", "young_population", "working_age_population", "elderly_population", "data_time"},
		Metrics:     []string{"young_population", "working_age_population", "elderly_population"},
		Dimensions:  []string{"year"},
		TimeColumn:  "year",
		Examples:    []string{"台北市人口結構", "台北市老年人口", "幼年人口", "人口老化", "年齡分布", "人口統計"},
	},
	{
		Table:       "population_age_distribution_new_tpe",
		Title:       "新北市人口年齡結構",
		Description: "依年份統計幼年、工作年齡與老年人口",
		Columns:     []string{"year", "young_population", "working_age_population", "elderly_population", "data_time"},
		Metrics:     []string{"young_population", "working_age_population", "elderly_population"},
		Dimensions:  []string{"year"},
		TimeColumn:  "year",
		Examples:    []string{"新北市人口結構", "新北市老年人口", "人口老化", "年齡分布"},
	},
}

const (
	errQueryFailed = "query execution failed: %v"
	errInvalidArgs = "invalid arguments: %v"
)

// ComponentContextItem represents a vector-searched component passed via component_context.
type ComponentContextItem struct {
	ID    int     `json:"id"`
	Index string  `json:"index"`
	Name  string  `json:"name"`
	City  string  `json:"city"`
	Score float64 `json:"score"`
}

// execChartQuery executes the chart query for a known component ID and city.
func execChartQuery(componentID int, city string) (string, error) {
	queryType, queryString, err := models.GetComponentChartDataQuery(componentID, city)
	if err != nil {
		return "", fmt.Errorf("query lookup failed: %v", err)
	}
	if queryString == "" {
		return "", fmt.Errorf("no chart query for component id=%d city=%q", componentID, city)
	}

	loc, _ := time.LoadLocation("Asia/Taipei")
	now := time.Now().In(loc)
	timeTo := now.Format("2006-01-02T15:04:05+08:00")
	timeFrom := now.Add(-24 * time.Hour).Format("2006-01-02T15:04:05+08:00")

	switch queryType {
	case "two_d":
		data, err := models.GetTwoDimensionalData(&queryString, timeFrom, timeTo)
		if err != nil {
			return "", fmt.Errorf(errQueryFailed, err)
		}
		out, _ := json.Marshal(data)
		return string(out), nil
	case "three_d", "percent":
		data, cats, err := models.GetThreeDimensionalData(&queryString, timeFrom, timeTo)
		if err != nil {
			return "", fmt.Errorf(errQueryFailed, err)
		}
		type threeDResult struct {
			Categories []string                            `json:"categories"`
			Series     []models.ThreeDimensionalDataOutput `json:"series"`
		}
		out, _ := json.Marshal(threeDResult{Categories: cats, Series: data})
		return string(out), nil
	case "time":
		data, err := models.GetTimeSeriesData(&queryString, timeFrom, timeTo)
		if err != nil {
			return "", fmt.Errorf(errQueryFailed, err)
		}
		out, _ := json.Marshal(data)
		return string(out), nil
	case "map_legend":
		data, err := models.GetMapLegendData(&queryString, timeFrom, timeTo)
		if err != nil {
			return "", fmt.Errorf(errQueryFailed, err)
		}
		out, _ := json.Marshal(data)
		return string(out), nil
	default:
		return "", fmt.Errorf("unknown query type: %s", queryType)
	}
}

// FetchComponentChartDataByID fetches chart data using a known component ID directly,
// skipping the index→id lookup in the components table.
func FetchComponentChartDataByID(_ context.Context, componentID int, city string) (string, error) {
	return execChartQuery(componentID, city)
}

// FetchComponentChartData resolves a component by its index string, retrieves its SQL
// query template from query_charts, and executes it against DBDashboard.
// It is the shared implementation for both the prefetch path and the AI tool.
func FetchComponentChartData(_ context.Context, componentIndex string, city string) (string, error) {
	var comp struct {
		ID int `gorm:"column:id"`
	}
	if err := models.DBManager.Table("components").Select("id").
		Where("index = ?", componentIndex).First(&comp).Error; err != nil {
		return "", fmt.Errorf("component %q not found", componentIndex)
	}
	return execChartQuery(comp.ID, city)
}

// BuildDatasetContextFromComponents prefetches chart data for every component in the
// list and returns a formatted string ready for injection into the AI system prompt.
func BuildDatasetContextFromComponents(ctx context.Context, components []ComponentContextItem) string {
	var parts []string
	var debugErrors []string
	for _, comp := range components {
		city := comp.City
		if city == "" {
			city = "metrotaipei"
		}

		var data string
		var err error
		if comp.ID > 0 {
			data, err = FetchComponentChartDataByID(ctx, comp.ID, city)
		} else {
			data, err = FetchComponentChartData(ctx, comp.Index, city)
		}

		if err != nil {
			log.Printf("[dataset_tools] fetch failed: component_id=%d index=%q city=%q err=%v", comp.ID, comp.Index, city, err)
			debugErrors = append(debugErrors, fmt.Sprintf(
				"prefetch failed: component_id=%d, index=%q, city=%q, error=%v",
				comp.ID,
				comp.Index,
				city,
				err,
			))
			continue
		}
		if data == "" {
			log.Printf("[dataset_tools] fetch returned empty: component_id=%d index=%q city=%q", comp.ID, comp.Index, city)
			debugErrors = append(debugErrors, fmt.Sprintf(
				"prefetch empty: component_id=%d, index=%q, city=%q",
				comp.ID,
				comp.Index,
				city,
			))
			continue
		}
		parts = append(parts, fmt.Sprintf("【%s】\n%s", comp.Name, data))
	}
	if len(parts) == 0 && len(debugErrors) > 0 {
		return "圖表資料預抓失敗，debug errors:\n- " + strings.Join(debugErrors, "\n- ")
	}
	return strings.Join(parts, "\n\n")
}

// ---------------------------------------------------------------------------
// get_component_chart_data
// ---------------------------------------------------------------------------

// ComponentChartArgs is the input schema for get_component_chart_data.
type ComponentChartArgs struct {
	ComponentIndex string `json:"component_index"`
	City           string `json:"city"`
}

// GetComponentChartData is an AI tool that fetches current chart data for a dashboard
// component by its index string, reusing the same query_charts logic as the HTTP API.
func GetComponentChartData(_ context.Context, args string) (string, error) {
	var params ComponentChartArgs
	if err := parseArgs(args, &params); err != nil {
		return "", fmt.Errorf(errInvalidArgs, err)
	}
	if params.City == "" {
		params.City = "metrotaipei"
	}
	data, err := FetchComponentChartData(context.Background(), params.ComponentIndex, params.City)
	if err != nil {
		return "", err
	}
	type Response struct {
		ComponentIndex string `json:"component_index"`
		City           string `json:"city"`
		Data           string `json:"data"`
	}
	out, _ := json.Marshal(Response{
		ComponentIndex: params.ComponentIndex,
		City:           params.City,
		Data:           data,
	})
	return string(out), nil
}

// ---------------------------------------------------------------------------
// search_dashboard_datasets
// ---------------------------------------------------------------------------

// SearchDatasetsArgs is the input schema for search_dashboard_datasets.
type SearchDatasetsArgs struct {
	Query string `json:"query"`
}

// SearchDashboardDatasets returns catalog entries that match the query keywords.
// Matching is keyword-based against Title, Description, and Examples fields.
func SearchDashboardDatasets(_ context.Context, args string) (string, error) {
	var params SearchDatasetsArgs
	if err := parseArgs(args, &params); err != nil {
		return "", fmt.Errorf(errInvalidArgs, err)
	}

	queryLower := strings.ToLower(params.Query)
	words := strings.Fields(queryLower)
	if len(words) == 0 {
		return `{"datasets":[],"message":"請提供查詢關鍵字"}`, nil
	}

	type scored struct {
		item  DatasetCatalogItem
		score float64
	}

	var hits []scored
	for _, item := range datasetCatalog {
		searchText := strings.ToLower(
			item.Title + " " + item.Description + " " + strings.Join(item.Examples, " "),
		)
		matched := 0
		for _, w := range words {
			if strings.Contains(searchText, w) {
				matched++
			}
		}
		if matched > 0 {
			hits = append(hits, scored{item: item, score: float64(matched) / float64(len(words))})
		}
	}

	sort.Slice(hits, func(i, j int) bool {
		return hits[i].score > hits[j].score
	})

	type DatasetResult struct {
		Table       string   `json:"table"`
		Title       string   `json:"title"`
		Description string   `json:"description"`
		Columns     []string `json:"columns"`
		TimeColumn  string   `json:"time_column"`
		Score       float64  `json:"score"`
	}

	datasets := make([]DatasetResult, 0, len(hits))
	for _, h := range hits {
		datasets = append(datasets, DatasetResult{
			Table:       h.item.Table,
			Title:       h.item.Title,
			Description: h.item.Description,
			Columns:     h.item.Columns,
			TimeColumn:  h.item.TimeColumn,
			Score:       h.score,
		})
	}

	if len(datasets) == 0 {
		return `{"datasets":[],"message":"找不到符合條件的資料集，請嘗試不同關鍵字"}`, nil
	}

	type Response struct {
		Datasets []DatasetResult `json:"datasets"`
	}
	out, err := json.Marshal(Response{Datasets: datasets})
	if err != nil {
		return "", err
	}
	return string(out), nil
}

// ---------------------------------------------------------------------------
// query_dashboard_dataset
// ---------------------------------------------------------------------------

// QueryDatasetArgs is the input schema for query_dashboard_dataset.
type QueryDatasetArgs struct {
	Table   string                 `json:"table"`
	Metrics []string               `json:"metrics"`
	Filters map[string]interface{} `json:"filters"`
	GroupBy []string               `json:"group_by"`
	Limit   int                    `json:"limit"`
}

// QueryDashboardDataset executes a whitelist-validated SELECT against the dashboard DB.
// It never accepts raw SQL — all table, column, and filter names are checked against
// the catalog before the query is built.
func QueryDashboardDataset(_ context.Context, args string) (string, error) {
	var params QueryDatasetArgs
	if err := parseArgs(args, &params); err != nil {
		return "", fmt.Errorf(errInvalidArgs, err)
	}

	// Resolve catalog entry
	var catalog *DatasetCatalogItem
	for i := range datasetCatalog {
		if datasetCatalog[i].Table == params.Table {
			catalog = &datasetCatalog[i]
			break
		}
	}
	if catalog == nil {
		return "", fmt.Errorf("資料表 %q 不在可查詢白名單中", params.Table)
	}

	// Build allowed-column set
	allowed := make(map[string]bool, len(catalog.Columns))
	for _, c := range catalog.Columns {
		allowed[c] = true
	}

	// Validate all AI-supplied names against the whitelist
	for _, m := range params.Metrics {
		if !allowed[m] {
			return "", fmt.Errorf("欄位 %q 不在資料表 %q 的允許範圍", m, params.Table)
		}
	}
	for _, g := range params.GroupBy {
		if !allowed[g] {
			return "", fmt.Errorf("group_by 欄位 %q 不在資料表 %q 的允許範圍", g, params.Table)
		}
	}
	for k := range params.Filters {
		if !allowed[k] {
			return "", fmt.Errorf("filter 欄位 %q 不在資料表 %q 的允許範圍", k, params.Table)
		}
	}

	// Enforce limit (max 100)
	limit := params.Limit
	if limit <= 0 || limit > 100 {
		limit = 50
	}

	// Build deduplicated SELECT column list
	seen := make(map[string]bool)
	var selectCols []string
	for _, c := range append(params.Metrics, params.GroupBy...) {
		if !seen[c] {
			selectCols = append(selectCols, c)
			seen[c] = true
		}
	}
	if len(selectCols) == 0 {
		selectCols = catalog.Columns
	}

	// Build GORM query — only SELECT, only whitelist columns, only parameterised values
	db := models.DBDashboard.Table(params.Table).Select(selectCols)

	for k, v := range params.Filters {
		// k is validated above; v is a value (parameterised), so no injection risk
		db = db.Where(fmt.Sprintf("%s = ?", k), v)
	}

	if len(params.GroupBy) > 0 {
		db = db.Group(strings.Join(params.GroupBy, ", "))
	}

	db = db.Limit(limit)

	var rows []map[string]interface{}
	if err := db.Scan(&rows).Error; err != nil {
		return "", fmt.Errorf("查詢 %q 失敗：%v", params.Table, err)
	}

	type Response struct {
		Table  string                   `json:"table"`
		Rows   []map[string]interface{} `json:"rows"`
		Source string                   `json:"source"`
	}
	out, err := json.Marshal(Response{
		Table:  params.Table,
		Rows:   rows,
		Source: "dashboard database",
	})
	if err != nil {
		return "", err
	}
	return string(out), nil
}
