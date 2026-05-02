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
	tl: { from: "rgba(170,80,80,0.12)",  to: "rgba(170,80,80,0.025)" },   // 深紅
	tr: { from: "rgba(185,125,70,0.12)", to: "rgba(185,125,70,0.025)" },  // 橙黃
	bl: { from: "rgba(70,120,170,0.12)", to: "rgba(70,120,170,0.025)" },  // 深藍
	br: { from: "rgba(70,150,110,0.11)", to: "rgba(70,150,110,0.025)" },  // 深綠
};

// 各象限對應的資料點顏色（正式儀表板低飽和色）
// xReverse=false: TR=右上(X高Y高), TL=左上(X低Y高)
// xReverse=true:  TL=左上(X高Y高), TR=右上(X低Y高)
const QUADRANT_DOT_COLORS = {
	// 位置 key 對應主色
	tl: "#B85C5C",  // 深紅（左上）
	tr: "#C9834A",  // 橙（右上）
	bl: "#4F7FAE",  // 藍（左下）
	br: "#5D9B7A",  // 綠（右下）
};

const DEFAULT_CLUSTER_RADIUS = 30;
const MAX_CLUSTER_ITEMS = 4;
const CLUSTER_OFFSET = 15;

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

// ── 鄰近點聚合 + 依象限著色 ──────────────────────────────
// 避免急診資料在左下角擠成一團，使用畫面像素距離合併接近點位。
const aggregatedSeries = computed(() => {
	return parsedSeries.value.map(serie => {
		const clusters = [];
		const clusterRadius = props.chart_config?.cluster_radius ?? DEFAULT_CLUSTER_RADIUS;

		serie.data.forEach(pt => {
			const px = toSvgX(pt.x);
			const py = toSvgY(pt.y);
			const cluster = clusters.find(item => {
				const dx = px - item.px;
				const dy = py - item.py;
				return Math.sqrt(dx * dx + dy * dy) <= clusterRadius;
			});

			if (cluster) {
				cluster.points.push(pt);
				cluster.labels.push(pt.label);
				cluster.x = average(cluster.points.map(item => item.x));
				cluster.y = average(cluster.points.map(item => item.y));
				cluster.px = toSvgX(cluster.x);
				cluster.py = toSvgY(cluster.y);
			} else {
				clusters.push({
					x: pt.x,
					y: pt.y,
					px,
					py,
					points: [pt],
					labels: [pt.label],
				});
			}
		});

		return {
			name: serie.name,
			data: splitLargeClusters(clusters).map(pt => {
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
						? `${pt.labels.length}家`
						: pt.labels[0],
				};
			}),
		};
	});
});

const displaySeries = computed(() => {
	return aggregatedSeries.value.map(serie => ({
		name: serie.name,
		data: layoutLabels(serie.data),
	}));
});

function average(values) {
	if (!values.length) return 0;
	const value = values.reduce((sum, item) => sum + Number(item || 0), 0) / values.length;
	return Math.round(value * 10) / 10;
}

function splitLargeClusters(clusters) {
	return clusters.flatMap(cluster => {
		if (cluster.points.length <= MAX_CLUSTER_ITEMS) {
			return [{ ...cluster, offsetX: 0, offsetY: 0 }];
		}

		const chunks = [];
		for (let i = 0; i < cluster.points.length; i += MAX_CLUSTER_ITEMS) {
			const points = cluster.points.slice(i, i + MAX_CLUSTER_ITEMS);
			chunks.push({
				...cluster,
				points,
				labels: points.map(point => point.label),
				x: average(points.map(point => point.x)),
				y: average(points.map(point => point.y)),
			});
		}

		return chunks.map((chunk, index) => {
			const angle = -Math.PI / 2 + (index * 2 * Math.PI) / chunks.length;
			return {
				...chunk,
				offsetX: Math.cos(angle) * CLUSTER_OFFSET,
				offsetY: Math.sin(angle) * CLUSTER_OFFSET,
			};
		});
	});
}

