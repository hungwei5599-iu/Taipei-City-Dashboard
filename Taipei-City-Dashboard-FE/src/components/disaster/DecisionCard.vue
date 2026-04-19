<template>
  <div 
    class="decision-card"
    :class="{ 'is-active': isActive }"
    @mouseenter="$emit('hover', decision.id)"
    @mouseleave="$emit('leave')"
    @click="$emit('select', decision.id)"
  >
    <div class="card-header">
      <span class="priority-badge" :class="`priority-${decision.priority}`">
        {{ priorityLabel }}優先
      </span>
      <h4 class="action-title">{{ decision.action }}</h4>
    </div>
    
    <div class="card-body">
      <div class="section">
        <strong class="section-title">依據：</strong>
        <ul class="bullet-list">
          <li v-for="(ev, idx) in decision.evidence" :key="idx">{{ ev }}</li>
        </ul>
      </div>
      
      <div class="section">
        <strong class="section-title text-green">預計效果：</strong>
        <span>{{ decision.expected_effect }}</span>
      </div>
      
      <div class="section text-warning" v-if="decision.side_effects && decision.side_effects.length">
        <strong class="section-title">⚠️ 副作用：</strong>
        <ul class="bullet-list">
          <li v-for="(se, idx) in decision.side_effects" :key="idx">{{ se.description }}</li>
        </ul>
      </div>
      
      <div class="section confidence">
        <span>信心度：{{ decision.confidence }}</span>
      </div>
    </div>
    
    <div class="card-actions">
      <button class="btn btn-primary" @click.stop>採納</button>
      <button class="btn btn-secondary" @click.stop>延後</button>
      <button class="btn btn-text" @click.stop>查看替代方案</button>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  decision: {
    type: Object,
    required: true
  },
  isActive: {
    type: Boolean,
    default: false
  }
});

defineEmits(['hover', 'leave', 'select']);

const priorityLabel = computed(() => {
  const map = {
    critical: '🔴 極高',
    high: '🟠 高',
    medium: '🟡 中',
    low: '🟢 低'
  };
  return map[props.decision.priority] || '';
});
</script>

<style scoped>
.decision-card {
  background: rgba(20, 20, 25, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 12px;
  color: #eee;
  font-size: 13px;
  transition: all 0.2s ease;
  cursor: pointer;
}

.decision-card:hover, .decision-card.is-active {
  border-color: #FFA500;
  box-shadow: 0 0 15px rgba(255, 165, 0, 0.2);
}

.card-header {
  margin-bottom: 12px;
}

.priority-badge {
  display: inline-block;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: bold;
  margin-bottom: 8px;
  background: rgba(255, 255, 255, 0.1);
}

.action-title {
  margin: 0;
  font-size: 15px;
  color: #fff;
}

.section {
  margin-bottom: 8px;
}

.section-title {
  display: inline-block;
  margin-bottom: 4px;
}

.bullet-list {
  margin: 0;
  padding-left: 20px;
  color: #ccc;
}

.text-green { color: #4CAF50; }
.text-warning { color: #FFBB33; }

.confidence {
  font-size: 11px;
  color: #888;
  margin-top: 8px;
  border-top: 1px dashed rgba(255, 255, 255, 0.1);
  padding-top: 8px;
}

.card-actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

.btn {
  padding: 6px 12px;
  border-radius: 6px;
  border: none;
  font-size: 12px;
  cursor: pointer;
  font-weight: bold;
}

.btn-primary {
  background: #3B82F6;
  color: white;
}

.btn-secondary {
  background: rgba(255, 255, 255, 0.1);
  color: white;
}

.btn-text {
  background: transparent;
  color: #3B82F6;
  padding: 6px;
}
</style>