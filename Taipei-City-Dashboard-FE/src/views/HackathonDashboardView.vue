<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import VueApexCharts from "vue3-apexcharts";
import {
	AI_INSIGHT_PROXY_ENDPOINT,
	cityOptions,
	demoScript,
	hackathonModules,
	heatFamilyWorkerFeatures,
} from "../assets/configs/hackathon/modules";

import ScenarioSelectorComponent from "../components/disaster/ScenarioSelectorComponent.vue";

const activeModuleId = ref(11);
const activeCity = ref("metrotaipei");
const mapEl = ref(null);
const mapLoaded = ref(false);
const features = ref([]);
const selectedFeature = ref(null);
const insightOpen = ref(true);
const insightText = ref("");
const insightStatus = ref("static");
const hoveredDecisionId = ref(null);
const executedIds = ref([]);
const expandedAlternatives = ref([]);

let map = null;

const activeModule = computed(() =>
	hackathonModules.find((module) => module.id === activeModuleId.value)
);

const activeDecisionCards = computed(() => activeModule.value?.decisions || []);

const filteredFeatureCount = computed(
	() => visibleFeatures().features.length
);

const activeCharts = computed(() => activeModule.value?.charts || [activeModule.value.chart]);

function chartOptionsFor(chart) {
	return {
		theme: { mode: "dark" },
		grid: { borderColor: "#494b4e" },
		tooltip: { theme: "dark" },
		...chart.options,
	};
}

function selectModule(module) {
	activeModuleId.value = module.id;
	activeCity.value = module.defaultCity;
	selectedFeature.value = null;
	clearDecisionPreview();
}

function visibleFeatures() {
	const moduleId = activeModuleId.value;
	return {
		type: "FeatureCollection",
		features: features.value.filter((feature) => {
			const modules = feature.properties?.modules || [];
			const featureCity = feature.properties?.city;
			const matchesModule = modules.includes(moduleId);
			const matchesCity =
				activeCity.value === "metrotaipei" ||
				featureCity === "taipei" ||
				featureCity === "metrotaipei";
			return matchesModule && matchesCity;
		}),
	};
}

function updateVisibleFeatures() {
	if (!mapLoaded.value || !map?.getSource("hackathon-demo")) return;
	map.getSource("hackathon-demo").setData(visibleFeatures());
}

function previewDecision(decision) {
	hoveredDecisionId.value = decision.id;
	if (!mapLoaded.value || !map?.getSource("decision-highlight")) return;
	map.getSource("decision-highlight").setData({
		type: "FeatureCollection",
		features: decision.mapFeatures || [],
	});
}

function clearDecisionPreview() {
	hoveredDecisionId.value = null;
	if (!mapLoaded.value || !map?.getSource("decision-highlight")) return;
	map.getSource("decision-highlight").setData({
		type: "FeatureCollection",
		features: [],
	});
}

function toggleExecuted(decisionId) {
	if (executedIds.value.includes(decisionId)) {
		executedIds.value = executedIds.value.filter((id) => id !== decisionId);
		return;
	}
	executedIds.value = [...executedIds.value, decisionId];
}

function toggleAlternative(decisionId) {
	if (expandedAlternatives.value.includes(decisionId)) {
		expandedAlternatives.value = expandedAlternatives.value.filter(
			(id) => id !== decisionId
		);
		return;
	}
	expandedAlternatives.value = [...expandedAlternatives.value, decisionId];
}

function isExecuted(decisionId) {
	return executedIds.value.includes(decisionId);
}

function isAlternativeOpen(decisionId) {
	return expandedAlternatives.value.includes(decisionId);
}

