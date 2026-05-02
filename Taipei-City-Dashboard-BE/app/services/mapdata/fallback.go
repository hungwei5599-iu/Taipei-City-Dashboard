package mapdata

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

type ChartSeries struct {
	Name string    `json:"name"`
	Data []float64 `json:"data"`
}

type FallbackChartData struct {
	Status         string                   `json:"status"`
	Source         string                   `json:"source"`
	ComponentIndex string                   `json:"component_index"`
	City           string                   `json:"city"`
	Categories     []string                 `json:"categories"`
	Data           []ChartSeries            `json:"data"`
	Records        []map[string]interface{} `json:"records,omitempty"`
}

type featureCollection struct {
	Features []feature `json:"features"`
}

type feature struct {
	Geometry   geometry               `json:"geometry"`
	Properties map[string]interface{} `json:"properties"`
}

type geometry struct {
	Type string `json:"type"`
}

var districtNameByTownEng = map[string]string{
	"Da'an District":      "大安區",
	"Wenshan District":    "文山區",
	"Xinyi District":      "信義區",
	"Wanhua District":     "萬華區",
	"Zhongzheng District": "中正區",
	"Songshan District":   "松山區",
	"Datong District":     "大同區",
	"Zhongshan District":  "中山區",
	"Shilin District":     "士林區",
	"Beitou District":     "北投區",
	"Nangang District":    "南港區",
	"Neihu District":      "內湖區",
	"Banqiao District":    "板橋區",
	"Sanchong District":   "三重區",
	"Zhonghe District":    "中和區",
	"Yonghe District":     "永和區",
	"Xinzhuang District":  "新莊區",
	"Xindian District":    "新店區",
	"Shulin District":     "樹林區",
	"Yingge District":     "鶯歌區",
	"Sanxia District":     "三峽區",
	"Tamsui District":     "淡水區",
	"Xizhi District":      "汐止區",
	"Ruifang District":    "瑞芳區",
	"Tucheng District":    "土城區",
	"Luzhou District":     "蘆洲區",
	"Wugu District":       "五股區",
	"Taishan District":    "泰山區",
	"Linkou District":     "林口區",
	"Shenkeng District":   "深坑區",
	"Shiding District":    "石碇區",
	"Pinglin District":    "坪林區",
	"Sanzhi District":     "三芝區",
	"Shimen District":     "石門區",
	"Bali District":       "八里區",
	"Pingxi District":     "平溪區",
	"Shuangxi District":   "雙溪區",
	"Gongliao District":   "貢寮區",
	"Jinshan District":    "金山區",
	"Wanli District":      "萬里區",
	"Wulai District":      "烏來區",
}

func BuildFallbackChartData(componentIndex string, city string) (FallbackChartData, bool, error) {
	kind, filename := fallbackSource(componentIndex)
	if filename == "" {
		return FallbackChartData{}, false, nil
	}

	fc, err := loadFeatureCollection(filename)
	if err != nil {
		return FallbackChartData{}, true, err
	}

	switch kind {
	case "pharmacy_by_town":
		return buildPharmacyByTown(componentIndex, city, fc), true, nil
	case "emergency_points":
		return buildEmergencyPoints(componentIndex, city, fc), true, nil
	case "water_quality_points":
		return buildWaterQualityPoints(componentIndex, city, fc), true, nil
	default:
		return FallbackChartData{}, false, nil
	}
}

func fallbackSource(componentIndex string) (string, string) {
	index := strings.ToLower(componentIndex)
	switch {
	case strings.Contains(index, "hackathon_component_7"), strings.Contains(index, "component3_"):
		return "pharmacy_by_town", "hackathon_component_7_pharmacy_density_by_town.geojson"
	case strings.Contains(index, "hackathon_component_9"), strings.Contains(index, "component2_"):
		return "emergency_points", "Component2_er_ready.geojson"
	case strings.Contains(index, "hackathon_component_10"), strings.Contains(index, "component4_"):
		return "water_quality_points", "Component4_water_quality_ready.geojson"
	default:
		return "", ""
	}
}

