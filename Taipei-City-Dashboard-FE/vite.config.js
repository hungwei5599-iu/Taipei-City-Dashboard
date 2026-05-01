import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import viteCompression from "vite-plugin-compression";

let isDockerCompose = process?.env.DOCKER_COMPOSE === "true"; // eslint-disable-line no-undef

const serverConfig = isDockerCompose
	? {
		host: "0.0.0.0",
		port: 80,
		watch: {
			usePolling: true,
			interval: 1000,
		},
		proxy: {
			"/api/dev": {
				target: "http://dashboard-be:8080",
				changeOrigin: true,
				rewrite: (path) => path.replace("/dev", "/v1"),
			},
		},
	}
	: {
		host: "0.0.0.0",
		port: 80,
		proxy: {
			"/api": {
				target: "https://citydashboard.taipei/api/v1",
				changeOrigin: true,
				rewrite: (path) => path.replace(/^\/api/, ""),
			},
			"/geo_server": {
				target: "https://citydashboard.taipei/geo_server/",
				changeOrigin: true,
				rewrite: (path) => path.replace(/^\/geo_server/, ""),
			},
		},
	};

export default defineConfig({
	plugins: [vue(), viteCompression()],
	build: {
		rollupOptions: {
			output: {
				manualChunks(id) {
					if (id.includes("node_modules")) {
						return id
							.toString()
							.split("node_modules/")[1]
							.split("/")[0]
							.toString();
					}
				},
			},
		},
		chunkSizeWarningLimit: 1600,
	},
	base: "/",
	server: serverConfig,
});