async function requestAIInsight() {
	insightText.value = activeModule.value.aiInsight;
	insightStatus.value = "static";
	if (!activeModule.value.aiProxyEndpoint) return;

	try {
		const response = await fetch(AI_INSIGHT_PROXY_ENDPOINT, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				stream: false,
				messages: [
					{
						role: "user",
						content: `請用兩句話解釋 ${activeModule.value.title}，city=${activeCity.value}，tool=${activeModule.value.aiTool || "none"}。`,
					},
				],
			}),
		});
		if (!response.ok) throw new Error(`AI proxy ${response.status}`);
		const data = await response.json();
		insightText.value = data.answer || data.content || data.message || activeModule.value.aiInsight;
		insightStatus.value = "go-proxy";
	} catch {
		insightStatus.value = "fallback";
		insightText.value = activeModule.value.aiInsight;
	}
}

function initMap() {
	mapboxgl.accessToken =
		import.meta.env.VITE_MAPBOXTOKEN || "local-hackathon-demo";
	map = new mapboxgl.Map({
		container: mapEl.value,
		center: [121.523, 25.038],
		zoom: 10.5,
		pitch: 38,
		bearing: -18,
		attributionControl: false,
		style: {
			version: 8,
			sources: {},
			layers: [
				{
					id: "background",
					type: "background",
					paint: { "background-color": "#0d1117" },
				},
			],
		},
	});
	map.addControl(new mapboxgl.NavigationControl({ showCompass: false }));
	map.on("load", () => {
		map.addSource("hackathon-demo", {
			type: "geojson",
			data: visibleFeatures(),
		});
		map.addSource("decision-highlight", {
			type: "geojson",
			data: { type: "FeatureCollection", features: [] },
		});
		map.addLayer({
			id: "hackathon-fills",
			type: "fill",
			source: "hackathon-demo",
			filter: ["==", ["geometry-type"], "Polygon"],
			paint: {
				"fill-color": ["coalesce", ["get", "color"], "#4FA3FF"],
				"fill-opacity": 0.28,
			},
		});
		map.addLayer({
			id: "hackathon-lines",
			type: "line",
			source: "hackathon-demo",
			filter: ["==", ["geometry-type"], "LineString"],
			paint: {
				"line-color": ["coalesce", ["get", "color"], "#4FA3FF"],
				"line-width": 5,
				"line-opacity": 0.82,
			},
		});
		map.addLayer({
			id: "hackathon-points",
			type: "circle",
			source: "hackathon-demo",
			filter: ["==", ["geometry-type"], "Point"],
			paint: {
				"circle-color": ["coalesce", ["get", "color"], "#4FA3FF"],
				"circle-radius": [
					"interpolate",
					["linear"],
					["coalesce", ["get", "value"], 10],
					0,
					7,
					100,
					18,
				],
				"circle-stroke-color": "#ffffff",
				"circle-stroke-width": 1.5,
				"circle-opacity": 0.9,
			},
		});
		map.addLayer({
			id: "decision-highlight-fill",
			type: "fill",
			source: "decision-highlight",
			filter: ["==", ["geometry-type"], "Polygon"],
			paint: {
				"fill-color": ["coalesce", ["get", "color"], "#F05D5E"],
				"fill-opacity": 0.42,
			},
		});
		map.addLayer({
			id: "decision-highlight-line",
			type: "line",
			source: "decision-highlight",
			filter: ["==", ["geometry-type"], "LineString"],
			paint: {
				"line-color": ["coalesce", ["get", "color"], "#FF8C00"],
				"line-width": 8,
				"line-opacity": 0.95,
			},
		});
		map.on("click", "hackathon-points", (event) => {
			selectedFeature.value = event.features?.[0]?.properties || null;
		});
		mapLoaded.value = true;
		updateVisibleFeatures();
	});
}

onMounted(async () => {
	const response = await fetch("/mapData/hackathon_metrotaipei_demo.geojson");
	const data = await response.json();
	features.value = [...(data.features || []), ...heatFamilyWorkerFeatures];
	await nextTick();
	initMap();
	requestAIInsight();
});

onBeforeUnmount(() => {
	if (map) {
		map.remove();
		map = null;
	}
});

watch([activeModuleId, activeCity], () => {
	updateVisibleFeatures();
	requestAIInsight();
});
</script>

