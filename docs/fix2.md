你以為 openGuideComponent(target.componentIndex) 會等於打開組件，
但實際上它只是在 mapStore 裡存一個 index。

所以這些問題會出現：

環保餐廳分布概況：AI 有回答，但組件沒真正用資料開起來
藥局資源分布概況：地圖 zoom 了，但藥局組件沒開
淨水場水質檢測概況：開到空殼，沒有資料

因為目前 openGuideComponent() 只做這件事：

openGuideComponent(componentIndex) {
	this.guideActiveComponentIndex = componentIndex;
}

這不會 fetch chart data，也不會用原本點卡片的流程開組件。你現在只是塞一個 componentIndex。

你要改的最小版本
1. 在 chatStore 裡加 findMatchedComponent

放在 tryRunMapInteraction() 前面：

const findMatchedComponent = (target, components = []) => {
	const targetKeys = [
		target.componentIndex,
		...(target.componentIndexes || []),
	]
		.filter(Boolean)
		.map(String);

	return components.find((component) => {
		const componentKeys = [
			component.id,
			component.index,
			component.component_index,
		]
			.filter(Boolean)
			.map(String);

		return componentKeys.some((key) => targetKeys.includes(key));
	});
};
2. 改 tryRunMapInteraction() 裡開組件的地方

把這種：

mapStore.openGuideComponent(target.componentIndex);

改成：

const matchedComponent = findMatchedComponent(target, components);

mapStore.openGuideComponent({
	component: matchedComponent,
	componentIndex: target.componentIndex,
	componentId: matchedComponent?.id,
	city: matchedComponent?.city || target.city || "metrotaipei",
});

原因是 components 裡才有真正能拿 chart data 的 id / index / city / name。你的 buildDatabaseContext() 也是靠 component.id 去打 /component/${component.id}/chart。

3. 改 mapStore state

現在有：

guideActiveComponentIndex: null,

改成：

guideActiveComponent: null,
guideActiveComponentIndex: null,
4. 改 mapStore.openGuideComponent

把：

openGuideComponent(componentIndex) {
	this.guideActiveComponentIndex = componentIndex;
}

改成：

openGuideComponent(payload) {
	this.guideActiveComponent = payload;
	this.guideActiveComponentIndex = payload?.componentIndex;
}
5. UI 那邊一定要 watch guideActiveComponent

這是最重要的。

不要只看 guideActiveComponentIndex。
你要用完整 component 去走原本「手動點推薦組件卡片」的流程。

watch(
	() => mapStore.guideActiveComponent,
	(payload) => {
		if (!payload?.component) return;

		// 換成你專案裡原本點推薦組件卡片的 function
		openComponentByRelation(payload.component);
	},
);

這個 openComponentByRelation() 一定要換成你專案裡實際的函式名稱。

重點是：

要用 payload.component
不要用 componentIndex 自己開空 panel
你的四個案例要怎麼修
1. 台北市目前急診人數最少的醫院是哪間

需求：

開急診組件
不要標點
不要 circle
不要 highlight

做法：

這題可以 component-only return：

if (shouldOpenComponentOnly(question, target)) {
	const matchedComponent = findMatchedComponent(target, components);

	mapStore.clearGuideHighlight();
	mapStore.openGuideComponent({
		component: matchedComponent,
		componentIndex: target.componentIndex,
		componentId: matchedComponent?.id,
		city: matchedComponent?.city || target.city || "metrotaipei",
	});

	return {
		tool_name: "frontend_component_open",
		status: "component_opened",
		target: target.id,
		componentIndex: target.componentIndex,
		componentId: matchedComponent?.id,
	};
}

這樣就不會繼續跑：

mapStore.openGuideLayer(target)
mapStore.runGuideSpatialFocus(target, intent)

也就不會標點。

2. 我附近最近的急診醫院

需求：

開 GPS
找最近急診
畫線

你現在只有：

navigator.geolocation.getCurrentPosition(...)

這只會拿座標，不會觸發 Mapbox 自己的定位藍點。

要改：

state 加：

geoLocateControl: null,

initializeMapBox() 裡：

const geoLocate = new mapboxGl.GeolocateControl({
	positionOptions: {
		enableHighAccuracy: true,
	},
	trackUserLocation: true,
	showUserHeading: true,
});

this.geoLocateControl = geoLocate;

在 setCurrentLocation() 成功前或成功後觸發：

this.geoLocateControl?.trigger();

然後補畫線 function：

