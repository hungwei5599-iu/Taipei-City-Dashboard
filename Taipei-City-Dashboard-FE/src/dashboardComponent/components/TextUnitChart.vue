
<script setup>
import { computed } from "vue";

const props = defineProps([
	"chart_config",
	"activeChart",
	"series",
	"map_config",
	"map_filter",
	"map_filter_on",
]);

function normalizeNumbers(values) {
	return (Array.isArray(values) ? values : [values])
		.map((value) => Number(value))
		.filter((value) => Number.isFinite(value));
}

function summarizeItem(item) {
	const values = normalizeNumbers(item.data);
	if (!values.length) return 0;

	if (props.chart_config?.unit === "%") {
		return Math.round(
			values.reduce((sum, value) => sum + value, 0) / values.length
		);
	}

	return values.reduce((sum, value) => sum + value, 0);
}

function isAlertItem(name = "") {
	return `${name}`.includes("不合格") || `${name}`.includes("異常");
}

function getItemColors(item) {
	const defaultLabel = props.chart_config.color?.[0] || "var(--color-normal-text)";
	const defaultValue =
		props.chart_config.color?.[1] ||
		props.chart_config.color?.[0] ||
		"var(--color-normal-text)";
	const defaultUnit =
		props.chart_config.color?.[2] ||
		props.chart_config.color?.[1] ||
		props.chart_config.color?.[0] ||
		"var(--color-normal-text)";

	if (!isAlertItem(item.name)) {
		return {
			label: defaultLabel,
			value: defaultValue,
			unit: defaultUnit,
		};
	}

	return {
		label: "#E58F8F",
		value: "#F19A9A",
		unit: "#B97C7C",
	};
}

const displayItems = computed(() =>
	props.series.map((item) => ({
		...item,
		total: summarizeItem(item),
		colors: getItemColors(item),
	}))
);
</script>

<template>
  <div
    v-if="activeChart === 'TextUnitChart'"
    class="TextUnitChart"
  >
    <div class="TextUnitChart__container">
      <div
        v-for="item in displayItems"
        :key="item.name"
        class="TextUnitChart__content"
      >
        <div
          class="TextUnitChart__name"
          :style="{ color: item.colors.label }"
        >
          {{ item.name }}
        </div>
        <div>
          <span
            class="TextUnitChart__value"
            :style="{ color: item.colors.value }"
          >{{ item.total }}</span>
          <span
            class="TextUnitChart__unit"
            :style="{ color: item.colors.unit }"
          >{{ item.icon }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.TextUnitChart {
	position: relative;
	max-height: 100%;
	height: 100%;
	flex: 1;
	color: var(--color-normal-text);
	overflow-y: auto;

	&__container {
		display: grid;
		grid-template-columns: 1fr 1fr;
		min-height: 100%
	}
	&__content {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 1rem;
		border-bottom: 1px solid var(--color-border);

		// 右邊框（不包括每行最後一個）
		&:not(:nth-child(2n)) {
			border-right: 1px solid var(--color-border);
		}
    
		// 移除最後一個項目的底部邊框
		&:last-child {
			border-bottom: none;
		}
    
		// 倒數第二個如果在右邊（偶數位置），移除底部邊框
		&:nth-last-child(2):nth-child(2n-1) {
			border-bottom: none;
		}
	}
	&__value {
		font-size: 1.5rem;
		padding-right: 0.25rem;
	}
}
</style>
