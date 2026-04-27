<template>
  <div class="briefing-panel">
    <div class="panel-header">
      <h3>指揮官 30 秒摘要</h3>
    </div>
    <div class="panel-body">
      <ul class="highlight-list">
        <li
          v-for="(highlight, idx) in briefing?.highlights"
          :key="idx"
        >
          {{ highlight }}
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup>
defineProps({
	briefing: {
		type: Object,
		default: () => ({ highlights: [] })
	}
});
</script>

<style scoped>
.briefing-panel {
  background: rgba(30, 30, 35, 0.85);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 16px;
  color: #fff;
}

.panel-header h3 {
  margin: 0 0 12px 0;
  font-size: 15px;
  color: #00e5ff;
}

.highlight-list {
  margin: 0;
  padding-left: 20px;
  font-size: 14px;
  line-height: 1.6;
}

.highlight-list li {
  margin-bottom: 8px;
}
</style>