func loadFeatureCollection(filename string) (featureCollection, error) {
	path, err := findMapDataFile(filename)
	if err != nil {
		return featureCollection{}, err
	}

	raw, err := os.ReadFile(path)
	if err != nil {
		return featureCollection{}, err
	}

	var fc featureCollection
	if err := json.Unmarshal(raw, &fc); err != nil {
		return featureCollection{}, err
	}
	return fc, nil
}

func findMapDataFile(filename string) (string, error) {
	candidateDirs := []string{
		os.Getenv("MAPDATA_DIR"),
		filepath.Join("..", "Taipei-City-Dashboard-FE", "public", "mapData"),
		filepath.Join("..", "..", "Taipei-City-Dashboard-FE", "public", "mapData"),
		filepath.Join("Taipei-City-Dashboard-FE", "public", "mapData"),
		filepath.Join("public", "mapData"),
		filepath.Join("/opt", "Taipei-City-Dashboard-FE", "public", "mapData"),
	}

	for _, dir := range candidateDirs {
		if dir == "" {
			continue
		}
		path := filepath.Join(dir, filename)
		if _, err := os.Stat(path); err == nil {
			return path, nil
		}
	}
	return "", fmt.Errorf("mapData fallback file %q not found", filename)
}

func buildPharmacyByTown(componentIndex string, city string, fc featureCollection) FallbackChartData {
	features := filterFeaturesByCity(fc.Features, city)
	sort.SliceStable(features, func(i, j int) bool {
		return asFloat(features[i].Properties["pharmacy_count"]) > asFloat(features[j].Properties["pharmacy_count"])
	})

	var categories []string
	var counts []float64
	var per10k []float64
	var records []map[string]interface{}
	for _, item := range features {
		props := item.Properties
		district := districtName(props)
		county := countyName(props)
		categories = append(categories, county+district)
		counts = append(counts, asFloat(props["pharmacy_count"]))
		per10k = append(per10k, asFloat(props["pharmacy_per_10k"]))
		records = append(records, map[string]interface{}{
			"county":            county,
			"district":          district,
			"pharmacy_count":    asFloat(props["pharmacy_count"]),
			"pharmacy_per_10k":  asFloat(props["pharmacy_per_10k"]),
			"data_time":         props["data_time"],
			"source_component":  componentIndex,
			"source_mapdata":    "hackathon_component_7_pharmacy_density_by_town",
			"chart_category":    county + district,
			"chart_description": "藥局行政區統計",
		})
	}

	return fallbackChart(componentIndex, city, categories, []ChartSeries{
		{Name: "藥局數", Data: counts},
		{Name: "每萬人藥局數", Data: per10k},
	}, records)
}

func buildEmergencyPoints(componentIndex string, city string, fc featureCollection) FallbackChartData {
	features := filterFeaturesByCity(fc.Features, city)
	sort.SliceStable(features, func(i, j int) bool {
		waitingI := asFloat(features[i].Properties["waiting_time"])
		waitingJ := asFloat(features[j].Properties["waiting_time"])
		if waitingI != waitingJ {
			return waitingI < waitingJ
		}
		return asFloat(features[i].Properties["patient_count"]) < asFloat(features[j].Properties["patient_count"])
	})

	var categories []string
	var patientCounts []float64
	var waitingTimes []float64
	var bedUtilization []float64
	var records []map[string]interface{}
	for _, item := range features {
		props := item.Properties
		name := asString(props["hospital_name"], "未知醫院")
		cityScope := asString(props["city_scope"], "")
		categories = append(categories, name)
		patientCounts = append(patientCounts, asFloat(props["patient_count"]))
		waitingTimes = append(waitingTimes, asFloat(props["waiting_time"]))
		bedUtilization = append(bedUtilization, asFloat(props["bed_utilization"]))
		records = append(records, map[string]interface{}{
			"hospital_name":   name,
			"city_scope":      cityScope,
			"patient_count":   asFloat(props["patient_count"]),
			"waiting_time":    asFloat(props["waiting_time"]),
			"bed_utilization": asFloat(props["bed_utilization"]),
			"data_time":       props["data_time"],
			"source_trace":    props["source_trace"],
			"source_mapdata":  "Component2_er_ready",
		})
	}

	return fallbackChart(componentIndex, city, categories, []ChartSeries{
		{Name: "候診人數", Data: patientCounts},
		{Name: "等待時間", Data: waitingTimes},
		{Name: "床位使用率", Data: bedUtilization},
	}, records)
}

