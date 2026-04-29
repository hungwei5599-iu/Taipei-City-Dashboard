<script setup>
import { ref, onMounted, watch } from 'vue';
import axios from 'axios';

defineProps({
	componentIndex: {
		type: String,
		default: 'hackathon_d3_death_cause'
	}
});

const currentCity = ref('taipei');
const lastUpdateTime = ref('');
const chartData = ref([]);
const isLoading = ref(true);
const aiResponse = ref('');
const isAiLoading = ref(false);

const chartOptions = ref({
	chart: {
		type: 'bubble',
		height: 350,
		background: 'transparent',
		toolbar: { show: false }
	},
	theme: {
		mode: 'dark'
	},
	title: {
		text: '主要死因分佈 (年齡 vs 人數 vs 影響程度)',
		align: 'left',
		style: { color: '#fff' }
	},
	xaxis: {
		type: 'numeric',
		title: { text: '平均年齡', style: { color: '#fff' } },
		labels: { style: { colors: '#fff' } }
	},
	yaxis: {
		title: { text: '影響人數', style: { color: '#fff' } },
		labels: { style: { colors: '#fff' } }
	},
	grid: { borderColor: '#444' }
});

const fetchData = async () => {
	isLoading.value = true;
	try {
		// Mocking API response for quick validation
		setTimeout(() => {
			chartData.value = [
				{ name: '心臟疾病', data: [[65, 120, 80], [75, 200, 120], [85, 250, 150]] },
				{ name: '惡性腫瘤', data: [[55, 150, 100], [65, 220, 180], [75, 300, 250]] },
				{ name: '肺炎', data: [[70, 80, 60], [80, 150, 110], [90, 200, 140]] }
			];
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
			tool_name: 'query_death_causes',
			city: currentCity.value,
			user_query: '請幫我分析主要死因的分佈與趨勢'
		});
		aiResponse.value = response.data.reply || response.data.message || '分析完成';
	} catch (error) {
		console.error('AI Insight failed:', error);
		aiResponse.value = '無法取得 AI 分析結果，請稍後再試。';
	} finally {
		isAiLoading.value = false;
	}
};

onMounted(() => { fetchData(); });
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
        v-if="isLoading"
        class="loading"
      >
        載入中...
      </div>
      <apexchart 
        v-else 
        type="bubble" 
        height="350" 
        :options="chartOptions" 
        :series="chartData" 
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
.visualization-area { flex-grow: 1; min-height: 350px; }
.loading { display: flex; justify-content: center; align-items: center; height: 100%; color: #888; }
.ai-panel { margin-top: 16px; padding: 12px; background-color: #2a2a2a; border-left: 4px solid #00E396; border-radius: 4px; }
.ai-panel h4 { margin: 0 0 8px 0; color: #00E396; }
.ai-content { margin: 0; font-size: 0.9rem; line-height: 1.5; color: #ddd; }
</style>
