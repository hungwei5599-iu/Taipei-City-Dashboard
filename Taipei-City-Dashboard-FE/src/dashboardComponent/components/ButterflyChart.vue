<!-- Developed by Taipei Urban Intelligence Center 2023-2024 -->
<!-- QuadrantChart – 四象限矩陣圖（純 SVG，取代 ButterflyChart）-->

<script setup>
import { ref, computed, onMounted, onUnmounted } from "vue";

const props = defineProps([
	"chart_config",
	"activeChart",
	"series",
	"map_config",
	"map_filter",
	"map_filter_on",
]);

const emits = defineEmits([
	"filterByParam",
	"filterByLayer",
	"clearByParamFilter",
	"clearByLayerFilter",
	"fly",
]);

// ──────────────────────────────────────────────────────────
// 資料格式說明（chart_config 選填欄位）：
//   xaxis_label     : X 軸自訂名稱（預設取 series[0].name）
//   yaxis_label     : Y 軸自訂名稱（預設取 series[1].name）
//   xaxis_reverse   : true → X 軸左大右小
//   bubble_size     : 氣泡半徑（預設 9）
//   quadrant_labels : { tl, tr, bl, br } 四象限角落文字
//
// 中心分隔線計算規則（動態，不需手動設定）：
//   midX = X 最大值的 50%（即最大值一半）
//   midY = Y 最大值的 50%
//   → 自動隨資料範圍調整，左右集中時也能正確分四象限
//
// chart_data（series）支援兩種格式：
//   格式A：[{ name:"A", data:[{x,y,label},...] }]
//   格式B：series[0].data=X陣列, series[1].data=Y陣列,
//          chart_config.categories=標籤陣列（醫院名等）
// ──────────────────────────────────────────────────────────

// 暖色系為主，避免與象限背景藍色混淆
const COLOR_POOL = [
	"#E8A838", "#E87040", "#4DBFBF", "#E84060",
	"#9B59B6", "#27AE60", "#F39C12", "#D4556A",
];

// 象限背景漸層（固定，不隨資料變動）
const QUADRANT_COLORS = {
	tl: { from: "rgba(180,30,30,0.22)",  to: "rgba(180,30,30,0.04)" },   // 深紅
	tr: { from: "rgba(220,120,20,0.20)", to: "rgba(220,120,20,0.04)" },  // 橙黃
	bl: { from: "rgba(30,120,200,0.20)", to: "rgba(30,120,200,0.04)" },  // 深藍
	br: { from: "rgba(20,160,100,0.18)", to: "rgba(20,160,100,0.04)" },  // 深綠
};

// 各象限對應的資料點顏色（固體色，帶漸層發光）
// xReverse=false: TR=右上(X高Y高), TL=左上(X低Y高)
// xReverse=true:  TL=左上(X高Y高), TR=右上(X低Y高)
const QUADRANT_DOT_COLORS = {
	// 位置 key 對應主色
	tl: "#D94F4F",  // 深紅（左上）
	tr: "#E8953A",  // 橙（右上）
	bl: "#3A7BD5",  // 藍（左下）
	br: "#2EBF80",  // 綠（右下）
};

// ── 資料解析 ──────────────────────────────────────────────
const parsedSeries = computed(() => {
	if (!props.series || props.series.length === 0) return [];
	const first = props.series[0];

	// 格式A：data[0] 已是 { x, y, label }
	if (
		first?.data?.[0] &&
		typeof first.data[0] === "object" &&
		"x" in first.data[0]
	) {
		return props.series.map((s, i) => ({
			name: s.name,
			color: s.color ?? COLOR_POOL[i % COLOR_POOL.length],
			data: s.data.map(d => ({
				x: Number(d.x),
				y: Number(d.y),
				label: d.label ?? d.name ?? "",
			})),
		}));
	}

	// 格式B：parallel arrays（本專案急診資料格式）
	const xArr = props.series[0]?.data ?? [];
	const yArr = props.series[1]?.data ?? [];
	const cats = props.chart_config?.categories ?? [];
	return [{
		name: props.series[0]?.name ?? "資料",
		color: COLOR_POOL[0],
		data: xArr.map((xv, i) => ({
			x: Number(xv),
			y: Number(yArr[i] ?? 0),
			label: cats[i] ?? `點${i + 1}`,
		})),
	}];
});

