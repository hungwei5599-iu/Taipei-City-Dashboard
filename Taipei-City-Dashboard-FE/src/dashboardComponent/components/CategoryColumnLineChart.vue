<!-- Developed by Taipei Urban Intelligence Center 2023-2024-->

<script setup>
import { computed, ref } from "vue";
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

const selectedIndex = ref(null);

const columnSeriesIndex = computed(() => {
	const explicit = props.chart_config?.column_series_index;
	if (Number.isInteger(explicit)) return explicit;
	const index = props.series?.findIndex((serie) =>
		/待診|人數|數量|件數|家數/.test(serie.name ?? "")
	);
	return index >= 0 ? index : 0;
});

const lineSeriesIndex = computed(() => {
	const explicit = props.chart_config?.line_series_index;
	if (Number.isInteger(explicit)) return explicit;
	const index = props.series?.findIndex((serie, idx) =>
		idx !== columnSeriesIndex.value &&
		/等候|等待|時間|分鐘|率|比例/.test(serie.name ?? "")
	);
	if (index >= 0) return index;
	return columnSeriesIndex.value === 0 ? 1 : 0;
});

const columnSeriesRaw = computed(() =>
	props.series?.[columnSeriesIndex.value] ?? props.series?.[0] ?? { name: "", data: [] }
);
const lineSeriesRaw = computed(() =>
	props.series?.[lineSeriesIndex.value] ?? props.series?.[1] ?? { name: "", data: [] }
);

const rows = computed(() => {
	const categories = props.chart_config?.categories ?? [];
	const columnData = columnSeriesRaw.value?.data ?? [];
	const lineData = lineSeriesRaw.value?.data ?? [];

	const parsed = categories.map((category, index) => {
		const columnValue = parseValue(columnData[index]);
		const lineValue = parseValue(lineData[index]);
		return {
			category,
			columnValue,
			lineValue,
			pressure: pressureScore(columnValue, lineValue),
		};
	});

	const sortMode = props.chart_config?.category_column_line_sort ?? "pressure";
	if (sortMode === "none") return parsed;
	if (sortMode === "column") {
		return [...parsed].sort((a, b) => b.columnValue - a.columnValue);
	}
	if (sortMode === "line") {
		return [...parsed].sort((a, b) => b.lineValue - a.lineValue);
	}
	return [...parsed].sort((a, b) => b.pressure - a.pressure);
});

const sortedCategories = computed(() => rows.value.map((row) => row.category));

const chartSeries = computed(() => [
	{
		name: columnSeriesRaw.value?.name ?? "數值",
		type: "column",
		data: rows.value.map((row) => row.columnValue),
	},
	{
		name: lineSeriesRaw.value?.name ?? "趨勢",
		type: "line",
		data: rows.value.map((row) => row.lineValue),
	},
]);

const isDenseData = computed(() => rows.value.length > 8);

const barColumnWidth = computed(() => {
	if (rows.value.length > 18) return "34%";
	if (rows.value.length > 12) return "42%";
	return "54%";
});

function buildAxisMax(values) {
	const max = Math.max(...values, 0);
	if (max <= 0) return 10;
	return Math.ceil(max * 1.25);
}

const columnAxisMax = computed(() =>
	buildAxisMax(rows.value.map((row) => row.columnValue))
);

const lineAxisMax = computed(() =>
	buildAxisMax(rows.value.map((row) => row.lineValue))
);

// Computed labels exposed for the custom vertical-text overlay
const leftAxisLabel = computed(() => axisLabel(columnSeriesRaw.value?.name, "column_unit"));
const rightAxisLabel = computed(() => axisLabel(lineSeriesRaw.value?.name, "line_unit"));

