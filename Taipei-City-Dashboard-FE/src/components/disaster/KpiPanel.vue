<template>
  <div class="kpi-panel">
    <div class="kpi-item">
      <div class="kpi-label">
        報案
      </div>
      <div class="kpi-value text-red">
        {{ kpi?.reports || 0 }}
      </div>
    </div>
    <div class="kpi-item">
      <div class="kpi-label">
        警戒
      </div>
      <div class="kpi-value text-orange">
        {{ kpi?.alerts || 0 }}
      </div>
    </div>
    <div class="kpi-item">
      <div class="kpi-label">
        空位
      </div>
      <div class="kpi-value text-green">
        {{ kpi?.shelterCapacity || '0%' }}
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
	kpi: {
		type: Object,
		default: () => ({ reports: 0, alerts: 0, shelterCapacity: '0%' })
	}
});
</script>

<style scoped>
.kpi-panel {
  display: flex;
  gap: 16px;
  background: rgba(30, 30, 35, 0.85);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 16px;
  color: #fff;
}

.kpi-item {
  flex: 1;
  text-align: center;
}

.kpi-label {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.7);
  margin-bottom: 8px;
}

.kpi-value {
  font-size: 24px;
  font-weight: bold;
  font-family: monospace;
}

.text-red { color: #FF4444; }
.text-orange { color: #FF8800; }
.text-green { color: #4CAF50; }
</style>