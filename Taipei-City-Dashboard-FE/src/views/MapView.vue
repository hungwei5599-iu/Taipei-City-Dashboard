<!-- Developed By Taipei Urban Intelligence Center 2023-2024 -->
<!-- 
Lead Developer:  Igor Ho (Full Stack Engineer)
Data Pipelines:  Iima Yu (Data Scientist)
Design and UX: Roy Lin (Fmr. Consultant), Chu Chen (Researcher)
Systems: Ann Shih (Systems Engineer)
Testing: Jack Huang (Data Scientist), Ian Huang (Data Analysis Intern) 
-->
<!-- Department of Information Technology, Taipei City Government -->

<!-- Map charts will be hidden in mobile mode and be replaced with the mobileLayers dialog -->

<script setup>
/* global gtag */
import { computed, nextTick, ref, watch } from "vue";
import { useRoute } from "vue-router";
import http from "../router/axios";
import DashboardComponent from "../dashboardComponent/DashboardComponent.vue";
import { useContentStore } from "../store/contentStore";
import { useDialogStore } from "../store/dialogStore";
import { useMapStore } from "../store/mapStore";
import MapContainer from "../components/map/MapContainer.vue";
import MoreInfo from "../components/dialogs/MoreInfo.vue";
import ReportIssue from "../components/dialogs/ReportIssue.vue";

const contentStore = useContentStore();
const dialogStore = useDialogStore();
const mapStore = useMapStore();
const route = useRoute();

const toggleOn = ref({
	noMap: [],
});
const handledGuideComponentToken = ref(0);

// Separate components with maps from those without
const parseMapLayers = computed(() => {
	const hasMap = contentStore.currentDashboard.components?.filter(
		(item) => item.map_config[0],
	);
	const noMap = contentStore.currentDashboard.components?.filter(
		(item) => !item.map_config[0],
	);

	return { hasMap: hasMap, noMap: noMap };
});

watch(
	() => route.query.index,
	(newIndex, oldIndex) => {
		if (newIndex !== oldIndex) {
			toggleOn.value = {
				noMap: new Array(parseMapLayers.value.noMap?.length).fill(
					false,
				),
			};
		}
	},
);

function handleOpenSettings() {
	contentStore.editDashboard = JSON.parse(
		JSON.stringify(contentStore.currentDashboard),
	);
	dialogStore.addEdit = "edit";
	dialogStore.showDialog("addEditDashboards");
}

// Open and closes the component as well as communicates to the mapStore to turn on and off map layers
function handleToggle(value, map_config) {
	if (!map_config[0]) {
		if (value) {
			dialogStore.showNotification(
				"info",
				"本組件沒有空間資料，不會渲染地圖",
			);
		}
		return;
	}
	if (value) {
		mapStore.openMapConfig(map_config);
	} else {
		mapStore.closeMapConfig(map_config);
	}
}

function toggleSwitchBtn(value, Btn, BtnIndex) {
	toggleOn.value[Btn][BtnIndex] = value;
}

function shouldDisable(map_config) {
	const allMapLayerIds = map_config.map(
		(el) => `${el.index}-${el.type}-${el.city}`,
	);
	if (mapStore.isPreloading === true) {
		return true;
	} else {
		return (
			mapStore.loadingLayers.filter((el) => allMapLayerIds.includes(el))
				.length > 0
		);
	}
}

// 開啟主題圖層時觸發GA自訂事件
function popularThematicLayerGA(map_config) {
	if (map_config[0].city && map_config[0].title) {
		gtag("event", "popular_thematic_layer", {
			dashboard_city: map_config[0].city,
			layer_name: map_config[0].title,
			city_layer: `${map_config[0].city}-${map_config[0].title}`,
			time: Date.now(),
		});
	}
}

// 開啟基本圖層時觸發GA自訂事件
function popularBasicLayerGA(map_config) {
	if (map_config[0].city && map_config[0].title) {
		gtag("event", "popular_basic_layer", {
			dashboard_city: map_config[0].city,
			layer_name: map_config[0].title,
			city_layer: `${map_config[0].city}-${map_config[0].title}`,
			time: Date.now(),
		});
	}
}

const hasUsableMapConfig = (component) =>
	Array.isArray(component?.map_config) &&
	component.map_config.length > 0 &&
	Boolean(component.map_config[0]);

