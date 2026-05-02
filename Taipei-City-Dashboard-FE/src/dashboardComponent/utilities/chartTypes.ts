interface chartType {
	[index: string]: string;
}

export const chartTypes: chartType = {
	DonutChart: "甜甜圈圖", // V
	BarChart: "橫條圖", // V
	ColumnChart: "直條圖", // V
	BarPercentChart: "橫條圖(%)", // V
	TreemapChart: "矩形樹圖", // V
	DistrictChart: "行政區圖", // V
	MetroChart: "捷運圖", // V
	TimelineSeparateChart: "折線圖(比較)", // V
	TimelineStackedChart: "折線圖(堆疊)", // V
	GuageChart: "儀表圖", // V
	RadarChart: "雷達圖", // V
	HeatmapChart: "熱力圖", // V
	PolarAreaChart: "極區圖", // V
	ColumnLineChart: "長條折線圖", // V
	BarChartWithGoal: "橫條圖(目標)", // V
	IconPercentChart: "圖示比例圖", // V
	SpeedometerChart: "速度儀表圖", // 尚未使用
	IndicatorChart: "指標圖", // V
	MapLegend: "地圖圖例", // V
	TextUnitChart: "文字數值圖", // V
	ButterflyChart: "蝴蝶圖", // V
	FoodSafetyPercentChart: "食品抽驗合格率", // V
}