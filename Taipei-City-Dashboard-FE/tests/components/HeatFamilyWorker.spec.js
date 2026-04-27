import assert from "node:assert/strict";
import {
	AI_INSIGHT_PROXY_ENDPOINT,
	APPROVED_DATA_FORMATS,
	HEAT_FAMILY_WORKER_MODULE_ID,
	buildHeatFamilyWorkerModule,
	heatFamilyWorkerComplianceReport,
	heatFamilyWorkerFeatures,
} from "../../src/assets/configs/hackathon/heatFamilyWorker.js";

const module = buildHeatFamilyWorkerModule();
const report = heatFamilyWorkerComplianceReport(module);

assert.equal(module.id, HEAT_FAMILY_WORKER_MODULE_ID);
assert.equal(module.defaultCity, "metrotaipei");
assert.equal(module.aiProxyEndpoint, AI_INSIGHT_PROXY_ENDPOINT);
assert.equal(module.aiTool, "analyze_heat_family_worker");

assert.ok(Array.isArray(module.charts));
assert.ok(module.charts.length >= 5);
assert.ok(module.charts.some((chart) => chart.type === "heatmap"));
assert.ok(module.charts.some((chart) => chart.type === "radialBar"));
assert.ok(module.charts.every((chart) => chart.series.length > 0));
assert.ok(module.charts.every((chart) => APPROVED_DATA_FORMATS.includes(chart.dataFormat)));

assert.ok(heatFamilyWorkerFeatures.length >= 5);
assert.ok(heatFamilyWorkerFeatures.some((feature) => feature.geometry.type === "Point"));
assert.ok(heatFamilyWorkerFeatures.some((feature) => feature.geometry.type === "Polygon"));
assert.ok(heatFamilyWorkerFeatures.every((feature) =>
	feature.properties.modules.includes(HEAT_FAMILY_WORKER_MODULE_ID)
));

assert.deepEqual(report, {
	usesOnlyApexChartTypes: true,
	usesOnlyApprovedFormats: true,
	usesGoAIProxy: true,
	hasMapFeatures: true,
});
