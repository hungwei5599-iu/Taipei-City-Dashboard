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
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import DashboardComponent from "../dashboardComponent/DashboardComponent.vue";
import { useContentStore } from "../store/contentStore";
import { useDialogStore } from "../store/dialogStore";
import { useMapStore } from "../store/mapStore";
import { useUiActionStore } from "../store/uiActionStore";
import MapContainer from "../components/map/MapContainer.vue";
import MoreInfo from "../components/dialogs/MoreInfo.vue";
import ReportIssue from "../components/dialogs/ReportIssue.vue";

const contentStore = useContentStore();
const dialogStore = useDialogStore();
const mapStore = useMapStore();
const uiActionStore = useUiActionStore();
const route = useRoute();
const router = useRouter();

const toggleOn = ref({
	hasMap: [],
	noMap: [],
	mapLayer: [],
	basicLayer: [],
});
const pendingAiComponentOpen = ref(null);

function getRouteAiOpenRequest() {
	if (!route.query.aiOpen) return null;

	return {
		requestId: Number(route.query.aiOpenTs) || Date.now(),
		componentIndex: String(route.query.aiOpen),
		dashboardIndex: String(route.query.index || "hackathon_food_health"),
		city: String(route.query.city || "metrotaipei"),
		source: "route-query",
	};
}

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
				hasMap: new Array(parseMapLayers.value.hasMap?.length).fill(
					false,
				),
				noMap: new Array(parseMapLayers.value.noMap?.length).fill(
					false,
				),
				mapLayer: new Array(
					contentStore.currentDashboard.components?.length,
				).fill(false),
				basicLayer: new Array(contentStore.mapLayers?.length).fill(
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
		mapStore.addToMapLayerList(map_config);
	} else {
		mapStore.clearByParamFilter(map_config);
		mapStore.turnOffMapLayerVisibility(map_config);
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

function getComponentSection(componentIndex) {
	if (contentStore.currentDashboard.index?.includes("map-layers")) {
		const arrayIdx = contentStore.currentDashboard.components?.findIndex(
			(item) => item.index === componentIndex,
		);
		if (arrayIdx >= 0) {
			return {
				section: "mapLayer",
				arrayIdx,
				component: contentStore.currentDashboard.components[arrayIdx],
			};
		}
	}

	const hasMapIdx = parseMapLayers.value.hasMap?.findIndex(
		(item) => item.index === componentIndex,
	);
	if (hasMapIdx >= 0) {
		return {
			section: "hasMap",
			arrayIdx: hasMapIdx,
			component: parseMapLayers.value.hasMap[hasMapIdx],
		};
	}

	const noMapIdx = parseMapLayers.value.noMap?.findIndex(
		(item) => item.index === componentIndex,
	);
	if (noMapIdx >= 0) {
		return {
			section: "noMap",
			arrayIdx: noMapIdx,
			component: parseMapLayers.value.noMap[noMapIdx],
		};
	}

	const basicLayerIdx = contentStore.mapLayers?.findIndex(
		(item) => item.index === componentIndex,
	);
	if (basicLayerIdx >= 0) {
		return {
			section: "basicLayer",
			arrayIdx: basicLayerIdx,
			component: contentStore.mapLayers[basicLayerIdx],
		};
	}

	return null;
}

function openComponentFromAi(request, retryCount = 0) {
	if (!request?.componentIndex) return;

	pendingAiComponentOpen.value = request;
	console.log("[ai-ui] open request", {
		request,
		retryCount,
		currentDashboard: contentStore.currentDashboard.index,
		currentCity: contentStore.currentDashboard.city,
		components: contentStore.currentDashboard.components?.map((item) => ({
			index: item.index,
			city: item.city,
			hasMap: !!item.map_config?.[0],
		})),
		isPreloading: mapStore.isPreloading,
		loadingLayers: mapStore.loadingLayers,
	});

	if (
		request.dashboardIndex &&
		contentStore.currentDashboard.index !== request.dashboardIndex
	) {
		if (
			route.path !== "/mapview" ||
			route.query.index !== request.dashboardIndex ||
			route.query.city !== request.city
		) {
			router.push({
				path: "/mapview",
				query: {
					index: request.dashboardIndex,
					city: request.city || contentStore.currentDashboard.city,
					aiOpen: request.componentIndex,
					aiOpenTs: request.requestId || Date.now(),
				},
			});
		}
		return;
	}

	const target = getComponentSection(request.componentIndex);
	if (!target?.component) {
		console.log("[ai-ui] target component not ready", request.componentIndex);
		if (retryCount < 20) {
			setTimeout(() => openComponentFromAi(request, retryCount + 1), 250);
		}
		return;
	}

	const mapConfig = target.component.map_config || [];
	if (mapConfig?.[0] && shouldDisable(mapConfig)) {
		console.log("[ai-ui] target map layer still loading", mapConfig);
		if (retryCount < 20) {
			setTimeout(() => openComponentFromAi(request, retryCount + 1), 250);
		}
		return;
	}

	handleToggle(true, mapConfig);
	toggleSwitchBtn(true, target.section, target.arrayIdx);
	console.log("[ai-ui] component opened", {
		section: target.section,
		arrayIdx: target.arrayIdx,
		component: target.component.index,
		mapConfig,
	});
	if (mapConfig?.[0]) {
		popularThematicLayerGA(mapConfig);
	}
	uiActionStore.clearComponentOpenRequest(request.requestId);
	pendingAiComponentOpen.value = null;
}

watch(
	() => uiActionStore.componentOpenRequest,
	(request) => {
		if (!request) return;
		nextTick(() => openComponentFromAi(request));
	},
	{ deep: true, immediate: true },
);

watch(
	() => [route.query.aiOpen, route.query.aiOpenTs],
	() => {
		const request = getRouteAiOpenRequest();
		if (request) {
			nextTick(() => openComponentFromAi(request));
		}
	},
	{ immediate: true },
);

watch(
	() => contentStore.currentDashboard.components,
	() => {
		if (pendingAiComponentOpen.value) {
			nextTick(() => openComponentFromAi(pendingAiComponentOpen.value));
		}
	},
	{ deep: true },
);

watch(
	() => [
		contentStore.currentDashboard.index,
		contentStore.currentDashboard.city,
		contentStore.currentDashboard.components?.length,
		mapStore.isPreloading,
		mapStore.loadingLayers.length,
	],
	() => {
		if (pendingAiComponentOpen.value || uiActionStore.componentOpenRequest) {
			nextTick(() =>
				openComponentFromAi(
					pendingAiComponentOpen.value || uiActionStore.componentOpenRequest,
				),
			);
		}
	},
);

onMounted(() => {
	const savedRequest = uiActionStore.getSavedComponentOpenRequest();
	const routeRequest = getRouteAiOpenRequest();
	if (routeRequest || savedRequest) {
		nextTick(() => openComponentFromAi(routeRequest || savedRequest));
	}
});
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
          v-for="(item, arrayIdx) in contentStore.currentDashboard
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
          :toggle-on="toggleOn.mapLayer[arrayIdx]"
          @info="
            (item) => {
              dialogStore.showMoreInfo(item);
            }
          "
          @toggle="
            (value, map_config) => {
              handleToggle(value, map_config);
              toggleSwitchBtn(value, 'mapLayer', arrayIdx);
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
                mapStore.clearByParamFilter(item.map_config);
                mapStore.turnOffMapLayerVisibility(
                  item.map_config,
                );
                mapStore.addToMapLayerList(
                  selectedData.map_config,
                );

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
          contentStore.currentDashboard.components?.length !== 0
        "
        class="map-charts"
      >
        <DashboardComponent
          v-for="(item, arrayIdx) in parseMapLayers.hasMap"
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
          :toggle-on="toggleOn.hasMap[arrayIdx]"
          @info="
            (item) => {
              dialogStore.showMoreInfo(item);
            }
          "
          @toggle="
            (value, map_config) => {
              handleToggle(value, map_config);
              toggleSwitchBtn(value, 'hasMap', arrayIdx);
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
                mapStore.clearByParamFilter(item.map_config);
                mapStore.turnOffMapLayerVisibility(
                  item.map_config,
                );
                mapStore.addToMapLayerList(
                  selectedData.map_config,
                );

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
          :toggle-on="toggleOn.basicLayer[arrayIdx]"
          @info="
            (item) => {
              dialogStore.showMoreInfo(item);
            }
          "
          @toggle="
            (value, map_config) => {
              handleToggle(value, map_config);
              toggleSwitchBtn(value, 'basicLayer', arrayIdx);
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
                mapStore.clearByParamFilter(item.map_config);
                mapStore.turnOffMapLayerVisibility(
                  item.map_config,
                );
                mapStore.addToMapLayerList(
                  selectedData.map_config,
                );

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
