<!-- Developed by Taipei Urban Intelligence Center 2023-2024-->

<script setup>
import { computed, ref } from "vue";

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
const failColor = "#D95D5D";
const passColor = "#A7DAB4";
const neutralColor = "#8F98A9";
const selectedIndex = ref(null);

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
	return displayedItems.value.map((item, index) => {
		const ratio = parsedTotal.value ? item.value / parsedTotal.value : 0;
		const angle = ratio * 360;
		const endAngle = cursor + angle;
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
			path: describeSlice(cursor, endAngle),
		};
		cursor = endAngle;
		return slice;
	});
});

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
          :d="slice.path"
          :fill="slice.color"
          @click="handleDataSelection(slice.index)"
        >
          <title>
            {{ slice.displayLabel }} {{ slice.value }}{{ unit }}
          </title>
        </path>
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
        />
      </svg>
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
		stroke: #2b2d30;
		stroke-width: 2.6;
		stroke-linejoin: round;
		cursor: pointer;
		transition: opacity 0.16s ease, filter 0.16s ease;

		&:hover {
			opacity: 0.96;
			filter: brightness(1.02);
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

	&__label,
	&__callout-label {
		text-anchor: middle;
		letter-spacing: 0;
	}

	&__label {
		fill: #1f2721;
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
		fill: #2b2d30;
		pointer-events: none;
	}
}
</style>