const sameGuideComponent = (component, payload) => {
	if (!component || !payload) return false;
	const ids = [payload.componentId, payload.component?.id]
		.filter(Boolean)
		.map(String);
	const indexes = [
		payload.componentIndex,
		...(payload.componentIndexes || []),
		payload.component?.index,
	]
		.filter(Boolean)
		.map(String);
	const componentId = String(component.id || "");
	const componentIndex = String(component.index || "");
	const sameCity =
		!payload.city ||
		!component.city ||
		component.city === payload.city ||
		payload.city === "metrotaipei";

	return sameCity && (
		ids.includes(componentId) ||
		indexes.includes(componentIndex)
	);
};

const findGuideComponentInStores = (payload) => {
	const pools = [
		...(contentStore.currentDashboard.components || []),
		...(contentStore.cityDashboard.components || []),
		...(contentStore.allMapLayers || []),
		payload?.component,
	].filter(Boolean);

	return pools.find((component) => sameGuideComponent(component, payload));
};

const clearAiGuideSyntheticLayers = () => {
	contentStore.mapLayers = (contentStore.mapLayers || []).filter((item) => {
		if (!item) return false;
		if (typeof item.id === "string" && item.id.startsWith("ai-guide-")) {
			return false;
		}
		return true;
	});
};

const fetchGuideComponent = async (payload) => {
	const componentId = payload?.componentId || payload?.component?.id;
	if (!componentId) return null;

	try {
		const response = await http.get(`/component/${componentId}`, {
			params: {
				city: payload.city || payload.component?.city || "metrotaipei",
			},
		});
		return response.data?.data || null;
	} catch (error) {
		console.warn("[ai-guide] component fetch failed", error);
		return null;
	}
};

const createGuideComponentFromPayload = (payload, mapConfig) => ({
	id: `ai-guide-${payload?.componentIndex || mapConfig?.[0]?.index || "component"}`,
	index: payload?.componentIndex || mapConfig?.[0]?.index || "ai-guide-component",
	name:
		payload?.title ||
		mapConfig?.find((item) => item.role === "focus")?.title ||
		mapConfig?.[0]?.title ||
		"AI 開啟組件",
	city: payload?.city || mapConfig?.[0]?.city || "metrotaipei",
	map_config: mapConfig,
	map_filter: null,
	chart_config: {
		types: ["MapLegend"],
		color: ["#38bdf8"],
		unit: "",
	},
	chart_data: [
		{
			name:
				mapConfig?.find((item) => item.role === "focus")?.title ||
				mapConfig?.[0]?.title ||
				"AI 開啟圖層",
			type: mapConfig?.[0]?.type || "circle",
		},
	],
	time_from: "static",
	time_to: "static",
	update_freq: null,
	update_freq_unit: null,
});

const normalizeGuideMapConfig = (mapConfig = [], payload = {}, component = null) => {
	const fallbackCity =
		payload?.city ||
		component?.city ||
		mapConfig?.[0]?.city ||
		"metrotaipei";

	return (mapConfig || []).map((item) => ({
		...item,
		city: item?.city || fallbackCity,
	}));
};

const waitForGuideContentReady = (timeout = 8000) =>
	new Promise((resolve) => {
		const started = Date.now();
		const tick = () => {
			const hasDashboard =
				Array.isArray(contentStore.currentDashboard.components) &&
				contentStore.currentDashboard.components.length > 0;
			const hasMapLayers =
				Array.isArray(contentStore.mapLayers) &&
				contentStore.mapLayers.length > 0;
			const hasAllMapLayers =
				Array.isArray(contentStore.allMapLayers) &&
				contentStore.allMapLayers.length > 0;
			if (!contentStore.loading && (hasDashboard || hasMapLayers || hasAllMapLayers)) {
				resolve(true);
				return;
			}
			if (Date.now() - started > timeout) {
				resolve(false);
				return;
			}
			setTimeout(tick, 100);
		};
		tick();
	});

const openGuideComponentPayload = async (payload) => {
	if (!payload?.componentIndex && !payload?.component && !payload?.componentId && !payload?.mapConfig?.length) {
		console.warn("[ai-guide] skipped open, empty payload", payload);
		return false;
	}

	console.log("[ai-guide] open payload received", payload);
	clearAiGuideSyntheticLayers();

	await nextTick();
	await waitForGuideContentReady();

	let component = findGuideComponentInStores(payload);
	if (!hasUsableMapConfig(component)) {
		component = await fetchGuideComponent(payload);
	}

	console.log("[ai-guide] resolved component for open", {
		payload,
		component,
		componentCity: component?.city,
		componentMapConfig: component?.map_config,
	});

	const rawMapConfig = hasUsableMapConfig(component)
		? component.map_config
		: payload.mapConfig;
	const mapConfig = normalizeGuideMapConfig(rawMapConfig, payload, component);

	console.log("[ai-guide] normalized map config", {
		rawMapConfig,
		mapConfig,
		cities: mapConfig.map((item) => item?.city),
	});

	if (!Array.isArray(mapConfig) || mapConfig.length === 0) {
		console.warn("[ai-guide] open aborted, no map config", {
			payload,
			component,
			rawMapConfig,
		});
		return false;
	}
	console.log("[ai-guide] opening map config", mapConfig);
	mapStore.openMapConfig(mapConfig);
	return true;
};

