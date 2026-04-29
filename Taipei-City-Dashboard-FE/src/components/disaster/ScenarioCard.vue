<template>
  <div 
    class="scenario-card"
    :class="{ 
      'is-active': isActive,
      'is-other': !isActive && anyActive,
      [`risk-${scenario.riskLevel}`]: true
    }"
    @click="$emit('select', scenario.id)"
  >
    <div class="card-header">
      <div class="hazards">
        <span
          v-for="hazard in scenario.hazards"
          :key="hazard"
          class="hazard-badge"
        >
          {{ hazard }}
        </span>
      </div>
      <div class="risk-badge">
        {{ riskLabel }}
      </div>
    </div>
    
    <h3 class="card-title">
      {{ scenario.title }}
    </h3>
    
    <div class="card-details">
      <div class="detail-row">
        <span class="icon">📍</span>
        <span>{{ scenario.focusDistricts }}</span>
      </div>
      <div class="detail-row">
        <span class="icon">👥</span>
        <span>影響約 {{ scenario.affectedPopulation }} 人</span>
      </div>
    </div>
    
    <div class="card-footer">
      <span class="action-text">點選查看 &rarr;</span>
      <span
        v-if="isActive"
        class="active-check"
      >✓</span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
	scenario: {
		type: Object,
		required: true
	},
	isActive: {
		type: Boolean,
		default: false
	},
	anyActive: {
		type: Boolean,
		default: false
	}
});

defineEmits(['select']);

const riskLabel = computed(() => {
	const map = {
		critical: '極高',
		high: '高',
		medium: '中'
	};
	return map[props.scenario.riskLevel] || props.scenario.riskLevel;
});
</script>

<style scoped>
.scenario-card {
  background: rgba(30, 30, 35, 0.85);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 16px;
  cursor: pointer;
  transition: all 0.3s ease;
  color: #fff;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.scenario-card:hover {
  border-color: rgba(255, 255, 255, 0.3);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
  transform: translateY(-2px);
}

.scenario-card.is-active {
  border: 2px solid #00e5ff;
  background: rgba(0, 229, 255, 0.05);
}

.scenario-card.is-other {
  opacity: 0.6;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.hazards {
  display: flex;
  gap: 4px;
}

.hazard-badge {
  background: rgba(255, 255, 255, 0.1);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 11px;
}

.risk-badge {
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: bold;
}

.risk-critical .risk-badge { background: #FF4444; color: white; }
.risk-high .risk-badge { background: #FF8800; color: white; }
.risk-medium .risk-badge { background: #FFBB33; color: black; }

.card-title {
  margin: 0;
  font-size: 15px;
  line-height: 20px;
  font-weight: bold;
}

.card-details {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.8);
}

.detail-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 4px;
  font-size: 13px;
  color: #00e5ff;
  font-weight: bold;
}

.active-check {
  font-size: 16px;
}
</style>