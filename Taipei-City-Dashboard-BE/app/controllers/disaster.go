package controllers

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"TaipeiCityDashboardBE/app/models"

	"github.com/gin-gonic/gin"
)

// GetDisasterLayers returns a GeoJSON FeatureCollection of disaster layers.
// Query params:
//   scenario  - e.g. "130mm" (optional, returns all scenarios if omitted)
//   kinds     - comma-separated: "flood_polygon,road_closure,rainfall"
//   bbox      - "minLng,minLat,maxLng,maxLat" (optional)
func GetDisasterLayers(c *gin.Context) {
	scenario := c.Query("scenario")

	var kinds []string
	if k := c.Query("kinds"); k != "" {
		kinds = strings.Split(k, ",")
	}

	var bbox *models.BBox
	if b := c.Query("bbox"); b != "" {
		parts := strings.Split(b, ",")
		if len(parts) == 4 {
			minLng, e1 := strconv.ParseFloat(parts[0], 64)
			minLat, e2 := strconv.ParseFloat(parts[1], 64)
			maxLng, e3 := strconv.ParseFloat(parts[2], 64)
			maxLat, e4 := strconv.ParseFloat(parts[3], 64)
			if e1 == nil && e2 == nil && e3 == nil && e4 == nil {
				bbox = &models.BBox{MinLng: minLng, MinLat: minLat, MaxLng: maxLng, MaxLat: maxLat}
			}
		}
	}

	rows, err := models.ListDisasterLayers(scenario, kinds, bbox)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	features := make([]map[string]interface{}, 0, len(rows))
	for _, r := range rows {
		props := map[string]interface{}{}
		_ = json.Unmarshal(r.Properties, &props)
		props["id"] = r.ID
		props["layer_kind"] = r.LayerKind
		props["scenario_code"] = r.ScenarioCode
		props["title"] = r.Title
		if r.DepthCM != nil {
			props["depth_cm"] = *r.DepthCM
		}

		features = append(features, map[string]interface{}{
			"type":       "Feature",
			"geometry":   r.Geometry,
			"properties": props,
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"type":     "FeatureCollection",
		"features": features,
	})
}