function pointSvgX(pt) {
	const radius = Math.max(4, bubbleR.value - 1);
	return clamp(
		toSvgX(pt.x) + (pt.offsetX ?? 0),
		pad.left + radius + 2,
		svgW.value - pad.right - radius - 2,
	);
}

function pointSvgY(pt) {
	const radius = Math.max(4, bubbleR.value - 1);
	return clamp(
		toSvgY(pt.y) + (pt.offsetY ?? 0),
		pad.top + radius + 2,
		svgH.value - pad.bottom - radius - 2,
	);
}

function clamp(value, min, max) {
	return Math.min(Math.max(value, min), max);
}

function layoutLabels(points) {
	const placed = [];
	const sorted = points
		.map((point, index) => ({ point, index }))
		.sort((a, b) => pointSvgY(a.point) - pointSvgY(b.point) || pointSvgX(a.point) - pointSvgX(b.point));
	const output = [...points];

	sorted.forEach(({ point, index }, orderIndex) => {
		const candidates = labelCandidates(point, orderIndex);
		let best = candidates[0];
		let bestScore = Number.POSITIVE_INFINITY;

		for (const candidate of candidates) {
			const score = placed.reduce((sum, box) => sum + overlapArea(candidate, box), 0);
			if (score === 0) {
				best = candidate;
				bestScore = 0;
				break;
			}
			if (score < bestScore) {
				best = candidate;
				bestScore = score;
			}
		}

		placed.push(best);
		output[index] = { ...point, labelBox: best };
	});

	return output;
}

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
function labelWidth(label) {
	const text = String(label ?? "");
	return clamp(text.length * 9 + 12, 30, 72);
}

function labelCandidates(pt, index) {
	const main = index % 2 === 0
		? ["top", "bottom", "right", "left"]
		: ["bottom", "top", "left", "right"];
	const diagonal = index % 2 === 0
		? ["topRight", "bottomLeft", "topLeft", "bottomRight"]
		: ["bottomRight", "topLeft", "bottomLeft", "topRight"];
	return [...main, ...diagonal].map(side => makeLabelBox(pt, side));
}

function makeLabelBox(pt, side = "top") {
	const px = pointSvgX(pt);
	const py = pointSvgY(pt);
	const width = labelWidth(pt.label);
	const height = 15;
	const gap = Math.max(6, bubbleR.value + 1);
	const plotRight = svgW.value - pad.right;
	const plotBottom = svgH.value - pad.bottom;
	let x = px;

	if (side.includes("Right")) x = px + width * 0.34;
	if (side.includes("Left")) x = px - width * 0.34;
	if (side === "right") x = px + width / 2 + gap;
	if (side === "left") x = px - width / 2 - gap;

	let y = py - gap - height;
	if (side.includes("bottom") || side === "bottom") {
		y = py + gap;
	}
	if (side === "right" || side === "left") {
		y = py - height / 2;
	}

	x = clamp(x, pad.left + width / 2 + 2, plotRight - width / 2 - 2);
	y = clamp(y, pad.top + 2, plotBottom - height - 2);

	return {
		x,
		y,
		width,
		height,
		textX: x,
		textY: y + 11,
	};
}

function labelPos(pt) {
	return pt.labelBox ?? makeLabelBox(pt);
}