const allPoints = computed(() => {
	const pts = [];
	parsedSeries.value.forEach(s => s.data.forEach(d => pts.push(d)));
	return pts;
});

// ── 重疊點聚合 + 依象限著色 ──────────────────────────────
// 每個聚合點根據其 (x,y) 對應的象限，自動套用象限顏色
const aggregatedSeries = computed(() => {
	return parsedSeries.value.map(serie => {
		const map = new Map();
		serie.data.forEach(pt => {
			const key = `${pt.x},${pt.y}`;
			if (map.has(key)) {
				map.get(key).labels.push(pt.label);
			} else {
				map.set(key, { x: pt.x, y: pt.y, labels: [pt.label] });
			}
		});
		return {
			name: serie.name,
			data: Array.from(map.values()).map(pt => {
				// 依象限位置決定顏色
				const onLeft  = xReverse.value ? pt.x >= midX.value : pt.x < midX.value;
				const onTop   = pt.y >= midY.value;
				const qKey = onTop
					? (onLeft ? "tl" : "tr")
					: (onLeft ? "bl" : "br");
				return {
					...pt,
					color: QUADRANT_DOT_COLORS[qKey],
					label: pt.labels.length > 1
						? `${pt.labels[0]} +${pt.labels.length - 1}`
						: pt.labels[0],
				};
			}),
		};
	});
});

// ── 軸標題（優先用 chart_config，否則讀 series 名稱）─────
// 單位支援：chart_config.unit（通用）或 xaxis_unit / yaxis_unit（個別設定）
function withUnit(label, unitKey) {
	const u = props.chart_config?.[unitKey] ?? props.chart_config?.unit ?? "";
	return u ? `${label}（${u}）` : label;
}
const xLabelRaw = computed(() =>
	props.chart_config?.xaxis_label
		?? props.series?.[0]?.name
		?? "X 軸"
);
const yLabelRaw = computed(() =>
	props.chart_config?.yaxis_label
		?? props.series?.[1]?.name
		?? "Y 軸"
);
const xLabel = computed(() => withUnit(xLabelRaw.value, "xaxis_unit"));
const yLabel = computed(() => withUnit(yLabelRaw.value, "yaxis_unit"));
const xReverse = computed(() => props.chart_config?.xaxis_reverse ?? false);
const qLabels  = computed(() => props.chart_config?.quadrant_labels ?? null);
const bubbleR  = computed(() => props.chart_config?.bubble_size ?? 9);

// ── 軸範圍：從 0 到最大值＋25% padding ──────────────────
// 25% 確保最大值氣泡 + 標籤不超出繪圖區域
function buildRange(vals) {
	if (!vals.length) return { min: 0, max: 100 };
	const mx = Math.max(...vals);
	const mn = 0;
	const span = mx - mn || 10;
	return { min: mn, max: mx + span * 0.25 };
}

const xRange = computed(() => buildRange(allPoints.value.map(p => p.x)));
const yRange = computed(() => buildRange(allPoints.value.map(p => p.y)));

// ── 中心分隔線：動態取 最大值的 50% ─────────────────────
// 不使用資料平均，而是 max/2，確保即使點集中時也能有意義地分四象限
const midX = computed(() => {
	if (props.chart_config?.midpoint_x !== undefined)
		return props.chart_config.midpoint_x;
	const xs = allPoints.value.map(p => p.x);
	if (!xs.length) return 50;
	return Math.max(...xs) / 2;
});
const midY = computed(() => {
	if (props.chart_config?.midpoint_y !== undefined)
		return props.chart_config.midpoint_y;
	const ys = allPoints.value.map(p => p.y);
	if (!ys.length) return 50;
	return Math.max(...ys) / 2;
});

// ── SVG 尺寸與 padding ────────────────────────────────────
const svgRef = ref(null);
const svgW   = ref(440);
const svgH   = ref(300);
const pad    = { top: 20, right: 20, bottom: 52, left: 52 };

let ro = null;
onMounted(() => {
	const el = svgRef.value?.parentElement;
	if (!el) return;
	svgW.value = el.clientWidth  || 440;
	svgH.value = el.clientHeight || 300;
	ro = new ResizeObserver(entries => {
		const r = entries[0].contentRect;
		if (r.width)  svgW.value = r.width;
		if (r.height) svgH.value = r.height;
	});
	ro.observe(el);
});
onUnmounted(() => ro?.disconnect());

