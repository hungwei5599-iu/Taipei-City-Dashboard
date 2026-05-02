<!-- Developed by Taipei Urban Intelligence Center 2023-2024 -->
<!-- Butterfly / Tornado Chart – two mirrored horizontal bar series sharing the same Y-axis categories -->

<script setup>
import { ref, computed } from "vue";
import VueApexCharts from "vue3-apexcharts";

const props = defineProps([
	"chart_config",
	"activeChart",
	"series",
	"map_config",
	"map_filter",
	"map_filter_on",
]);

const emits = defineEmits([
	"filterByParam",
	"filterByLayer",
	"clearByParamFilter",
	"clearByLayerFilter",
	"fly",
]);

// series[0] → 左側長條（負值方向），series[1] → 右側長條（正值方向）
// ApexCharts butterfly 的做法：series[0] 的資料全部乘以 -1，xaxis labels 用 Math.abs 格式化
const parseSeries = computed(() => {
	if (!props.series || props.series.length < 2) return props.series;
	return [
		{
			...props.series[0],
			data: props.series[0].data.map((v) => (typeof v === "number" ? -Math.abs(v) : v)),
		},
		{ ...props.series[1] },
	];
});

const chartOptions = ref({
	chart: {
		type: "bar",
		stacked: true,
		toolbar: { show: false },
	},
	colors: [...props.chart_config.color],
	dataLabels: {
		enabled: false,
	},
	grid: {
		show: false,
	},
	legend: {
		show: true,
		position: "top",
		offsetY: 4,
	},
	plotOptions: {
		bar: {
			horizontal: true,
			borderRadius: 2,
			barHeight: "70%",
		},
	},
	stroke: {
		colors: ["#282a2c"],
		show: true,
		width: 1,
	},
	tooltip: {
		// The class "chart-tooltip" could be edited in /assets/styles/chartStyles.css
		custom: function ({ series, seriesIndex, dataPointIndex, w }) {
			// 顯示絕對值（左側存負值，tooltip 轉回正）
			const rawVal = Math.abs(series[seriesIndex][dataPointIndex]);
			return (
				'<div class="chart-tooltip">' +
				"<h6>" +
				w.globals.seriesNames[seriesIndex] +
				" — " +
				w.globals.labels[dataPointIndex] +
				"</h6>" +
				"<span>" +
				rawVal +
				` ${props.chart_config.unit}` +
				"</span>" +
				"</div>"
			);
		},
		followCursor: true,
	},
	xaxis: {
		axisBorder: { show: false },
		axisTicks: { show: false },
		categories: props.chart_config.categories ? props.chart_config.categories : [],
		labels: {
			formatter: (val) => Math.abs(Math.round(val)).toString(),
		},
		type: "category",
	},
	yaxis: {
		labels: {
			formatter: (value) =>
				value && value.length > 7 ? value.slice(0, 6) + "..." : value,
		},
	},
});

// 動態高度：每行 30px + 上下 padding
const chartHeight = computed(() => {
	const rows = props.series?.[0]?.data?.length ?? 6;
	return `${50 + rows * 30}`;
});

const selectedIndex = ref(null);

function handleDataSelection(_e, _chartContext, config) {
	if (!props.map_filter || !props.map_filter_on) return;

	const key = `${config.dataPointIndex}-${config.seriesIndex}`;
	if (key !== selectedIndex.value) {
		if (props.map_filter.mode === "byParam") {
			emits(
				"filterByParam",
				props.map_filter,
				props.map_config,
				config.w.globals.labels[config.dataPointIndex],
				config.w.globals.seriesNames[config.seriesIndex]
			);
		} else if (props.map_filter.mode === "byLayer") {
			emits(
				"filterByLayer",
				props.map_config,
				config.w.globals.labels[config.dataPointIndex]
			);
		}
		selectedIndex.value = key;
	} else {
		if (props.map_filter.mode === "byParam") {
			emits("clearByParamFilter", props.map_config);
		} else if (props.map_filter.mode === "byLayer") {
			emits("clearByLayerFilter", props.map_config);
		}
		selectedIndex.value = null;
	}
}
</script>

<template>
  <div v-if="activeChart === 'ButterflyChart'">
    <VueApexCharts
      type="bar"
      width="100%"
      :height="chartHeight"
      :options="chartOptions"
      :series="parseSeries"
      @data-point-selection="handleDataSelection"
    />
  </div>
</template>
