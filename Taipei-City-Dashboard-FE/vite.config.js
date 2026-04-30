import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import viteCompression from "vite-plugin-compression";
import { fileURLToPath, URL } from "node:url";

// 嘗試讀取環境變數，若不存在則回傳 false
let isDockerCompose = process?.env.DOCKER_COMPOSE === "true"; // eslint-disable-line no-undef

const serverConfig = isDockerCompose
	? {
		// Docker Compose override config
		host: true, // Listen on all addresses (0.0.0.0)
		port: 80,
		proxy: {
			"/api/dev": {
				target: "http://dashboard-be:8080",
				changeOrigin: true,
				rewrite: (path) => path.replace("/dev", "/v1")
			}
		}
	}
	: {
		host: "0.0.0.0",
		port: 80,
		proxy: {
			"/api/dev/ai": {
				target: "http://localhost:8080",
				changeOrigin: true,
				secure: false,
				rewrite: (path) => path.replace(/^\/api\/dev\/ai/, "/api/v1/ai")
			},
			"/api/dev": {
				target: "https://citydashboard.taipei/api/v1",
				changeOrigin: true,
				secure: false,
				rewrite: (path) => path.replace(/^\/api\/dev/, "")
			},
			"/geo_server": {
				target: "https://citydashboard.taipei/geo_server/",
				changeOrigin: true,
				secure: false,
				rewrite: (path) => path.replace(/^\/geo_server/, "")
			}
		}
	};

export default defineConfig({
	plugins: [vue(), viteCompression()],
	resolve: {
		alias: {
			"@": fileURLToPath(new URL("./src", import.meta.url)),
		},
	},
	server: {
		...serverConfig,
		hmr: {
			clientPort: 80,
		},
	},
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
});
