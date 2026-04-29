<script setup>
import { ref, onMounted, watch, onUnmounted } from 'vue';
import axios from 'axios';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

defineProps({
	componentIndex: {
		type: String,
		default: 'hackathon_c5_library_map'
	}
});

const currentCity = ref('taipei');
const lastUpdateTime = ref('');
const isLoading = ref(true);
const aiResponse = ref('');
const isAiLoading = ref(false);

const mapContainer = ref(null);
let map = null;
const mapboxToken = import.meta.env.VITE_MAPBOXTOKEN || '';
const canUseMapbox = /^pk\./.test(mapboxToken);
const mapError = ref('');

const initMap = () => {
	if (map) return;
	if (!canUseMapbox) {
		mapError.value = '需設定可在瀏覽器使用的 Mapbox public token';
		lastUpdateTime.value = new Date().toLocaleString();
		isLoading.value = false;
		return;
	}
	mapboxgl.accessToken = mapboxToken;
	map = new mapboxgl.Map({
		container: mapContainer.value,
		style: 'mapbox://styles/mapbox/dark-v11',
		center: [121.5654, 25.0330], // Taipei 101
		zoom: 11
	});
  
	map.on('load', () => {
		// Add Isochrone source and layer
		map.addSource('isochrone', {
			type: 'geojson',
			data: { type: 'FeatureCollection', features: [] }
		});
    
		map.addLayer({
			id: 'isochrone-layer',
			type: 'fill',
			source: 'isochrone',
			paint: {
				'fill-color': '#00E396',
				'fill-opacity': 0.3
			}
		});
    
		fetchData();
	});

	map.on('error', () => {
		mapError.value = 'Mapbox 圖資載入失敗';
		isLoading.value = false;
	});
};

const updateMapData = (geojsonData) => {
	if (map && map.getSource('isochrone')) {
		map.getSource('isochrone').setData(geojsonData);
	}
};

const fetchData = async () => {
	isLoading.value = true;
	try {
		// Mocking API response for quick validation
		setTimeout(() => {
			const mockGeoJSON = {
				type: 'FeatureCollection',
				features: [{
					type: 'Feature',
					geometry: {
						type: 'Polygon',
						coordinates: [[[121.5654, 25.0330], [121.5754, 25.0330], [121.5754, 25.0430], [121.5654, 25.0430], [121.5654, 25.0330]]]
					}
				}]
			};
			updateMapData(mockGeoJSON);
			lastUpdateTime.value = new Date().toLocaleString();
			isLoading.value = false;
		}, 500);
	} catch (error) {
		console.error('Failed to fetch data:', error);
		isLoading.value = false;
	}
};

const getAiInsights = async () => {
	isAiLoading.value = true;
	aiResponse.value = '';
	try {
		const response = await axios.post('/api/v1/ai/chat/twai', {
			tool_name: 'query_library_map',
			city: currentCity.value,
			user_query: '請幫我分析圖書館的分佈與等時圈涵蓋率'
		});
		aiResponse.value = response.data.reply || response.data.message || '分析完成';
	} catch (error) {
		console.error('AI Insight failed:', error);
		aiResponse.value = '無法取得 AI 分析結果，請稍後再試。';
	} finally {
		isAiLoading.value = false;
	}
};

onMounted(() => { initMap(); });
onUnmounted(() => { if (map) map.remove(); });
watch(currentCity, () => { fetchData(); });
</script>

<template>
  <div class="custom-component-container">
    <div class="control-bar">
      <select
        v-model="currentCity"
        class="city-select"
      >
        <option value="taipei">
          台北市
        </option>
        <option value="new_taipei">
          新北市
        </option>
      </select>
      <span class="update-time">最後更新時間: {{ lastUpdateTime }}</span>
      <button
        class="ai-button"
        :disabled="isAiLoading"
        @click="getAiInsights"
      >
        {{ isAiLoading ? '分析中...' : 'AI 洞察' }}
      </button>
    </div>
    <div class="visualization-area">
      <div
        v-if="isLoading && !mapError"
        class="loading"
      >
        載入中...
      </div>
      <div
        v-if="mapError"
        class="map-fallback library-fallback"
      >
        <div class="fallback-map-shape">
          <span class="fallback-zone zone-a" />
          <span class="fallback-zone zone-b" />
          <span class="fallback-zone zone-c" />
        </div>
        <div class="fallback-copy">
          <strong>圖書館等時圈預覽</strong>
          <span>{{ mapError }}</span>
        </div>
      </div>
      <div
        v-show="!mapError"
        ref="mapContainer"
        class="map-container"
      />
    </div>
    <div
      v-if="aiResponse || isAiLoading"
      class="ai-panel"
    >
      <h4>🤖 AI 分析結果</h4>
      <p class="ai-content">
        {{ aiResponse }}
      </p>
    </div>
  </div>
</template>

<style scoped>
.custom-component-container { display: flex; flex-direction: column; background-color: #1a1a1a; border-radius: 8px; padding: 16px; color: white; height: 100%; }
.control-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; padding-bottom: 8px; border-bottom: 1px solid #333; }
.city-select { background: #333; color: white; border: 1px solid #555; padding: 4px 8px; border-radius: 4px; }
.update-time { font-size: 0.85rem; color: #aaa; }
.ai-button { background-color: #0078D4; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-weight: bold; }
.ai-button:disabled { background-color: #555; cursor: not-allowed; }
.visualization-area { flex-grow: 1; min-height: 350px; position: relative; }
.map-container { width: 100%; height: 350px; border-radius: 4px; }
.loading { display: flex; justify-content: center; align-items: center; height: 100%; color: #888; position: absolute; width: 100%; z-index: 10; }
.map-fallback { position: relative; display: grid; place-items: center; width: 100%; height: 350px; overflow: hidden; border: 1px solid #333; border-radius: 4px; background: radial-gradient(circle at 50% 45%, #25463f 0, #1d3833 34%, #142522 68%, #111 100%); }
.fallback-map-shape { position: relative; width: min(58%, 360px); aspect-ratio: 1.25; }
.fallback-zone { position: absolute; display: block; border: 2px solid rgba(255,255,255,0.45); background: rgba(0,227,150,0.22); }
.zone-a { inset: 18% 22% 20% 12%; border-radius: 55% 45% 50% 40%; }
.zone-b { inset: 8% 8% 36% 46%; border-radius: 45% 55% 38% 52%; }
.zone-c { inset: 45% 4% 8% 38%; border-radius: 48% 42% 58% 46%; }
.fallback-copy { position: absolute; left: 16px; bottom: 16px; display: flex; flex-direction: column; gap: 4px; padding: 10px 12px; border-radius: 6px; background: rgba(26,26,26,0.88); color: #ddd; }
.fallback-copy strong { color: #fff; }
.fallback-copy span { color: #aaa; font-size: 0.85rem; }
.ai-panel { margin-top: 16px; padding: 12px; background-color: #2a2a2a; border-left: 4px solid #00E396; border-radius: 4px; }
.ai-panel h4 { margin: 0 0 8px 0; color: #00E396; }
.ai-content { margin: 0; font-size: 0.9rem; line-height: 1.5; color: #ddd; }
</style>