drawGuideRouteLine(fromCoords, toCoords) {
	const geojson = {
		type: "FeatureCollection",
		features: [
			{
				type: "Feature",
				geometry: {
					type: "LineString",
					coordinates: [fromCoords, toCoords],
				},
				properties: {},
			},
		],
	};

	if (this.map.getSource("guide-route-source")) {
		this.map.getSource("guide-route-source").setData(geojson);
	} else {
		this.map.addSource("guide-route-source", {
			type: "geojson",
			data: geojson,
		});

		this.map.addLayer({
			id: "guide-route-layer",
			type: "line",
			source: "guide-route-source",
			paint: {
				"line-width": 4,
				"line-color": "#2563eb",
				"line-opacity": 0.85,
			},
		});
	}
}

在 runGuideSpatialFocus() 裡找到最近點後：

if (intent.needsDistance && userCoords && ranked[0]) {
	const targetCoords = ranked[0].geometry?.coordinates;
	this.drawGuideRouteLine(userCoords, targetCoords);
}
3. 新北最多藥局的地方

你現在問題有三個：

可能沒開藥局組件
沒有新北 filter
沒有框線 function

先補 pharmacy filter：

if (target?.moduleKey === "pharmacy" && /新北|New Taipei/i.test(text)) {
	filters.push({
		key: "city_scope",
		operator: "==",
		value: "NewTaipei",
	});
}

value 要依你的 GeoJSON 欄位實際值改。

再把「地方 / 哪裡 / 哪個區」算成 area highlight：

const needsAreaHighlight =
	/附近|周邊|行政區|區域|地方|哪裡|哪個區|area|nearby/i.test(text);

然後補框線，不要用 circle：

updateGuideBoundaryLayer(features) {
	if (!this.map) return;

	const geojson = {
		type: "FeatureCollection",
		features: features.filter((f) =>
			["Polygon", "MultiPolygon"].includes(f.geometry?.type)
		),
	};

	if (!geojson.features.length) return;

	if (this.map.getSource("guide-boundary-source")) {
		this.map.getSource("guide-boundary-source").setData(geojson);
	} else {
		this.map.addSource("guide-boundary-source", {
			type: "geojson",
			data: geojson,
		});

		this.map.addLayer({
			id: "guide-boundary-fill",
			type: "fill",
			source: "guide-boundary-source",
			paint: {
				"fill-color": "#facc15",
				"fill-opacity": 0.12,
			},
		});

		this.map.addLayer({
			id: "guide-boundary-line",
			type: "line",
			source: "guide-boundary-source",
			paint: {
				"line-color": "#facc15",
				"line-width": 4,
			},
		});
	}
}

然後 runGuideSpatialFocus() 裡改成：

if (intent.needsAreaHighlight) {
	const top = ranked.slice(0, 1);

	const isAreaFeature = ["Polygon", "MultiPolygon"].includes(
		top[0]?.geometry?.type
	);

	if (isAreaFeature) {
		this.updateGuideBoundaryLayer(top);
	} else {
		this.updateGuideHighlightLayer(top);
	}
}
4. 哪裡最多環保餐廳

這題 AI 有答，但地圖不動，通常是：

registry 沒有 eco_restaurant target
或 target 有了，但 componentIndex 對不到 recommendComponents
或 mapConfig 沒接行政區 polygon layer

你要在 guide-map-target-registry.json 補 target：

{
	"id": "eco_restaurant",
	"moduleKey": "eco_restaurant",
	"title": "環保餐廳分布概況",
	"componentIndex": "你的環保餐廳 component index",
	"componentIndexes": ["你的環保餐廳 component index"],
	"keywords": ["環保餐廳", "綠色餐廳", "eco restaurant"],
	"openMode": "component",
	"mapConfig": [
		{
			"index": "你的環保餐廳行政區圖層 index",
			"type": "fill",
			"city": "taipei",
			"source": "geojson",
			"role": "focus"
		}
	],
	"focusLayerIndex": "你的環保餐廳行政區圖層 index",
	"dataSemantics": {
		"primaryNameKey": "district",
		"sortableMetrics": ["restaurant_count"]
	}
}

然後在 resolveGuideEnhancementIntent() 補：

if (target?.moduleKey === "eco_restaurant") {
	ranking = { metric: "restaurant_count", order: "desc" };
}
最後你真正要改的簡表
1. openGuideComponent 不要只傳 index
   → 傳完整 matchedComponent + id + city

2. mapStore 要存 guideActiveComponent payload
   → 不只存 guideActiveComponentIndex

3. UI watcher 要用 payload.component
   → 走原本點卡片開組件的流程

4. 純排名題不要 openGuideLayer
   → 不然會標點、圈圈、亂開圖層

5. 附近最近題要 trigger Mapbox GeolocateControl
   → 不能只 navigator.geolocation

6. 行政區題要用 boundary layer
   → Polygon 畫框線，不要 circle

7. 環保餐廳要補 registry target
   → keywords、componentIndex、mapConfig、sortableMetrics 都要有

你現在最大的 bug 就一句話：

你不是「組件沒資料」，
你是「沒有用真正的 component 物件去開組件」。