watch(
	[
		() => mapStore.guideComponentOpenToken,
		() => route.name,
		() => contentStore.loading,
		() => contentStore.currentDashboard.index,
		() => contentStore.mapLayers.length,
		() => contentStore.allMapLayers.length,
	],
	async () => {
		if (route.name !== "mapview") return;
		if (
			!mapStore.guideComponentOpenToken ||
			handledGuideComponentToken.value === mapStore.guideComponentOpenToken
		) {
			return;
		}
		const handled = await openGuideComponentPayload(mapStore.guideActiveComponent);
		if (handled) {
			handledGuideComponentToken.value = mapStore.guideComponentOpenToken;
		}
	},
	{ immediate: true },
);
</script>

<template>
  <div class="map">
    <div class="hide-if-mobile">
      <!-- 1. If the dashboard is map-layers -->
      <div
        v-if="
          contentStore.currentDashboard.index?.includes('map-layers')
        "
        class="map-charts"
      >
        <DashboardComponent
          v-for="item in contentStore.currentDashboard
            .components"
          :key="`map-layer-${item.index}-${item.city}`"
          :config="item"
          mode="halfmap"
          :info-btn="true"
          :active-city="item.city"
          :select-btn="true"
          :select-btn-disabled="
            contentStore.cityManager.getSelectList(
              contentStore.currentDashboard?.city,
            ).length === 1
          "
          :select-btn-list="
            contentStore.cityManager.getSelectList(
              contentStore.currentDashboard?.city,
            )
          "
          :city-tag="
            contentStore.cityManager.getTagList(
              contentStore.currentDashboard?.city,
            )
          "
          :toggle-disable="shouldDisable(item.map_config)"
          :toggle-on="mapStore.isMapConfigVisible(item.map_config)"
          @info="
            (item) => {
              dialogStore.showMoreInfo(item);
            }
          "
          @toggle="
            (value, map_config) => {
              handleToggle(value, map_config);
              popularThematicLayerGA(map_config);
            }
          "
          @filter-by-param="
            (map_filter, map_config, x, y) => {
              mapStore.filterByParam(
                map_filter,
                map_config,
                x,
                y,
              );
            }
          "
          @filter-by-layer="
            (map_config, layer) => {
              mapStore.filterByLayer(map_config, layer);
            }
          "
          @clear-by-param-filter="
            (map_config) => {
              mapStore.clearByParamFilter(map_config);
            }
          "
          @clear-by-layer-filter="
            (map_config) => {
              mapStore.clearByLayerFilter(map_config);
            }
          "
          @change-city="
            (city) => {
              const selectedData =
                contentStore.cityDashboard.components.find(
                  (data) => {
                    if (
                      data.index === item.index &&
                      data.city === city
                    ) {
                      return data;
                    }
                  },
                );

              const componentIndex =
                contentStore.currentDashboard.components.findIndex(
                  (item) => item.id === selectedData.id,
                );

              if (selectedData) {
                mapStore.closeMapConfig(item.map_config);
                mapStore.openMapConfig(selectedData.map_config);

                contentStore.setComponentData(
                  componentIndex,
                  selectedData,
                );
              }
            }
          "
        />
      </div>
      <!-- 2. Dashboards that have components -->
      <div
        v-else-if="
          contentStore.currentDashboard.components?.length !== 0 ||
            contentStore.mapLayers.length > 0
        "
        class="map-charts"
      >
        <DashboardComponent
          v-for="item in parseMapLayers.hasMap"
          :key="`map-layer-${item.index}-${item.city}`"
          :config="item"
          mode="map"
          :info-btn="true"
          :active-city="item.city"
          :select-btn="true"
          :select-btn-disabled="
            contentStore.cityManager.getSelectList(
              contentStore.currentDashboard?.city,
            ).length === 1 ||
              contentStore.currentDashboardExcluded.components.filter(
                (data) => data.index === item.index,
              ).length === 0
          "
          :select-btn-list="
            contentStore.currentDashboard?.city
              ? contentStore.cityManager.getSelectList(
                contentStore.currentDashboard?.city,
              )
              : contentStore.cityManager.getCities(
                contentStore.cityManager.activeCities,
              )
          "
          :city-tag="
            contentStore.currentDashboard?.city
              ? contentStore.cityManager.getTagList(
                contentStore.currentDashboard?.city,
              )
              : contentStore.cityManager.getTagList(item.city)
          "
          :toggle-disable="shouldDisable(item.map_config)"
          :toggle-on="mapStore.isMapConfigVisible(item.map_config)"
          @info="
            (item) => {
              dialogStore.showMoreInfo(item);
            }
          "
          @toggle="
            (value, map_config) => {
              handleToggle(value, map_config);
              popularThematicLayerGA(map_config);
            }
          "
          @filter-by-param="
            (map_filter, map_config, x, y) => {
              mapStore.filterByParam(
                map_filter,
                map_config,
                x,
                y,
              );
            }
          "
          @filter-by-layer="
            (map_config, layer) => {
              mapStore.filterByLayer(map_config, layer);
            }
          "
          @clear-by-param-filter="
            (map_config) => {
              mapStore.clearByParamFilter(map_config);
            }
          "
          @clear-by-layer-filter="
            (map_config) => {
              mapStore.clearByLayerFilter(map_config);
            }
          "
          @fly="
            (location) => {
              mapStore.flyToLocation(location);
            }
          "
          @change-city="
            (city) => {
              const selectedData =
                contentStore.cityDashboard.components.find(
                  (data) => {
                    if (
                      data.index === item.index &&
                      data.city === city
                    ) {
                      return data;
                    }
                  },
                );

              const componentIndex =
                contentStore.currentDashboard.components.findIndex(
                  (item) => item.id === selectedData.id,
                );

              if (selectedData) {
                mapStore.closeMapConfig(item.map_config);
                mapStore.openMapConfig(selectedData.map_config);

                contentStore.setComponentData(
                  componentIndex,
                  selectedData,
                );
              }
            }
          "
        />
        <h2 v-if="contentStore.mapLayers.length > 0">
          基本圖層
        </h2>
        <DashboardComponent
          v-for="(item, arrayIdx) in contentStore.mapLayers"
          :key="`map-layer-${item.index}-${item.city}`"
          :config="item"
          mode="halfmap"
          :info-btn="true"
          :active-city="item.city"
          :select-btn="true"
          :select-btn-disabled="
            contentStore.cityManager.getSelectList(
              contentStore.currentDashboard?.city,
            ).length === 1
          "
          :select-btn-list="
            contentStore.cityManager.getSelectList(
              contentStore.currentDashboard?.city,
            )
          "
          :city-tag="
            contentStore.cityManager.getTagList(
              contentStore.currentDashboard?.city,
            )
          "
          :toggle-disable="shouldDisable(item.map_config)"
          :toggle-on="mapStore.isMapConfigVisible(item.map_config)"
          @info="
            (item) => {
              dialogStore.showMoreInfo(item);
            }
          "
          @toggle="
            (value, map_config) => {
              handleToggle(value, map_config);
              popularBasicLayerGA(map_config);
            }
          "
          @filter-by-param="
            (map_filter, map_config, x, y) => {
              mapStore.filterByParam(
                map_filter,
                map_config,
                x,
                y,
              );
            }
          "
          @filter-by-layer="
            (map_config, layer) => {
              mapStore.filterByLayer(map_config, layer);
            }
          "
          @clear-by-param-filter="
            (map_config) => {
              mapStore.clearByParamFilter(map_config);
            }
          "
          @clear-by-layer-filter="
            (map_config) => {
              mapStore.clearByLayerFilter(map_config);
            }
          "
          @change-city="
            (city) => {
              const selectedData = contentStore.allMapLayers.find(
                (data) => {
                  if (
                    data.index === item.index &&
                    data.city === city
                  ) {
                    return data;
                  }
                },
              );

              if (selectedData) {
                mapStore.closeMapConfig(item.map_config);
                mapStore.openMapConfig(selectedData.map_config);

                contentStore.setMapLayerData(
                  arrayIdx,
                  selectedData,
                );
              }
            }
          "
        />
        <h2 v-if="parseMapLayers.noMap?.length > 0">
          無空間資料組件
        </h2>
        <DashboardComponent
          v-for="(item, arrayIdx) in parseMapLayers.noMap"
          :key="`map-layer-${item.index}-${item.city}`"
          :config="item"
          mode="map"
          :info-btn="true"
          :active-city="item.city"
          :select-btn="true"
          :select-btn-disabled="
            contentStore.cityManager.getSelectList(
              contentStore.currentDashboard?.city,
            ).length === 1 ||
              contentStore.currentDashboardExcluded.components.filter(
                (data) => data.index === item.index,
              ).length === 0
          "
          :select-btn-list="
            contentStore.currentDashboard?.city
              ? contentStore.cityManager.getSelectList(
                contentStore.currentDashboard?.city,
              )
              : contentStore.cityManager.getCities(
                contentStore.cityManager.activeCities,
              )
          "
          :city-tag="
            contentStore.currentDashboard?.city
              ? contentStore.cityManager.getTagList(
                contentStore.currentDashboard?.city,
              )
              : contentStore.cityManager.getTagList(item.city)
          "
          :toggle-on="toggleOn.noMap[arrayIdx]"
          @info="
            (item) => {
              dialogStore.showMoreInfo(item);
            }
          "
          @toggle="
            (value, map_config) => {
              handleToggle(value, map_config);
              toggleSwitchBtn(value, 'noMap', arrayIdx);
            }
          "
          @change-city="
            (city) => {
              const selectedData =
                contentStore.cityDashboard.components.find(
                  (data) => {
                    if (
                      data.index === item.index &&
                      data.city === city
                    ) {
                      return data;
                    }
                  },
                );
              const componentIndex =
                contentStore.currentDashboard.components.findIndex(
                  (data) =>
                    data.index === item.index &&
                    data.city === item.city,
                );
              if (selectedData && componentIndex !== -1) {
                contentStore.setComponentData(
                  componentIndex,
                  selectedData,
                );
              }
            }
          "
        />
      </div>
      <!-- 3. If dashboard is still loading -->
      <div
        v-else-if="contentStore.loading"
        class="map-charts-nodashboard"
      >
        <div />
      </div>
      <!-- 4. If dashboard failed to load -->
      <div
        v-else-if="contentStore.error"
        class="map-charts-nodashboard"
      >
        <span>sentiment_very_dissatisfied</span>
        <h2>發生錯誤，無法載入儀表板</h2>
      </div>
      <!-- 5. Dashboards that don't have components -->
      <div
        v-else
        class="map-charts-nodashboard"
      >
        <span>addchart</span>
        <h2>尚未加入組件</h2>
        <button
          v-if="contentStore.currentDashboard.icon !== 'favorite'"
          class="hide-if-mobile"
          @click="handleOpenSettings"
        >
          加入您的第一個組件
        </button>
        <p v-else>
          點擊其他儀表板組件之愛心以新增至收藏組件
        </p>
      </div>
    </div>
    <MapContainer />
    <MoreInfo />
    <ReportIssue />
  </div>