<template>
  <main class="hackathon">
    <aside class="hackathon-rail">
      <div class="hackathon-brand">
        <span>dashboard_customize</span>
        <div>
          <h1>Taipei Dashdorad</h1>
          <p>Hackathon demo cockpit</p>
        </div>
      </div>
      <button
        v-for="module in hackathonModules"
        :key="module.id"
        type="button"
        :class="{ active: module.id === activeModuleId }"
        @click="selectModule(module)"
      >
        <span>{{ module.icon }}</span>
        <div>
          <strong>{{ module.shortTitle }}</strong>
          <small>{{ module.theme }}</small>
        </div>
      </button>
    </aside>

    <section class="hackathon-main">
      <header class="hackathon-header">
        <div>
          <span class="theme-pill">{{ activeModule.theme }}</span>
          <h2>{{ activeModule.title }}</h2>
          <p>最後更新：{{ activeModule.lastUpdated }} · 可見圖徵 {{ filteredFeatureCount }}</p>
        </div>
        <div class="hackathon-controls">
          <select
            v-model="activeCity"
            aria-label="城市切換"
          >
            <option
              v-for="city in cityOptions"
              :key="city.value"
              :value="city.value"
            >
              {{ city.label }}
            </option>
          </select>
          <button
            type="button"
            @click="insightOpen = !insightOpen"
          >
            <span>{{ insightOpen ? "visibility_off" : "visibility" }}</span>
            AI 洞察
          </button>
        </div>
      </header>

      <div class="hackathon-filter-row">
        <span
          v-for="filter in activeModule.filters"
          :key="filter"
        >{{ filter }}</span>
      </div>

      <div class="hackathon-content">
        <section class="map-panel">
          <div
            ref="mapEl"
            class="map-canvas"
          />
          <ScenarioSelectorComponent v-if="activeModuleId === 10" />
          <div class="map-status">
            <strong>{{ selectedFeature?.name || "點選地圖圖徵查看細節" }}</strong>
            <span>{{ selectedFeature?.status || "Mapbox demo layer ready" }}</span>
          </div>
        </section>

        <section class="insight-panel">
          <div
            v-for="chart in activeCharts"
            :key="chart.id || chart.type"
            class="chart-shell"
          >
            <header
              v-if="chart.title"
              class="chart-title"
            >
              <strong>{{ chart.title }}</strong>
              <span>{{ chart.dataFormat }}</span>
            </header>
            <VueApexCharts
              :key="`${activeModule.id}-${activeCity}-${chart.id || chart.type}`"
              height="260"
              :type="chart.type"
              :options="chartOptionsFor(chart)"
              :series="chart.series"
            />
          </div>

          <div
            v-if="insightOpen"
            class="ai-box"
          >
            <div>
              <span>auto_awesome</span>
              <strong>AI 洞察</strong>
              <small>{{ insightStatus }}</small>
            </div>
            <p>{{ insightText }}</p>
          </div>

          <div
            v-if="activeDecisionCards.length"
            class="decision-list"
          >
            <article
              v-for="decision in activeDecisionCards"
              :key="decision.id"
              :class="{
                executed: isExecuted(decision.id),
                hovering: hoveredDecisionId === decision.id,
              }"
              @mouseenter="previewDecision(decision)"
              @mouseleave="clearDecisionPreview"
            >
              <div class="decision-head">
                <span
                  :class="`priority ${decision.priority}`"
                >{{ decision.priority }}</span>
                <strong>{{ decision.action }}</strong>
              </div>
              <p>{{ decision.evidence }}</p>
              <dl>
                <div>
                  <dt>效果</dt>
                  <dd>{{ decision.effect }}</dd>
                </div>
                <div>
                  <dt>副作用</dt>
                  <dd>{{ decision.sideEffect }}</dd>
                </div>
                <div>
                  <dt>信心</dt>
                  <dd>{{ Math.round(decision.confidence * 100) }}%</dd>
                </div>
              </dl>
              <div class="decision-actions">
                <button
                  type="button"
                  @click="toggleExecuted(decision.id)"
                >
                  <span>{{ isExecuted(decision.id) ? "done_all" : "check_circle" }}</span>
                  {{ isExecuted(decision.id) ? "已執行" : "採納" }}
                </button>
                <button
                  type="button"
                  @click="toggleAlternative(decision.id)"
                >
                  <span>alt_route</span>
                  替代
                </button>
              </div>
              <p
                v-if="isAlternativeOpen(decision.id)"
                class="alternative"
              >
                {{ decision.alternative }}
              </p>
            </article>
          </div>
        </section>
      </div>

      <footer class="demo-script">
        <span
          v-for="line in demoScript"
          :key="line"
        >{{ line }}</span>
      </footer>
    </section>
  </main>
