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

const alertKeywords = ["不合格", "異常", "警示", "失敗"];

const isAlertItem = (itemName = "") =>
	alertKeywords.some((keyword) => itemName.includes(keyword));

const displaySeries = computed(() =>
	(props.series || []).map((item) => ({
		...item,
		total: Array.isArray(item.data)
			? item.data.reduce((sum, value) => sum + Number(value || 0), 0)
			: Number(item.data || 0),
	})),
);
</script>

<template>
  <div
    v-if="activeChart === 'TextUnitChart2'"
    class="TextUnitChart"
  >
    <div class="TextUnitChart__container">
      <div
        v-for="item in displaySeries"
        :key="item.name"
        class="TextUnitChart__content"
      >
        <div
          class="TextUnitChart__name"
          :style="{ color: isAlertItem(item.name) ? '#F29B9B' : chart_config.color[0] }"
        >
          {{ item.name }}
        </div>
        <div>
          <span
            class="TextUnitChart__value"
            :style="{ color: '#EEF2F8' }"
          >{{ item.total }}</span>
          <span
            class="TextUnitChart__unit"
            :style="{ color: '#EEF2F8' }"
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
		min-height: 100%;
	}
	&__content {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 1rem;
		border-bottom: 1px solid var(--color-border);

		&:not(:nth-child(2n)) {
			border-right: 1px solid var(--color-border);
		}

		&:last-child {
			border-bottom: none;
		}

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
