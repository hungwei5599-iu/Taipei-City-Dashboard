<template>
  <div class="scenario-selector-container">
    <!-- Top Banner -->
    <div v-if="store.isFallback" class="fallback-banner">
      ⚠ 離線模式 — 使用預存資料
      <div class="city-switch">
        <label>
          <input 
            type="radio" 
            name="city" 
            value="Taipei" 
            :checked="store.activeCity === 'Taipei'" 
            @change="store.toggleCity"
          > 
          Taipei
        </label>
        <label>
          <input 
            type="radio" 
            name="city" 
            value="Metro-Taipei" 
            :checked="store.activeCity === 'Metro-Taipei'" 
            @change="store.toggleCity"
          > 
          Metro-Taipei
        </label>
      </div>
    </div>

    <!-- Main Layout -->
    <div class="layout-main">
      
      <!-- Left Panel: Scenarios -->
      <div class="panel-left">
        <h2 class="panel-title">災難情境劇本</h2>
        <div class="scenario-list">
          <ScenarioCard 
            v-for="scen in store.scenarios" 
            :key="scen.id" 
            :scenario="scen"
            :isActive="store.activeScenarioId === scen.id"
            :anyActive="store.activeScenarioId !== null"
            @select="store.selectScenario"
          />
        </div>
      </div>

      <!-- Right Panel: Details (Only visible when scenario selected) -->
      <div class="panel-right" v-if="store.activeScenarioId && !store.isLoading">
        <div class="right-content-wrapper">
          <BriefingPanel :briefing="store.briefing" />
          <KpiPanel :kpi="store.kpi" />
          
          <div class="decisions-list">
            <h3 class="decisions-title">決策建議</h3>
            <DecisionCard 
              v-for="dec in store.decisions" 
              :key="dec.id" 
              :decision="dec"
              :isActive="store.activeDecisionId === dec.id"
              @hover="store.activeDecisionId = $event"
              @leave="store.activeDecisionId = null"
              @select="store.selectDecision"
            />
          </div>
        </div>
      </div>

      <!-- Empty State -->
      <div class="panel-right empty-state" v-else-if="!store.isLoading">
        <p>請從左側點選情境查看決策建議</p>
      </div>

      <!-- Loading State -->
      <div class="panel-right loading-state" v-else>
        <div class="skeleton-box title"></div>
        <div class="skeleton-box kpi"></div>
        <div class="skeleton-box card"></div>
        <div class="skeleton-box card"></div>
      </div>

      <!-- Bottom Panel: Timeline -->
      <div class="panel-bottom" v-if="store.activeScenarioId && !store.isLoading">
        <div class="timeline-container">
          <div class="timeline-track">
            <div class="timeline-step">T-72h <br><span>預警</span></div>
            <div class="timeline-step">T-24h <br><span>整備</span></div>
            <div class="timeline-step active">T-6h <br><span>即將發生</span></div>
            <div class="timeline-step">T+應變中 <br><span>災害進行</span></div>
          </div>
        </div>
      </div>

    </div>
  </div>
</template>

<script setup>
import { useScenarioStore } from '@/store/scenarioStore';
import ScenarioCard from './ScenarioCard.vue';
import DecisionCard from './DecisionCard.vue';
import BriefingPanel from './BriefingPanel.vue';
import KpiPanel from './KpiPanel.vue';

const store = useScenarioStore();
</script>

<style scoped>
.scenario-selector-container {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  pointer-events: none; /* Let map clicks through where empty */
  display: flex;
  flex-direction: column;
  font-family: sans-serif;
  z-index: 10;
}

.fallback-banner {
  background: #FF8C00;
  color: white;
  padding: 8px 16px;
  text-align: center;
  font-weight: bold;
  pointer-events: auto;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 20px;
}

.city-switch {
  display: flex;
  gap: 12px;
  font-size: 13px;
  font-weight: normal;
}

.layout-main {
  flex: 1;
  position: relative;
}

.panel-left {
  position: absolute;
  top: 20px;
  left: 20px;
  width: 320px;
  bottom: 240px; /* space for timeline */
  pointer-events: auto;
  display: flex;
  flex-direction: column;
  background: rgba(10, 10, 15, 0.6);
  backdrop-filter: blur(10px);
  padding: 16px;
  border-radius: 16px;
}

.panel-title {
  margin: 0 0 16px 0;
  color: white;
  font-size: 18px;
}

.scenario-list {
  flex: 1;
  overflow-y: auto;
  padding-right: 8px;
}

.scenario-list::-webkit-scrollbar {
  width: 6px;
}
.scenario-list::-webkit-scrollbar-thumb {
  background: rgba(255,255,255,0.2);
  border-radius: 3px;
}

.panel-right {
  position: absolute;
  top: 20px;
  right: 20px;
  width: 360px;
  bottom: 240px;
  pointer-events: auto;
  display: flex;
  flex-direction: column;
  background: rgba(10, 10, 15, 0.6);
  backdrop-filter: blur(10px);
  padding: 16px;
  border-radius: 16px;
  overflow-y: auto;
}

.panel-right::-webkit-scrollbar {
  width: 6px;
}
.panel-right::-webkit-scrollbar-thumb {
  background: rgba(255,255,255,0.2);
  border-radius: 3px;
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.5);
  font-size: 15px;
}

.loading-state {
  gap: 16px;
}

.skeleton-box {
  background: linear-gradient(90deg, rgba(255,255,255,0.05) 25%, rgba(255,255,255,0.1) 50%, rgba(255,255,255,0.05) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: 8px;
}

@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

.skeleton-box.title { height: 120px; }
.skeleton-box.kpi { height: 80px; }
.skeleton-box.card { height: 160px; }

.decisions-title {
  margin: 16px 0 12px 0;
  color: #fff;
  font-size: 16px;
}

.panel-bottom {
  position: absolute;
  bottom: 20px;
  left: 20px;
  right: 20px;
  height: 200px;
  pointer-events: auto;
  background: rgba(10, 10, 15, 0.8);
  backdrop-filter: blur(10px);
  border-radius: 16px;
  padding: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.timeline-container {
  width: 100%;
  max-width: 800px;
}

.timeline-track {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  position: relative;
}

.timeline-track::before {
  content: '';
  position: absolute;
  top: 10px;
  left: 5%;
  right: 5%;
  height: 4px;
  background: rgba(255, 255, 255, 0.2);
  z-index: 1;
}

.timeline-step {
  position: relative;
  z-index: 2;
  text-align: center;
  color: rgba(255, 255, 255, 0.6);
  font-size: 14px;
  font-weight: bold;
}

.timeline-step::before {
  content: '';
  display: block;
  width: 24px;
  height: 24px;
  background: #2a2a35;
  border: 4px solid #555;
  border-radius: 50%;
  margin: 0 auto 12px auto;
}

.timeline-step.active {
  color: #FF4444;
}

.timeline-step.active::before {
  border-color: #FF4444;
  background: #fff;
  box-shadow: 0 0 10px #FF4444;
}

.timeline-step span {
  font-size: 12px;
  font-weight: normal;
  opacity: 0.8;
}
</style>