</template>

<style scoped lang="scss">
.map {
	height: calc(100vh - 127px);
	height: calc(var(--vh) * 100 - 127px);
	display: flex;
	margin: var(--font-m) var(--font-m);

	&-charts {
		width: 360px;
		max-height: 100%;
		height: fit-content;
		display: grid;
		row-gap: var(--font-m);
		margin-right: var(--font-s);
		border-radius: 5px;
		overflow-y: scroll;

		@media (min-width: 1000px) {
			width: 370px;
		}

		@media (min-width: 2000px) {
			width: 400px;
		}

		&-nodashboard {
			width: 360px;
			height: calc(100vh - 127px);
			height: calc(var(--vh) * 100 - 127px);
			display: flex;
			flex-direction: column;
			align-items: center;
			justify-content: center;
			margin-right: var(--font-s);

			@media (min-width: 1000px) {
				width: 370px;
			}

			@media (min-width: 2000px) {
				width: 400px;
			}

			span {
				margin-bottom: var(--font-ms);
				font-family: var(--font-icon);
				font-size: 2rem;
			}

			button {
				color: var(--color-highlight);
			}

			div {
				width: 2rem;
				height: 2rem;
				border-radius: 50%;
				border: solid 4px var(--color-border);
				border-top: solid 4px var(--color-highlight);
				animation: spin 0.7s ease-in-out infinite;
			}
		}
	}
}

@keyframes spin {
	to {
		transform: rotate(360deg);
	}
}
</style>
