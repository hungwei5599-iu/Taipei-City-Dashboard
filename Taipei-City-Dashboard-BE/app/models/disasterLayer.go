package models

import (
	"encoding/json"
)

type DisasterLayerRow struct {
	ID           int64           `gorm:"column:id"`
	LayerKind    string          `gorm:"column:layer_kind"`
	ScenarioCode string          `gorm:"column:scenario_code"`
	Title        string          `gorm:"column:title"`
	DepthCM      *float64        `gorm:"column:depth_cm"`
	Properties   json.RawMessage `gorm:"column:properties"`
	Geometry     json.RawMessage `gorm:"column:geometry"`
}

type BBox struct {
	MinLng float64
	MinLat float64
	MaxLng float64
	MaxLat float64
}

func ListDisasterLayers(scenario string, layerKinds []string, bbox *BBox) ([]DisasterLayerRow, error) {
	q := DBDashboard.Table("disaster_layers").
		Select(`id, layer_kind, scenario_code, title, depth_cm,
			COALESCE(properties, '{}'::jsonb) AS properties,
			ST_AsGeoJSON(geom)::json AS geometry`).
		Where("is_active = TRUE")

	if scenario != "" {
		q = q.Where("scenario_code = ?", scenario)
	}
	if len(layerKinds) > 0 {
		q = q.Where("layer_kind IN ?", layerKinds)
	}
	if bbox != nil {
		q = q.Where(
			"ST_Intersects(geom, ST_MakeEnvelope(?, ?, ?, ?, 4326))",
			bbox.MinLng, bbox.MinLat, bbox.MaxLng, bbox.MaxLat,
		)
	}

	var rows []DisasterLayerRow
	return rows, q.Find(&rows).Error
}
