<!-- Developed by Taipei Urban Intelligence Center 2023-2024-->

<script setup>
import { computed, onUnmounted, ref, watch } from "vue";
import { useMapStore } from "../../store/mapStore";

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
	"fly"
]);

const steps = ref(100);
// Rose-mauve palette (image reference)
const failColor = "#7A5260";   // deep rose-mauve  – for fail / alert slices
const passColor = "#A88090";   // mid  rose-mauve  – for pass / main slices
const neutralColor = "#7A8FA8"; // steel-blue       – for everything else
const selectedIndex = ref(null);
const mapStore = useMapStore();
const chartProgress = ref(1);
const hoveredSlice = ref(null);
const mousePosition = ref({ x: null, y: null });
let stopChartAnimation = null;

const center = 110;
const radius = 82;
const startOffset = -90;

function isFailLabel(label = "") {
	const normalized = label.toLowerCase();
	return [
		"不合格",
		"未合格",
		"不通過",
		"異常",
		"fail",
		"failed",
	].some((keyword) => normalized.includes(keyword));
}

function isPassLabel(label = "") {
	const normalized = label.toLowerCase();
	return [
		"合格",
		"通過",
		"pass",
		"passed",
	].some((keyword) => normalized.includes(keyword));
}

function getDisplayLabel(label = "") {
	if (isFailLabel(label)) return "不合格率";
	if (isPassLabel(label)) return "合格率";
	return label;
}

function clamp(value, min, max) {
	return Math.min(Math.max(value, min), max);
}

function polarToCartesian(angle, distance = radius) {
	const radians = (angle * Math.PI) / 180;
	return {
		x: center + distance * Math.cos(radians),
		y: center + distance * Math.sin(radians),
	};
}

function getLabelPosition(startAngle, endAngle, percent) {
	const middleAngle = startAngle + (endAngle - startAngle) / 2;
	const distance = percent < 6 ? radius * 0.74 : radius * 0.58;

	return polarToCartesian(middleAngle, distance);
}

function getCalloutGeometry(startAngle, endAngle) {
	const middleAngle = startAngle + (endAngle - startAngle) / 2;
	const anchor = polarToCartesian(middleAngle, radius * 0.96);
	const elbow = polarToCartesian(middleAngle, radius * 1.12);
	const labelX = clamp(elbow.x, 54, 166);
	const labelY = clamp(elbow.y - 6, 22, 46);

	return {
		line: `M ${anchor.x} ${anchor.y} L ${elbow.x} ${elbow.y} L ${labelX} ${labelY + 10}`,
		labelX,
		labelY,
	};
}

function describeSlice(startAngle, endAngle) {
	const start = polarToCartesian(startAngle);
	const end = polarToCartesian(endAngle);
	const largeArcFlag = endAngle - startAngle > 180 ? 1 : 0;
	return [
		`M ${center} ${center}`,
		`L ${start.x} ${start.y}`,
		`A ${radius} ${radius} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`,
		"Z",
	].join(" ");
}

function easeOutCubic(value) {
	return 1 - Math.pow(1 - value, 3);
}

function stopPieAnimation() {
	if (stopChartAnimation) {
		stopChartAnimation();
		stopChartAnimation = null;
	}
}

const tooltipPosition = computed(() => {
	if (!mousePosition.value.x || !mousePosition.value.y) {
		return {
			left: "-1000px",
			top: "-1000px",
		};
	}
	const tooltipWidth = 120;
	const tooltipHeight = 58;
	const viewportWidth = window.innerWidth;
	const viewportHeight = window.innerHeight;
	const shouldFlipX =
		mousePosition.value.x + tooltipWidth + 18 > viewportWidth;
	const shouldFlipY =
		mousePosition.value.y + tooltipHeight + 12 > viewportHeight;

	return {
		left: shouldFlipX
			? `${mousePosition.value.x - tooltipWidth - 8}px`
			: `${mousePosition.value.x + 14}px`,
		top: shouldFlipY
			? `${mousePosition.value.y - tooltipHeight - 8}px`
			: `${mousePosition.value.y - 12}px`,
	};
});

const tooltipValue = computed(() => {
	if (!hoveredSlice.value) return "";
	if (unit.value) {
		return `${hoveredSlice.value.value}${unit.value}`;
	}
	return hoveredSlice.value.valueText;
});

function updateMouseLocation(event) {
	mousePosition.value.x = event.clientX;
	mousePosition.value.y = event.clientY;
}

function showSliceTooltip(event, slice) {
	hoveredSlice.value = slice;
	updateMouseLocation(event);
}

function hideSliceTooltip() {
	hoveredSlice.value = null;
}