</template>

<style scoped lang="scss">
.hackathon {
	width: 100vw;
	height: calc(var(--vh, 1vh) * 100);
	display: grid;
	grid-template-columns: 280px 1fr;
	background: #090909;
	color: var(--color-normal-text);
}

.hackathon-rail {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding: 18px;
	border-right: 1px solid var(--color-border);
	background: #111315;

	button {
		min-height: 54px;
		display: grid;
		grid-template-columns: 34px 1fr;
		align-items: center;
		gap: 10px;
		padding: 10px;
		border: 1px solid transparent;
		border-radius: 6px;
		text-align: left;
		background: #1b1e21;

		span {
			font-family: var(--font-icon);
			font-size: 1.35rem;
			color: #9fb7d8;
		}

		strong,
		small {
			display: block;
			line-height: 1.25;
		}

		small {
			margin-top: 3px;
			color: var(--color-complement-text);
		}

		&.active {
			border-color: #4fa3ff;
			background: #17253a;
		}
	}
}

.hackathon-brand {
	display: flex;
	gap: 12px;
	align-items: center;
	margin-bottom: 12px;

	> span {
		font-family: var(--font-icon);
		font-size: 2rem;
		color: #4fa3ff;
	}

	h1 {
		font-size: var(--font-m);
	}

	p {
		margin-top: 3px;
		color: var(--color-complement-text);
	}
}

.hackathon-main {
	min-width: 0;
	display: flex;
	flex-direction: column;
	padding: 18px;
	gap: 12px;
}

.hackathon-header {
	display: flex;
	justify-content: space-between;
	gap: 16px;
	align-items: flex-start;

	h2 {
		margin-top: 6px;
		font-size: var(--font-xl);
	}

	p {
		margin-top: 6px;
		color: var(--color-complement-text);
	}
}

.theme-pill,
.hackathon-filter-row span {
	display: inline-flex;
	align-items: center;
	min-height: 24px;
	padding: 0 8px;
	border-radius: 4px;
	background: #22334a;
	color: #bad7ff;
	font-size: var(--font-s);
}

.hackathon-controls {
	display: flex;
	gap: 8px;

	button,
	select {
		height: 34px;
		border-radius: 5px;
		border: 1px solid var(--color-border);
		background: #171a1d;
	}

	button {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 0 10px;

		span {
			font-family: var(--font-icon);
		}
	}
}

.hackathon-filter-row {
	display: flex;
	gap: 8px;
	overflow-x: auto;
}

.hackathon-content {
	min-height: 0;
	flex: 1;
	display: grid;
	grid-template-columns: minmax(420px, 1.4fr) minmax(340px, 0.8fr);
	gap: 12px;
}

.map-panel,
.insight-panel,
.chart-shell,
.ai-box,
.decision-list article,
.demo-script {
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background: #171a1d;
}

.map-panel {
	position: relative;
	min-height: 420px;
}

.map-canvas {
	width: 100%;
	height: 100%;
}

