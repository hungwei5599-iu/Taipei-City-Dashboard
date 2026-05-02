package mapdata

import "testing"

func TestBuildFallbackChartDataPharmacy(t *testing.T) {
	data, ok, err := BuildFallbackChartData("Component3_pharmacy_map_ready", "metrotaipei")
	if err != nil {
		t.Fatalf("BuildFallbackChartData returned error: %v", err)
	}
	if !ok {
		t.Fatal("expected pharmacy component to be supported")
	}
	if data.Status != "success" || data.Source != "mapdata_fallback" {
		t.Fatalf("unexpected fallback metadata: status=%q source=%q", data.Status, data.Source)
	}
	if len(data.Categories) == 0 || len(data.Data) == 0 || len(data.Records) == 0 {
		t.Fatalf("expected non-empty chart fallback, got categories=%d data=%d records=%d", len(data.Categories), len(data.Data), len(data.Records))
	}
}

func TestBuildFallbackChartDataUnsupported(t *testing.T) {
	_, ok, err := BuildFallbackChartData("regular_component", "metrotaipei")
	if err != nil {
		t.Fatalf("unsupported component should not return error: %v", err)
	}
	if ok {
		t.Fatal("expected unsupported component to return ok=false")
	}
}