const parsedItems = computed(() => {
	if (!props.series?.length) {
		return [];
	}
	const firstDatum = props.series[0]?.data?.[0];
	if (
		firstDatum &&
		typeof firstDatum === "object" &&
		Object.hasOwn(firstDatum, "x") &&
		Object.hasOwn(firstDatum, "y")
	) {
		return props.series[0].data.map((item) => ({
			label: item.x,
			value: Number(item.y || 0),
		}));
	}
	return props.series.map((item) => ({
		label: item.name,
		value: Number(item.data?.[0] || 0),
	}));
});

const displayedItems = computed(() => {
	const toParse = [...parsedItems.value];
	if (toParse.length <= steps.value) {
		return toParse;
	}
	const visibleItems = toParse.slice(0, steps.value);
	const otherValue = toParse
		.slice(steps.value)
		.reduce((sum, item) => sum + item.value, 0);
	return [
		...visibleItems,
		{
			label: "其他",
			value: otherValue,
		},
	];
});

const parsedTotal = computed(() =>
	displayedItems.value.reduce((sum, item) => sum + item.value, 0)
);

const unit = computed(() => props.chart_config?.unit ?? "");

const chartColors = computed(() =>
	displayedItems.value.map((item, index) => {
		if (isFailLabel(item.label)) return failColor;
		if (isPassLabel(item.label)) return passColor;
		return props.chart_config?.color?.[index] ?? neutralColor;
	})
);

const slices = computed(() => {
	let cursor = startOffset;
	const revealedAngle = 360 * chartProgress.value;
	return displayedItems.value.map((item, index) => {
		const ratio = parsedTotal.value ? item.value / parsedTotal.value : 0;
		const angle = ratio * 360;
		const endAngle = cursor + angle;
		const animatedEndAngle = Math.min(
			endAngle,
			startOffset + revealedAngle
		);
		const visibleAngle = Math.max(animatedEndAngle - cursor, 0);
		const percent = Math.round(ratio * 1000) / 10;
		const labelPosition = getLabelPosition(cursor, endAngle, percent);
		const calloutGeometry = getCalloutGeometry(cursor, endAngle);
		const slice = {
			...item,
			index,
			color: chartColors.value[index],
			displayLabel: getDisplayLabel(item.label),
			percent,
			isExternalLabel: percent < 8,
			labelX: labelPosition.x,
			labelY: labelPosition.y,
			labelSize: percent < 6 ? 7.5 : 11,
			calloutPath: calloutGeometry.line,
			calloutX: calloutGeometry.labelX,
			calloutY: calloutGeometry.labelY,
			valueText: unit.value === "%"
				? `${item.value}%`
				: `${percent}%`,
			isVisible: visibleAngle > 0.2,
			labelOpacity: clamp((chartProgress.value - index * 0.08) * 2.5, 0, 1),
			path: describeSlice(cursor, visibleAngle > 0.2 ? animatedEndAngle : cursor),
		};
		cursor = endAngle;
		return slice;
	});
});

function startPieAnimation() {
	stopPieAnimation();
	selectedIndex.value = null;

	if (props.activeChart !== "PieChart" || displayedItems.value.length === 0) {
		chartProgress.value = 1;
		return;
	}

	chartProgress.value = 0;
	stopChartAnimation = mapStore.animateProgress({
		from: 0,
		to: 1,
		duration: 900,
		onUpdate: (_progress, ratio) => {
			chartProgress.value = easeOutCubic(ratio);
		},
		onComplete: () => {
			chartProgress.value = 1;
			stopChartAnimation = null;
		},
	});
}

watch(
	[
		() => props.activeChart,
		() => props.series,
		displayedItems,
	],
	startPieAnimation,
	{
		deep: true,
		immediate: true,
	}
);

onUnmounted(stopPieAnimation);