// ── 座標轉換：資料值 → SVG 像素 ──────────────────────────
function toSvgX(val) {
	const { min, max } = xRange.value;
	const ratio = (val - min) / (max - min);
	const eff   = xReverse.value ? 1 - ratio : ratio;
	return pad.left + eff * (svgW.value - pad.left - pad.right);
}
function toSvgY(val) {
	const { min, max } = yRange.value;
	const ratio = (val - min) / (max - min);
	return svgH.value - pad.bottom - ratio * (svgH.value - pad.top - pad.bottom);
}

const svgMidX = computed(() => toSvgX(midX.value));
const svgMidY = computed(() => toSvgY(midY.value));

// ── 軸刻度自動計算 ────────────────────────────────────────
function niceTicks(min, max, count = 5) {
	const span  = max - min;
	if (span <= 0) return [min];
	const rough = span / count;
	const mag   = Math.pow(10, Math.floor(Math.log10(rough || 1)));
	const norm  = rough / mag;
	let step = mag;
	if (norm > 5)      step = 10 * mag;
	else if (norm > 2) step =  5 * mag;
	else if (norm > 1) step =  2 * mag;
	const start = Math.ceil(min / step) * step;
	const ticks = [];
	for (let v = start; v <= max + 1e-9; v += step)
		ticks.push(Math.round(v * 1e6) / 1e6);
	return ticks;
}
const xTicks = computed(() => niceTicks(xRange.value.min, xRange.value.max));
const yTicks = computed(() => niceTicks(yRange.value.min, yRange.value.max));

// ── 標籤偏移：避免超出邊界，緊貼氣泡旁邊 ────────────────
function labelPos(px, py) {
	const onRight = px >= svgMidX.value;
	const onTop   = py <= svgMidY.value;
	const r = bubbleR.value;
	return {
		anchor: onRight ? "start" : "end",
		dx:     onRight ? r + 4 : -(r + 4),
		dy:     onTop   ? -(r + 2) : r + 11,
	};
}

// ── Tooltip（使用全域 .chart-tooltip 樣式）────────────────────
// 資料： labels=至多名院合併列表， sx=待诊人數， sy=等候時間
const tooltip = ref({
	show:   false,
	tx:     0,    // 相對 SVG 左上角 X
	ty:     0,    // 相對 SVG 左上角 Y
	flipX:  false,// true → tooltip 顯示在鼠標左方
	flipY:  false,// true → tooltip 顯示在鼠標上方
	labels: [],   // 聊合點列表
	sx:     0,
	sy:     0,
	color:  "#fff",
});

// tooltip 寬度預估（px）
// 右邊界 + 下邊界判斷
const TIP_W = 150;
const TIP_H = 76;

function showTip(e, pt, color) {
	const rect = svgRef.value.getBoundingClientRect();
	const mx = e.clientX - rect.left;
	const my = e.clientY - rect.top;
	const flipX = mx + TIP_W + 16 > svgW.value;  // 顯示不下則左翻
	const flipY = my + TIP_H + 10 > svgH.value;  // 顯示不下則上翻
	tooltip.value = {
		show:   true,
		tx:     mx,
		ty:     my,
		flipX,
		flipY,
		labels: pt.labels ?? [pt.label ?? ""],
		sx:     pt.x,
		sy:     pt.y,
		color,
	};
}
function hideTip() { tooltip.value.show = false; }

// ── 篩選互動 ──────────────────────────────────────────────
const selKey = ref(null);
function handleClick(si, pi, pt) {
	if (!props.map_filter || !props.map_filter_on) return;
	const label = pt.labels?.[0] ?? pt.label ?? "";
	const k = `${pi}-${si}`;
	if (k !== selKey.value) {
		if (props.map_filter.mode === "byParam")
			emits("filterByParam", props.map_filter, props.map_config,
				label, props.series?.[si]?.name ?? "");
		else if (props.map_filter.mode === "byLayer")
			emits("filterByLayer", props.map_config, label);
		selKey.value = k;
	} else {
		if (props.map_filter.mode === "byParam")
			emits("clearByParamFilter", props.map_config);
		else if (props.map_filter.mode === "byLayer")
			emits("clearByLayerFilter", props.map_config);
		selKey.value = null;
	}
}
</script>

