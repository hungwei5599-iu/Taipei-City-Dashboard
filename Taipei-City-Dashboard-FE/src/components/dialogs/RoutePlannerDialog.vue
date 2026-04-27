<!-- 複合型災難避災路線查詢 Drawer -->
<script setup>
import { ref, computed } from "vue";
import { useMapStore } from "../../store/mapStore";
import { useDialogStore } from "../../store/dialogStore";
import * as turf from "@turf/turf";

const mapStore = useMapStore();
const dialogStore = useDialogStore();

const isCalculating = ref(false);
const safeRoute = ref(null);
const dangerSegments = ref([]);
const statusMsg = ref("");

const startSet = computed(() => mapStore.routePlannerStart !== null);
const endSet = computed(() => mapStore.routePlannerEnd !== null);

async function calculateRoute() {
	if (!startSet.value || !endSet.value) return;
	isCalculating.value = true;
	safeRoute.value = null;
	dangerSegments.value = [];
	statusMsg.value = "計算路線中...";

	try {
		const token = import.meta.env.VITE_MAPBOXTOKEN;
		const [sLng, sLat] = mapStore.routePlannerStart;
		const [eLng, eLat] = mapStore.routePlannerEnd;
		const url =
      `https://api.mapbox.com/directions/v5/mapbox/driving/` +
      `${sLng},${sLat};${eLng},${eLat}` +
      `?geometries=geojson&overview=full&access_token=${token}`;

		const res = await fetch(url);
		const data = await res.json();
		const routeGeojson = data.routes?.[0]?.geometry;
		if (!routeGeojson) throw new Error("無法取得路線");

		// 偵測危險段（與淹水 polygon 交叉）
		const floodFeatures = mapStore.disasterLayers?.features?.filter(
			(f) => f.properties?.layer_kind === "flood_polygon"
		) ?? [];

		const pts = [];
		for (const poly of floodFeatures) {
			try {
				const hit = turf.lineIntersect(routeGeojson, poly);
				pts.push(...hit.features);
			} catch (_) {}
		}

		safeRoute.value = routeGeojson;
		dangerSegments.value = pts;
		mapStore.setRouteResult(routeGeojson, pts);

		statusMsg.value =
      pts.length > 0
      	? `⚠️ 路線經過 ${pts.length} 個淹水危險點，請注意`
      	: "✅ 路線安全，未穿越已知淹水區";
	} catch (e) {
		statusMsg.value = `計算失敗：${e.message}`;
	} finally {
		isCalculating.value = false;
	}
}

function clearRoute() {
	mapStore.clearRoutePlanner();
	safeRoute.value = null;
	dangerSegments.value = [];
	statusMsg.value = "";
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="dialogStore.dialogs.routePlanner"
      class="route-planner-overlay"
    >
      <div class="route-planner-drawer">
        <div class="route-planner-header">
          <h3>家人接送避災路線</h3>
          <button @click="dialogStore.hideDialog('routePlanner')">
            <span class="material-icons">close</span>
          </button>
        </div>

        <div class="route-planner-body">
          <div class="instruction">
            <p>在地圖上點擊設定起點和終點</p>
          </div>

          <div class="point-status">
            <div :class="['point-item', { set: startSet }]">
              <span class="dot start" />
              <div class="point-info">
                <span>{{ startSet ? `起點已設定` : "點擊地圖設定起點" }}</span>
                <span
                  v-if="startSet"
                  class="coords"
                >({{ mapStore.routePlannerStart[0].toFixed(4) }}, {{ mapStore.routePlannerStart[1].toFixed(4) }})</span>
              </div>
            </div>
            <div :class="['point-item', { set: endSet }]">
              <span class="dot end" />
              <div class="point-info">
                <span>{{ endSet ? `終點已設定` : "點擊地圖設定終點" }}</span>
                <span
                  v-if="endSet"
                  class="coords"
                >({{ mapStore.routePlannerEnd[0].toFixed(4) }}, {{ mapStore.routePlannerEnd[1].toFixed(4) }})</span>
              </div>
            </div>
          </div>

          <div class="actions">
            <button
              class="btn-calculate"
              :disabled="!startSet || !endSet || isCalculating"
              @click="calculateRoute"
            >
              {{ isCalculating ? "計算中..." : "計算避災路徑" }}
            </button>
            <button
              class="btn-clear"
              @click="clearRoute"
            >
              清除
            </button>
          </div>

          <div
            v-if="statusMsg"
            :class="['status-msg', dangerSegments.length > 0 ? 'danger' : 'safe']"
          >
            {{ statusMsg }}
          </div>

          <div
            v-if="safeRoute"
            class="route-legend"
          >
            <div class="legend-item">
              <span class="line safe-line" />
              <span>建議路線</span>
            </div>
            <div
              v-if="dangerSegments.length > 0"
              class="legend-item"
            >
              <span class="dot-warn" />
              <span>淹水危險交叉點 ({{ dangerSegments.length }})</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
.route-planner-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  pointer-events: none;
}

.route-planner-drawer {
  position: absolute;
  bottom: 80px;
  left: 16px;
  width: 300px;
  background: var(--color-component-background);
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
  pointer-events: all;
  overflow: hidden;
}

.route-planner-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: var(--color-highlight);

  h3 {
    font-size: 0.9rem;
    font-weight: 600;
    color: white;
    margin: 0;
  }

  button {
    background: none;
    color: white;
    cursor: pointer;
    display: flex;
    align-items: center;

    span { font-size: 1.1rem; }
  }
}

.route-planner-body {
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.instruction p {
  font-size: 0.78rem;
  color: var(--color-complement-text);
  margin: 0;
}

.point-status {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.point-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 0.82rem;
  color: var(--color-complement-text);
  opacity: 0.6;
  transition: opacity 0.2s;

  &.set { opacity: 1; }
}

.point-info {
  display: flex;
  flex-direction: column;

  .coords {
    font-size: 0.72rem;
    font-family: monospace;
    opacity: 0.7;
    margin-top: 1px;
  }
}

.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
  margin-top: 3px;

  &.start { background: #2ecc71; }
  &.end   { background: #e74c3c; }
}

.actions {
  display: flex;
  gap: 8px;
}

.btn-calculate {
  flex: 1;
  padding: 8px;
  border-radius: 6px;
  background: var(--color-highlight);
  color: white;
  font-size: 0.82rem;
  cursor: pointer;
  transition: opacity 0.2s;

  &:disabled { opacity: 0.4; cursor: not-allowed; }
}

.btn-clear {
  padding: 8px 12px;
  border-radius: 6px;
  background: var(--color-border);
  color: var(--color-complement-text);
  font-size: 0.82rem;
  cursor: pointer;
}

.status-msg {
  padding: 8px 10px;
  border-radius: 6px;
  font-size: 0.8rem;
  font-weight: 500;

  &.safe   { background: rgba(46, 204, 113, 0.15); color: #2ecc71; }
  &.danger { background: rgba(231, 76, 60, 0.15);  color: #e74c3c; }
}

.route-legend {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.78rem;
  color: var(--color-complement-text);
}

.line {
  display: inline-block;
  width: 24px;
  height: 3px;
  border-radius: 2px;

  &.safe-line { background: #2ecc71; }
}

.dot-warn {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #f39c12;
  flex-shrink: 0;
}
</style>