.map-status {
	position: absolute;
	left: 14px;
	bottom: 14px;
	display: flex;
	flex-direction: column;
	gap: 4px;
	max-width: min(420px, calc(100% - 28px));
	padding: 10px 12px;
	border-radius: 6px;
	background: rgba(9, 9, 9, 0.78);

	span {
		color: var(--color-complement-text);
	}
}

.insight-panel {
	min-width: 0;
	display: grid;
	grid-template-columns: 1fr;
	gap: 12px;
	padding: 12px;
	overflow-y: auto;
}

.chart-shell {
	min-height: 280px;
	padding: 10px;
}

.chart-title {
	display: flex;
	justify-content: space-between;
	align-items: center;
	margin-bottom: 8px;

	span {
		padding: 2px 6px;
		border-radius: 4px;
		background: #22334a;
		color: #bad7ff;
		font-size: var(--font-s);
	}
}

.ai-box {
	padding: 12px;

	div {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 8px;
	}

	span {
		font-family: var(--font-icon);
		color: #f9a03f;
	}

	small {
		margin-left: auto;
		color: var(--color-complement-text);
		font-size: var(--font-s);
	}

	p {
		line-height: 1.55;
		color: #dce6f2;
	}
}

.decision-list {
	display: flex;
	flex-direction: column;
	gap: 10px;

	article {
		padding: 12px;
		border-color: #38414b;

		&.hovering {
			border-color: #ff8c00;
		}

		&.executed {
			border-color: #59d987;
			background: #14251d;
		}

		p {
			margin-top: 8px;
			line-height: 1.45;
			color: #dce6f2;
		}
	}
}

.decision-head {
	display: flex;
	gap: 8px;
	align-items: center;
}

.priority {
	padding: 2px 6px;
	border-radius: 4px;
	font-size: 0.68rem;
	text-transform: uppercase;

	&.critical {
		background: #5e1e24;
		color: #ffb7bd;
	}

	&.high {
		background: #5a3a10;
		color: #ffd38a;
	}

	&.medium {
		background: #1e3d59;
		color: #b7dcff;
	}
}

dl {
	display: grid;
	grid-template-columns: repeat(3, 1fr);
	gap: 8px;
	margin-top: 10px;

	div {
		min-width: 0;
	}

	dt {
		color: var(--color-complement-text);
		font-size: var(--font-s);
	}

	dd {
		margin-top: 4px;
		font-size: var(--font-s);
		line-height: 1.35;
	}
}

.decision-actions {
	display: flex;
	gap: 8px;
	margin-top: 10px;

	button {
		display: flex;
		align-items: center;
		gap: 5px;
		min-height: 30px;
		padding: 0 9px;
		border-radius: 5px;
		background: #222a32;

		span {
			font-family: var(--font-icon);
		}
	}
}

.alternative {
	padding: 8px;
	border-left: 3px solid #f9a03f;
	background: #221b10;
}

.demo-script {
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	gap: 8px;
	padding: 10px;

	span {
		color: #dce6f2;
		font-size: var(--font-s);
		line-height: 1.4;
	}
}

@media (max-width: 1100px) {
	.hackathon {
		grid-template-columns: 1fr;
		height: auto;
		min-height: calc(var(--vh, 1vh) * 100);
	}

	.hackathon-rail {
		display: grid;
		grid-template-columns: repeat(5, minmax(130px, 1fr));
		overflow-x: auto;
	}

	.hackathon-brand {
		grid-column: 1 / -1;
	}

	.hackathon-content {
		grid-template-columns: 1fr;
	}

	.map-panel {
		height: 520px;
	}

	.demo-script {
		grid-template-columns: 1fr 1fr;
	}
}

@media (max-width: 640px) {
	.hackathon-main {
		padding: 12px;
	}

	.hackathon-header {
		flex-direction: column;
	}

	.hackathon-rail {
		grid-template-columns: repeat(2, minmax(140px, 1fr));
		padding: 12px;
	}

	.map-panel {
		height: 430px;
		min-height: 430px;
	}

	dl,
	.demo-script {
		grid-template-columns: 1fr;
	}
}
</style>
