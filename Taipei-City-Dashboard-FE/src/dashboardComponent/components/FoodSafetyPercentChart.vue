<script setup>
import { computed } from "vue";

const props = defineProps(["activeChart", "series", "chart_config"]);

const chartItems = computed(() => {
	const passItem = (props.series || []).find((item) =>
		item.name?.includes("合格")
	);
	const failItem = (props.series || []).find((item) =>
		item.name?.includes("不合格")
	);

	return [
		{
			key: "pass",
			label: "合格率",
			value: averageValue(passItem?.data),
			color: props.chart_config?.color?.[0] ?? "#8ED766",
		},
		{
			key: "fail",
			label: "不合格率",
			value: averageValue(failItem?.data),
			color: props.chart_config?.color?.[1] ?? "#E4473F",
		},
	];
});

function averageValue(values = []) {
	const numbers = values
		.map((value) => Number(value))
		.filter((value) => Number.isFinite(value));

	if (!numbers.length) return 0;

	return Math.round(
		numbers.reduce((sum, value) => sum + value, 0) / numbers.length
	);
}
</script>

<template>
  <div
    v-if="activeChart === 'FoodSafetyPercentChart'"
    class="food-safety-percent-chart"
  >
    <div class="food-safety-percent-chart__panel">
      <div
        v-for="item in chartItems"
        :key="item.key"
        class="food-safety-percent-chart__metric"
      >
        <div
          class="food-safety-percent-chart__value"
          :style="{ color: item.color }"
        >
          {{ item.value }}%
        </div>
        <div class="food-safety-percent-chart__label">
          {{ item.label }}
        </div>
      </div>
    </div>
    <div class="food-safety-percent-chart__badge">
      食品抽樣率
    </div>
  </div>
</template>

<style scoped lang="scss">
.food-safety-percent-chart {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 1.65rem;
	min-height: 18rem;
	height: 100%;
	color: var(--color-normal-text);
	overflow: hidden;

	&__panel {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		align-items: center;
		width: min(100%, 48rem);
		gap: 2rem;
	}

	&__metric {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-width: 0;
		text-align: center;
	}

	&__value {
		font-size: clamp(1.65rem, 3.35vw, 2.95rem);
		font-weight: 800;
		line-height: 1;
		white-space: nowrap;
	}

	&__label {
		margin-top: 0.55rem;
		font-size: clamp(0.9rem, 1.65vw, 1.35rem);
		font-weight: 800;
		line-height: 1.15;
		color: var(--color-normal-text);
		white-space: nowrap;
	}

	&__badge {
		display: flex;
		align-items: center;
		justify-content: center;
		min-width: 4.9rem;
		height: 1.35rem;
		padding: 0 0.42rem;
		border: 2px solid var(--color-complement-text);
		border-radius: 7px;
		font-size: 0.72rem;
		font-weight: 500;
		line-height: 1;
		color: var(--color-normal-text);
		background: rgba(255, 255, 255, 0.12);
	}
}

@media (max-width: 640px) {
	.food-safety-percent-chart {
		gap: 1.25rem;
		min-height: 15rem;

		&__panel {
			gap: 1rem;
		}

		&__value {
			font-size: 1.48rem;
		}

		&__label {
			font-size: 0.82rem;
		}

		&__badge {
			min-width: 4.6rem;
			height: 1.3rem;
			font-size: 0.68rem;
		}
	}
}
</style>