func buildWaterQualityPoints(componentIndex string, city string, fc featureCollection) FallbackChartData {
	features := filterFeaturesByCity(fc.Features, city)
	sort.SliceStable(features, func(i, j int) bool {
		return asFloat(features[i].Properties["measured_count"]) > asFloat(features[j].Properties["measured_count"])
	})

	var categories []string
	var itemCounts []float64
	var recordCounts []float64
	var measuredCounts []float64
	var records []map[string]interface{}
	for _, item := range features {
		props := item.Properties
		plant := asString(props["plant"], "未知淨水場")
		categories = append(categories, plant)
		itemCounts = append(itemCounts, asFloat(props["item_count"]))
		recordCounts = append(recordCounts, asFloat(props["record_count"]))
		measuredCounts = append(measuredCounts, asFloat(props["measured_count"]))
		records = append(records, map[string]interface{}{
			"plant":          plant,
			"county":         props["county"],
			"township":       props["township"],
			"item_count":     asFloat(props["item_count"]),
			"record_count":   asFloat(props["record_count"]),
			"measured_count": asFloat(props["measured_count"]),
			"data_time":      props["data_time"],
			"source_mapdata": "Component4_water_quality_ready",
		})
	}

	return fallbackChart(componentIndex, city, categories, []ChartSeries{
		{Name: "檢測項目數", Data: itemCounts},
		{Name: "資料筆數", Data: recordCounts},
		{Name: "已量測數", Data: measuredCounts},
	}, records)
}

func fallbackChart(componentIndex string, city string, categories []string, data []ChartSeries, records []map[string]interface{}) FallbackChartData {
	return FallbackChartData{
		Status:         "success",
		Source:         "mapdata_fallback",
		ComponentIndex: componentIndex,
		City:           city,
		Categories:     categories,
		Data:           data,
		Records:        records,
	}
}

func filterFeaturesByCity(features []feature, city string) []feature {
	if city == "" || city == "metrotaipei" {
		return features
	}

	var filtered []feature
	for _, item := range features {
		props := item.Properties
		countyCode := asString(props["COUNTYCODE"], "")
		cityScope := asString(props["city_scope"], "")
		county := asString(props["county"], "") + asString(props["COUNTYNAME"], "") + asString(props["PNAME"], "")
		switch city {
		case "taipei":
			if countyCode == "63000" || cityScope == "Taipei" || strings.Contains(county, "台北") || strings.Contains(county, "臺北") {
				filtered = append(filtered, item)
			}
		case "newtaipei":
			if countyCode == "65000" || cityScope == "NewTaipei" || strings.Contains(county, "新北") {
				filtered = append(filtered, item)
			}
		default:
			filtered = append(filtered, item)
		}
	}
	return filtered
}

func districtName(props map[string]interface{}) string {
	if value := asString(props["district"], ""); value != "" {
		return value
	}
	if value := asString(props["TNAME"], ""); value != "" {
		return value
	}
	if value := asString(props["TOWNENG"], ""); value != "" {
		if mapped, ok := districtNameByTownEng[value]; ok {
			return mapped
		}
		return value
	}
	return "未知行政區"
}

func countyName(props map[string]interface{}) string {
	if value := asString(props["county"], ""); value != "" {
		return value
	}
	switch asString(props["COUNTYCODE"], "") {
	case "63000":
		return "台北市"
	case "65000":
		return "新北市"
	default:
		return asString(props["COUNTYNAME"], "")
	}
}

func asString(value interface{}, fallback string) string {
	if value == nil {
		return fallback
	}
	if text, ok := value.(string); ok && text != "" {
		return text
	}
	return fmt.Sprint(value)
}

func asFloat(value interface{}) float64 {
	switch typed := value.(type) {
	case float64:
		return typed
	case float32:
		return float64(typed)
	case int:
		return float64(typed)
	case int64:
		return float64(typed)
	case json.Number:
		number, _ := typed.Float64()
		return number
	case string:
		var number float64
		if _, err := fmt.Sscan(typed, &number); err == nil {
			return number
		}
	}
	return 0
}