<template>
  <div
    v-if="activeChart === 'ButterflyChart'"
    class="qc-root"
  >
    <!-- Y 軸旋轉標題 -->
    <div class="qc-ytitle">
      {{ yLabel }}
    </div>

    <!-- SVG 主體 -->
    <div class="qc-body">
      <svg
        ref="svgRef"
        class="qc-svg"
        :viewBox="`0 0 ${svgW} ${svgH}`"
        :width="svgW"
        :height="svgH"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <!-- 四象限漸層 -->
          <linearGradient id="qcg-tl" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" :stop-color="QUADRANT_COLORS.tl.to" />
            <stop offset="100%" :stop-color="QUADRANT_COLORS.tl.from" />
          </linearGradient>
          <linearGradient id="qcg-tr" x1="100%" y1="100%" x2="0%" y2="0%">
            <stop offset="0%" :stop-color="QUADRANT_COLORS.tr.to" />
            <stop offset="100%" :stop-color="QUADRANT_COLORS.tr.from" />
          </linearGradient>
          <linearGradient id="qcg-bl" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" :stop-color="QUADRANT_COLORS.bl.from" />
            <stop offset="100%" :stop-color="QUADRANT_COLORS.bl.to" />
          </linearGradient>
          <linearGradient id="qcg-br" x1="100%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" :stop-color="QUADRANT_COLORS.br.from" />
            <stop offset="100%" :stop-color="QUADRANT_COLORS.br.to" />
          </linearGradient>
        </defs>

        <!-- ── 象限背景色塊 ── -->
        <!-- TL（左上：深紅） -->
        <rect
          :x="pad.left"
          :y="pad.top"
          :width="Math.max(0, svgMidX - pad.left)"
          :height="Math.max(0, svgMidY - pad.top)"
          fill="url(#qcg-tl)"
        />
        <!-- TR（右上：橙黃） -->
        <rect
          :x="svgMidX"
          :y="pad.top"
          :width="Math.max(0, svgW - pad.right - svgMidX)"
          :height="Math.max(0, svgMidY - pad.top)"
          fill="url(#qcg-tr)"
        />
        <!-- BL（左下：深藍） -->
        <rect
          :x="pad.left"
          :y="svgMidY"
          :width="Math.max(0, svgMidX - pad.left)"
          :height="Math.max(0, svgH - pad.bottom - svgMidY)"
          fill="url(#qcg-bl)"
        />
        <!-- BR（右下：綠） -->
        <rect
          :x="svgMidX"
          :y="svgMidY"
          :width="Math.max(0, svgW - pad.right - svgMidX)"
          :height="Math.max(0, svgH - pad.bottom - svgMidY)"
          fill="url(#qcg-br)"
        />

        <!-- ── 象限分隔線 ── -->
        <line
          :x1="svgMidX" :y1="pad.top"
          :x2="svgMidX" :y2="svgH - pad.bottom"
          stroke="rgba(255,255,255,0.30)" stroke-width="1.2"
          stroke-dasharray="4 3"
        />
        <line
          :x1="pad.left" :y1="svgMidY"
          :x2="svgW - pad.right" :y2="svgMidY"
          stroke="rgba(255,255,255,0.30)" stroke-width="1.2"
          stroke-dasharray="4 3"
        />

        <!-- ── 象限角落文字 ── -->
        <g
          v-if="qLabels"
          font-size="10"
          fill="rgba(255,255,255,0.28)"
          font-weight="500"
        >
          <text v-if="qLabels.tl" :x="pad.left + 6" :y="pad.top + 14">{{ qLabels.tl }}</text>
          <text v-if="qLabels.tr" :x="svgW - pad.right - 6" :y="pad.top + 14" text-anchor="end">{{ qLabels.tr }}</text>
          <text v-if="qLabels.bl" :x="pad.left + 6" :y="svgH - pad.bottom - 7">{{ qLabels.bl }}</text>
          <text v-if="qLabels.br" :x="svgW - pad.right - 6" :y="svgH - pad.bottom - 7" text-anchor="end">{{ qLabels.br }}</text>
        </g>

        <!-- ── X 軸 ── -->
        <line
          :x1="pad.left - 4" :y1="svgH - pad.bottom"
          :x2="svgW - pad.right + 4" :y2="svgH - pad.bottom"
          stroke="rgba(255,255,255,0.22)" stroke-width="1"
        />
        <!-- X 軸箭頭 -->
        <polygon
          :points="`${svgW - pad.right + 8},${svgH - pad.bottom} ${svgW - pad.right + 1},${svgH - pad.bottom - 4} ${svgW - pad.right + 1},${svgH - pad.bottom + 4}`"
          fill="rgba(255,255,255,0.28)"
        />
        <!-- X 軸刻度 -->
        <g
          v-for="t in xTicks" :key="`xt-${t}`"
          font-size="9.5" fill="#777" text-anchor="middle"
        >
          <line
            :x1="toSvgX(t)" :y1="svgH - pad.bottom"
            :x2="toSvgX(t)" :y2="svgH - pad.bottom + 4"
            stroke="rgba(255,255,255,0.18)"
          />
          <text :x="toSvgX(t)" :y="svgH - pad.bottom + 15">{{ t }}</text>
        </g>

        <!-- ── Y 軸 ── -->
        <line
          :x1="pad.left" :y1="pad.top - 4"
          :x2="pad.left" :y2="svgH - pad.bottom + 4"
          stroke="rgba(255,255,255,0.22)" stroke-width="1"
        />
        <!-- Y 軸箭頭 -->
        <polygon
          :points="`${pad.left},${pad.top - 8} ${pad.left - 4},${pad.top - 1} ${pad.left + 4},${pad.top - 1}`"
          fill="rgba(255,255,255,0.28)"
        />
        <!-- Y 軸刻度 -->
        <g
          v-for="t in yTicks" :key="`yt-${t}`"
          font-size="9.5" fill="#777" text-anchor="end"
        >
          <line
            :x1="pad.left - 4" :y1="toSvgY(t)"
            :x2="pad.left" :y2="toSvgY(t)"
            stroke="rgba(255,255,255,0.18)"
          />
          <text :x="pad.left - 6" :y="toSvgY(t) + 3.5">{{ t }}</text>
        </g>

        <!-- ── 資料氣泡（使用 aggregatedSeries 展示集合點） ── -->
        <g v-for="(serie, si) in aggregatedSeries" :key="`s${si}`">
          <g
            v-for="(pt, pi) in serie.data"
            :key="`p${si}-${pi}`"
            class="qc-point"
            :class="{ 'qc-selected': selKey === `${pi}-${si}` }"
            @mouseenter="showTip($event, pt, pt.color)"
            @mouseleave="hideTip"
            @click="handleClick(si, pi, pt)"
          >
          <!-- 外層大光暈（象限顏色） -->
            <circle
              :cx="toSvgX(pt.x)"
              :cy="toSvgY(pt.y)"
              :r="bubbleR + 7"
              :fill="pt.color"
              fill-opacity="0.10"
              class="qc-glow-outer"
            />
            <!-- 中層光暈 -->
            <circle
              :cx="toSvgX(pt.x)"
              :cy="toSvgY(pt.y)"
              :r="bubbleR + 3"
              :fill="pt.color"
              fill-opacity="0.22"
              class="qc-glow-inner"
            />
            <!-- 主圓（實心） -->
            <circle
              :cx="toSvgX(pt.x)"
              :cy="toSvgY(pt.y)"
              :r="bubbleR"
              :fill="pt.color"
              fill-opacity="0.92"
              class="qc-circle"
            />
            <!-- 標籤文字（帶黑色描邊增加可讀性） -->
            <text
              :x="toSvgX(pt.x) + labelPos(toSvgX(pt.x), toSvgY(pt.y)).dx"
              :y="toSvgY(pt.y) + labelPos(toSvgX(pt.x), toSvgY(pt.y)).dy"
              :text-anchor="labelPos(toSvgX(pt.x), toSvgY(pt.y)).anchor"
              font-size="11"
              font-weight="500"
              fill="#e8e8e8"
              paint-order="stroke"
              stroke="rgba(0,0,0,0.65)"
              stroke-width="3"
              stroke-linejoin="round"
            >
              {{ pt.label }}
            </text>
          </g>
        </g>
      </svg>

      <!-- ── Tooltip -->
      <Transition name="qc-fade">
        <div
          v-if="tooltip.show"
          class="chart-tooltip qc-tooltip"
          :style="{
            left: tooltip.flipX ? (tooltip.tx - TIP_W - 8) + 'px' : (tooltip.tx + 14) + 'px',
            top:  tooltip.flipY ? (tooltip.ty - TIP_H - 8) + 'px' : (tooltip.ty - 10) + 'px',
          }"
        >
          <span class="qc-tooltip-dot" :style="{ background: tooltip.color }" />
          <!-- 醫院列表 -->
          <h6 v-for="(lbl, i) in tooltip.labels" :key="i">{{ lbl }}</h6>
          <!-- 待诊人數：X 軸，單位獲取 xaxis_unit -->
          <span>{{ xLabelRaw }}：{{ tooltip.sx }}
            <template v-if="props.chart_config?.xaxis_unit">
              {{ props.chart_config.xaxis_unit }}
            </template>
          </span>
          <!-- 等候時間：Y 軸，單位獲取 yaxis_unit -->
          <span>{{ yLabelRaw }}：{{ tooltip.sy }}
            <template v-if="props.chart_config?.yaxis_unit">
              {{ props.chart_config.yaxis_unit }}
            </template>
          </span>
        </div>
      </Transition>
    </div>

    <!-- X 軸標題 -->
    <div class="qc-xtitle">
      {{ xLabel }}
    </div>

    <!-- 圖例（多系列時顯示） -->
    <div v-if="parsedSeries.length > 1" class="qc-legend">
      <div
        v-for="(s, i) in parsedSeries"
        :key="`leg${i}`"
        class="qc-legend-item"
      >
        <span class="qc-legend-dot" :style="{ background: s.color }" />
        <span class="qc-legend-name">{{ s.name }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.qc-root {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  position: relative;
  box-sizing: border-box;
  overflow: hidden;
}

/* Y 軸旋轉標題 */
.qc-ytitle {
  position: absolute;
  left: 2px;
  top: 50%;
  transform: translateX(-50%) translateY(-50%) rotate(-90deg);
  font-size: 10.5px;
  font-weight: 600;
  color: var(--color-complement-text, #bbb);
  letter-spacing: 0.05em;
  white-space: nowrap;
  pointer-events: none;
  z-index: 2;
}

.qc-body {
  flex: 1;
  position: relative;
  min-height: 0;
  overflow: hidden;
}

.qc-svg {
  display: block;
  width: 100%;
  height: 100%;
}

/* 氣泡互動 */
.qc-point {
  cursor: pointer;
}
.qc-point:hover .qc-glow-outer {
  fill-opacity: 0.20;
  transition: fill-opacity 0.2s ease;
}
.qc-point:hover .qc-glow-inner {
  fill-opacity: 0.35;
  transition: fill-opacity 0.2s ease;
}
.qc-point:hover .qc-circle {
  filter: brightness(1.25);
}
.qc-glow-outer,
.qc-glow-inner,
.qc-circle {
  transition: fill-opacity 0.2s ease, filter 0.2s ease;
}
.qc-selected .qc-circle {
  stroke: #fff;
  stroke-width: 2;
}

/* X 軸標題 */
.qc-xtitle {
  text-align: center;
  font-size: 10.5px;
  font-weight: 600;
  color: var(--color-complement-text, #bbb);
  letter-spacing: 0.05em;
  padding: 1px 0 0;
  flex-shrink: 0;
}

/* Tooltip 定位包裝（全域 .chart-tooltip 負責外觀） */
.qc-tooltip {
  position: absolute;
  pointer-events: none;
  z-index: 200;
  min-width: 130px;
}
.qc-tooltip-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 5px;
  vertical-align: middle;
}

/* Tooltip 淡入動畫 */
.qc-fade-enter-active,
.qc-fade-leave-active {
  transition: opacity 0.12s ease;
}
.qc-fade-enter-from,
.qc-fade-leave-to {
  opacity: 0;
}

/* 圖例 */
.qc-legend {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 5px 12px;
  padding: 3px 8px 0;
  flex-shrink: 0;
}
.qc-legend-item {
  display: flex;
  align-items: center;
  gap: 4px;
}
.qc-legend-dot {
  display: inline-block;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  flex-shrink: 0;
}
.qc-legend-name {
  font-size: 11px;
  color: var(--color-complement-text, #ccc);
}
</style>
