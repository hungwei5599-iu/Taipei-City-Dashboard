<script setup>
import { computed } from "vue";

const props = defineProps(["activeChart", "series", "chart_config"]);

const metrics = computed(() =>
	(props.series || []).map((item, index) => ({
		name: `${areaLabel.value}${item.name}`,
		value: Math.round(
			(item.data || []).reduce((sum, value) => sum + Number(value || 0), 0) /
				(item.data?.length || 1)
		),
		color: props.chart_config?.color?.[index] ?? "#7BDCA8",
	}))
);

const areaLabel = computed(() => {
	const categories = props.chart_config?.categories || [];
	if (categories.length > 1) return "雙北";
	return categories[0] || "";
});
</script>

<template>
  <div
    v-if="activeChart === 'FoodSafetyPercentChart'"
    class="food-safety-percent-chart"
  >
    <div class="food-safety-percent-chart__title">
      <div
        v-for="item in metrics"
        :key="item.name"
        class="food-safety-percent-chart__content"
      >
        <h2>
          {{ item.name }}
          <span
            class="food-safety-percent-chart__percentage"
            :style="{ color: item.color }"
          >{{ item.value }}</span>
          %
        </h2>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.food-safety-percent-chart {
	position: relative;
	max-height: 100%;
	color: var(--color-normal-text);
	overflow: hidden;

	&__title {
		display: flex;
		justify-content: space-around;
		margin: var(--font-ms) var(--font-ms);
		padding-top: 2.8rem;
	}

	&__content {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-width: 0;
	}

	h2 {
		font-size: var(--font-m);
		font-weight: 700;
		white-space: nowrap;
	}

	&__percentage {
		padding: 0 0.3em;
		font-size: 1.3rem;
	}
}

@media (max-width: 640px) {
	.food-safety-percent-chart {
		&__title {
			gap: 0.8rem;
			margin: var(--font-s) 0;
			padding-top: 1.5rem;
		}

		h2 {
			font-size: 1.1rem;
		}
	}
}
</style>
