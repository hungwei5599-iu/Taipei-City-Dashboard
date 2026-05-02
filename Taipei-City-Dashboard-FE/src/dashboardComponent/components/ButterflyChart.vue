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
// 資料格式偵測：相容兩種格式
//   格式A (純數字陣列):  { name, data: [15, 30, 45] }
//   格式B (物件陣列):    { name, data: [{x:"醫院A", y:15}, ...] }
// -------------------------------------------------------

// 從 series[0] 自動抽取 categories（格式B 使用）
const autoCategories = computed(() => {
	const first = props.series?.[0]?.data;
	if (!first || !first.length) return [];
	if (typeof first[0] === "object" && first[0] !== null && "x" in first[0]) {
		return first.map((d) => d.x);
	}
	return [];
});

// 判斷是否為物件陣列格式
const isObjectFormat = computed(() => autoCategories.value.length > 0);

// series[0] → 左側長條（負值），series[1] → 右側長條（正值）
const parseSeries = computed(() => {
	if (!props.series || props.series.length < 2) return props.series;

	const negateData = (data) =>
		data.map((v) => {
			if (typeof v === "number") return -Math.abs(v);
			if (typeof v === "object" && v !== null && "y" in v) {
				return { ...v, y: -Math.abs(v.y) };
			}
			return v;
		});

	// 格式B：取出純數字給 ApexCharts（categories 另外設定）
	const flattenData = (data) =>
		isObjectFormat.value ? data.map((d) => d.y) : data;

	return [
		{
			...props.series[0],
			data: negateData(flattenData(props.series[0].data)),
		},
		{
			...props.series[1],
			data: flattenData(props.series[1].data),
		},
	];
});

// 最終使用的 categories（優先 chart_config，其次自動抽取）
const finalCategories = computed(() => {
	if (props.chart_config.categories?.length) return props.chart_config.categories;
	return autoCategories.value;
});

// 動態高度
const chartHeight = computed(() => {
	const rows = props.series?.[0]?.data?.length ?? 6;
	return `${60 + rows * 34}`;
});

// -------------------------------------------------------
// Chart Options
// -------------------------------------------------------
const chartOptions = ref(buildOptions());

function buildOptions() {
	return {
		chart: {
			type: "bar",
			stacked: true,
			toolbar: { show: false },
		},
		colors: [...props.chart_config.color],
		dataLabels: {
			enabled: true,
			formatter: (val) => (val === 0 ? "" : Math.abs(val)),
			offsetX: 0,
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
			markers: {
				radius: 2,
			},
		},
		plotOptions: {
			bar: {
				horizontal: true,
				borderRadius: 2,
				barHeight: "65%",
				dataLabels: {
					position: "center",
				},
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
				const label = w.globals.labels[dataPointIndex] ?? "";
				const seriesName = w.globals.seriesNames[seriesIndex];
				return (
					'<div class="chart-tooltip">' +
					"<h6>" +
					seriesName +
					(label ? " — " + label : "") +
					"</h6>" +
					"<span>" +
					rawVal +
					` ${props.chart_config.unit ?? ""}` +
					"</span>" +
					"</div>"
				);
			},
			followCursor: true,
		},
		xaxis: {
			axisBorder: { show: false },
			axisTicks: { show: false },
			categories: finalCategories.value,
			labels: {
				formatter: (val) => Math.abs(Math.round(Number(val))).toString(),
			},
			type: "category",
		},
		yaxis: {
			labels: {
				maxWidth: 120,
				formatter: (value) => {
					if (!value) return value;
					return value.length > 8 ? value.slice(0, 7) + "…" : value;
				},
			},
		},
	};
}

// 當 series 或 categories 變化時重新建立 options（確保 xaxis.categories 更新）
watch(
	[() => props.series, finalCategories],
	() => {
		chartOptions.value = buildOptions();
	},
	{ deep: true }
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
