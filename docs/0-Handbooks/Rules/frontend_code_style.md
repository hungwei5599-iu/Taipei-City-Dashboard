# Frontend Code Style Guide — Taipei Dashdorad

> **⚠️ 本文僅涵蓋前端的程式碼撰寫規範。** 後端請參閱 [後端程式碼撰寫規範](./backend_code_style.md)。
> 
> 本文件基於 [官方 citydashboard.taipei 規範](https://citydashboard.taipei/documentation/front-end/code-style) 整理。

## 程式檢查 (Linting)
- **Prettier** + **ESLint**（配置檔：`.eslintrc.json` + `.prettierrc`）
- **配置檔禁止修改**
- PR 前必須在根目錄執行 `npm run lint` 並解決所有問題
- 建議使用 VS Code 搭配 Prettier 和 ESLint 擴充功能

## 技術棧限制
- **Framework**: Vue 3.4+ (Composition API with `<script setup>`)
- **Build Tool**: Vite 5
- **State Management**: Pinia
- **Charts**: **ApexCharts 3.45+**（⛔ 禁止 ECharts / Chart.js / D3 / Recharts / Highcharts）
- **Maps**: Mapbox GL 3.1 / Deck.gl 9
- **Styling**: **SCSS** (`<style scoped lang="scss">`)

## 變量和檔案命名

### Vue 元件
- **Pascal Case**，至少兩個單字（`MapView`, `HistoryChart`）

### 函式
- **Camel Case**，以動詞開頭（`handleSubmit`, `hideAllDialogs`, `executeQuery`）

### 一般變量
- **Camel Case**（`parsedChartData`）
- **禁止使用 `var`**，僅用 `const` 和 `let`

### CSS Class 命名
- **Kebab Case**（`settingsbar-title`）
- 根類 = 組件名全小寫（`SettingsBar` → `.settingsbar`）
- 子類以根類名為前綴（`.settingsbar-title`）

## 文件結構

### Vue 元件結構
順序：`<script setup>` → `<template>` → `<style scoped lang="scss">`

```vue
<!-- Component Name: SampleComponent -->
<script setup>
// 1. Library, package, and Pinia Store imports
import { ref, computed, onMounted } from 'vue';
import { useContentStore } from '../store/contentStore';

// 2. Component, config, utility function imports
import AddComponent from './dialogs/AddComponent.vue';

// 3. Library, package, and Pinia Store constant declarations
const contentStore = useContentStore();

// 4. Props and Emits
const props = defineProps('sample');

// 5. Local Data
const isDashboard = ref(false);

// 6. Computed Properties
const sampleComputed = computed(() => {
	return "sample"
})

// 7. Methods
handleSubmit() {
	return
}

// 8. Life Cycle Hooks
onMounted(() => {
	isDashboard.value = true;
})
</script>

<template>
	<div class="samplecomponent">
		<!-- Rest of the template -->
	</div>
</template>

<style scoped lang="scss">
.samplecomponent {
	/* ...styling */
}
</style>
```

### CSS 屬性排序（嚴格遵守）
```scss
.samplecomponent {
	/* 1. Dimensions */
	width: 1rem;
	/* 2. Display Related */
	display: flex;
	flex-direction: column;
	/* 3. Position Related */
	position: absolute;
	top: 0;
	/* 4. Margin and Padding */
	margin: 0 1rem;
	padding: 0;
	/* 5. Border related */
	border: none;
	border-radius: 5px;
	/* 6. Background related */
	background-color: "red";
	opacity: 1;
	/* 7. Font related */
	color: "white";
	font-size: var(--font-s);
	/* 8. Animation related */
	animation: fade 1s;
	/* 9. Transition */
	transition: opacity 0.2s;
	/* 10. Other */
	overflow: hidden;
	z-index: 2;
	pointer-events: none;

	/* Selectors placed AFTER main styles */
	&:hover {
		opacity: 0;
	}
}
```

## 圖表類型參照（ApexCharts 專用）
| 英文名 | 中文名 | 適用場景 |
|--------|--------|----------|
| `BarChart` | 橫向長條圖 | 多筆條列資料 |
| `BarPercentChart` | 長條圖(%) | 百分比值 |
| `ColumnChart` | 縱向長條圖 | ≤12 項目列表 |
| `DonutChart` | 圓餅圖 | 百分比分佈 |
| `GuageChart` | 量表圖 | 單一百分比 |
| `RadarChart` | 雷達圖 | 多維度比較 |
| `TimelineSeparateChart` | 折線圖(比較) | 時間序列獨立 |
| `TimelineStackedChart` | 折線圖(堆疊) | 時間序列累計 |
| `TreemapChart` | 矩形圖 | 面積佔比 |
| `DistrictChart` | 行政區圖 | 雙北行政區 |
| `HeatmapChart` | 熱力圖 | 三維網格 |
| `PolarAreaChart` | 極座標圖 | 三維扇形 |
| `ColumnLineChart` | 長條折線圖 | 雙系列時間資料 |
| `BarChartWithGoal` | 長條圖(目標) | 目標對比 |
| `IconPercentChart` | 圖示比例圖 | 圖示化百分比 |
| `IndicatorChart` | 指標圖 | 範圍判斷 |
| `TextUnitChart` | 文字單位圖 | 數值+單位展示 |

## 資料格式（5 種法定格式）
- `two_d` — 二維資料（XY 圖表）
- `percent` — 百分比資料（圓餅/量表）
- `three_d` — 三維資料（多系列）
- `map_legend` — 地圖圖例資料
- `time` — 時間序列資料