function handleDataSelection(index) {
	if (!props.map_filter || !props.map_filter_on) {
		return;
	}
	const item = slices.value[index];
	if (!item) return;

	if (`${index}-0` !== selectedIndex.value) {
		if (props.map_filter.mode === "byParam") {
			emits(
				"filterByParam",
				props.map_filter,
				props.map_config,
				item.label,
				null
			);
		} else if (props.map_filter.mode === "byLayer") {
			emits("filterByLayer", props.map_config, item.label);
		}
		selectedIndex.value = `${index}-0`;
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
    v-if="activeChart === 'PieChart'"
    class="piechart"
  >
    <div class="piechart__visual">
      <svg
        class="piechart__svg"
        viewBox="0 0 220 220"
        role="img"
      >
        <circle
          :cx="center"
          :cy="center"
          :r="radius"
          class="piechart__base"
        />
        <path
          v-for="slice in slices"
          :key="slice.label"
          class="piechart__slice"
          :class="{ 'is-selected': selectedIndex === `${slice.index}-0` }"
          :style="{
            '--slice-index': slice.index,
            opacity: slice.isVisible ? 1 : 0,
          }"
          :d="slice.path"
          :fill="slice.color"
          @mouseenter="showSliceTooltip($event, slice)"
          @mousemove="updateMouseLocation"
          @mouseleave="hideSliceTooltip"
          @click="handleDataSelection(slice.index)"
        />
        <circle
          :cx="center"
          :cy="center"
          :r="radius"
          class="piechart__outline"
        />
        <g class="piechart__labels">
          <g
            v-for="slice in slices"
            :key="`${slice.label}-label`"
            class="piechart__label-group"
            :style="{
              '--slice-index': slice.index,
              opacity: slice.labelOpacity,
            }"
          >
            <template v-if="slice.isExternalLabel">
              <path
                class="piechart__callout-line"
                :d="slice.calloutPath"
              />
              <text
                class="piechart__callout-label"
                :x="slice.calloutX"
                :y="slice.calloutY"
              >
                <tspan
                  :x="slice.calloutX"
                  dy="0"
                >
                  {{ slice.displayLabel }}
                </tspan>
                <tspan
                  :x="slice.calloutX"
                  dy="1.2em"
                  class="piechart__callout-value"
                >
                  {{ slice.valueText }}
                </tspan>
              </text>
            </template>
            <text
              v-else
              class="piechart__label"
              :x="slice.labelX"
              :y="slice.labelY"
              :font-size="slice.labelSize"
            >
              <tspan
                :x="slice.labelX"
                dy="-0.1em"
              >
                {{ slice.displayLabel }}
              </tspan>
              <tspan
                :x="slice.labelX"
                dy="1.12em"
                class="piechart__label-value"
              >
                {{ slice.valueText }}
              </tspan>
            </text>
          </g>
        </g>
        <circle
          :cx="center"
          :cy="center"
          :r="1.8"
          class="piechart__hub"
          :style="{ opacity: chartProgress }"
        />
      </svg>
      <Teleport to="body">
        <div
          v-if="hoveredSlice"
          class="piechart__tooltip chart-tooltip"
          :style="tooltipPosition"
        >
          <h6>{{ hoveredSlice.displayLabel }}</h6>
          <span>{{ tooltipValue }}</span>
        </div>
      </Teleport>
    </div>
  </div>
</template>

<style scoped lang="scss">
.piechart {
	height: 100%;
	width: 100%;
	display: flex;
	align-items: center;
	justify-content: center;
	overflow: hidden;

	&__visual {
		width: min(80%, 22rem);
		aspect-ratio: 1;
		min-height: 0;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	&__svg {
		width: 100%;
		height: 100%;
		display: block;
		overflow: visible;
		filter: drop-shadow(0 10px 16px rgba(0, 0, 0, 0.16));
	}

	&__base {
		fill: rgba(255, 255, 255, 0.04);
	}

	&__slice {
		stroke: none;          // remove dark border between slices
		cursor: pointer;
		transform-box: fill-box;
		transform-origin: center;
		transition:
			opacity 0.16s ease,
			filter 0.16s ease,
			transform 0.16s ease;

		&:hover {
			opacity: 0.88;
			filter: brightness(1.08);
			transform: scale(1.025);
		}

		&.is-selected {
			filter: brightness(1.16) drop-shadow(0 0 8px rgba(255, 255, 255, 0.22));
			transform: scale(1.035);
		}
	}

	&__outline {
		fill: none;
		stroke: rgba(255, 255, 255, 0.12);
		stroke-width: 1;
		pointer-events: none;
	}

	&__labels {
		pointer-events: none;
	}

	&__label-group {
		transition: opacity 0.16s ease;
	}

	&__label,
	&__callout-label {
		text-anchor: middle;
		letter-spacing: 0;
	}

	&__label {
		fill: rgba(255, 255, 255, 0.92);
		font-weight: 700;
	}

	&__label-value {
		font-size: 1.22em;
		font-weight: 800;
	}

	&__callout-line {
		fill: none;
		stroke: rgba(255, 255, 255, 0.5);
		stroke-width: 1.15;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	&__callout-label {
		fill: rgba(255, 255, 255, 0.94);
		font-size: 8.6px;
		font-weight: 600;
	}

	&__callout-value {
		font-size: 1.28em;
		font-weight: 800;
	}

	&__hub {
		fill: rgba(30, 28, 32, 0.72);
		pointer-events: none;
		transition: opacity 0.16s ease;
	}

	&__tooltip {
		position: fixed;
		z-index: 20;
		pointer-events: none;
		min-width: min-content;
		white-space: nowrap;
	}
}

@media (prefers-reduced-motion: reduce) {
	.piechart {
		&__slice {
			transition: opacity 0.16s ease, filter 0.16s ease;

			&:hover,
			&.is-selected {
				transform: none;
			}
		}
	}
}
</style>
