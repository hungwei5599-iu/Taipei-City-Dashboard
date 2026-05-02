import { defineStore } from "pinia";

export const useUiActionStore = defineStore("uiAction", {
	state: () => ({
		componentOpenRequest: null,
	}),
	actions: {
		requestComponentOpen(payload) {
			this.componentOpenRequest = {
				requestId: Date.now(),
				...payload,
			};
			sessionStorage.setItem(
				"aiComponentOpenRequest",
				JSON.stringify(this.componentOpenRequest),
			);
		},
		clearComponentOpenRequest(requestId) {
			if (this.componentOpenRequest?.requestId === requestId) {
				this.componentOpenRequest = null;
			}
			const savedRequest = JSON.parse(
				sessionStorage.getItem("aiComponentOpenRequest") || "null",
			);
			if (savedRequest?.requestId === requestId) {
				sessionStorage.removeItem("aiComponentOpenRequest");
			}
		},
		getSavedComponentOpenRequest() {
			return JSON.parse(
				sessionStorage.getItem("aiComponentOpenRequest") || "null",
			);
		},
	},
});