const chartOptions = computed(() => {
	const colors = props.chart_config?.color?.length >= 2
		? [props.chart_config.color[0], props.chart_config.color[1]]
		: ["#68C7D4", "#FFE184"];

	return {
		chart: {
			toolbar: { show: false },
			zoom: { enabled: false },
		},
		colors,
		dataLabels: {
			enabled: false,
		},
		grid: {
			show: true,
			borderColor: "rgba(255,255,255,0.08)",
			strokeDashArray: 3,
			padding: {
				top: 16,
				right: 12,
				bottom: 8,
				left: 8,
			},
			xaxis: { lines: { show: false } },
			yaxis: { lines: { show: true } },
		},
		legend: {
			show: true,
			offsetY: 4,
			markers: { radius: [2, 20] },
		},
		markers: {
			size: 4,
			strokeWidth: 0,
			hover: { size: 6 },
		},
		plotOptions: {
			bar: {
				borderRadius: 4,
				columnWidth: barColumnWidth.value,
			},
		},
		stroke: {
			width: [0, 3],
			curve: "smooth",
		},
		tooltip: {
			custom: function ({
				series,
				seriesIndex,
				dataPointIndex,
				w,
			}) {
				const category = sortedCategories.value[dataPointIndex];
				const name = w.globals.seriesNames[seriesIndex];
				const unit = seriesIndex === 0
					? axisUnit(columnSeriesRaw.value?.name, "column_unit")
					: axisUnit(lineSeriesRaw.value?.name, "line_unit");
				return (
					'<div class="chart-tooltip">' +
					"<h6>" +
					`${category} - ${name}` +
					"</h6>" +
					"<span>" +
					`${series[seriesIndex][dataPointIndex]} ${unit}` +
					"</span>" +
					"</div>"
				);
			},
			followCursor: true,
			intersect: true,
			shared: false,
		},
		xaxis: {
			axisBorder: {
				color: "#555",
				height: "0.8",
			},
			axisTicks: { show: false },
			categories: sortedCategories.value,
			labels: {
				rotate: 0,
				rotateAlways: false,
				trim: false,
				hideOverlappingLabels: false,
				style: { colors: "rgba(255,255,255,0.56)" },
				formatter: function (value) {
					const text = String(value ?? "");
					const maxLength = isDenseData.value ? 6 : 8;
					const truncated = text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
					// Split each character onto its own line so ApexCharts renders
					// them as stacked <tspan> elements – true top-to-bottom vertical text.
					return truncated.split("");
				},
			},
			tooltip: { enabled: false },
			type: "category",
		},
		yaxis: [
			{
				min: 0,
				max: columnAxisMax.value,
				forceNiceScale: true,
				tickAmount: 4,
				labels: {
					formatter: (val) => Number(val).toFixed(0),
					style: { colors: "rgba(255,255,255,0.56)" },
				},
				// Title disabled – rendered by custom CSS overlay below
				title: { text: "" },
			},
			{
				min: 0,
				max: lineAxisMax.value,
				forceNiceScale: true,
				tickAmount: 4,
				opposite: true,
				labels: {
					formatter: (val) => Number(val).toFixed(0),
					style: { colors: "rgba(255,255,255,0.56)" },
				},
				// Title disabled – rendered by custom CSS overlay below
				title: { text: "" },
			},
		],
	};
});

function parseValue(value) {
	if (value && typeof value === "object") {
		return Number(value.y ?? value.value ?? 0);
	}
	return Number(value ?? 0);
}

function pressureScore(columnValue, lineValue) {
	const maxColumn = Math.max(
		...((columnSeriesRaw.value?.data ?? []).map(parseValue)),
		1
	);
	const maxLine = Math.max(
		...((lineSeriesRaw.value?.data ?? []).map(parseValue)),
		1
	);
	return (columnValue / maxColumn) * 0.48 + (lineValue / maxLine) * 0.52;
}

function axisUnit(label, key) {
	const explicitUnit = props.chart_config?.[key];
	if (explicitUnit) return explicitUnit;

	const text = String(label ?? "");
	if (/待診|人數|數量|件數|家數/.test(text)) return "人";
	if (/等候|等待|時間|分鐘/.test(text)) return "分鐘";
	if (/率|比例|百分比/.test(text)) return "%";
	return props.chart_config?.unit ?? "";
}

function axisLabel(label, unitKey) {
	const unit = axisUnit(label, unitKey);
	return unit ? `${label}（${unit}）` : (label ?? "");
}

function handleDataSelection(_e, _chartContext, config) {
	if (!props.map_filter || !props.map_filter_on) {
		return;
	}
	const key = `${config.dataPointIndex}-${config.seriesIndex}`;
	const category = sortedCategories.value[config.dataPointIndex];

	if (key !== selectedIndex.value) {
		if (props.map_filter.mode === "byParam") {
			emits(
				"filterByParam",
				props.map_filter,
				props.map_config,
				category,
				config.w.globals.seriesNames[config.seriesIndex],
			);
		} else if (props.map_filter.mode === "byLayer") {
			emits("filterByLayer", props.map_config, category);
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
  <div
    v-if="activeChart === 'CategoryColumnLineChart'"
    class="category-column-line-chart"
  >
    <!-- Custom vertical axis title – left (column series) -->
    <div class="axis-title axis-title--left" aria-hidden="true">
      {{ leftAxisLabel }}
    </div>

    <VueApexCharts
      type="line"
      width="100%"
      height="260px"
      :options="chartOptions"
      :series="chartSeries"
      @data-point-selection="handleDataSelection"
    />

    <!-- Custom vertical axis title – right (line series) -->
    <div class="axis-title axis-title--right" aria-hidden="true">
      {{ rightAxisLabel }}
    </div>
  </div>
</template>

<style scoped lang="scss">
.category-column-line-chart {
	position: relative;
	width: 100%;
	height: 100%;
	min-width: 0;
	max-width: 100%;
	overflow-x: hidden;
	overflow-y: hidden;

	.vue-apexcharts {
		justify-content: unset !important;
		max-width: 100%;
	}

	// Custom vertical axis title labels
	.axis-title {
		position: absolute;
		top: 50%;
		transform: translateY(-50%);
		writing-mode: vertical-rl;
		text-orientation: upright;
		font-size: 10px;
		letter-spacing: 0.05em;
		color: var(--color-complement-text, rgba(255, 255, 255, 0.56));
		pointer-events: none;
		user-select: none;
		z-index: 1;
	}

	.axis-title--left {
		left: 0;
		transform: translateY(-50%);
	}

	.axis-title--right {
		right: 0;
		transform: translateY(-50%);
		// Right-side title reads bottom-to-top in vertical-rl;
		// rotate 180° to make it read top-to-bottom as well.
		writing-mode: vertical-lr;
	}
}
</style>
