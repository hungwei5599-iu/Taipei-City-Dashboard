<!-- Developed by Taipei Urban Intelligence Center 2023-2024 -->
<!-- Butterfly / Tornado Chart – two mirrored horizontal bar series sharing the same Y-axis categories -->

<script setup>
import { ref, computed, watch } from "vue";
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

// -------------------------------------------------------
// 資料格式說明（本專案實際格式）：
//
//  chart_data (→ props.series):
//    [ { name:"待診人數", data:[0,4,0,...] },
//      { name:"等候時間", data:[2,13,0,...] } ]
//
//  chart_config.categories:
//    ["三總","亞東","北市聯醫", ...]
//
// series[0] → 左側長條（取負值往左延伸）
// series[1] → 右側長條（正值）
// -------------------------------------------------------

// series[0] 的值全部取負，讓長條往左延伸
const parseSeries = computed(() => {
	if (!props.series || props.series.length < 2) return props.series ?? [];
	return [
		{
			...props.series[0],
			data: props.series[0].data.map((v) => -Math.abs(Number(v))),
		},
		{
			...props.series[1],
			data: props.series[1].data.map((v) => Math.abs(Number(v))),
		},
	];
});

// categories 直接取自 chart_config
const categories = computed(() => props.chart_config?.categories ?? []);

// 動態高度：每行 34px
const chartHeight = computed(() => {
	const rows = props.series?.[0]?.data?.length ?? 6;
	return `${60 + rows * 34}`;
});

// -------------------------------------------------------
// Chart Options（每次 series/categories 變化都重建）
// -------------------------------------------------------
function buildOptions() {
	return {
		chart: {
			type: "bar",
			stacked: true,
			toolbar: { show: false },
		},
		colors: [...(props.chart_config?.color ?? ["#5b9bd5", "#ed7d31"])],
		dataLabels: {
			enabled: true,
			// 顯示絕對值；空值不顯示
			formatter: (val) => {
				const abs = Math.abs(Number(val));
				return abs === 0 ? "" : abs;
			},
			style: {
				fontSize: "11px",
				colors: ["#fff"],
			},
		},
		grid: {
			show: false,
		},
		legend: {
			show: true,
			position: "top",
			offsetY: 4,
			markers: { radius: 2 },
		},
		plotOptions: {
			bar: {
				horizontal: true,
				borderRadius: 2,
				barHeight: "65%",
				dataLabels: { position: "center" },
			},
		},
		stroke: {
			colors: ["transparent"],
			show: true,
			width: 2,
		},
		tooltip: {
			// The class "chart-tooltip" could be edited in /assets/styles/chartStyles.css
			custom: function ({ series, seriesIndex, dataPointIndex, w }) {
				const rawVal = Math.abs(series[seriesIndex][dataPointIndex]);
				const label = categories.value[dataPointIndex] ?? "";
				const seriesName = w.globals.seriesNames[seriesIndex];
				return (
					'<div class="chart-tooltip">' +
					"<h6>" +
					seriesName +
					(label ? " — " + label : "") +
					"</h6>" +
					"<span>" +
					rawVal +
					` ${props.chart_config?.unit ?? ""}` +
					"</span>" +
					"</div>"
				);
			},
			followCursor: true,
		},
		xaxis: {
			// xaxis 是數值軸（左負右正），categories 給的是 Y 軸（醫院名）
			axisBorder: { show: false },
			axisTicks: { show: false },
			labels: {
				// 顯示絕對值，不顯示負號
				formatter: (val) => Math.abs(Math.round(Number(val))).toString(),
			},
		},
		yaxis: {
			// Y 軸顯示醫院名（categories 對應到每一行）
			categories: categories.value,
			labels: {
				maxWidth: 100,
				formatter: (value) => {
					if (!value) return value;
					return value.length > 7 ? value.slice(0, 6) + "…" : value;
				},
			},
		},
	};
}

const chartOptions = ref(buildOptions());

watch(
	[() => props.series, categories],
	() => {
		chartOptions.value = buildOptions();
	},
	{ deep: true, immediate: false }
);

// -------------------------------------------------------
// 互動：地圖篩選
// -------------------------------------------------------
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
				categories.value[config.dataPointIndex] ?? "",
				config.w.globals.seriesNames[config.seriesIndex]
			);
		} else if (props.map_filter.mode === "byLayer") {
			emits(
				"filterByLayer",
				props.map_config,
				categories.value[config.dataPointIndex] ?? ""
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