function overlapArea(a, b) {
	const padding = 3;
	const left = Math.max(a.x - a.width / 2 - padding, b.x - b.width / 2 - padding);
	const right = Math.min(a.x + a.width / 2 + padding, b.x + b.width / 2 + padding);
	const top = Math.max(a.y - padding, b.y - padding);
	const bottom = Math.min(a.y + a.height + padding, b.y + b.height + padding);
	return Math.max(0, right - left) * Math.max(0, bottom - top);
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
          stroke="rgba(255,255,255,0.18)" stroke-width="1"
          stroke-dasharray="3 4"
        />
        <line
          :x1="pad.left" :y1="svgMidY"
          :x2="svgW - pad.right" :y2="svgMidY"
          stroke="rgba(255,255,255,0.18)" stroke-width="1"
          stroke-dasharray="3 4"
        />

        <!-- ── 象限角落文字 ── -->
        <g
          v-if="qLabels"
          font-size="9.5"
          fill="rgba(255,255,255,0.34)"
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
          fill="rgba(255,255,255,0.24)"
        />
        <!-- X 軸刻度 -->
        <g
          v-for="t in xTicks" :key="`xt-${t}`"
          font-size="9" fill="rgba(255,255,255,0.42)" text-anchor="middle"
        >
          <line
            :x1="toSvgX(t)" :y1="svgH - pad.bottom"
            :x2="toSvgX(t)" :y2="svgH - pad.bottom + 4"
            stroke="rgba(255,255,255,0.14)"
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
          fill="rgba(255,255,255,0.24)"
        />
        <!-- Y 軸刻度 -->
        <g
          v-for="t in yTicks" :key="`yt-${t}`"
          font-size="9" fill="rgba(255,255,255,0.42)" text-anchor="end"
        >
          <line
            :x1="pad.left - 4" :y1="toSvgY(t)"
            :x2="pad.left" :y2="toSvgY(t)"
            stroke="rgba(255,255,255,0.14)"
          />
          <text :x="pad.left - 6" :y="toSvgY(t) + 3.5">{{ t }}</text>
        </g>

        <!-- ── 資料氣泡（使用 aggregatedSeries 展示集合點） ── -->
        <g v-for="(serie, si) in displaySeries" :key="`s${si}`">
          <g
            v-for="(pt, pi) in serie.data"
            :key="`p${si}-${pi}`"
            class="qc-point"
            :class="{ 'qc-selected': selKey === `${pi}-${si}` }"
            @mouseenter="showTip($event, pt, pt.color)"
            @mouseleave="hideTip"
            @click="handleClick(si, pi, pt)"
          >
          <!-- 透明點擊範圍 -->
            <circle
              :cx="pointSvgX(pt)"
              :cy="pointSvgY(pt)"
              :r="bubbleR + 7"
              :fill="pt.color"
              fill-opacity="0"
              class="qc-hit-area"
            />
            <!-- 主圓（實心） -->
            <circle
              :cx="pointSvgX(pt)"
              :cy="pointSvgY(pt)"
              :r="Math.max(4, bubbleR - 1)"
              :fill="pt.color"
              fill-opacity="0.88"
              class="qc-circle"
            />
            <!-- 標籤文字 -->
            <rect
              :x="labelPos(pt).x - labelPos(pt).width / 2"
              :y="labelPos(pt).y"
              :width="labelPos(pt).width"
              :height="labelPos(pt).height"
              rx="3"
              class="qc-label-bg"
            />
            <text
              :x="labelPos(pt).textX"
              :y="labelPos(pt).textY"
              text-anchor="middle"
              font-size="9"
              font-weight="400"
              fill="rgba(255,255,255,0.82)"
              paint-order="stroke"
              stroke="rgba(32,34,36,0.62)"
              stroke-width="1.5"
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
  font-size: 10px;
  font-weight: 500;
  color: rgba(255,255,255,0.58);
  letter-spacing: 0;
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
.qc-point:hover .qc-circle {
  fill-opacity: 1;
  stroke: rgba(255,255,255,0.82);
  stroke-width: 1.5;
}
.qc-hit-area {
  pointer-events: all;
}
.qc-circle {
  stroke: rgba(255,255,255,0.48);
  stroke-width: 1;
  transition: fill-opacity 0.15s ease, stroke 0.15s ease, stroke-width 0.15s ease;
}
.qc-label-bg {
  fill: rgba(26,28,30,0.48);
  stroke: rgba(255,255,255,0.08);
  stroke-width: 0.5;
  pointer-events: none;
}
.qc-selected .qc-circle {
  fill-opacity: 1;
  stroke: rgba(255,255,255,0.95);
  stroke-width: 2;
}

/* X 軸標題 */
.qc-xtitle {
  text-align: center;
  font-size: 10px;
  font-weight: 500;
  color: rgba(255,255,255,0.58);
  letter-spacing: 0;
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
  font-size: 10px;
  color: rgba(255,255,255,0.62);
}
</style>
