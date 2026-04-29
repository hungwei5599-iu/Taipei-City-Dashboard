<script setup>
import { ref, onMounted, watch } from 'vue';
import axios from 'axios';

defineProps({
	componentIndex: {
		type: String,
		default: 'hackathon_c3_cultural_density'
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
		type: 'boxPlot',
		height: 350,
		background: 'transparent',
		toolbar: { show: false }
	},
	theme: {
		mode: 'dark'
	},
	colors: ['#00E396', '#FEB019'],
	title: {
		text: '文化設施密度分布',
		align: 'left',
		style: { color: '#fff' }
	},
	plotOptions: {
		boxPlot: {
			colors: {
				upper: '#00E396',
				lower: '#FEB019'
			}
		}
	},
	xaxis: {
		type: 'category',
		labels: { style: { colors: '#fff' } }
	},
	yaxis: {
		labels: { style: { colors: '#fff' } }
	},
	grid: {
		borderColor: '#444'
	}
});

const fetchData = async () => {
	isLoading.value = true;
	try {
		// Mocking API response for quick validation
		setTimeout(() => {
			chartData.value = [{
				type: 'boxPlot',
				data: [
					{ x: '中正區', y: [54, 66, 69, 75, 88] },
					{ x: '大安區', y: [43, 65, 69, 76, 81] },
					{ x: '信義區', y: [31, 39, 45, 51, 59] },
					{ x: '中山區', y: [39, 46, 55, 65, 71] },
					{ x: '萬華區', y: [29, 31, 35, 39, 44] }
				]
			}];
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
			tool_name: 'query_cultural_facilities',
			city: currentCity.value,
			user_query: '請幫我分析目前的文化設施密度狀況'
		});
		aiResponse.value = response.data.reply || response.data.message || '分析完成';
	} catch (error) {
		console.error('AI Insight failed:', error);
		aiResponse.value = '無法取得 AI 分析結果，請稍後再試。';
	} finally {
		isAiLoading.value = false;
	}
};

onMounted(() => {
	fetchData();
});

watch(currentCity, () => {
	fetchData();
});
</script>

<template>
  <div class="custom-component-container">
    <!-- Control Bar -->
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

    <!-- Visualization -->
    <div class="visualization-area">
      <div
        v-if="isLoading"
        class="loading"
      >
        載入中...
      </div>
      <apexchart 
        v-else 
        type="boxPlot" 
        height="350" 
        :options="chartOptions" 
        :series="chartData" 
      />
    </div>

    <!-- AI Panel -->
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
.custom-component-container {
  display: flex;
  flex-direction: column;
  background-color: #1a1a1a;
  border-radius: 8px;
  padding: 16px;
  color: white;
  height: 100%;
}

.control-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  padding-bottom: 8px;
  border-bottom: 1px solid #333;
}

.city-select {
  background: #333;
  color: white;
  border: 1px solid #555;
  padding: 4px 8px;
  border-radius: 4px;
}

.update-time {
  font-size: 0.85rem;
  color: #aaa;
}

.ai-button {
  background-color: #0078D4;
  color: white;
  border: none;
  padding: 6px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-weight: bold;
}

.ai-button:disabled {
  background-color: #555;
  cursor: not-allowed;
}

.visualization-area {
  flex-grow: 1;
  min-height: 350px;
}

.loading {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
  color: #888;
}

.ai-panel {
  margin-top: 16px;
  padding: 12px;
  background-color: #2a2a2a;
  border-left: 4px solid #00E396;
  border-radius: 4px;
}

.ai-panel h4 {
  margin: 0 0 8px 0;
  color: #00E396;
}

.ai-content {
  margin: 0;
  font-size: 0.9rem;
  line-height: 1.5;
  color: #ddd;
}
</style>
